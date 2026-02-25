import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseOrganizationHolidaysParams {
  organizationId?: string | null;
  month: number;
  year: number;
}

export function useOrganizationHolidays({ organizationId, month, year }: UseOrganizationHolidaysParams) {
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHolidays = async () => {
      if (!organizationId) {
        setHolidayDates([]);
        return;
      }

      setLoading(true);

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

      const { data, error } = await supabase
        .from("organization_holidays")
        .select("date")
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) {
        console.error("Erro ao carregar feriados:", error);
        setHolidayDates([]);
      } else {
        setHolidayDates((data || []).map((item) => item.date));
      }

      setLoading(false);
    };

    fetchHolidays();
  }, [organizationId, month, year]);

  return { holidayDates, loading };
}
