import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface AIDailyCoachCardProps {
  barberId: string;
  organizationId: string;
  barberName: string;
  monthlyGoal: number;
  soldToday: number;
  soldThisMonth: number;
  daysRemaining: number;
  dailyTarget: number;
}

export default function AIDailyCoachCard({
  barberId,
  organizationId,
  barberName,
  monthlyGoal,
  soldToday,
  soldThisMonth,
  daysRemaining,
  dailyTarget,
}: AIDailyCoachCardProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoachMessage = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Sessão não encontrada");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("barber-ai-assistant", {
        body: {
          type: "daily_insight",
          barberId,
          organizationId,
          barberName,
          monthlyGoal,
          soldToday,
          soldThisMonth,
          daysRemaining,
          dailyTarget,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("Error fetching AI coach:", fnError);
        setError("Erro ao carregar dica do coach");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setMessage(data?.message || "Continue focado nas suas metas!");
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Só buscar se tiver dados válidos
    if (barberName && monthlyGoal > 0) {
      fetchCoachMessage();
    } else {
      setLoading(false);
      setMessage(null);
    }
  }, [barberName, monthlyGoal, soldThisMonth]);

  if (!monthlyGoal || monthlyGoal <= 0) {
    return null;
  }

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <Bot className="w-5 h-5" />
            Dica do Coach 🤖
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <Bot className="w-5 h-5" />
            Dica do Coach 🤖
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-3">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchCoachMessage}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!message) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-primary/40 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <Bot className="w-5 h-5" />
          Dica do Coach 🤖
          <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-background/60 rounded-lg p-4 border border-primary/20">
          <p className="text-foreground font-medium text-base leading-relaxed">
            {message}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchCoachMessage}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Nova dica
        </Button>
      </CardContent>
    </Card>
  );
}
