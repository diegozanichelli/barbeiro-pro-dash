import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Target, Calendar } from "lucide-react";

export default function GoalsManagement() {
  const [barbers, setBarbers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [goals, setGoals] = useState<Record<string, { target: string; days: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (barbers.length > 0) {
      fetchGoals();
    }
  }, [barbers, selectedMonth, selectedYear]);

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("*")
      .eq("status", "active")
      .order("name");
    if (data) setBarbers(data);
  };

  const fetchGoals = async () => {
    const { data } = await supabase
      .from("monthly_goals")
      .select("*")
      .eq("month", selectedMonth)
      .eq("year", selectedYear);

    const goalsMap: Record<string, { target: string; days: string }> = {};
    
    barbers.forEach((barber) => {
      const existingGoal = data?.find((g) => g.barber_id === barber.id);
      goalsMap[barber.id] = {
        target: existingGoal?.target_commission?.toString() || "",
        days: existingGoal?.work_days?.toString() || "",
      };
    });

    setGoals(goalsMap);
  };

  const handleSave = async () => {
    setLoading(true);

    try {
      for (const barberId of Object.keys(goals)) {
        const goal = goals[barberId];
        
        if (!goal.target || !goal.days) continue;

        await supabase.from("monthly_goals").upsert({
          barber_id: barberId,
          month: selectedMonth,
          year: selectedYear,
          target_commission: Number(goal.target),
          work_days: Number(goal.days),
        });
      }

      toast.success("Metas salvas com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateGoal = (barberId: string, field: "target" | "days", value: string) => {
    setGoals({
      ...goals,
      [barberId]: {
        ...goals[barberId],
        [field]: value,
      },
    });
  };

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = [2024, 2025, 2026, 2027];

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Definição de Metas Mensais
        </CardTitle>
        <CardDescription>Configure as metas de cada barbeiro</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="month" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Mês
            </Label>
            <Select
              value={String(selectedMonth)}
              onValueChange={(value) => setSelectedMonth(Number(value))}
            >
              <SelectTrigger id="month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={index} value={String(index + 1)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-2">
            <Label htmlFor="year">Ano</Label>
            <Select
              value={String(selectedYear)}
              onValueChange={(value) => setSelectedYear(Number(value))}
            >
              <SelectTrigger id="year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {barbers.map((barber) => (
            <div
              key={barber.id}
              className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3"
            >
              <h3 className="font-bold text-lg">{barber.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`target-${barber.id}`}>
                    Meta de Recebimento Mensal (R$)
                  </Label>
                  <Input
                    id={`target-${barber.id}`}
                    type="number"
                    step="0.01"
                    placeholder="5000.00"
                    value={goals[barber.id]?.target || ""}
                    onChange={(e) => updateGoal(barber.id, "target", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`days-${barber.id}`}>
                    Dias Úteis de Trabalho no Mês
                  </Label>
                  <Input
                    id={`days-${barber.id}`}
                    type="number"
                    placeholder="22"
                    value={goals[barber.id]?.days || ""}
                    onChange={(e) => updateGoal(barber.id, "days", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={handleSave} className="w-full" disabled={loading}>
          {loading ? "Salvando..." : "Salvar Todas as Metas"}
        </Button>
      </CardContent>
    </Card>
  );
}
