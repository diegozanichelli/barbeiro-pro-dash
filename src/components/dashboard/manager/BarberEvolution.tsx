import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Building2, User, GitCompare } from "lucide-react";
import ShopEvolution from "./ShopEvolution";
import UnitsComparison from "./UnitsComparison";

interface Barber {
  id: string;
  name: string;
}

interface MonthlyData {
  month: string;
  meta: number;
  comissaoGanha: number;
}

function BarberEvolutionChart() {
  const manausNow = useMemo(() => getManausDate(), []);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(manausNow.getFullYear());
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(false);

  const monthNames = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  const years = Array.from({ length: 5 }, (_, i) => getManausDate().getFullYear() - 2 + i);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (selectedBarberId) {
      fetchEvolutionData();
    }
  }, [selectedBarberId, selectedYear]);

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from("barbers")
      .select("id, name")
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("Erro ao buscar barbeiros:", error);
      return;
    }

    setBarbers(data || []);
    if (data && data.length > 0) {
      setSelectedBarberId(data[0].id);
    }
  };

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
    const { data: productions, error: productionsError } = await supabase
      .from("daily_productions")
      .select("date, commission_earned")
      .eq("barber_id", selectedBarberId)
      .gte("date", `${selectedYear}-01-01`)
      .lte("date", `${selectedYear}-12-31`);

    if (productionsError) {
      console.error("Erro ao buscar produções:", productionsError);
      setLoading(false);
      return;
    }

    // Agrupar comissões por mês
    const commissionByMonth = new Array(12).fill(0);
    productions?.forEach((prod) => {
      const month = new Date(prod.date).getMonth();
      commissionByMonth[month] += Number(prod.commission_earned);
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
              {entry.name}: R$ {entry.value.toFixed(2)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                Selecionar Ano
              </label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(Number(value))}
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
    </div>
  );
}

// Componente principal com tabs
export default function BarberEvolution() {
  return (
    <Tabs defaultValue="barbearia" className="space-y-6">
      <TabsList className="grid w-full max-w-xl grid-cols-3">
        <TabsTrigger value="barbearia" className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Barbearia
        </TabsTrigger>
        <TabsTrigger value="comparativo" className="flex items-center gap-2">
          <GitCompare className="w-4 h-4" />
          Comparativo
        </TabsTrigger>
        <TabsTrigger value="barbeiro" className="flex items-center gap-2">
          <User className="w-4 h-4" />
          Barbeiro
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="barbearia">
        <ShopEvolution />
      </TabsContent>

      <TabsContent value="comparativo">
        <UnitsComparison />
      </TabsContent>
      
      <TabsContent value="barbeiro">
        <BarberEvolutionChart />
      </TabsContent>
    </Tabs>
  );
}
