import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Bot, Lightbulb, TrendingUp, Calendar } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UsageData {
  barber_id: string;
  barber_name: string;
  daily_insight_count: number;
  sales_help_count: number;
  total_count: number;
  last_used: string;
}

interface RecentUsage {
  id: string;
  barber_name: string;
  usage_type: string;
  scenario: string | null;
  created_at: string;
}

export default function AIUsageTracking() {
  const { organizationId } = useOrganization();
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [recentUsage, setRecentUsage] = useState<RecentUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalUsageToday, setTotalUsageToday] = useState(0);
  const [totalUsageWeek, setTotalUsageWeek] = useState(0);

  useEffect(() => {
    if (organizationId) {
      fetchUsageData();
    }
  }, [organizationId]);

  const fetchUsageData = async () => {
    if (!organizationId) return;

    try {
      setIsLoading(true);

      // Fetch usage with barber names
      const { data: usageRecords, error: usageError } = await supabase
        .from("ai_assistant_usage")
        .select(`
          id,
          barber_id,
          usage_type,
          scenario,
          created_at,
          barbers!inner(name)
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (usageError) throw usageError;

      if (!usageRecords || usageRecords.length === 0) {
        setUsageData([]);
        setRecentUsage([]);
        setTotalUsageToday(0);
        setTotalUsageWeek(0);
        return;
      }

      // Process data for aggregation by barber
      const barberMap = new Map<string, UsageData>();
      const today = startOfDay(new Date());
      const weekAgo = subDays(today, 7);

      let todayCount = 0;
      let weekCount = 0;

      usageRecords.forEach((record: any) => {
        const barberId = record.barber_id;
        const barberName = record.barbers?.name || "Desconhecido";
        const createdAt = new Date(record.created_at);

        // Count today and week
        if (createdAt >= today) todayCount++;
        if (createdAt >= weekAgo) weekCount++;

        if (!barberMap.has(barberId)) {
          barberMap.set(barberId, {
            barber_id: barberId,
            barber_name: barberName,
            daily_insight_count: 0,
            sales_help_count: 0,
            total_count: 0,
            last_used: record.created_at,
          });
        }

        const barberData = barberMap.get(barberId)!;
        barberData.total_count++;
        if (record.usage_type === "daily_insight") {
          barberData.daily_insight_count++;
        } else if (record.usage_type === "sales_help") {
          barberData.sales_help_count++;
        }
      });

      setTotalUsageToday(todayCount);
      setTotalUsageWeek(weekCount);

      // Sort by total usage
      const sortedUsage = Array.from(barberMap.values()).sort(
        (a, b) => b.total_count - a.total_count
      );
      setUsageData(sortedUsage);

      // Get last 10 recent usage
      const recent = usageRecords.slice(0, 10).map((record: any) => ({
        id: record.id,
        barber_name: record.barbers?.name || "Desconhecido",
        usage_type: record.usage_type,
        scenario: record.scenario,
        created_at: record.created_at,
      }));
      setRecentUsage(recent);

    } catch (error) {
      console.error("Error fetching AI usage data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getScenarioLabel = (scenario: string | null) => {
    const labels: Record<string, string> = {
      cliente_achou_caro: "💰 Cliente achou caro",
      oferecer_pomada: "🧴 Oferecer pomada",
      mudanca_visual: "✂️ Mudança de visual",
      cliente_caspa: "❄️ Cliente com caspa",
      servico_extra: "⭐ Serviço extra",
      fidelizacao: "🎯 Fidelização",
    };
    return scenario ? labels[scenario] || scenario : null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usos Hoje</p>
                <p className="text-2xl font-bold text-foreground">{totalUsageToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
                <p className="text-2xl font-bold text-foreground">{totalUsageWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Barbeiros Ativos</p>
                <p className="text-2xl font-bold text-foreground">{usageData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Barber */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Uso do Assistente IA por Barbeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usageData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum barbeiro utilizou o assistente IA ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {usageData.map((barber) => (
                <div
                  key={barber.barber_id}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {getInitials(barber.barber_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">{barber.barber_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Último uso: {format(new Date(barber.last_used), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        <Bot className="w-3 h-3" />
                        {barber.daily_insight_count}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <Lightbulb className="w-3 h-3" />
                        {barber.sales_help_count}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">{barber.total_count}</p>
                      <p className="text-xs text-muted-foreground">total</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {recentUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentUsage.map((usage) => (
                <div
                  key={usage.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      usage.usage_type === "daily_insight" 
                        ? "bg-primary/10" 
                        : "bg-green-500/10"
                    }`}>
                      {usage.usage_type === "daily_insight" ? (
                        <Bot className="w-4 h-4 text-primary" />
                      ) : (
                        <Lightbulb className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{usage.barber_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {usage.usage_type === "daily_insight" 
                          ? "Coach Diário" 
                          : getScenarioLabel(usage.scenario) || "Ajuda para Vender"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(usage.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
