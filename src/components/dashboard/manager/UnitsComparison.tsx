import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { GitCompare, TrendingUp, TrendingDown, Medal, Scissors, Sparkles, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getManausDate } from "@/lib/dateUtils";
import BarberPeriodDetailModal from "./BarberPeriodDetailModal";

interface Unit {
  id: string;
  name: string;
}

interface UnitMetrics {
  unitId: string;
  unitName: string;
  receita: number;
  receitaBasica: number;
  receitaExtra: number;
  receitaProdutos: number;
  comissao: number;
  clientes: number;
  ticketMedio: number;
  metaTotal: number;
  performance: number;
  newClientOpportunities: number;
  existingClientOpportunities: number;
  newClientSubscriptions: number;
  existingClientSubscriptions: number;
  totalNewSubscriptions: number;
  newClientConversionRate: number;
  existingClientConversionRate: number;
}

interface BarberLeader {
  barberId: string;
  barberName: string;
  value: number;
}

interface UnitTopBarbers {
  unitId: string;
  unitName: string;
  topBasic: BarberLeader | null;
  topExtra: BarberLeader | null;
  topProducts: BarberLeader | null;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function UnitsComparison() {
  // Usar data de Manaus para inicializar ano e mês corretamente
  const manausNow = useMemo(() => getManausDate(), []);
  const [selectedYear, setSelectedYear] = useState<number>(manausNow.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(manausNow.getMonth() + 1);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsMetrics, setUnitsMetrics] = useState<UnitMetrics[]>([]);
  const [topBarbersByUnit, setTopBarbersByUnit] = useState<UnitTopBarbers[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailBarber, setDetailBarber] = useState<{ id: string; name: string; unitName: string } | null>(null);

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => getManausDate().getFullYear() - 2 + i), []);

  useEffect(() => {
    fetchUnits();
  }, []);

  useEffect(() => {
    if (units.length > 0) {
      fetchUnitsComparison();
    }
  }, [selectedYear, selectedMonth, units]);

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

  const fetchUnitsComparison = async () => {
    setLoading(true);

    // Calcular datas do mês
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;

    // Buscar produções com paginação (Supabase tem limite default de 1000 linhas).
    // Inclui campos tx_* (gestor) e manual_* (barbeiro) para aplicar a hierarquia oficial:
    // tx (gestor) > manual (barbeiro) > legacy detalhado > services_total
    const productions: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let productionsError: any = null;
    while (true) {
      const { data: page, error } = await supabase
        .from("daily_productions")
        .select(`date, services_total, services_basic_total, services_extra_total, products_total,
                 tx_basic_total, tx_extra_total, tx_products_total,
                 manual_basic_total, manual_extra_total, manual_products_total,
                 commission_earned, clients_count, barber_id, barbers!inner(unit_id, name)`)
        .gte("date", startDate)
        .lte("date", endDate)
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

    // Buscar metas do mês
    const { data: goals, error: goalsError } = await supabase
      .from("monthly_goals")
      .select("month, target_commission, barber_id, barbers!inner(unit_id)")
      .eq("year", selectedYear)
      .eq("month", selectedMonth);

    if (goalsError) {
      console.error("Erro ao buscar metas:", goalsError);
    }

    // Calcular métricas por unidade
    const metricsMap = new Map<string, UnitMetrics>();

    // Inicializar métricas para cada unidade
    units.forEach(unit => {
      metricsMap.set(unit.id, {
        unitId: unit.id,
        unitName: unit.name,
        receita: 0,
        receitaBasica: 0,
        receitaExtra: 0,
        receitaProdutos: 0,
        comissao: 0,
        clientes: 0,
        ticketMedio: 0,
        metaTotal: 0,
        performance: 0,
        newClientOpportunities: 0,
        existingClientOpportunities: 0,
        newClientSubscriptions: 0,
        existingClientSubscriptions: 0,
        totalNewSubscriptions: 0,
        newClientConversionRate: 0,
        existingClientConversionRate: 0,
      });
    });

    // Buscar transações para conversões e novos assinantes
    const { data: transactions, error: transactionsError } = await supabase
      .from("sale_transactions")
      .select("barber_id, is_new_client, item_type, subscription_action, mobile_phone, barbers!inner(unit_id)")
      .eq("source", "manager")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .not("barber_id", "is", null);

    if (transactionsError) {
      console.error("Erro ao buscar transações de assinatura:", transactionsError);
    }

    // Agregar produções por unidade
    productions?.forEach((prod: any) => {
      const unitId = prod.barbers?.unit_id;
      if (!unitId || !metricsMap.has(unitId)) return;

      const metrics = metricsMap.get(unitId)!;

      const txBasic = Number(prod.tx_basic_total) || 0;
      const txExtra = Number(prod.tx_extra_total) || 0;
      const txProducts = Number(prod.tx_products_total) || 0;
      const txTotal = txBasic + txExtra + txProducts;

      const mBasic = Number(prod.manual_basic_total) || 0;
      const mExtra = Number(prod.manual_extra_total) || 0;
      const mProducts = Number(prod.manual_products_total) || 0;
      const manualTotal = mBasic + mExtra + mProducts;

      const legacyBasic = Number(prod.services_basic_total) || 0;
      const legacyExtra = Number(prod.services_extra_total) || 0;
      const legacyProducts = Number(prod.products_total) || 0;
      const servicesTotalLegacy = Number(prod.services_total) || 0;

      let receitaBasicaItem = 0;
      let receitaExtraItem = 0;
      let receitaProdutosItem = 0;

      if (txTotal > 0) {
        receitaBasicaItem = txBasic;
        receitaExtraItem = txExtra;
        receitaProdutosItem = txProducts;
      } else if (manualTotal > 0) {
        receitaBasicaItem = mBasic;
        receitaExtraItem = mExtra;
        receitaProdutosItem = mProducts;
      } else if (prod.services_basic_total != null || prod.services_extra_total != null) {
        receitaExtraItem = legacyExtra;
        if (legacyBasic === 0 && legacyExtra > 0) {
          receitaBasicaItem = Math.max(0, servicesTotalLegacy - legacyExtra);
        } else {
          receitaBasicaItem = legacyBasic;
        }
        receitaProdutosItem = legacyProducts;
      } else {
        receitaBasicaItem = servicesTotalLegacy;
        receitaExtraItem = 0;
        receitaProdutosItem = legacyProducts;
      }

      metrics.receitaBasica += receitaBasicaItem;
      metrics.receitaExtra += receitaExtraItem;
      metrics.receitaProdutos += receitaProdutosItem;
      metrics.receita += receitaBasicaItem + receitaExtraItem + receitaProdutosItem;
      metrics.comissao += Number(prod.commission_earned) || 0;
      metrics.clientes += Number(prod.clients_count) || 0;

      // Agregar por barbeiro
      const barberId = prod.barber_id;
      const barberName = prod.barbers?.name || 'Sem nome';
      if (barberId) {
        const key = barberId;
        const existing = barberAgg.get(key) || { barberId, barberName, unitId, basic: 0, extra: 0, products: 0 };
        existing.basic += receitaBasicaItem;
        existing.extra += receitaExtraItem;
        existing.products += receitaProdutosItem;
        barberAgg.set(key, existing);
      }
    });

    // Agregar metas por unidade
    goals?.forEach((goal: any) => {
      const unitId = goal.barbers?.unit_id;
      if (!unitId || !metricsMap.has(unitId)) return;

      const metrics = metricsMap.get(unitId)!;
      metrics.metaTotal += Number(goal.target_commission);
    });

    // Calcular conversão de assinaturas por unidade
    const conversionMap = new Map<string, {
      newPhones: Set<string>;
      existingPhones: Set<string>;
      newSubsFromNewClients: number;
      newSubsFromExistingClients: number;
      totalNewSubs: number;
    }>();

    transactions?.forEach((tx: any) => {
      const unitId = tx.barbers?.unit_id;
      if (!unitId || !metricsMap.has(unitId)) return;

      if (!conversionMap.has(unitId)) {
        conversionMap.set(unitId, {
          newPhones: new Set<string>(),
          existingPhones: new Set<string>(),
          newSubsFromNewClients: 0,
          newSubsFromExistingClients: 0,
          totalNewSubs: 0,
        });
      }

      const conversion = conversionMap.get(unitId)!;

      if (tx.mobile_phone) {
        if (tx.is_new_client === true) conversion.newPhones.add(tx.mobile_phone);
        if (tx.is_new_client === false) conversion.existingPhones.add(tx.mobile_phone);
      }

      const isNewSubscription = tx.item_type === "subscription" && tx.subscription_action === "new";
      if (isNewSubscription) {
        conversion.totalNewSubs += 1;
        if (tx.is_new_client === true) conversion.newSubsFromNewClients += 1;
        if (tx.is_new_client === false) conversion.newSubsFromExistingClients += 1;
      }
    });

    // Calcular métricas derivadas
    metricsMap.forEach(metrics => {
      metrics.ticketMedio = metrics.clientes > 0 ? metrics.receita / metrics.clientes : 0;
      metrics.performance = metrics.metaTotal > 0 ? (metrics.comissao / metrics.metaTotal) * 100 : 0;

      const conversion = conversionMap.get(metrics.unitId);
      const newOpp = conversion?.newPhones.size ?? 0;
      const existingOpp = conversion?.existingPhones.size ?? 0;
      const newSubsFromNew = conversion?.newSubsFromNewClients ?? 0;
      const newSubsFromExisting = conversion?.newSubsFromExistingClients ?? 0;

      metrics.newClientOpportunities = newOpp;
      metrics.existingClientOpportunities = existingOpp;
      metrics.newClientSubscriptions = newSubsFromNew;
      metrics.existingClientSubscriptions = newSubsFromExisting;
      metrics.totalNewSubscriptions = conversion?.totalNewSubs ?? 0;
      metrics.newClientConversionRate = newOpp > 0 ? (newSubsFromNew / newOpp) * 100 : 0;
      metrics.existingClientConversionRate = existingOpp > 0 ? (newSubsFromExisting / existingOpp) * 100 : 0;
    });

    // Ordenar por receita (maior primeiro)
    const sortedMetrics = Array.from(metricsMap.values()).sort((a, b) => b.receita - a.receita);
    setUnitsMetrics(sortedMetrics);

    // Top barbeiros por unidade (básico, extra, produtos)
    const tops: UnitTopBarbers[] = sortedMetrics.map((u) => {
      const barbersOfUnit = Array.from(barberAgg.values()).filter((b) => b.unitId === u.unitId);
      const pickTop = (key: 'basic' | 'extra' | 'products'): BarberLeader | null => {
        const filtered = barbersOfUnit.filter((b) => b[key] > 0);
        if (filtered.length === 0) return null;
        const winner = filtered.reduce((a, b) => (b[key] > a[key] ? b : a));
        return { barberId: winner.barberId, barberName: winner.barberName, value: winner[key] };
      };
      return {
        unitId: u.unitId,
        unitName: u.unitName,
        topBasic: pickTop('basic'),
        topExtra: pickTop('extra'),
        topProducts: pickTop('products'),
      };
    });
    setTopBarbersByUnit(tops);

    setLoading(false);
  };

  // Preparar dados para o gráfico
  const chartData = [
    {
      metric: "Receita (R$ mil)",
      ...Object.fromEntries(unitsMetrics.map(u => [u.unitName, u.receita / 1000]))
    },
    {
      metric: "Ticket Médio",
      ...Object.fromEntries(unitsMetrics.map(u => [u.unitName, u.ticketMedio]))
    },
    {
      metric: "Comissão (R$ mil)",
      ...Object.fromEntries(unitsMetrics.map(u => [u.unitName, u.comissao / 1000]))
    },
  ];

  const colors = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(217, 91%, 60%)"];

  // Encontrar líderes por métrica
  const getLeader = (metric: keyof UnitMetrics) => {
    if (unitsMetrics.length === 0) return null;
    return unitsMetrics.reduce((prev, current) => 
      (current[metric] as number) > (prev[metric] as number) ? current : prev
    );
  };

  const receitaLeader = getLeader('receita');
  const ticketLeader = getLeader('ticketMedio');
  const clientesLeader = getLeader('clientes');
  const newClientConversionLeader = getLeader('newClientConversionRate');
  const existingClientConversionLeader = getLeader('existingClientConversionRate');
  const newSubscribersLeader = getLeader('totalNewSubscriptions');

  // "Melhor Performance" = unidade que melhor converte atendimentos em receita
  // (maior ticket médio), exigindo volume mínimo (>=30% dos atendimentos da líder)
  // para evitar que uma unidade pequena com 1 venda alta vença injustamente.
  const conversionLeader = (() => {
    if (unitsMetrics.length === 0) return null;
    const maxClientes = Math.max(...unitsMetrics.map(u => u.clientes));
    const piso = maxClientes * 0.3;
    const candidatas = unitsMetrics.filter(u => u.clientes >= piso && u.clientes > 0);
    const pool = candidatas.length > 0
      ? candidatas
      : unitsMetrics.filter(u => u.clientes > 0);
    if (pool.length === 0) return null;
    return pool.reduce((prev, cur) => (cur.ticketMedio > prev.ticketMedio ? cur : prev));
  })();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-card-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {label.includes('mil') ? `R$ ${(entry.value * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : `R$ ${entry.value.toFixed(2)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <GitCompare className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle>Comparativo entre Unidades</CardTitle>
                <CardDescription>
                  Compare o desempenho das unidades lado a lado - {monthNames[selectedMonth - 1]} {selectedYear}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Select
                value={selectedMonth.toString()}
                onValueChange={(value) => setSelectedMonth(Number(value))}
              >
                <SelectTrigger className="w-[140px] bg-secondary">
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
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(Number(value))}
              >
                <SelectTrigger className="w-[100px] bg-secondary">
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
        </CardHeader>
      </Card>

      {/* Cards de Líderes */}
      {!loading && unitsMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Medal className="w-5 h-5 text-yellow-500" />
                <p className="text-sm text-muted-foreground">Maior Receita</p>
              </div>
              <p className="text-lg font-bold text-foreground">{receitaLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                R$ {receitaLeader?.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <p className="text-sm text-muted-foreground">Maior Ticket</p>
              </div>
              <p className="text-lg font-bold text-foreground">{ticketLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                R$ {ticketLeader?.ticketMedio.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Medal className="w-5 h-5 text-blue-500" />
                <p className="text-sm text-muted-foreground">Mais Clientes</p>
              </div>
              <p className="text-lg font-bold text-foreground">{clientesLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                {clientesLeader?.clientes} clientes
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-500" />
                <p className="text-sm text-muted-foreground">Melhor Performance</p>
              </div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
                Conversão de atendimento
              </p>
              <p className="text-lg font-bold text-foreground">{conversionLeader?.unitName ?? '—'}</p>
              <p className="text-sm text-muted-foreground">
                {conversionLeader
                  ? `R$ ${conversionLeader.ticketMedio.toFixed(2)} por cliente · ${conversionLeader.clientes} atendimentos`
                  : 'Sem dados suficientes'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && unitsMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <p className="text-sm text-muted-foreground">Conversão Novos Clientes</p>
              </div>
              <p className="text-lg font-bold text-foreground">{newClientConversionLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                {newClientConversionLeader?.newClientConversionRate.toFixed(1)}% ({newClientConversionLeader?.newClientSubscriptions} / {newClientConversionLeader?.newClientOpportunities})
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-cyan-500" />
                <p className="text-sm text-muted-foreground">Conversão Clientes da Casa</p>
              </div>
              <p className="text-lg font-bold text-foreground">{existingClientConversionLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                {existingClientConversionLeader?.existingClientConversionRate.toFixed(1)}% ({existingClientConversionLeader?.existingClientSubscriptions} / {existingClientConversionLeader?.existingClientOpportunities})
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Medal className="w-5 h-5 text-amber-500" />
                <p className="text-sm text-muted-foreground">Mais Novos Assinantes</p>
              </div>
              <p className="text-lg font-bold text-foreground">{newSubscribersLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                {newSubscribersLeader?.totalNewSubscriptions ?? 0} novas assinaturas
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico comparativo */}
      <Card>
        <CardHeader>
          <CardTitle>Gráfico Comparativo</CardTitle>
          <CardDescription>Comparação visual das principais métricas por unidade</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-80">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : unitsMetrics.length === 0 ? (
            <div className="flex items-center justify-center h-80">
              <p className="text-muted-foreground">Nenhum dado encontrado para o período selecionado</p>
            </div>
          ) : (
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unitsMetrics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="unitName" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} width={100} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                      name
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="receitaBasica" name="Serviços Básicos" stackId="a" fill="hsl(var(--primary))" />
                  <Bar dataKey="receitaExtra" name="Serviços Extras" stackId="a" fill="hsl(var(--success))" />
                  <Bar dataKey="receitaProdutos" name="Produtos" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela comparativa detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Unidade</CardTitle>
          <CardDescription>Todas as métricas lado a lado</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Métrica</th>
                    {unitsMetrics.map((unit, index) => (
                      <th key={unit.unitId} className="text-right py-3 px-4 font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {index === 0 && <Badge variant="default" className="text-xs">1º</Badge>}
                          {index === 1 && <Badge variant="secondary" className="text-xs">2º</Badge>}
                          {index === 2 && <Badge variant="outline" className="text-xs">3º</Badge>}
                          {unit.unitName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Receita Total</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right font-medium">
                        R$ {unit.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 text-muted-foreground">↳ Serviços Básicos</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right text-muted-foreground">
                        R$ {unit.receitaBasica.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 text-muted-foreground">↳ Serviços Extras</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right text-muted-foreground">
                        R$ {unit.receitaExtra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 text-muted-foreground">↳ Produtos</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right text-muted-foreground">
                        R$ {unit.receitaProdutos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Ticket Médio</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right font-medium">
                        R$ {unit.ticketMedio.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Total Clientes</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right font-medium">
                        {unit.clientes}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Comissão Total</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right font-medium">
                        R$ {unit.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Meta Total</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right font-medium">
                        R$ {unit.metaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">Performance</td>
                    {unitsMetrics.map((unit) => (
                      <td key={unit.unitId} className="py-3 px-4 text-right">
                        <span className={`font-bold ${unit.performance >= 100 ? 'text-green-500' : unit.performance > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          {unit.performance > 0 ? `${unit.performance.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top barbeiros por unidade */}
      {!loading && topBarbersByUnit.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Destaques por Unidade</CardTitle>
            <CardDescription>
              Barbeiros que mais venderam em cada categoria - {monthNames[selectedMonth - 1]} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topBarbersByUnit.map((unit) => (
                <Card key={unit.unitId} className="bg-muted/30 border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{unit.unitName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Scissors className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Serviços Básicos</p>
                        {unit.topBasic ? (
                          <button
                            type="button"
                            onClick={() => setDetailBarber({ id: unit.topBasic!.barberId, name: unit.topBasic!.barberName, unitName: unit.unitName })}
                            className="text-sm font-semibold text-foreground truncate hover:text-primary hover:underline text-left w-full"
                          >
                            {unit.topBasic.barberName}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold text-foreground truncate">—</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {unit.topBasic ? `R$ ${unit.topBasic.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem vendas'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Serviços Extras</p>
                        {unit.topExtra ? (
                          <button
                            type="button"
                            onClick={() => setDetailBarber({ id: unit.topExtra!.barberId, name: unit.topExtra!.barberName, unitName: unit.unitName })}
                            className="text-sm font-semibold text-foreground truncate hover:text-primary hover:underline text-left w-full"
                          >
                            {unit.topExtra.barberName}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold text-foreground truncate">—</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {unit.topExtra ? `R$ ${unit.topExtra.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem vendas'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Produtos</p>
                        {unit.topProducts ? (
                          <button
                            type="button"
                            onClick={() => setDetailBarber({ id: unit.topProducts!.barberId, name: unit.topProducts!.barberName, unitName: unit.unitName })}
                            className="text-sm font-semibold text-foreground truncate hover:text-primary hover:underline text-left w-full"
                          >
                            {unit.topProducts.barberName}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold text-foreground truncate">—</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {unit.topProducts ? `R$ ${unit.topProducts.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem vendas'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BarberPeriodDetailModal
        open={!!detailBarber}
        onOpenChange={(o) => { if (!o) setDetailBarber(null); }}
        barberId={detailBarber?.id ?? null}
        barberName={detailBarber?.name ?? ''}
        unitName={detailBarber?.unitName}
        year={selectedYear}
        month={selectedMonth}
      />
    </div>
  );
}
