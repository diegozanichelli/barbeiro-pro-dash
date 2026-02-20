import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getManausDate } from "@/lib/dateUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { DollarSign, Save, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Barber {
  id: string;
  name: string;
  unit_id: string;
}

interface Unit {
  id: string;
  name: string;
}

interface SubscriptionEarning {
  id: string;
  barber_id: string;
  month: number;
  year: number;
  amount: number;
  total_revenue: number;
  barbers?: { name: string };
}

export default function SubscriptionEarningsForm() {
  const manausNow = useMemo(() => getManausDate(), []);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [earnings, setEarnings] = useState<SubscriptionEarning[]>([]);
  
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [selectedBarber, setSelectedBarber] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>((manausNow.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(manausNow.getFullYear().toString());
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const months = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = getManausDate().getFullYear() - 2 + i;
    return { value: year.toString(), label: year.toString() };
  });

  useEffect(() => {
    fetchUnits();
    fetchBarbers();
    fetchEarnings();
  }, []);

  useEffect(() => {
    fetchEarnings();
  }, [selectedMonth, selectedYear]);

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
      .select("id, name, unit_id")
      .eq("status", "active")
      .order("name");
    
    if (data) setBarbers(data);
  };

  const fetchEarnings = async () => {
    const { data } = await supabase
      .from("barber_subscription_earnings")
      .select("*, barbers(name)")
      .eq("month", parseInt(selectedMonth))
      .eq("year", parseInt(selectedYear))
      .order("created_at", { ascending: false });
    
    if (data) setEarnings(data as unknown as SubscriptionEarning[]);
  };

  const filteredBarbers = selectedUnit === "all" 
    ? barbers 
    : barbers.filter(b => b.unit_id === selectedUnit);

  const handleSave = async () => {
    if (!selectedBarber || totalRevenue <= 0 || amount <= 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione o barbeiro e informe ambos os valores (Faturamento Bruto e Ganho do Barbeiro).",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { data: barberData } = await supabase
        .from("barbers")
        .select("organization_id")
        .eq("id", selectedBarber)
        .single();

      if (!barberData) {
        throw new Error("Barbeiro não encontrado");
      }

      if (editingId) {
        const { error } = await supabase
          .from("barber_subscription_earnings")
          .update({ amount, total_revenue: totalRevenue } as any)
          .eq("id", editingId);

        if (error) throw error;

        toast({
          title: "Atualizado!",
          description: "Ganho de assinatura atualizado com sucesso.",
        });
      } else {
        const { data: existing } = await supabase
          .from("barber_subscription_earnings")
          .select("id")
          .eq("barber_id", selectedBarber)
          .eq("month", parseInt(selectedMonth))
          .eq("year", parseInt(selectedYear))
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("barber_subscription_earnings")
            .update({ amount, total_revenue: totalRevenue } as any)
            .eq("id", existing.id);

          if (error) throw error;

          toast({
            title: "Atualizado!",
            description: "Valor existente foi atualizado.",
          });
        } else {
          const { error } = await supabase
            .from("barber_subscription_earnings")
            .insert({
              barber_id: selectedBarber,
              organization_id: barberData.organization_id,
              month: parseInt(selectedMonth),
              year: parseInt(selectedYear),
              amount,
              total_revenue: totalRevenue,
            } as any);

          if (error) throw error;

          toast({
            title: "Salvo!",
            description: "Ganho de assinatura registrado com sucesso.",
          });
        }
      }

      setSelectedBarber("");
      setAmount(0);
      setTotalRevenue(0);
      setEditingId(null);
      fetchEarnings();
    } catch (error) {
      console.error("Error saving subscription earning:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (earning: SubscriptionEarning) => {
    setSelectedBarber(earning.barber_id);
    setAmount(earning.amount);
    setTotalRevenue(earning.total_revenue || 0);
    setEditingId(earning.id);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from("barber_subscription_earnings")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;

      toast({
        title: "Excluído!",
        description: "Registro removido com sucesso.",
      });
      
      fetchEarnings();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir registro.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const getMonthName = (month: number) => {
    return months.find(m => m.value === month.toString())?.label || month.toString();
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Lançar Ganhos de Assinatura
          </CardTitle>
          <CardDescription>
            Informe os valores de recorrência/assinatura calculados externamente para cada barbeiro
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Filtrar por Unidade</Label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
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
              <Label>Barbeiro *</Label>
              <Select value={selectedBarber} onValueChange={setSelectedBarber}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o barbeiro" />
                </SelectTrigger>
                <SelectContent>
                  {filteredBarbers.map(barber => (
                    <SelectItem key={barber.id} value={barber.id}>{barber.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mês *</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(month => (
                    <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ano *</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Faturamento Bruto (Cadeira) *</Label>
              <CurrencyInput
                value={totalRevenue}
                onChange={setTotalRevenue}
                quickValues={[500, 1000, 2000, 3000]}
              />
              <p className="text-xs text-muted-foreground">
                Este valor será usado para calcular o faturamento total da unidade nos relatórios.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ganho do Barbeiro (Comissão) *</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                quickValues={[200, 500, 1000, 1500]}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => {
                setEditingId(null);
                setSelectedBarber("");
                setAmount(0);
                setTotalRevenue(0);
              }}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle>Lançamentos de {getMonthName(parseInt(selectedMonth))} / {selectedYear}</CardTitle>
          <CardDescription>Ganhos de assinatura registrados no período</CardDescription>
        </CardHeader>
        <CardContent>
          {earnings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum lançamento registrado para este período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                  <TableHead className="text-right">Faturamento Bruto (R$)</TableHead>
                  <TableHead className="text-right">Ganho Barbeiro (R$)</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map(earning => (
                  <TableRow key={earning.id}>
                    <TableCell className="font-medium">
                      {earning.barbers?.name || "Desconhecido"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-foreground">
                      R$ {(earning.total_revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      R$ {earning.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(earning)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeletingId(earning.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
