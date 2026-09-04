import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { checkSubscriptionAccess, type SubscriptionAccessStatus } from "@/lib/subscriptionAccess";

type SubscriptionStatus = SubscriptionAccessStatus;

export function useSubscriptionCheck() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    try {
      const result = await checkSubscriptionAccess();

      if (!result.authenticated) {
        // No session - user should login, not go to subscription-blocked
        setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        return;
      }

      // Retry com backoff para falhas transitórias (rede/erro 500 temporário)
      let data = result.data;
      let error = result.error;
      for (let attempt = 1; attempt < 3 && (error || data?.error || !data); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        const retry = await checkSubscriptionAccess();
        data = retry.data;
        error = retry.error;
        if (!retry.authenticated) {
          setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
          navigate("/auth");
          return;
        }
      }

      if (error) {
        console.error("Error checking subscription:", error);
        // Falha persistente de infraestrutura: não bloqueia quem já está logado.
        // O SubscriptionGuard global redireciona se houver bloqueio real.
        setStatus({ has_access: true, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        return;
      }


      if (!data || data.error || data.message?.toLowerCase().includes("invalid")) {
        console.error("Subscription check error:", data.error, data.details);
        // Uma resposta inválida não prova que a assinatura está bloqueada.
        setStatus({ has_access: true, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        return;
      }

      setStatus(data);

      // Only redirect to subscription-blocked if:
      // 1. User is authenticated (has a role)
      // 2. But doesn't have access due to subscription status
      const isSubscriptionIssue = !data.has_access && 
        data.role && 
        data.subscription_status && 
        !["active", "trial", "gratuita"].includes(data.subscription_status);
      
      if (isSubscriptionIssue && window.location.pathname !== "/subscription-blocked") {
        navigate("/subscription-blocked");
      }
    } catch (error) {
      console.error("Subscription check failed:", error);
      // Falha inesperada não deve derrubar uma sessão já autenticada.
      setStatus({ has_access: true, role: null, subscription_status: null, organization_id: null });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    checkSubscription();

    // Only re-check on relevant auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') return;
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        checkSubscription();
      }
    });

    return () => subscription.unsubscribe();
  }, [checkSubscription]);

  return { status, loading, refetch: checkSubscription };
}
