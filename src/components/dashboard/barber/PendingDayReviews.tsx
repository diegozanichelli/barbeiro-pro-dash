import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getTodayString } from "@/lib/dateUtils";

interface PendingReviewDay {
  date: string;
  itemCount: number;
  total: number;
  hasProduction: boolean; // true = já existe daily_production com dados do barbeiro
}

interface PendingDayReviewsProps {
  barberId: string;
  onReview: (date: string) => void;
}

export default function PendingDayReviews({ barberId, onReview }: PendingDayReviewsProps) {
  const [pendingDays, setPendingDays] = useState<PendingReviewDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingDays();
  }, [barberId]);

  const fetchPendingDays = async () => {
    setLoading(true);
    try {
      const today = getTodayString();
      
      // Get last 7 days of manager transactions
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const startDate = format(sevenDaysAgo, "yyyy-MM-dd");

      const { data: transactions } = await supabase
        .from("sale_transactions")
        .select("created_at, price_sold")
        .eq("barber_id", barberId)
        .eq("source", "manager")
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      if (!transactions || transactions.length === 0) {
        setPendingDays([]);
        setLoading(false);
        return;
      }

      // Group by date
      const byDate = new Map<string, { count: number; total: number }>();
      transactions.forEach((tx) => {
        const txDate = tx.created_at.split("T")[0];
        const existing = byDate.get(txDate) || { count: 0, total: 0 };
        existing.count++;
        existing.total += tx.price_sold;
        byDate.set(txDate, existing);
      });

      // Check which dates have barber confirmation (source='barber' transactions or confirmed_presence)
      const dates = Array.from(byDate.keys());
      
      const { data: productions } = await supabase
        .from("daily_productions")
        .select("date, confirmed_presence, manual_basic_total, manual_extra_total, manual_products_total")
        .eq("barber_id", barberId)
        .in("date", dates);

      const confirmedDates = new Set<string>();
      (productions || []).forEach((p) => {
        const manualTotal = (Number(p.manual_basic_total) || 0) + 
                           (Number(p.manual_extra_total) || 0) + 
                           (Number(p.manual_products_total) || 0);
        // Consider confirmed if barber has manual totals > 0 OR confirmed_presence
        if (manualTotal > 0 || p.confirmed_presence) {
          confirmedDates.add(p.date);
        }
      });

      const pending: PendingReviewDay[] = [];
      byDate.forEach((data, date) => {
        if (!confirmedDates.has(date)) {
          pending.push({
            date,
            itemCount: data.count,
            total: data.total,
            hasProduction: false,
          });
        }
      });

      // Sort by date descending (most recent first)
      pending.sort((a, b) => b.date.localeCompare(a.date));

      setPendingDays(pending);
    } catch (error) {
      console.error("Erro ao buscar dias pendentes:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  if (loading) return null;
  if (pendingDays.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-card-custom">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          Dias Pendentes de Conferência
          <Badge variant="destructive" className="ml-auto">
            {pendingDays.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground mb-3">
          A recepção lançou vendas nesses dias. Confira e confirme sua produção.
        </p>
        {pendingDays.map((day) => (
          <div
            key={day.date}
            className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
          >
            <div>
              <p className="font-semibold">
                {format(new Date(`${day.date}T12:00:00`), "EEEE, dd/MM", { locale: ptBR })}
              </p>
              <p className="text-sm text-muted-foreground">
                {day.itemCount} itens • {formatCurrency(day.total)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => onReview(day.date)}
              className="gap-1.5"
            >
              <Eye className="w-4 h-4" />
              Conferir
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
