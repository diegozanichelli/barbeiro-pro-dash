import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calendar } from "lucide-react";

interface SubscriptionEarningsCardProps {
  barberId: string;
  selectedMonth: number;
  selectedYear: number;
}

export default function SubscriptionEarningsCard({ 
  barberId, 
  selectedMonth, 
  selectedYear 
}: SubscriptionEarningsCardProps) {
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  useEffect(() => {
    fetchSubscriptionEarning();
  }, [barberId, selectedMonth, selectedYear]);

  const fetchSubscriptionEarning = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("barber_subscription_earnings")
      .select("amount")
      .eq("barber_id", barberId)
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .maybeSingle();

    if (!error && data) {
      setAmount(data.amount);
    } else {
      setAmount(0);
    }
    
    setLoading(false);
  };

  if (loading) {
    return (
      <Card className="bg-gradient-card border-border shadow-card-custom animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded w-1/3"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-success/10 via-success/5 to-transparent border-success/30 shadow-card-custom">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Meus Ganhos de Assinatura
        </CardTitle>
        <DollarSign className="h-4 w-4 text-success" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-success">
          R$ {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
          <Calendar className="h-3 w-3" />
          {monthNames[selectedMonth - 1]} / {selectedYear}
        </p>
        {amount === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Nenhum valor de assinatura lançado para este mês.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
