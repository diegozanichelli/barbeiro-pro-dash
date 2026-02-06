import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, RefreshCw, Sparkles, Database, Cpu, Zap } from "lucide-react";
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

type ResponseSource = "cache" | "rules_engine" | "ai" | undefined;

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
  const [source, setSource] = useState<ResponseSource>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoachMessage = async (forceRefresh = false) => {
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
          forceRefresh,
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
      setSource(data?.source as ResponseSource);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (barberName && monthlyGoal > 0) {
      fetchCoachMessage();
    } else {
      setLoading(false);
      setMessage(null);
    }
  }, [barberName, monthlyGoal, soldThisMonth]);

  const getSourceBadge = () => {
    if (!source) return null;

    const config = {
      cache: {
        icon: Database,
        label: "Dica salva",
        className: "bg-muted text-muted-foreground",
      },
      rules_engine: {
        icon: Cpu,
        label: "Dica automática",
        className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      },
      ai: {
        icon: Zap,
        label: "IA Personalizada",
        className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      },
    };

    const { icon: Icon, label, className } = config[source];

    return (
      <Badge variant="outline" className={`text-xs gap-1 ${className}`}>
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

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
          <Button variant="ghost" size="sm" onClick={() => fetchCoachMessage(true)}>
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <Bot className="w-5 h-5" />
            Dica do Coach 🤖
            <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse" />
          </CardTitle>
          {getSourceBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-background/60 rounded-lg p-4 border border-primary/20">
          <div className="text-foreground font-medium text-base leading-relaxed whitespace-pre-line">
            {message}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchCoachMessage(true)}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Nova dica
        </Button>
      </CardContent>
    </Card>
  );
}
