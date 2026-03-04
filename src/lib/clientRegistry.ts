import { supabase } from "@/integrations/supabase/client";
import { isValidPhone, sanitizePhone } from "@/lib/phoneUtils";

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");
const normalizedKey = (name: string) => normalizeName(name).toLowerCase();

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

  if (byPhoneError) throw byPhoneError;

  if (byPhone) {
    return {
      clientName: byPhone.name,
      mobilePhone: byPhone.mobile_phone,
      reusedByPhone: true,
    };
  }

  const { data: duplicateName, error: duplicateNameError } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("normalized_name", normalizedKey(name))
    .maybeSingle();

  if (duplicateNameError) throw duplicateNameError;

  if (duplicateName) {
    throw new Error("Já existe um cliente cadastrado com esse nome. Use o celular já cadastrado ou ajuste o nome.");
  }

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
    if (createError.code === "23505") {
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
