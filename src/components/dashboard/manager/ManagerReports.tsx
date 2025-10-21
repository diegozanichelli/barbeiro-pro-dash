import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, TrendingUp, Users, Pencil, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface DailyProduction {
  id: string;
  date: string;
  barber_id: string;
  services_total: number;
  products_total: number;
  services_count: number;
  products_count: number;
  clients_count: number;
  commission_earned: number;
}

interface Barber {
  id: string;
  name: string;
}

export default function ManagerReports() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCommission: 0,
    totalClients: 0,
    averageTicket: 0,
    goalsAchieved: 0,
    totalBarbers: 0,
  });
  
  const [productions, setProductions] = useState<DailyProduction[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<string>("all");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [editingProduction, setEditingProduction] = useState<DailyProduction | null>(null);
  const [deletingProductionId, setDeletingProductionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    services_total: "",
    products_total: "",
    services_count: "",
    products_count: "",
    clients_count: "",
  });

  useEffect(() => {
    fetchStats();
    fetchBarbers();
  }, []);

  useEffect(() => {
    fetchProductions();
  }, [startDate, endDate, selectedBarber]);

  const fetchStats = async () => {
    const now = new Date();
    const start = format(startOfMonth(now), "yyyy-MM-dd");
    const end = format(endOfMonth(now), "yyyy-MM-dd");

    // Buscar produções do mês
    const { data: productions } = await supabase
      .from("daily_productions")
      .select("*")
      .gte("date", start)
      .lte("date", end);

    // Buscar barbeiros ativos
    const { data: barbers } = await supabase
      .from("barbers")
      .select("id")
      .eq("status", "active");

    // Buscar metas do mês
    const { data: goals } = await supabase
      .from("monthly_goals")
      .select("*, barbers!inner(id)")
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear());

    if (productions) {
      const totalRevenue = productions.reduce(
        (sum, p) => sum + Number(p.services_total) + Number(p.products_total),
        0
      );
      const totalCommission = productions.reduce(
        (sum, p) => sum + Number(p.commission_earned),
        0
      );
      const totalClients = productions.reduce(
        (sum, p) => sum + Number(p.clients_count),
        0
      );

      // Calcular comissão acumulada por barbeiro para verificar metas
      const barberCommissions = new Map<string, number>();
      productions.forEach((p) => {
        const current = barberCommissions.get(p.barber_id) || 0;
        barberCommissions.set(p.barber_id, current + Number(p.commission_earned));
      });

      let goalsAchieved = 0;
      if (goals) {
        goals.forEach((goal) => {
          const earned = barberCommissions.get(goal.barber_id) || 0;
          if (earned >= goal.target_commission) {
            goalsAchieved++;
          }
        });
      }

      setStats({
        totalRevenue,
        totalCommission,
        totalClients,
        averageTicket: totalClients > 0 ? totalRevenue / totalClients : 0,
        goalsAchieved,
        totalBarbers: barbers?.length || 0,
      });
    }
  };

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    
    if (data) {
      setBarbers(data);
    }
  };

  const fetchProductions = async () => {
    let query = supabase
      .from("daily_productions")
      .select("*, barbers(name)")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    if (selectedBarber !== "all") {
      query = query.eq("barber_id", selectedBarber);
    }

    const { data } = await query;
    if (data) {
      setProductions(data as any);
    }
  };

  const handleEdit = (production: DailyProduction) => {
    setEditingProduction(production);
    setEditForm({
      services_total: production.services_total.toString(),
      products_total: production.products_total.toString(),
      services_count: production.services_count.toString(),
      products_count: production.products_count.toString(),
      clients_count: production.clients_count.toString(),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProduction) return;

    const { error } = await supabase
      .from("daily_productions")
      .update({
        services_total: Number(editForm.services_total),
        products_total: Number(editForm.products_total),
        services_count: Number(editForm.services_count),
        products_count: Number(editForm.products_count),
        clients_count: Number(editForm.clients_count),
      })
      .eq("id", editingProduction.id);

    if (error) {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Lançamento atualizado",
        description: "A meta dinâmica foi recalculada automaticamente.",
      });
      setEditingProduction(null);
      fetchStats();
      fetchProductions();
    }
  };

  const handleDelete = async () => {
    if (!deletingProductionId) return;

    const { error } = await supabase
      .from("daily_productions")
      .delete()
      .eq("id", deletingProductionId);

    if (error) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Lançamento excluído",
        description: "A meta dinâmica foi recalculada automaticamente.",
      });
      setDeletingProductionId(null);
      fetchStats();
      fetchProductions();
    }
  };

  const getBarberName = (production: any) => {
    return production.barbers?.name || "Barbeiro Desconhecido";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Visão Geral do Mês</h2>
        <p className="text-muted-foreground">Acompanhe o desempenho geral da sua barbearia</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Bruta Total</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {stats.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Serviços + Produtos</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão Total Paga</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              R$ {stats.totalCommission.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Para todos os barbeiros</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Atendimentos no mês</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio Geral</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {stats.averageTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Por cliente</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle>Metas Batidas</CardTitle>
          <CardDescription>Barbeiros que atingiram a meta do mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary">{stats.goalsAchieved}</span>
            <span className="text-2xl text-muted-foreground">/ {stats.totalBarbers}</span>
            <span className="text-sm text-muted-foreground">barbeiros</span>
          </div>
          <div className="mt-2">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${stats.totalBarbers > 0 ? (stats.goalsAchieved / stats.totalBarbers) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle>Lançamentos Diários</CardTitle>
          <CardDescription>Visualize, edite ou exclua lançamentos de produção</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>Barbeiro</Label>
              <Select value={selectedBarber} onValueChange={setSelectedBarber}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um barbeiro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Barbeiros</SelectItem>
                  {barbers.map((barber) => (
                    <SelectItem key={barber.id} value={barber.id}>
                      {barber.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Barbeiro</TableHead>
                  <TableHead className="text-right">Serviços (R$)</TableHead>
                  <TableHead className="text-right">Produtos (R$)</TableHead>
                  <TableHead className="text-right">Qtd Serviços</TableHead>
                  <TableHead className="text-right">Qtd Produtos</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Nenhum lançamento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  productions.map((production) => (
                    <TableRow key={production.id}>
                      <TableCell>{format(new Date(production.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{getBarberName(production)}</TableCell>
                      <TableCell className="text-right">
                        R$ {Number(production.services_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {Number(production.products_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{production.services_count}</TableCell>
                      <TableCell className="text-right">{production.products_count}</TableCell>
                      <TableCell className="text-right">{production.clients_count}</TableCell>
                      <TableCell className="text-right">
                        R$ {Number(production.commission_earned).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(production)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingProductionId(production.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={!!editingProduction} onOpenChange={() => setEditingProduction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>
              Altere os valores do lançamento. A comissão será recalculada automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Serviços (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.services_total}
                  onChange={(e) => setEditForm({ ...editForm, services_total: e.target.value })}
                />
              </div>
              <div>
                <Label>Total Produtos (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.products_total}
                  onChange={(e) => setEditForm({ ...editForm, products_total: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Qtd Serviços</Label>
                <Input
                  type="number"
                  value={editForm.services_count}
                  onChange={(e) => setEditForm({ ...editForm, services_count: e.target.value })}
                />
              </div>
              <div>
                <Label>Qtd Produtos</Label>
                <Input
                  type="number"
                  value={editForm.products_count}
                  onChange={(e) => setEditForm({ ...editForm, products_count: e.target.value })}
                />
              </div>
              <div>
                <Label>Qtd Clientes</Label>
                <Input
                  type="number"
                  value={editForm.clients_count}
                  onChange={(e) => setEditForm({ ...editForm, clients_count: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduction(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingProductionId} onOpenChange={() => setDeletingProductionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita e a meta dinâmica será recalculada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
