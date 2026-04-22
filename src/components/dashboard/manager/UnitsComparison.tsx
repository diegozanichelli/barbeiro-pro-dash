import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { GitCompare, TrendingUp, TrendingDown, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getManausDate } from "@/lib/dateUtils";

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
  const [loading, setLoading] = useState(false);

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

    // Buscar produções com dados do barbeiro
    const { data: productions, error: productionsError } = await supabase
      .from("daily_productions")
      .select("date, services_total, services_basic_total, services_extra_total, products_total, commission_earned, clients_count, barber_id, barbers!inner(unit_id)")
      .gte("date", startDate)
      .lte("date", endDate);

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
      });
    });

    // Agregar produções por unidade
    productions?.forEach((prod: any) => {
      const unitId = prod.barbers?.unit_id;
      if (!unitId || !metricsMap.has(unitId)) return;

      const metrics = metricsMap.get(unitId)!;

      const servicesBasic = prod.services_basic_total ?? 0;
      const servicesExtra = prod.services_extra_total ?? 0;
      const servicesTotalLegacy = prod.services_total ?? 0;
      const servicesTotal = servicesBasic > 0 || servicesExtra > 0 
        ? servicesBasic + servicesExtra 
        : servicesTotalLegacy;

      // Básico: se já temos basic > 0, usar. Se temos extras mas basic=0, derivar.
      // Senão, usar legado inteiro.
      let receitaBasicaItem = servicesBasic;
      if (servicesBasic === 0 && servicesExtra > 0) {
        receitaBasicaItem = Math.max(0, servicesTotalLegacy - servicesExtra);
      } else if (servicesBasic === 0 && servicesExtra === 0) {
        receitaBasicaItem = servicesTotalLegacy;
      }

      metrics.receitaBasica += receitaBasicaItem;
      metrics.receitaExtra += servicesExtra;
      metrics.receitaProdutos += prod.products_total ?? 0;
      metrics.receita += servicesTotal + (prod.products_total ?? 0);
      metrics.comissao += prod.commission_earned ?? 0;
      metrics.clientes += prod.clients_count ?? 0;
    });

    // Agregar metas por unidade
    goals?.forEach((goal: any) => {
      const unitId = goal.barbers?.unit_id;
      if (!unitId || !metricsMap.has(unitId)) return;

      const metrics = metricsMap.get(unitId)!;
      metrics.metaTotal += Number(goal.target_commission);
    });

    // Calcular métricas derivadas
    metricsMap.forEach(metrics => {
      metrics.ticketMedio = metrics.clientes > 0 ? metrics.receita / metrics.clientes : 0;
      metrics.performance = metrics.metaTotal > 0 ? (metrics.comissao / metrics.metaTotal) * 100 : 0;
    });

    // Ordenar por receita (maior primeiro)
    const sortedMetrics = Array.from(metricsMap.values()).sort((a, b) => b.receita - a.receita);
    setUnitsMetrics(sortedMetrics);
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
  const performanceLeader = getLeader('performance');
  const clientesLeader = getLeader('clientes');

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
              <p className="text-lg font-bold text-foreground">{performanceLeader?.unitName}</p>
              <p className="text-sm text-muted-foreground">
                {performanceLeader?.performance.toFixed(1)}% da meta
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
    </div>
  );
}
