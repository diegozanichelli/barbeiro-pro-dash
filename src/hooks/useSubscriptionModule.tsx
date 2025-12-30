import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSubscriptionModule() {
  const [hasSubscriptionModule, setHasSubscriptionModule] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSubscriptionModule();
  }, []);

  const checkSubscriptionModule = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Buscar organization_id do usuário
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.organization_id) {
        setLoading(false);
        return;
      }

      // Buscar se a organização tem o módulo de assinatura habilitado
      const { data: orgData } = await supabase
        .from("organizations")
        .select("has_subscription_module")
        .eq("id", roleData.organization_id)
        .maybeSingle();

      setHasSubscriptionModule(orgData?.has_subscription_module || false);
    } catch (error) {
      console.error("Error checking subscription module:", error);
    } finally {
      setLoading(false);
    }
  };

  return { hasSubscriptionModule, loading, refetch: checkSubscriptionModule };
}
