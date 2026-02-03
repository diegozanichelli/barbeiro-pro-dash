import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MySubscriptionsCardProps {
  barberId: string;
}

export default function MySubscriptionsCard({ barberId }: MySubscriptionsCardProps) {
  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [monthCount, setMonthCount] = useState(0);

  useEffect(() => {
    if (barberId) {
      fetchMySubscriptions();
    }
  }, [barberId]);

  const fetchMySubscriptions = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

    try {
      const { data: transactions } = await supabase
        .from("sale_transactions")
        .select("created_at")
        .eq("barber_id", barberId)
        .eq("item_type", "subscription")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd + "T23:59:59");

      let todayTotal = 0;
      let monthTotal = 0;

      (transactions || []).forEach((tx) => {
        monthTotal += 1;
        const txDate = tx.created_at.split("T")[0];
        if (txDate === today) {
          todayTotal += 1;
        }
      });

      setTodayCount(todayTotal);
      setMonthCount(monthTotal);
    } catch (error) {
      console.error("Erro ao buscar assinaturas:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentMonthName = format(new Date(), "MMMM", { locale: ptBR });
  const points = monthCount * 10;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-warning" />
          Minhas Assinaturas
        </CardTitle>
        <CardDescription>
          Vendas de assinaturas registradas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Estatísticas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <Calendar className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold text-primary">{todayCount}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{monthCount}</p>
                <p className="text-xs text-muted-foreground">{currentMonthName}</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-lg text-center border border-warning/20">
                <Crown className="w-4 h-4 mx-auto mb-1 text-warning" />
                <p className="text-2xl font-bold text-warning">{points}</p>
                <p className="text-xs text-muted-foreground">Pontos</p>
              </div>
            </div>

            {/* Aviso de segurança */}
            <Alert variant="default" className="bg-muted/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Divergência? Apenas o <strong>Gestor</strong> pode corrigir registros de assinaturas.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
