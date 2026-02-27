import { useEffect, useState } from "react";
import { getDaysInMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface UseOrganizationHolidaysParams {
  organizationId?: string | null;
  month: number;
  year: number;
}

export function useOrganizationHolidays({ organizationId, month, year }: UseOrganizationHolidaysParams) {
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchHolidays = async () => {
      if (!organizationId) {
        if (!isMounted) return;
        setHolidayDates([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const lastDay = getDaysInMonth(new Date(year, month - 1));
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("organization_holidays")
        .select("date")
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) {
        console.error("Erro ao carregar feriados:", error);
        if (isMounted) {
          setHolidayDates([]);
          setError(error.message || "Erro ao carregar feriados");
        }
      } else {
        if (isMounted) {
          setHolidayDates((data || []).map((item) => item.date));
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    fetchHolidays();

    return () => {
      isMounted = false;
    };
  }, [organizationId, month, year]);

  return { holidayDates, loading, error };
}
