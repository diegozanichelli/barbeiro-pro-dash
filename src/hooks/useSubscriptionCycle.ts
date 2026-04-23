import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizePhone, isValidPhone } from "@/lib/phoneUtils";
import {
  computeCycleStatus,
  parseCycleAnchor,
  type CycleInfo,
} from "@/lib/subscriptionCycle";

interface UseSubscriptionCycleParams {
  organizationId: string;
  mobilePhone: string;
  /** Quando true, faz a busca; quando false, retorna estado vazio. */
  enabled?: boolean;
}

interface UseSubscriptionCycleResult {
  loading: boolean;
  cycle: CycleInfo | null;
  /** ID do plano da última transação — útil para botão "Renovar este plano agora" */
  planId: string | null;
  planName: string | null;
  /** ID da última transação (para debug/auditoria) */
  lastTransactionId: string | null;
  refetch: () => void;
}

/**
 * Busca a última transação de assinatura (new/renew/upgrade) do cliente identificado pelo telefone
 * e calcula o status de ciclo (em dia / renovação disponível / vencido).
 *
 * Degrada graciosamente: se a busca falhar ou não houver transação, retorna cycle=null.
 */
export function useSubscriptionCycle({
  organizationId,
  mobilePhone,
  enabled = true,
}: UseSubscriptionCycleParams): UseSubscriptionCycleResult {
  const [loading, setLoading] = useState(false);
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);

  useEffect(() => {
    const digits = sanitizePhone(mobilePhone);

    if (!enabled || !organizationId || digits.length !== 11 || !isValidPhone(mobilePhone)) {
      setCycle(null);
      setPlanId(null);
      setPlanName(null);
      setLastTransactionId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("sale_transactions")
          .select(
            "id, created_at, description, subscription_plan_id, item_name, subscription_action"
          )
          .eq("organization_id", organizationId)
          .eq("mobile_phone", digits)
          .eq("item_type", "subscription")
          .in("subscription_action", ["new", "renew", "upgrade"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          setCycle(null);
          setPlanId(null);
          setPlanName(null);
          setLastTransactionId(null);
          return;
        }

        const lastDate = new Date(data.created_at);
        const anchor = parseCycleAnchor(data.description);
        const info = computeCycleStatus(lastDate, anchor);

        setCycle(info);
        setPlanId(data.subscription_plan_id ?? null);
        setPlanName(data.item_name ?? null);
        setLastTransactionId(data.id);
      } catch (err) {
        if (!cancelled) {
          // degradação graciosa: log silencioso
          console.warn("[useSubscriptionCycle] erro ao buscar ciclo:", err);
          setCycle(null);
          setPlanId(null);
          setPlanName(null);
          setLastTransactionId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, mobilePhone, enabled, refetchToken]);

  return {
    loading,
    cycle,
    planId,
    planName,
    lastTransactionId,
    refetch: () => setRefetchToken((n) => n + 1),
  };
}
