import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import BarberDeepAnalysis, { type DeepAnalysisPeriod } from "./BarberDeepAnalysis";
import { useOrganization } from "@/hooks/useOrganization";
import { brl } from "@/lib/currency";
import { useReportsFilter } from "@/contexts/reportsFilter";

interface Barber {
  id: string;
  name: string;
}

interface MonthlyData {
  month: string;
  meta: number;
  comissaoGanha: number;
}

export default function BarberEvolutionChart() {
  const { organizationId } = useOrganization();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const { year: selectedYear, unitId } = useReportsFilter();
  const [period, setPeriod] = useState<DeepAnalysisPeriod>("current_month");
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(false);

  const monthNames = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  useEffect(() => {
    if (selectedBarberId) {
      fetchEvolutionData();
    }
  }, [selectedBarberId, selectedYear]);

  const fetchBarbers = useCallback(async () => {
    let query = supabase
      .from("barbers")
      .select("id, name")
      .eq("status", "active");

    if (unitId !== "all") {
      query = query.eq("unit_id", unitId);
    }

    const { data, error } = await query.order("name");

    if (error) {
      console.error("Erro ao buscar barbeiros:", error);
      return;
    }

    const lista = data || [];
    setBarbers(lista);

    // Ao trocar de unidade, o barbeiro escolhido pode não pertencer mais à
    // lista; nesse caso cai no primeiro da nova, ou zera se ela vier vazia,
    // para não deixar no gráfico os dados de quem não está mais em tela.
    setSelectedBarberId((atual) =>
      atual && lista.some((b) => b.id === atual) ? atual : lista[0]?.id ?? ""
    );

    // Sem barbeiro em tela não há o que plotar, e o efeito de busca não roda
    // com a seleção vazia — então limpo aqui para não sobrar o gráfico antigo.
    if (lista.length === 0) {
      setChartData([]);
    }
  }, [unitId]);

  // A lista segue a unidade do recorte compartilhado: com uma unidade
  // escolhida, só os barbeiros dela aparecem aqui.
  useEffect(() => {
    fetchBarbers();
  }, [fetchBarbers]);

  const fetchEvolutionData = async () => {
    setLoading(true);

    // Buscar metas mensais
    const { data: goals, error: goalsError } = await supabase
      .from("monthly_goals")
      .select("month, target_commission")
      .eq("barber_id", selectedBarberId)
      .eq("year", selectedYear);

    if (goalsError) {
      console.error("Erro ao buscar metas:", goalsError);
      setLoading(false);
      return;
    }

    // Buscar comissões ganhas por mês
    // Prioridade: tx_commission_earned (auditado pelo gestor) > commission_earned (calculado)
    const { data: productions, error: productionsError } = await supabase
      .from("daily_productions")
      .select("date, commission_earned, tx_commission_earned")
      .eq("barber_id", selectedBarberId)
      .gte("date", `${selectedYear}-01-01`)
      .lte("date", `${selectedYear}-12-31`);

    if (productionsError) {
      console.error("Erro ao buscar produções:", productionsError);
      setLoading(false);
      return;
    }

    // Agrupar comissões por mês usando dado auditado quando disponível
    const commissionByMonth = new Array(12).fill(0);
    productions?.forEach((prod: any) => {
      const month = new Date(prod.date).getMonth();
      const txCommission = Number(prod.tx_commission_earned) || 0;
      const baseCommission = Number(prod.commission_earned) || 0;
      // Usar tx (gestor) se houver lançamento auditado, senão usar a comissão padrão
      commissionByMonth[month] += txCommission > 0 ? txCommission : baseCommission;
    });

    // Criar dados do gráfico
    const data: MonthlyData[] = monthNames.map((monthName, index) => {
      const goalForMonth = goals?.find((g) => g.month === index + 1);
      return {
        month: monthName,
        meta: goalForMonth ? Number(goalForMonth.target_commission) : 0,
        comissaoGanha: commissionByMonth[index],
      };
    });

    setChartData(data);
    setLoading(false);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-card-foreground mb-2">
            {payload[0].payload.month}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {brl(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Evolução do Barbeiro</CardTitle>
              <CardDescription>
                Compare metas cadastradas vs. comissões conquistadas ao longo do ano
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Selecionar Barbeiro
              </label>
              <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                <SelectTrigger className="bg-secondary">
                  <SelectValue placeholder="Escolha um barbeiro" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map((barber) => (
                    <SelectItem key={barber.id} value={barber.id}>
                      {barber.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Selecionar Ano (gráfico anual)
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Período (análise individual)
              </label>
              <Select
                value={period}
                onValueChange={(value) => setPeriod(value as DeepAnalysisPeriod)}
              >
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Mês atual</SelectItem>
                  <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
                  <SelectItem value="year">Ano selecionado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          ) : (
            <div className="w-full h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => `R$ ${value}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ color: "hsl(var(--foreground))" }}
                    iconType="rect"
                  />
                  <Bar
                    dataKey="meta"
                    name="Meta Mensal"
                    fill="hsl(var(--primary))"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="comissaoGanha"
                    name="Comissão Ganha"
                    fill="hsl(var(--success))"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBarberId && (
        <BarberDeepAnalysis
          barberId={selectedBarberId}
          organizationId={organizationId}
          period={period}
          selectedYear={selectedYear}
        />
      )}
    </div>
  );
}

// Componente principal com tabs
