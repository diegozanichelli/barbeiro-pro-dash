import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { getManausDate } from "@/lib/dateUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Target, Calendar, Plus, Pencil, Trash2, Landmark } from "lucide-react";
import { format } from "date-fns";

interface BarberOption {
  id: string;
  name: string;
}

interface MonthlyGoal {
  id: string;
  barber_id: string;
  month: number;
  year: number;
  target_commission: number;
  work_days: number;
  barbers?: {
    name: string;
  };
}

export default function GoalsManagement() {
  const { organizationId } = useOrganization();
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const manausNow = useMemo(() => getManausDate(), []);
  const [filterMonth, setFilterMonth] = useState(manausNow.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(manausNow.getFullYear());
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
  
  // Form states
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [targetCommission, setTargetCommission] = useState("");
  const [workDays, setWorkDays] = useState("");
  const [editingGoal, setEditingGoal] = useState<MonthlyGoal | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [holidayDates, setHolidayDates] = useState<Date[]>([]);
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [holidayTableUnavailable, setHolidayTableUnavailable] = useState(false);

  const isHolidayTableMissingError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;

    const maybe = error as { message?: string };
    return (maybe.message || "").includes("Could not find the table 'public.organization_holidays' in the schema cache");
  };

  const fetchBarbers = useCallback(async () => {
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
  }, []);

  const fetchGoals = useCallback(async () => {
    const { data, error } = await supabase
      .from("monthly_goals")
      .select(`
        *,
        barbers (
          name
        )
      `)
      .eq("month", filterMonth)
      .eq("year", filterYear)
      .order("barbers(name)");

    if (error) {
      console.error("Erro ao buscar metas:", error);
      toast.error("Erro ao carregar metas");
      return;
    }

    if (data) {
      setGoals(data as MonthlyGoal[]);
    }
  }, [filterMonth, filterYear]);

  const loadHolidaysForMonth = useCallback(async () => {
    if (!organizationId) return;

    const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
    const endDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-31`;

    const { data, error } = await (supabase as any)
      .from("organization_holidays")
      .select("date")
      .eq("organization_id", organizationId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      console.error("Erro ao carregar feriados:", error);

      if (isHolidayTableMissingError(error)) {
        setHolidayTableUnavailable(true);
        return;
      }

      toast.error("Erro ao carregar feriados");
      return;
    }

    setHolidayTableUnavailable(false);

    const loadedDates = (data || []).map((item) => new Date(`${item.date}T12:00:00`));
    setHolidayDates(loadedDates);
  }, [organizationId, filterYear, filterMonth]);

  const saveHolidaysForMonth = async () => {
    if (!organizationId) {
      toast.error("Organização não encontrada");
      return;
    }

    setSavingHolidays(true);

    try {
      const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
      const endDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-31`;

      const { error: deleteError } = await (supabase as any)
        .from("organization_holidays")
        .delete()
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .lte("date", endDate);

      if (deleteError) throw deleteError;

      if (holidayDates.length > 0) {
        const payload = holidayDates.map((date) => ({
          organization_id: organizationId,
          date: format(date, "yyyy-MM-dd"),
        }));

        const { error: insertError } = await (supabase as any)
          .from("organization_holidays")
          .insert(payload);

        if (insertError) throw insertError;
      }

      toast.success("Feriados salvos com sucesso!");
      loadHolidaysForMonth();
    } catch (error: unknown) {
      if (isHolidayTableMissingError(error)) {
        setHolidayTableUnavailable(true);
        toast.error("Tabela de feriados ainda não existe no banco. Rode as migrações (supabase db push) e tente novamente.");
      } else {
        toast.error(error instanceof Error ? error.message : "Erro ao salvar feriados");
      }
    } finally {
      setSavingHolidays(false);
    }
  };

  const fetchHolidays = async () => {
    if (!organizationId) return;

    const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
    const endDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-31`;

    const { data, error } = await (supabase as any)
      .from("organization_holidays")
      .select("date")
      .eq("organization_id", organizationId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      console.error("Erro ao carregar feriados:", error);
      toast.error("Erro ao carregar feriados");
      return;
    }

    const loadedDates = (data || []).map((item) => new Date(`${item.date}T12:00:00`));
    setHolidayDates(loadedDates);
  };

  const handleSaveHolidays = async () => {
    if (!organizationId) {
      toast.error("Organização não encontrada");
      return;
    }

    setSavingHolidays(true);

    try {
      const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
      const endDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-31`;

      const { error: deleteError } = await (supabase as any)
        .from("organization_holidays")
        .delete()
        .eq("organization_id", organizationId)
        .gte("date", startDate)
        .lte("date", endDate);

      if (deleteError) throw deleteError;

      if (holidayDates.length > 0) {
        const payload = holidayDates.map((date) => ({
          organization_id: organizationId,
          date: format(date, "yyyy-MM-dd"),
        }));

        const { error: insertError } = await (supabase as any)
          .from("organization_holidays")
          .insert(payload);

        if (insertError) throw insertError;
      }

      toast.success("Feriados salvos com sucesso!");
      fetchHolidays();
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar feriados");
    } finally {
      setSavingHolidays(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedBarberId || !targetCommission || !workDays) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (!organizationId) {
      toast.error("Organização não encontrada");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("monthly_goals")
        .insert({
          barber_id: selectedBarberId,
          organization_id: organizationId,
          month: filterMonth,
          year: filterYear,
          target_commission: Number(targetCommission),
          work_days: Number(workDays),
        });

      if (error) throw error;

      toast.success("Meta criada com sucesso!");
      setIsCreateDialogOpen(false);
      resetForm();
      fetchGoals();
    } catch (error: unknown) {
      // Detectar erro de duplicate key
      const dbError = error as { code?: string; message?: string };
      if (dbError.code === '23505' || dbError.message?.includes('duplicate key')) {
        toast.error("Erro: Este barbeiro já possui uma meta para este mês. Use o botão Editar (lápis) para modificar.");
      } else {
        toast.error(error instanceof Error ? error.message : "Erro ao criar meta");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editingGoal || !targetCommission || !workDays) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("monthly_goals")
        .update({
          target_commission: Number(targetCommission),
          work_days: Number(workDays),
        })
        .eq("id", editingGoal.id);

      if (error) throw error;

      toast.success("Meta atualizada com sucesso!");
      setIsEditDialogOpen(false);
      resetForm();
      fetchGoals();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar meta");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGoalId) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from("monthly_goals")
        .delete()
        .eq("id", deletingGoalId);

      if (error) throw error;

      toast.success("Meta excluída com sucesso!");
      setIsDeleteDialogOpen(false);
      setDeletingGoalId(null);
      fetchGoals();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir meta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, [fetchBarbers]);

  useEffect(() => {
    fetchGoals();
    loadHolidaysForMonth();
  }, [fetchGoals, loadHolidaysForMonth]);

  const openEditDialog = (goal: MonthlyGoal) => {
    setEditingGoal(goal);
    setTargetCommission(goal.target_commission.toString());
    setWorkDays(goal.work_days.toString());
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (goalId: string) => {
    setDeletingGoalId(goalId);
    setIsDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedBarberId("");
    setTargetCommission("");
    setWorkDays("");
    setEditingGoal(null);
  };

  // Calcular barbeiros disponíveis (sem meta no mês/ano atual)
  const availableBarbers = useMemo(() => {
    const barbersWithGoals = new Set(goals.map(goal => goal.barber_id));
    return barbers.filter(barber => !barbersWithGoals.has(barber.id));
  }, [barbers, goals]);

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = [2024, 2025, 2026, 2027];

  return (
    <>
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Gerenciar Metas Mensais
              </CardTitle>
              <CardDescription>Visualize, edite e exclua as metas cadastradas</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsHolidayDialogOpen(true)}
              >
                <Landmark className="w-4 h-4 mr-2" />
                Configurar Feriados
              </Button>

              <Button 
                onClick={() => setIsCreateDialogOpen(true)}
                disabled={availableBarbers.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Nova Meta
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtro de Mês/Ano */}
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="filter-month" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Filtrar por Mês/Ano
              </Label>
              <div className="flex gap-2">
                <Select
                  value={String(filterMonth)}
                  onValueChange={(value) => setFilterMonth(Number(value))}
                >
                  <SelectTrigger id="filter-month" className="flex-1">
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

                <Select
                  value={String(filterYear)}
                  onValueChange={(value) => setFilterYear(Number(value))}
                >
                  <SelectTrigger className="w-32">
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
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                Feriados da Empresa ({months[filterMonth - 1]}/{filterYear})
              </CardTitle>
              <CardDescription>
                Selecione os dias de feriado em que a empresa não vai funcionar. Esses dias serão desconsiderados nos cálculos de dias restantes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DateCalendar
                mode="multiple"
                selected={holidayDates}
                onSelect={(dates) => setHolidayDates(dates || [])}
                month={new Date(filterYear, filterMonth - 1, 1)}
                onMonthChange={() => undefined}
                className="rounded-md border"
              />

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {holidayDates.length} {holidayDates.length === 1 ? "feriado selecionado" : "feriados selecionados"}
                </p>
                <Button onClick={handleSaveHolidays} disabled={savingHolidays}>
                  {savingHolidays ? "Salvando..." : "Salvar Feriados"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Metas */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                  <TableHead>Meta de Recebimento (R$)</TableHead>
                  <TableHead>Dias Úteis de Trabalho</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma meta cadastrada para este mês/ano
                    </TableCell>
                  </TableRow>
                ) : (
                  goals.map((goal) => (
                    <TableRow key={goal.id}>
                      <TableCell className="font-medium">
                        {goal.barbers?.name || "Barbeiro não encontrado"}
                      </TableCell>
                      <TableCell>
                        R$ {goal.target_commission.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{goal.work_days} dias</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(goal)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(goal.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="w-4 h-4" />
              Feriados da Empresa ({months[filterMonth - 1]}/{filterYear})
            </DialogTitle>
            <DialogDescription>
              Selecione os dias de feriado em que a empresa não vai funcionar. Esses dias serão desconsiderados nos cálculos de dias restantes.
            </DialogDescription>
          </DialogHeader>

          {holidayTableUnavailable && (
            <Alert variant="destructive">
              <AlertDescription>
                A tabela de feriados ainda não está disponível no banco deste ambiente.
                Execute as migrações (ex.: <strong>supabase db push</strong>) e tente novamente.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-2">
            <DateCalendar
              mode="multiple"
              selected={holidayDates}
              onSelect={(dates) => setHolidayDates(dates || [])}
              month={new Date(filterYear, filterMonth - 1, 1)}
              onMonthChange={() => undefined}
              className="rounded-md border"
            />

            <p className="text-sm text-muted-foreground">
              {holidayDates.length} {holidayDates.length === 1 ? "feriado selecionado" : "feriados selecionados"}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHolidayDialogOpen(false)}>
              Fechar
            </Button>
            <Button onClick={saveHolidaysForMonth} disabled={savingHolidays || holidayTableUnavailable}>
              {savingHolidays ? "Salvando..." : "Salvar Feriados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Criar Meta */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Meta</DialogTitle>
            <DialogDescription>
              Defina a meta para {months[filterMonth - 1]} de {filterYear}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-barber">Selecionar Barbeiro</Label>
              <Select
                value={selectedBarberId}
                onValueChange={(value) => setSelectedBarberId(value)}
              >
                <SelectTrigger id="create-barber">
                  <SelectValue placeholder={availableBarbers.length === 0 ? "Todos os barbeiros já têm meta" : "Escolha um barbeiro..."} />
                </SelectTrigger>
                <SelectContent>
                  {availableBarbers.map((barber) => (
                    <SelectItem key={barber.id} value={barber.id}>
                      {barber.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-target">Meta de Recebimento Mensal (R$)</Label>
              <Input
                id="create-target"
                type="number"
                step="0.01"
                placeholder="5000.00"
                value={targetCommission}
                onChange={(e) => setTargetCommission(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-days">Dias Úteis de Trabalho no Mês</Label>
              <Input
                id="create-days"
                type="number"
                placeholder="22"
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? "Salvando..." : "Criar Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Editar Meta */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Meta</DialogTitle>
            <DialogDescription>
              Atualize a meta de {editingGoal?.barbers?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-target">Meta de Recebimento Mensal (R$)</Label>
              <Input
                id="edit-target"
                type="number"
                step="0.01"
                placeholder="5000.00"
                value={targetCommission}
                onChange={(e) => setTargetCommission(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-days">Dias Úteis de Trabalho no Mês</Label>
              <Input
                id="edit-days"
                type="number"
                placeholder="22"
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Confirmar Exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A meta será permanentemente excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setDeletingGoalId(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {loading ? "Excluindo..." : "Excluir Meta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
