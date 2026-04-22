import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import { useOrganization } from "@/hooks/useOrganization";
import { Crown, TrendingUp, Users, Target, Loader2, Star, AlertTriangle, Trophy } from "lucide-react";

interface BarberPerformance {
  barberId: string;
  barberName: string;
  unitName: string;
  newClientsCount: number;
  subscriptionsSold: number;
  conversionRate: number;
}

export default function SubscriptionPerformanceReport() {
  const manausNow = useMemo(() => getManausDate(), []);
  const { organizationId } = useOrganization();
  const [selectedMonth, setSelectedMonth] = useState(manausNow.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(manausNow.getFullYear());
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<BarberPerformance[]>([]);

  const months = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const years = Array.from({ length: 3 }, (_, i) => getManausDate().getFullYear() - 1 + i);

  useEffect(() => {
    if (organizationId) fetchPerformanceData();
  }, [selectedMonth, selectedYear, organizationId]);

  const fetchPerformanceData = async () => {
    if (!organizationId) return;
    setLoading(true);

    // Calculate date range for the selected month
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

    try {
      // Fetch ONLY manager transactions for the period (source='manager')
      // Explicit organization_id filter to avoid super_admin cross-tenant leakage
      const { data: transactions, error: txError } = await supabase
        .from("sale_transactions")
        .select(`
          barber_id,
          is_new_client,
          item_type,
          subscription_action,
          barbers!sale_transactions_barber_id_fkey(name, units(name))
        `)
        .eq("organization_id", organizationId)
        .eq("source", "manager") // CRITICAL: Only manager data for accurate metrics
        .gte("created_at", `${startDate}T00:00:00`)
        .lte("created_at", `${endDate}T23:59:59`)
        .not("barber_id", "is", null);

      if (txError) throw txError;

      // Group data by barber
      const barberMap = new Map<string, {
        name: string;
        unit: string;
        newClients: number;
        subscriptions: number;
      }>();

      transactions?.forEach((tx) => {
        if (!tx.barber_id) return;

        const existing = barberMap.get(tx.barber_id) || {
          name: (tx.barbers as any)?.name || "Desconhecido",
          unit: (tx.barbers as any)?.units?.name || "Sem unidade",
          newClients: 0,
          subscriptions: 0,
        };

        // Count new clients (is_new_client = true)
        if (tx.is_new_client === true) {
          existing.newClients++;
        }

        // Count ONLY new subscriptions (exclude renew/upgrade/downgrade)
        // A "conversion" is a brand-new subscription tied to a new client opportunity
        if (
          tx.item_type === "subscription" &&
          (tx as any).subscription_action === "new" &&
          tx.is_new_client === true
        ) {
          existing.subscriptions++;
        }

        barberMap.set(tx.barber_id, existing);
      });

      // Convert to array and calculate conversion rate
      const performance: BarberPerformance[] = Array.from(barberMap.entries()).map(
        ([barberId, data]) => ({
          barberId,
          barberName: data.name,
          unitName: data.unit,
          newClientsCount: data.newClients,
          subscriptionsSold: data.subscriptions,
          conversionRate: data.newClients > 0 
            ? (data.subscriptions / data.newClients) * 100 
            : 0,
        })
      );

      // Sort by conversion rate descending
      performance.sort((a, b) => b.conversionRate - a.conversionRate);

      setPerformanceData(performance);
    } catch (error) {
      console.error("Erro ao buscar dados de performance:", error);
    } finally {
      setLoading(false);
    }
  };

  const getConversionBadge = (rate: number, opportunities: number) => {
    // If no opportunities, show N/A
    if (opportunities === 0) {
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <span>N/A</span>
        </Badge>
      );
    }

    // Elite: > 30%
    if (rate >= 30) {
      return (
        <Badge className="bg-success text-white text-xs gap-1 font-semibold">
          <Trophy className="w-3 h-3" />
          <span>Elite ({rate.toFixed(0)}%)</span>
        </Badge>
      );
    }

    // Regular: 10-29%
    if (rate >= 10) {
      return (
        <Badge className="bg-warning text-warning-foreground text-xs gap-1 font-medium">
          <Star className="w-3 h-3" />
          <span>Na Média ({rate.toFixed(0)}%)</span>
        </Badge>
      );
    }

    // Critical: < 10%
    return (
      <Badge variant="destructive" className="text-xs gap-1 font-medium">
        <AlertTriangle className="w-3 h-3" />
        <span>Baixo ({rate.toFixed(0)}%)</span>
      </Badge>
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Highlight critical cases: many opportunities, few sales
  const isCriticalCase = (opportunities: number, sales: number) => {
    return opportunities >= 5 && sales === 0;
  };

  // Summary stats
  const totalNewClients = performanceData.reduce((sum, p) => sum + p.newClientsCount, 0);
  const totalSubscriptions = performanceData.reduce((sum, p) => sum + p.subscriptionsSold, 0);
  const overallConversion = totalNewClients > 0 ? (totalSubscriptions / totalNewClients) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Relatório de Conversão de Assinaturas</CardTitle>
              <CardDescription>
                Taxa de conversão: Clientes Novos → Assinantes
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Mês
              </label>
              <Select
                value={selectedMonth.toString()}
                onValueChange={(v) => setSelectedMonth(Number(v))}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Ano
              </label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">🎯 Oportunidades</span>
                </div>
                <p className="text-2xl font-bold">{totalNewClients}</p>
                <p className="text-xs text-muted-foreground">Clientes Novos</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Crown className="w-4 h-4" />
                  <span className="text-xs">👑 Vendas</span>
                </div>
                <p className="text-2xl font-bold">{totalSubscriptions}</p>
                <p className="text-xs text-muted-foreground">Assinaturas</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs">📉 Conversão Geral</span>
                </div>
                <p className="text-2xl font-bold">
                  {overallConversion.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">Vendas / Oportunidades</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : performanceData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum dado encontrado</p>
              <p className="text-sm">Selecione outro período ou registre atendimentos com clientes novos</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Barbeiro</TableHead>
                    <TableHead className="text-center">🎯 Oportunidades</TableHead>
                    <TableHead className="text-center">👑 Vendas</TableHead>
                    <TableHead className="text-center">📉 Taxa de Conversão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData.map((barber) => (
                    <TableRow 
                      key={barber.barberId}
                      className={isCriticalCase(barber.newClientsCount, barber.subscriptionsSold) 
                        ? "bg-destructive/10" 
                        : ""
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-primary/20">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {getInitials(barber.barberName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{barber.barberName}</p>
                            <p className="text-xs text-muted-foreground">{barber.unitName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-semibold text-lg ${
                          isCriticalCase(barber.newClientsCount, barber.subscriptionsSold)
                            ? "text-destructive"
                            : ""
                        }`}>
                          {barber.newClientsCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold text-lg">{barber.subscriptionsSold}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getConversionBadge(barber.conversionRate, barber.newClientsCount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Badge className="bg-success text-white text-xs gap-1">
                <Trophy className="w-3 h-3" />
                Elite
              </Badge>
              <span>&gt; 30%</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-warning text-warning-foreground text-xs gap-1">
                <Star className="w-3 h-3" />
                Na Média
              </Badge>
              <span>10-29%</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="w-3 h-3" />
                Baixo
              </Badge>
              <span>&lt; 10%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}