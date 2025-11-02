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
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("check-subscription-status");

      if (error) {
        console.error("Error checking subscription:", error);
        setLoading(false);
        return;
      }

      setStatus(data);

      // Redirect if access is blocked
      if (!data.has_access && window.location.pathname !== "/subscription-blocked") {
        navigate("/subscription-blocked");
      }
    } catch (error) {
      console.error("Subscription check failed:", error);
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