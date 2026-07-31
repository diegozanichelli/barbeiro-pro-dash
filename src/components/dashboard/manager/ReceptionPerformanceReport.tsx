import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate, manausDayStart, manausDayEnd, toDateKey } from "@/lib/dateUtils";
import { fetchAllRows } from "@/lib/supabasePagination";
import { isLegacyImport, isValidOpportunity } from "@/lib/metricsRules";
import { normalizePhoneForMetrics } from "@/lib/normalizers";
import { useOrganization } from "@/hooks/useOrganization";
import { Building2, Crown, TrendingUp, TrendingDown, Minus, Users, HelpCircle } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SubscriptionScopeBanner, SubscriptionScopeFooter } from "./SubscriptionScopeInfo";

interface UnitPerformance {
  unitId: string | null;
  unitName: string;
  totalSubscriptions: number;
  newClients: number;
  existingClients: number;
  previousMonthTotal: number;
}

export default function ReceptionPerformanceReport() {
  const { organizationId } = useOrganization();
  const manausNow = useMemo(() => getManausDate(), []);
  const [selectedMonth, setSelectedMonth] = useState(manausNow.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(manausNow.getFullYear());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UnitPerformance[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = Array.from({ length: 3 }, (_, i) => getManausDate().getFullYear() - 1 + i);

  useEffect(() => {
    fetchUnits();
  }, [organizationId]);

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear, units, organizationId]);

  const fetchUnits = async () => {
    if (!organizationId) return;
    const { data: unitsData, error } = await supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("Erro ao buscar unidades:", error);
      return;
    }

    setUnits(unitsData || []);
  };

  const fetchData = async () => {
    if (units.length === 0) return;
    if (!organizationId) return;

    setLoading(true);

    // Limites do mês em Manaus (evita capturar vendas do dia 1 do mês seguinte)
    const startISO = manausDayStart(toDateKey(new Date(selectedYear, selectedMonth - 1, 1)));
    const endISO = manausDayEnd(toDateKey(new Date(selectedYear, selectedMonth, 0)));

    // Mês anterior para comparação
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const prevStartISO = manausDayStart(toDateKey(new Date(prevYear, prevMonth - 1, 1)));
    const prevEndISO = manausDayEnd(toDateKey(new Date(prevYear, prevMonth, 0)));

    try {
      // Buscar vendas de assinatura da recepção (barber_id IS NULL)
      const currentMonthData = await fetchAllRows<{
        unit_id: string | null;
        is_new_client: boolean | null;
        mobile_phone: string | null;
        subscription_action: string | null;
        item_type: string | null;
      }>(() =>
        supabase
          .from("sale_transactions")
          .select("unit_id, is_new_client, mobile_phone, subscription_action, item_type")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .is("barber_id", null)
          .gte("created_at", startISO)
          .lte("created_at", endISO) as any
      );

      // Buscar mês anterior para trend
      const prevMonthData = await fetchAllRows<{ unit_id: string | null; subscription_action: string | null }>(() =>
        supabase
          .from("sale_transactions")
          .select("unit_id, subscription_action")
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .is("barber_id", null)
          .gte("created_at", prevStartISO)
          .lte("created_at", prevEndISO) as any
      );


      // Agrupar dados por unidade
      const unitMap = new Map<string, UnitPerformance>();

      // Inicializar todas as unidades
      units.forEach(unit => {
        unitMap.set(unit.id, {
          unitId: unit.id,
          unitName: unit.name,
          totalSubscriptions: 0,
          newClients: 0,
          existingClients: 0,
          previousMonthTotal: 0,
        });
      });

      // Adicionar "Unidade não informada" para vendas antigas sem unit_id
      unitMap.set("unknown", {
        unitId: null,
        unitName: "Não informada",
        totalSubscriptions: 0,
        newClients: 0,
        existingClients: 0,
        previousMonthTotal: 0,
      });

      // Processar dados do mês atual.
      // Regras unificadas (src/lib/metricsRules.ts): clientes migrados do sistema antigo
      // não contam como adesão, e "cliente novo" exige telefone válido de 11 dígitos.
      const seenNewPhones = new Set<string>();
      currentMonthData?.forEach(tx => {
        if (isLegacyImport(tx)) return;
        const key = tx.unit_id || "unknown";
        const unit = unitMap.get(key);
        if (unit) {
          unit.totalSubscriptions++;
          const phone = normalizePhoneForMetrics(tx.mobile_phone);
          if (isValidOpportunity(tx) && phone && !seenNewPhones.has(phone)) {
            seenNewPhones.add(phone);
            unit.newClients++;
          } else {
            unit.existingClients++;
          }
        }
      });

      // Processar dados do mês anterior
      prevMonthData?.forEach(tx => {
        if (isLegacyImport(tx)) return;
        const key = tx.unit_id || "unknown";
        const unit = unitMap.get(key);
        if (unit) {
          unit.previousMonthTotal++;
        }
      });

      // Filtrar unidades sem vendas e ordenar
      const result = Array.from(unitMap.values())
        .filter(u => u.totalSubscriptions > 0 || u.previousMonthTotal > 0)
        .sort((a, b) => b.totalSubscriptions - a.totalSubscriptions);

      setData(result);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = data.reduce((sum, u) => sum + u.totalSubscriptions, 0);
  const totalNew = data.reduce((sum, u) => sum + u.newClients, 0);
  const avgPerUnit = data.length > 0 ? Math.round(totalSales / data.filter(u => u.totalSubscriptions > 0).length) : 0;
  const bestUnit = data[0]?.unitName || "-";

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="w-4 h-4 text-success" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Performance da Recepção</CardTitle>
              <CardDescription>
                Vendas de assinaturas realizadas diretamente pela recepção (sem atribuição a barbeiro)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SubscriptionScopeBanner scope="reception" />
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Mês</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((month, index) => (
                    <SelectItem key={index + 1} value={(index + 1).toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Ano</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
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

          {/* Cards de Resumo */}
          <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Crown className="w-8 h-8 text-primary" />
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <p className="text-sm">Total de Assinaturas</p>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="Sobre Total">
                              <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Vendas de assinatura sem barbeiro atribuído (apenas balcão), no período.
                          </TooltipContent>
                        </UITooltip>
                      </div>
                      <p className="text-2xl font-bold">{totalSales}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <p className="text-sm">Clientes Novos</p>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="Sobre Clientes Novos">
                              <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Vendas marcadas como cliente novo (1ª assinatura) entre as vendas da
                            recepção. Conta linhas, não pessoas únicas.
                          </TooltipContent>
                        </UITooltip>
                      </div>
                      <p className="text-2xl font-bold">{totalNew}</p>
                      <p className="text-xs text-muted-foreground">
                        {totalSales > 0 ? Math.round((totalNew / totalSales) * 100) : 0}% das adesões são de clientes novos
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Melhor Unidade</p>
                      <p className="text-2xl font-bold">{bestUnit}</p>
                      <p className="text-xs text-muted-foreground">
                        Média: {avgPerUnit} por unidade
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TooltipProvider>

          {/* Tabela */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Nenhuma venda de assinatura pela recepção neste período</p>
              <p className="text-sm text-muted-foreground mt-1">
                As vendas aparecerão aqui quando forem registradas sem atribuição a barbeiro
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Novos</TableHead>
                  <TableHead className="text-center">Casa</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((unit) => (
                  <TableRow key={unit.unitId || "unknown"}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        {unit.unitName}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold">{unit.totalSubscriptions}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-success">{unit.newClients}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-primary">{unit.existingClients}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getTrendIcon(unit.totalSubscriptions, unit.previousMonthTotal)}
                        <span className="text-xs text-muted-foreground">
                          vs {unit.previousMonthTotal}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <SubscriptionScopeFooter />
    </div>
  );
}
