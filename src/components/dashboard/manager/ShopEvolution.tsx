import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { Building2, TrendingUp, TrendingDown, DollarSign, Users, Target, MapPin } from "lucide-react";
import { getManausDate } from "@/lib/dateUtils";
import { isSubscriptionRevenue } from "@/lib/metricsRules";
import { productionBreakdown } from "@/lib/productionTotals";
import { brl } from "@/lib/currency";
import { useReportsFilter } from "@/contexts/reportsFilter";

interface Unit {
  id: string;
  name: string;
}

interface MonthlyShopData {
  month: string;
  monthNumber: number;
  receita: number;
  receitaBasica: number;
  receitaExtra: number;
  receitaProdutos: number;
  receitaAssinaturas: number;
  comissaoTotal: number;
  ticketMedio: number;
  clientes: number;
  metaTotal: number;
  performance: number;
}

export default function ShopEvolution() {
  // Usar data de Manaus para inicializar ano e calcular mês atual
  const manausNow = useMemo(() => getManausDate(), []);
  const { year: selectedYear, unitId: selectedUnit } = useReportsFilter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [chartData, setChartData] = useState<MonthlyShopData[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'receita' | 'ticket' | 'performance'>('receita');

  const monthNames = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  useEffect(() => {
    fetchUnits();
  }, []);

  useEffect(() => {
    fetchShopEvolutionData();
  }, [selectedYear, selectedUnit]);

  const fetchUnits = async () => {
    const { data, error } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("Erro ao buscar unidades:", error);
      return;
    }

    setUnits(data || []);
  };

  const fetchShopEvolutionData = async () => {
    setLoading(true);

    // Buscar todas as produções do ano com paginação (Supabase tem limite default de 1000 linhas).
    // Inclui campos tx_* (gestor) e manual_* (barbeiro) para aplicar a hierarquia oficial:
    // tx (gestor) > manual (barbeiro) > legacy (services_basic/extra/products) > services_total
    const productions: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let productionsError: any = null;
    // Loop de paginação: continua até receber menos linhas que o tamanho da página
    while (true) {
      const { data: page, error } = await supabase
        .from("daily_productions")
        .select(`date, services_total, services_basic_total, services_extra_total, products_total,
                 tx_basic_total, tx_extra_total, tx_products_total,
                 manual_basic_total, manual_extra_total, manual_products_total,
                 commission_earned, clients_count, barber_id, barbers!inner(unit_id)`)
        .gte("date", `${selectedYear}-01-01`)
        .lte("date", `${selectedYear}-12-31`)
        .order("date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        productionsError = error;
        break;
      }
      if (!page || page.length === 0) break;
      productions.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (productionsError) {
      console.error("Erro ao buscar produções:", productionsError);
      setLoading(false);
      return;
    }

    // Filtrar produções por unidade se selecionada
    const filteredProductions = selectedUnit === "all" 
      ? productions 
      : productions?.filter((p: any) => p.barbers?.unit_id === selectedUnit);

    // Buscar metas do ano com dados do barbeiro para filtrar por unidade
    let goalsQuery = supabase
      .from("monthly_goals")
      .select("month, target_commission, barber_id, barbers!inner(unit_id)")
      .eq("year", selectedYear);

    const { data: goals, error: goalsError } = await goalsQuery;

    if (goalsError) {
      console.error("Erro ao buscar metas:", goalsError);
    }

    // Buscar receita de assinaturas direto de sale_transactions (fonte única de verdade)
    // Filtra por source='manager' para alinhar com o princípio "Gestão como Fonte de Verdade"
    // Paginação para evitar o limite default de 1000 linhas do Supabase
    const subscriptionTxs: any[] = [];
    let subFrom = 0;
    let subError: any = null;
    while (true) {
      const { data: page, error } = await supabase
        .from("sale_transactions")
        .select("created_at, price_sold, barber_id, barbers!inner(unit_id)")
        .eq("item_type", "subscription")
        .gte("created_at", `${selectedYear}-01-01T00:00:00`)
        .lte("created_at", `${selectedYear}-12-31T23:59:59`)
        .order("created_at", { ascending: true })
        .range(subFrom, subFrom + PAGE_SIZE - 1);

      if (error) {
        subError = error;
        break;
      }
      if (!page || page.length === 0) break;
      subscriptionTxs.push(...page);
      if (page.length < PAGE_SIZE) break;
      subFrom += PAGE_SIZE;
    }

    if (subError) {
      console.error("Erro ao buscar transações de assinatura:", subError);
    }

    // Filtrar assinaturas por unidade se selecionada
    const filteredSubTxs = selectedUnit === "all"
      ? subscriptionTxs
      : subscriptionTxs?.filter((s: any) => s.barbers?.unit_id === selectedUnit);

    // Filtrar metas por unidade se selecionada
    const filteredGoals = selectedUnit === "all"
      ? goals
      : goals?.filter((g: any) => g.barbers?.unit_id === selectedUnit);

    // Agrupar dados por mês
    const monthlyAggregates = monthNames.map(() => ({
      receita: 0,
      receitaBasica: 0,
      receitaExtra: 0,
      receitaProdutos: 0,
      receitaAssinaturas: 0,
      comissaoTotal: 0,
      clientes: 0,
    }));

    filteredProductions?.forEach((prod: any) => {
      const month = new Date(prod.date).getMonth();

      // Hierarquia oficial: tx (gestor) > manual (barbeiro) > legacy detalhado > services_total
      const {
        basic: receitaBasicaItem,
        extra: receitaExtraItem,
        products: receitaProdutosItem,
      } = productionBreakdown(prod);

      const servicesTotal = receitaBasicaItem + receitaExtraItem;

      monthlyAggregates[month].receitaBasica += receitaBasicaItem;
      monthlyAggregates[month].receitaExtra += receitaExtraItem;
      monthlyAggregates[month].receitaProdutos += receitaProdutosItem;
      monthlyAggregates[month].receita += servicesTotal + receitaProdutosItem;
      monthlyAggregates[month].comissaoTotal += Number(prod.commission_earned) || 0;
      monthlyAggregates[month].clientes += Number(prod.clients_count) || 0;
    });

    // Agregar receita de assinaturas por mês (usando created_at da transação)
    filteredSubTxs?.forEach((tx: any) => {
      const monthIndex = new Date(tx.created_at).getMonth();
      if (monthIndex >= 0 && monthIndex < 12) {
        const revenue = Number(tx.price_sold) || 0;
        monthlyAggregates[monthIndex].receitaAssinaturas += revenue;
        monthlyAggregates[monthIndex].receita += revenue;
      }
    });

    // Agrupar metas por mês
    const metasByMonth = new Array(12).fill(0);
    filteredGoals?.forEach((goal: any) => {
      metasByMonth[goal.month - 1] += Number(goal.target_commission);
    });

    // Criar dados do gráfico
    const data: MonthlyShopData[] = monthNames.map((monthName, index) => {
      const agg = monthlyAggregates[index];
      const ticketMedio = agg.clientes > 0 ? agg.receita / agg.clientes : 0;
      const metaTotal = metasByMonth[index];
      const performance = metaTotal > 0 ? (agg.comissaoTotal / metaTotal) * 100 : 0;

      return {
        month: monthName,
        monthNumber: index + 1,
        receita: agg.receita,
        receitaBasica: agg.receitaBasica,
        receitaExtra: agg.receitaExtra,
        receitaProdutos: agg.receitaProdutos,
        receitaAssinaturas: agg.receitaAssinaturas,
        comissaoTotal: agg.comissaoTotal,
        ticketMedio,
        clientes: agg.clientes,
        metaTotal,
        performance,
      };
    });

    setChartData(data);
    setLoading(false);
  };

  // Calcular totais e comparativos - usar data de Manaus
  const currentMonth = manausNow.getMonth();
  const defaultMonthData = { receita: 0, ticketMedio: 0, performance: 0, clientes: 0, receitaBasica: 0, receitaExtra: 0, receitaProdutos: 0, receitaAssinaturas: 0, comissaoTotal: 0, metaTotal: 0 };
  const currentMonthData = chartData.length > 0 ? (chartData[currentMonth] || defaultMonthData) : defaultMonthData;
  const previousMonthData = chartData.length > 0 && currentMonth > 0 ? (chartData[currentMonth - 1] || defaultMonthData) : defaultMonthData;

  const receitaVariation = previousMonthData.receita > 0 
    ? ((currentMonthData.receita - previousMonthData.receita) / previousMonthData.receita) * 100 
    : 0;
  const ticketVariation = previousMonthData.ticketMedio > 0 
    ? ((currentMonthData.ticketMedio - previousMonthData.ticketMedio) / previousMonthData.ticketMedio) * 100 
    : 0;

  const totalAnual = chartData.length > 0 ? chartData.reduce((acc, m) => acc + m.receita, 0) : 0;
  const totalClientes = chartData.length > 0 ? chartData.reduce((acc, m) => acc + m.clientes, 0) : 0;
  const ticketMedioAnual = totalClientes > 0 ? totalAnual / totalClientes : 0;

  const visibleChartData = useMemo(() => {
    if (chartData.length === 0) return [];

    if (selectedYear === manausNow.getFullYear()) {
      return chartData.slice(0, manausNow.getMonth() + 1);
    }

    const lastMonthWithData = [...chartData]
      .map((month, index) => ({ month, index }))
      .reverse()
      .find(({ month }) =>
        month.receita > 0 ||
        month.receitaBasica > 0 ||
        month.receitaExtra > 0 ||
        month.receitaProdutos > 0 ||
        month.receitaAssinaturas > 0 ||
        month.comissaoTotal > 0 ||
        month.metaTotal > 0 ||
        month.clientes > 0
      )?.index;

    return lastMonthWithData != null ? chartData.slice(0, lastMonthWithData + 1) : chartData;
  }, [chartData, selectedYear, manausNow]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-card-foreground mb-2">{data.month}</p>
          {viewMode === 'receita' && (
            <>
              <p className="text-sm text-muted-foreground">Serviços Básicos: <span className="text-foreground font-medium">{brl(data.receitaBasica)}</span></p>
              <p className="text-sm text-muted-foreground">Serviços Extras: <span className="text-foreground font-medium">{brl(data.receitaExtra)}</span></p>
              <p className="text-sm text-muted-foreground">Produtos: <span className="text-foreground font-medium">{brl(data.receitaProdutos)}</span></p>
              {data.receitaAssinaturas > 0 && (
                <p className="text-sm text-muted-foreground">Assinaturas: <span className="text-foreground font-medium">{brl(data.receitaAssinaturas)}</span></p>
              )}
              <p className="text-sm text-muted-foreground border-t border-border mt-2 pt-2">Total: <span className="text-primary font-bold">{brl(data.receita)}</span></p>
            </>
          )}
          {viewMode === 'ticket' && (
            <>
              <p className="text-sm text-muted-foreground">Ticket Médio: <span className="text-foreground font-medium">{brl(data.ticketMedio)}</span></p>
              <p className="text-sm text-muted-foreground">Total Clientes: <span className="text-foreground font-medium">{data.clientes}</span></p>
            </>
          )}
          {viewMode === 'performance' && (
            <>
              <p className="text-sm text-muted-foreground">Meta: <span className="text-foreground font-medium">{brl(data.metaTotal)}</span></p>
              <p className="text-sm text-muted-foreground">Comissão: <span className="text-foreground font-medium">{brl(data.comissaoTotal)}</span></p>
              <p className="text-sm text-muted-foreground">Performance: <span className={`font-medium ${data.performance >= 100 ? 'text-green-500' : 'text-yellow-500'}`}>{data.performance.toFixed(1)}%</span></p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Total {selectedYear}</p>
                <p className="text-2xl font-bold text-foreground">R$ {totalAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio Anual</p>
                <p className="text-2xl font-bold text-foreground">{brl(ticketMedioAnual)}</p>
              </div>
              <Target className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clientes {selectedYear}</p>
                <p className="text-2xl font-bold text-foreground">{totalClientes.toLocaleString('pt-BR')}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${receitaVariation >= 0 ? 'from-green-500/10 to-green-500/5 border-green-500/20' : 'from-red-500/10 to-red-500/5 border-red-500/20'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Variação Mês Anterior</p>
                <p className={`text-2xl font-bold ${receitaVariation >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {receitaVariation >= 0 ? '+' : ''}{receitaVariation.toFixed(1)}%
                </p>
              </div>
              {receitaVariation >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-500" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico principal */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle>Evolução da Barbearia</CardTitle>
                <CardDescription>
                  {selectedUnit === "all" 
                    ? "Comparativo mensal de receita, ticket médio e performance - Todas as unidades"
                    : `Comparativo mensal - ${units.find(u => u.id === selectedUnit)?.name || 'Unidade'}`}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <SelectTrigger className="w-[160px] bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="ticket">Ticket Médio</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : (
            <div className="w-full h-96">
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'receita' ? (
                  <BarChart data={visibleChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="receitaBasica" name="Serviços Básicos" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="receitaExtra" name="Serviços Extras" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="receitaProdutos" name="Produtos" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="receitaAssinaturas" name="Assinaturas" stackId="a" fill="hsl(280, 70%, 55%)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                ) : viewMode === 'ticket' ? (
                  <LineChart data={visibleChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$ ${v.toFixed(0)}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="ticketMedio" name="Ticket Médio" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }} />
                  </LineChart>
                ) : (
                  <BarChart data={visibleChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="metaTotal" name="Meta Total" fill="hsl(var(--muted))" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="comissaoTotal" name="Comissão Total" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela comparativa mensal */}
      <Card>
        <CardHeader>
          <CardTitle>Comparativo Mensal</CardTitle>
          <CardDescription>Detalhamento mês a mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Mês</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Receita Total</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Ticket Médio</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Clientes</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Comissão</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Performance</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((data, index) => {
                  const prevData = index > 0 ? chartData[index - 1] : null;
                  const receitaChange = prevData && prevData.receita > 0 
                    ? ((data.receita - prevData.receita) / prevData.receita) * 100 
                    : null;
                  
                  return (
                    <tr key={data.month} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{data.month}</td>
                      <td className="py-3 px-2 text-right">
                        <span className="font-medium">R$ {data.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        {receitaChange !== null && (
                          <span className={`ml-2 text-xs ${receitaChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ({receitaChange >= 0 ? '+' : ''}{receitaChange.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">{brl(data.ticketMedio)}</td>
                      <td className="py-3 px-2 text-right">{data.clientes}</td>
                      <td className="py-3 px-2 text-right">R$ {data.comissaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={`font-medium ${data.performance >= 100 ? 'text-green-500' : data.performance > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          {data.performance > 0 ? `${data.performance.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
