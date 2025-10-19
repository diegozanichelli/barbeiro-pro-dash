import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Target, Calendar, Plus, Pencil, Trash2 } from "lucide-react";

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
  const [barbers, setBarbers] = useState<any[]>([]);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Form states
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [targetCommission, setTargetCommission] = useState("");
  const [workDays, setWorkDays] = useState("");
  const [editingGoal, setEditingGoal] = useState<MonthlyGoal | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [filterMonth, filterYear]);

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

  const fetchGoals = async () => {
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
  };

  const handleCreate = async () => {
    if (!selectedBarberId || !targetCommission || !workDays) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("monthly_goals")
        .insert({
          barber_id: selectedBarberId,
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
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar meta");
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
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar meta");
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
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir meta");
    } finally {
      setLoading(false);
    }
  };

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
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Nova Meta
            </Button>
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
