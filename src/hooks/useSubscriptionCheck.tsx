import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/asyncTimeout";

interface SubscriptionStatus {
  has_access: boolean;
  role: string | null;
  subscription_status: string | null;
  organization_id: string | null;
}

export function useSubscriptionCheck() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        10000,
        "Tempo esgotado ao validar a sessão.",
      );
      
      if (!session) {
        // No session - user should login, not go to subscription-blocked
        setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        return;
      }

      const { data, error } = await withTimeout(
        supabase.functions.invoke("check-subscription-status"),
        12000,
        "Tempo esgotado ao validar a assinatura.",
      );

      if (error) {
        console.error("Error checking subscription:", error);
        // On network/function error, don't redirect - allow retry
        setLoading(false);
        return;
      }

      // Check for auth-related errors (session expired, invalid token, corrupted JWT)
      const authErrors = ["Invalid or expired token", "No authorization header", "User not found"];
      const isAuthError = authErrors.some(err => data?.message?.includes(err)) || 
                          data?.message?.includes("invalid claim");
      
      if (isAuthError) {
        
        // Wait for autoRefreshToken to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const { data: { session: freshSession } } = await withTimeout(
          supabase.auth.getSession(),
          10000,
          "Tempo esgotado ao renovar a sessão.",
        );
        if (!freshSession) {
          await supabase.auth.signOut();
          setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
          setLoading(false);
          navigate("/auth");
          return;
        }
        
        // Retry with fresh session
        const retryResult = await withTimeout(
          supabase.functions.invoke("check-subscription-status"),
          12000,
          "Tempo esgotado ao validar a assinatura novamente.",
        );
        if (retryResult.data?.message?.includes("Invalid") || retryResult.data?.message?.includes("invalid claim")) {
          await supabase.auth.signOut();
          setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
          setLoading(false);
          navigate("/auth");
          return;
        }
        
        // Retry succeeded
        setStatus(retryResult.data);
        setLoading(false);
        return;
      }

      if (data?.error) {
        console.error("Subscription check error:", data.error, data.details);
        // On error response, don't redirect to blocked - might be temporary
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
      // On catch, expose state explicitly to avoid indefinite/ambiguous UI state.
      setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
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
