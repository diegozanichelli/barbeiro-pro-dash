import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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

  const checkSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // No session - user should login, not go to subscription-blocked
        setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("check-subscription-status");

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
        console.log("Auth issue detected, signing out for re-authentication", data?.message);
        await supabase.auth.signOut();
        setStatus({ has_access: false, role: null, subscription_status: null, organization_id: null });
        setLoading(false);
        navigate("/auth");
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
      // On catch, don't set status to false - might be temporary network issue
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSubscription();

    // Check subscription status on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkSubscription();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { status, loading, refetch: checkSubscription };
}