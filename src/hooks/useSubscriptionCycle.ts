import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizePhone, isValidPhone } from "@/lib/phoneUtils";
import {
  buildLegacyCycle,
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
  /** ID do plano atual (da última transação OU do vínculo direto em clients) */
  planId: string | null;
  planName: string | null;
  /** ID da última transação de assinatura (null para legados sem histórico) */
  lastTransactionId: string | null;
  refetch: () => void;
}

/**
 * Calcula o status de ciclo do cliente identificado pelo telefone.
 *
 * Estratégia em duas camadas:
 *  1) Tenta a última `sale_transaction` de assinatura (`new`/`renew`/`upgrade`) — fonte ideal.
 *  2) Se não houver transação, mas o cliente estiver vinculado a um plano em `clients`,
 *     retorna um ciclo neutro (`sem_historico`) para que o banner ainda apareça
 *     e a primeira renovação ancore o ciclo definitivamente.
 *
 * Degrada graciosamente: se ambas as buscas falharem, retorna cycle=null.
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
        // 1) Fonte primária: última transação de assinatura
        const { data: txData, error: txError } = await supabase
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

        if (!txError && txData) {
          const lastDate = new Date(txData.created_at);
          const anchor = parseCycleAnchor(txData.description);
          const info = computeCycleStatus(lastDate, anchor);

          setCycle(info);
          setPlanId(txData.subscription_plan_id ?? null);
          setPlanName(txData.item_name ?? null);
          setLastTransactionId(txData.id);
          return;
        }

        // 2) Fonte secundária (fallback legado): cliente vinculado a um plano
        //    sem nenhuma transação de assinatura registrada.
        const { data: clientData, error: clientError } = await (supabase
          .from("clients") as any)
          .select("subscription_plan_id, subscription_plans(name)")
          .eq("organization_id", organizationId)
          .eq("mobile_phone", digits)
          .maybeSingle();

        if (cancelled) return;

        if (!clientError && clientData?.subscription_plan_id) {
          setCycle(buildLegacyCycle());
          setPlanId(clientData.subscription_plan_id);
          setPlanName(clientData.subscription_plans?.name ?? null);
          setLastTransactionId(null);
          return;
        }

        // Sem assinatura
        setCycle(null);
        setPlanId(null);
        setPlanName(null);
        setLastTransactionId(null);
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
