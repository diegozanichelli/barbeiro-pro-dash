import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Barber {
  id: string;
  name: string;
  unit_id: string;
  services_commission: number;
  products_commission: number;
}

interface Unit {
  id: string;
  name: string;
}

interface MonthData {
  month: string;
  avulso: number;
  assinatura: number;
  total: number;
}

interface BarberEarnings {
  barberId: string;
  barberName: string;
  monthsData: MonthData[];
  growthPercentage: number;
}

export default function EarningsComparison() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [selectedBarber, setSelectedBarber] = useState<string>("all");
  const [earningsData, setEarningsData] = useState<BarberEarnings[]>([]);
  const [loading, setLoading] = useState(true);

  const monthNames = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  useEffect(() => {
    fetchUnits();
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (barbers.length > 0) {
      fetchEarningsData();
    }
  }, [barbers, selectedUnit, selectedBarber]);

  const fetchUnits = async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    
    if (data) setUnits(data);
  };

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("id, name, unit_id, services_commission, products_commission")
      .eq("status", "active")
      .order("name");
    
    if (data) setBarbers(data);
  };

  const fetchEarningsData = async () => {
    setLoading(true);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Calcular os últimos 3 meses
    const months: { month: number; year: number; label: string }[] = [];
    for (let i = 2; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      months.push({
        month: m,
        year: y,
        label: `${monthNames[m - 1]}/${y.toString().slice(-2)}`
      });
    }

    // Filtrar barbeiros
    let filteredBarbers = barbers;
    if (selectedUnit !== "all") {
      filteredBarbers = barbers.filter(b => b.unit_id === selectedUnit);
    }
    if (selectedBarber !== "all") {
      filteredBarbers = filteredBarbers.filter(b => b.id === selectedBarber);
    }

    const results: BarberEarnings[] = [];

    for (const barber of filteredBarbers) {
      const monthsData: MonthData[] = [];

      for (const m of months) {
        const firstDay = new Date(m.year, m.month - 1, 1);
        const lastDay = new Date(m.year, m.month, 0);

        // Buscar produções do mês (comissões avulsas)
        const { data: productions } = await supabase
          .from("daily_productions")
          .select("commission_earned")
          .eq("barber_id", barber.id)
          .gte("date", firstDay.toISOString().split("T")[0])
          .lte("date", lastDay.toISOString().split("T")[0]);

        const avulso = productions?.reduce((sum, p) => sum + Number(p.commission_earned), 0) || 0;

        // Buscar ganhos de assinatura do mês
        const { data: subscription } = await supabase
          .from("barber_subscription_earnings")
          .select("amount")
          .eq("barber_id", barber.id)
          .eq("month", m.month)
          .eq("year", m.year)
          .maybeSingle();

        const assinatura = subscription?.amount || 0;

        monthsData.push({
          month: m.label,
          avulso,
          assinatura,
          total: avulso + assinatura
        });
      }

      // Calcular crescimento (mês atual vs mês anterior)
      const currentTotal = monthsData[2]?.total || 0;
      const previousTotal = monthsData[1]?.total || 0;
      
      let growthPercentage = 0;
      if (previousTotal > 0) {
        growthPercentage = ((currentTotal - previousTotal) / previousTotal) * 100;
      } else if (currentTotal > 0) {
        growthPercentage = 100;
      }

      results.push({
        barberId: barber.id,
        barberName: barber.name,
        monthsData,
        growthPercentage
      });
    }

    setEarningsData(results);
    setLoading(false);
  };

  const filteredBarbersList = selectedUnit === "all" 
    ? barbers 
    : barbers.filter(b => b.unit_id === selectedUnit);

  const getGrowthIcon = (percentage: number) => {
    if (percentage > 0) return <TrendingUp className="w-5 h-5 text-success" />;
    if (percentage < 0) return <TrendingDown className="w-5 h-5 text-destructive" />;
    return <Minus className="w-5 h-5 text-muted-foreground" />;
  };

  const getGrowthColor = (percentage: number) => {
    if (percentage > 0) return "text-success";
    if (percentage < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  // Agregar dados para o gráfico geral (quando "all" está selecionado)
  const aggregatedChartData = () => {
    if (earningsData.length === 0) return [];
    
    const months = earningsData[0]?.monthsData.map(m => m.month) || [];
    
    return months.map((month, index) => {
      const avulso = earningsData.reduce((sum, b) => sum + (b.monthsData[index]?.avulso || 0), 0);
      const assinatura = earningsData.reduce((sum, b) => sum + (b.monthsData[index]?.assinatura || 0), 0);
      return {
        month,
        avulso,
        assinatura,
        total: avulso + assinatura
      };
    });
  };

  // Calcular totais gerais
  const totals = {
    currentMonth: earningsData.reduce((sum, b) => sum + (b.monthsData[2]?.total || 0), 0),
    previousMonth: earningsData.reduce((sum, b) => sum + (b.monthsData[1]?.total || 0), 0),
  };
  
  const overallGrowth = totals.previousMonth > 0 
    ? ((totals.currentMonth - totals.previousMonth) / totals.previousMonth) * 100 
    : 0;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Comparativo de Ganhos - Últimos 3 Meses
          </CardTitle>
          <CardDescription>
            Análise de ganhos avulsos (comissões) + ganhos de assinatura
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Filtrar por Unidade</Label>
              <Select value={selectedUnit} onValueChange={(v) => {
                setSelectedUnit(v);
                setSelectedBarber("all");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {units.map(unit => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Filtrar por Barbeiro</Label>
              <Select value={selectedBarber} onValueChange={setSelectedBarber}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os barbeiros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os barbeiros</SelectItem>
                  {filteredBarbersList.map(barber => (
                    <SelectItem key={barber.id} value={barber.id}>{barber.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : (
            <>
              {/* Indicador de Saúde Geral */}
              <Card className="bg-gradient-card border-border">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Crescimento Geral</p>
                      <p className="text-xs text-muted-foreground">
                        Mês atual vs mês anterior
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getGrowthIcon(overallGrowth)}
                      <span className={`text-2xl font-bold ${getGrowthColor(overallGrowth)}`}>
                        {overallGrowth >= 0 ? "+" : ""}{overallGrowth.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gráfico Geral */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aggregatedChartData()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-muted-foreground" />
                    <YAxis 
                      tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`} 
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="avulso" name="Ganhos Avulsos" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="assinatura" name="Ganhos de Assinatura" stackId="a" fill="hsl(var(--success))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cards individuais por barbeiro */}
              {selectedBarber === "all" && earningsData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {earningsData.map(barber => (
                    <Card key={barber.barberId} className="bg-card border-border">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{barber.barberName}</CardTitle>
                          <div className="flex items-center gap-1">
                            {getGrowthIcon(barber.growthPercentage)}
                            <span className={`text-sm font-bold ${getGrowthColor(barber.growthPercentage)}`}>
                              {barber.growthPercentage >= 0 ? "+" : ""}{barber.growthPercentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {barber.monthsData.map((m, i) => (
                            <div key={m.month} className="flex justify-between">
                              <span className="text-muted-foreground">{m.month}:</span>
                              <span className="font-medium">
                                R$ {m.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
