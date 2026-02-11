import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizePhone, isValidPhone } from "@/lib/phoneUtils";

export type ClientStatus =
  | "idle"
  | "checking"
  | "phone_found"
  | "name_found"
  | "not_found";

interface ClientHistoryResult {
  status: ClientStatus;
  visitCount: number;
  suggestedName: string | null;
}

export function useClientHistory(organizationId: string) {
  const [result, setResult] = useState<ClientHistoryResult>({
    status: "idle",
    visitCount: 0,
    suggestedName: null,
  });

  const abortRef = useRef(0);

  const checkHistory = useCallback(
    async (phone: string, clientName?: string) => {
      const digits = sanitizePhone(phone);

      if (digits.length !== 11 || !isValidPhone(phone)) {
        setResult({ status: "idle", visitCount: 0, suggestedName: null });
        return null;
      }

      const callId = ++abortRef.current;
      setResult((prev) => ({ ...prev, status: "checking" }));

      try {
        // Step A: Search by phone
        const { data: phoneMatches, count: phoneCount } = await supabase
          .from("sale_transactions")
          .select("client_name", { count: "exact" })
          .eq("organization_id", organizationId)
          .eq("mobile_phone", digits)
          .order("created_at", { ascending: false })
          .limit(1);

        if (callId !== abortRef.current) return null;

        if (phoneCount && phoneCount > 0 && phoneMatches?.[0]?.client_name) {
          const res: ClientHistoryResult = {
            status: "phone_found",
            visitCount: phoneCount,
            suggestedName: phoneMatches[0].client_name,
          };
          setResult(res);
          return res;
        }

        // Step B: Fallback by name (legacy migration)
        const name = clientName?.trim();
        if (name && name.length >= 3) {
          const { count: nameCount } = await supabase
            .from("sale_transactions")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .ilike("client_name", `%${name}%`);

          if (callId !== abortRef.current) return null;

          if (nameCount && nameCount > 0) {
            const res: ClientHistoryResult = {
              status: "name_found",
              visitCount: nameCount,
              suggestedName: null,
            };
            setResult(res);
            return res;
          }
        }

        const res: ClientHistoryResult = {
          status: "not_found",
          visitCount: 0,
          suggestedName: null,
        };
        setResult(res);
        return res;
      } catch (err) {
        console.error("Error checking client history:", err);
        if (callId === abortRef.current) {
          setResult({ status: "idle", visitCount: 0, suggestedName: null });
        }
        return null;
      }
    },
    [organizationId]
  );

  const reset = useCallback(() => {
    abortRef.current++;
    setResult({ status: "idle", visitCount: 0, suggestedName: null });
  }, []);

  return {
    ...result,
    checking: result.status === "checking",
    checkHistory,
    reset,
  };
}
