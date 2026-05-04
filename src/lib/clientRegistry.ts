import { supabase } from "@/integrations/supabase/client";
import { isValidPhone, sanitizePhone } from "@/lib/phoneUtils";

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");
const normalizedKey = (name: string) => normalizeName(name).toLowerCase();

let warnedMissingClientsSchema = false;

const isClientsSchemaMissing = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("public.clients") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    details.includes("public.clients")
  );
};

const fallbackWithoutRegistry = (name: string, phone: string): RegisterClientResult => {
  if (!warnedMissingClientsSchema) {
    warnedMissingClientsSchema = true;
    console.warn("Tabela public.clients não encontrada. Seguindo sem registry até aplicar migration.");
  }

  return {
    clientName: name,
    mobilePhone: phone,
    reusedByPhone: false,
  };
};

interface RegisterClientInput {
  organizationId: string;
  clientName: string;
  mobilePhone: string;
}

interface RegisterClientResult {
  clientName: string;
  mobilePhone: string;
  reusedByPhone: boolean;
}

export async function registerClientOrThrow({
  organizationId,
  clientName,
  mobilePhone,
}: RegisterClientInput): Promise<RegisterClientResult> {
  const name = normalizeName(clientName);
  const phone = sanitizePhone(mobilePhone);

  if (name.length < 3) {
    throw new Error("Informe um nome de cliente válido (mínimo 3 caracteres).");
  }

  if (phone.length !== 11 || !isValidPhone(mobilePhone)) {
    throw new Error("Informe um celular válido com DDD.");
  }

  const { data: byPhone, error: byPhoneError } = await supabase
    .from("clients")
    .select("id, name, mobile_phone")
    .eq("organization_id", organizationId)
    .eq("mobile_phone", phone)
    .maybeSingle();

  if (byPhoneError) {
    if (isClientsSchemaMissing(byPhoneError)) {
      return fallbackWithoutRegistry(name, phone);
    }
    throw byPhoneError;
  }

  if (byPhone) {
    return {
      clientName: byPhone.name,
      mobilePhone: byPhone.mobile_phone,
      reusedByPhone: true,
    };
  }

  // Permitimos clientes homônimos (mesmo nome) desde que tenham telefones diferentes.
  // A unicidade é garantida apenas por (organization_id, mobile_phone).

  const { data: createdClient, error: createError } = await supabase
    .from("clients")
    .insert({
      organization_id: organizationId,
      name,
      mobile_phone: phone,
    })
    .select("name, mobile_phone")
    .single();

  if (createError) {
    if (isClientsSchemaMissing(createError)) {
      return fallbackWithoutRegistry(name, phone);
    }

    if (createError.code === "23505") {
      const { data: existingByPhone, error: existingByPhoneError } = await supabase
        .from("clients")
        .select("name, mobile_phone")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", phone)
        .maybeSingle();

      if (existingByPhoneError && !isClientsSchemaMissing(existingByPhoneError)) {
        throw existingByPhoneError;
      }

      if (existingByPhone) {
        return {
          clientName: existingByPhone.name,
          mobilePhone: existingByPhone.mobile_phone,
          reusedByPhone: true,
        };
      }

      const { data: existingByName, error: existingByNameError } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("normalized_name", normalizedKey(name))
        .maybeSingle();

      if (existingByNameError && !isClientsSchemaMissing(existingByNameError)) {
        throw existingByNameError;
      }

      if (existingByName) {
        throw new Error("Já existe um cliente cadastrado com esse nome. Use o celular já cadastrado ou ajuste o nome.");
      }

      throw new Error("Cliente já cadastrado (nome ou celular em uso).");
    }
    throw createError;
  }

  return {
    clientName: createdClient.name,
    mobilePhone: createdClient.mobile_phone,
    reusedByPhone: false,
  };
}
