import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOrganization() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizationId();
  }, []);

  const fetchOrganizationId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching organization:", error);
        setLoading(false);
        return;
      }

      setOrganizationId(data.organization_id);
    } catch (error) {
      console.error("Failed to fetch organization:", error);
    } finally {
      setLoading(false);
    }
  };

  return { 
    organization: organizationId ? { id: organizationId } : null, 
    organizationId, 
    loading 
  };
}