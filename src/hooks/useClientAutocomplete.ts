import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizePhone } from "@/lib/phoneUtils";
import { normalizeClientName } from "@/lib/clientName";

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

export interface ClientSuggestion {
  id: string;
  name: string;
  mobile_phone: string;
}

interface UseClientAutocompleteParams {
  organizationId: string;
  nameQuery: string;
  phoneQuery: string;
  enabled?: boolean;
}

export function useClientAutocomplete({
  organizationId,
  nameQuery,
  phoneQuery,
  enabled = true,
}: UseClientAutocompleteParams) {
  const [nameSuggestions, setNameSuggestions] = useState<ClientSuggestion[]>([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState<ClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !organizationId) {
      setNameSuggestions([]);
      setPhoneSuggestions([]);
      return;
    }

    const rawName = nameQuery.trim();
    const normalizedNameQuery = normalizeClientName(rawName);
    const normalizedPhoneQuery = sanitizePhone(phoneQuery);
    const shouldQueryName = normalizedNameQuery.length >= 2;
    const shouldQueryPhone = normalizedPhoneQuery.length >= 3;

    if (!shouldQueryName && !shouldQueryPhone) {
      setNameSuggestions([]);
      setPhoneSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const [nameResult, phoneResult] = await Promise.all([
          shouldQueryName
            ? supabase
                .from("clients")
                .select("id, name, mobile_phone")
                .eq("organization_id", organizationId)
                .ilike("normalized_name", `${normalizedNameQuery}%`)
                .limit(8)
            : Promise.resolve({ data: [], error: null }),
          shouldQueryPhone
            ? supabase
                .from("clients")
                .select("id, name, mobile_phone")
                .eq("organization_id", organizationId)
                .ilike("mobile_phone", `${normalizedPhoneQuery}%`)
                .limit(8)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (cancelled) return;

        if (nameResult.error) throw nameResult.error;
        if (phoneResult.error) throw phoneResult.error;

        setNameSuggestions((nameResult.data || []) as ClientSuggestion[]);
        setPhoneSuggestions((phoneResult.data || []) as ClientSuggestion[]);
      } catch (error: any) {
        if (isClientsSchemaMissing(error)) {
          if (!warnedMissingClientsSchema) {
            warnedMissingClientsSchema = true;
            console.warn("Tabela public.clients não encontrada. Autocomplete desabilitado até aplicar migration.");
          }
        } else {
          console.error("Erro ao carregar sugestões de clientes:", error);
        }

        if (!cancelled) {
          setNameSuggestions([]);
          setPhoneSuggestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled, organizationId, nameQuery, phoneQuery]);

  return { nameSuggestions, phoneSuggestions, loading };
}
