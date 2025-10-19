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
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [targetCommission, setTargetCommission] = useState("");
  const [workDays, setWorkDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingGoal, setExistingGoal] = useState<any>(null);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    if (selectedBarberId) {
      fetchExistingGoal();
    }
  }, [selectedBarberId, selectedMonth, selectedYear]);

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from("barbers")
      .select("*")
      .eq("status", "active")
      .order("name");
    
    if (error) {
      console.error("Erro ao buscar barbeiros:", error);
      toast.error("Erro ao carregar barbeiros");
      return;
    }
    
    console.log("Barbeiros carregados:", data);
    if (data) setBarbers(data);
  };

  const fetchExistingGoal = async () => {
    if (!selectedBarberId) return;

    const { data, error } = await supabase
      .from("monthly_goals")
      .select("*")
      .eq("barber_id", selectedBarberId)
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar meta existente:", error);
    }

    if (data) {
      console.log("Meta existente encontrada:", data);
      setExistingGoal(data);
      setTargetCommission(data.target_commission.toString());
      setWorkDays(data.work_days.toString());
    } else {
      console.log("Nenhuma meta encontrada para este barbeiro/mês/ano");
      setExistingGoal(null);
      setTargetCommission("");
      setWorkDays("");
    }
  };

  const handleSave = async () => {
    if (!selectedBarberId) {
      toast.error("Selecione um barbeiro");
      return;
    }

    if (!targetCommission || !workDays) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);

    try {
      const goalData = {
        barber_id: selectedBarberId,
        month: selectedMonth,
        year: selectedYear,
        target_commission: Number(targetCommission),
        work_days: Number(workDays),
      };

      console.log("Salvando meta:", goalData);

      const { data, error } = await supabase
        .from("monthly_goals")
        .upsert(goalData, {
          onConflict: "barber_id,month,year"
        })
        .select();

      if (error) {
        console.error("Erro ao salvar meta:", error);
        throw error;
      }

      console.log("Meta salva com sucesso:", data);
      toast.success("Meta salva com sucesso!");
      
      // Limpar campos após salvar
      setTargetCommission("");
      setWorkDays("");
      setSelectedBarberId("");
      setExistingGoal(null);
    } catch (error: any) {
      console.error("Erro ao salvar meta:", error);
      toast.error(error.message || "Erro ao salvar meta");
    } finally {
      setLoading(false);
    }
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
        {/* Seleção do Barbeiro */}
        <div className="space-y-2">
          <Label htmlFor="barber" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Selecionar Barbeiro
          </Label>
          <Select
            value={selectedBarberId}
            onValueChange={(value) => setSelectedBarberId(value)}
          >
            <SelectTrigger id="barber">
              <SelectValue placeholder="Escolha um barbeiro..." />
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

        {/* Campos de Mês/Ano e Meta - só aparecem após selecionar barbeiro */}
        {selectedBarberId && (
          <>
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

            {existingGoal && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm">
                <p className="text-blue-600 dark:text-blue-400 font-medium">
                  ℹ️ Já existe uma meta cadastrada para este barbeiro neste mês/ano. 
                  Ao salvar, ela será atualizada.
                </p>
              </div>
            )}

            <div className="p-4 rounded-lg border border-border bg-secondary/20 space-y-4">
              <h3 className="font-bold text-lg">
                Meta para: {barbers.find(b => b.id === selectedBarberId)?.name}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target">
                    Meta de Recebimento Mensal (R$)
                  </Label>
                  <Input
                    id="target"
                    type="number"
                    step="0.01"
                    placeholder="5000.00"
                    value={targetCommission}
                    onChange={(e) => setTargetCommission(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="days">
                    Dias Úteis de Trabalho no Mês
                  </Label>
                  <Input
                    id="days"
                    type="number"
                    placeholder="22"
                    value={workDays}
                    onChange={(e) => setWorkDays(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Meta"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
