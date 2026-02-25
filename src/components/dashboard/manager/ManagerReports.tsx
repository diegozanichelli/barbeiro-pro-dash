import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, TrendingUp, Users, Pencil, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, parse } from "date-fns";
import { getManausDate } from "@/lib/dateUtils";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import TransactionManagerModal from "./TransactionManagerModal";
import { useOrganization } from "@/hooks/useOrganization";

interface DailyProduction {
  id: string;
  date: string;
  barber_id: string;
  services_total: number;
  services_basic_total?: number | null;
  services_extra_total?: number | null;
  tx_basic_total?: number | null;
  tx_extra_total?: number | null;
  tx_products_total?: number | null;
  products_total: number;
  services_count: number;
  products_count: number;
  clients_count: number;
  commission_earned: number;
  barbers?: {
    id?: string;
    unit_id?: string;
    name?: string;
  } | null;
}

interface Barber {
  id: string;
  name: string;
  unit_id: string;
}

interface Unit {
  id: string;
  name: string;
}

export default function ManagerReports() {
  const { organizationId } = useOrganization();
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
  const [allBarbers, setAllBarbers] = useState<Barber[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<string>("all");
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const manausNow = useMemo(() => getManausDate(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(manausNow),
    to: endOfMonth(manausNow),
  });
  const [editingProduction, setEditingProduction] = useState<DailyProduction | null>(null);
  const [deletingProductionId, setDeletingProductionId] = useState<string | null>(null);

  useEffect(() => {
    fetchUnits();
    fetchBarbers();
  }, []);

  useEffect(() => {
    // Filtrar barbeiros pela unidade selecionada
    if (selectedUnit === "all") {
      setBarbers(allBarbers);
    } else {
      setBarbers(allBarbers.filter(b => b.unit_id === selectedUnit));
    }
    // Reset do barbeiro selecionado quando a unidade muda
    setSelectedBarber("all");
  }, [selectedUnit, allBarbers]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchStats();
      fetchProductions();
    }
  }, [dateRange, selectedBarber, selectedUnit]);

  const fetchStats = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    const now = new Date();

    // Usar RPC para agregação no banco (evita limite de 1000 linhas)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_manager_report_stats', {
      p_date_from: format(dateRange.from, "yyyy-MM-dd"),
      p_date_to: format(dateRange.to, "yyyy-MM-dd"),
      p_unit_id: selectedUnit !== "all" ? selectedUnit : null,
      p_barber_id: selectedBarber !== "all" ? selectedBarber : null,
    });

    if (rpcError) {
      console.error("Erro ao buscar stats:", rpcError);
      return;
    }

    const statsRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const totalRevenue = Number(statsRow?.total_revenue) || 0;
    const totalCommission = Number(statsRow?.total_commission) || 0;
    const totalClients = Number(statsRow?.total_clients) || 0;
    const averageTicket = Number(statsRow?.average_ticket) || 0;

    // Buscar barbeiros ativos (filtrados por unidade se selecionada)
    let barbersQuery = supabase
      .from("barbers")
      .select("id")
      .eq("status", "active");

    if (selectedUnit !== "all") {
      barbersQuery = barbersQuery.eq("unit_id", selectedUnit);
    }

    const { data: barbersData } = await barbersQuery;

    // Buscar metas do mês (filtradas por unidade se selecionada)
    let goalsQuery = supabase
      .from("monthly_goals")
      .select("*, barbers!inner(id, unit_id)")
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear());

    if (selectedUnit !== "all") {
      goalsQuery = goalsQuery.eq("barbers.unit_id", selectedUnit);
    }

    const { data: goals } = await goalsQuery;

    if (productions) {
      const totalRevenue = productions.reduce(
        (sum, p: DailyProduction) => {
          const txServicesTotal = (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0);
          const txProductsTotal = Number(p.tx_products_total) || 0;
          const hasTxSource = txServicesTotal > 0 || txProductsTotal > 0;

          if (hasTxSource) {
            return sum + txServicesTotal + txProductsTotal;
          }

          const manualServicesTotal = (p.services_basic_total !== null || p.services_extra_total !== null)
            ? (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0)
            : (Number(p.services_total) || 0);
          const manualProductsTotal = Number(p.products_total) || 0;

          return sum + manualServicesTotal + manualProductsTotal;
        },
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

        goals.forEach((goal: any) => {
          const earned = barberCommissions.get(goal.barber_id) || 0;
          if (earned >= goal.target_commission) {
            goalsAchieved++;
          }
        });
      }
    }

    setStats({
      totalRevenue,
      totalCommission,
      totalClients,
      averageTicket,
      goalsAchieved,
      totalBarbers: barbersData?.length || 0,
    });
  };

  const fetchUnits = async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    
    if (data) {
      setUnits(data);
    }
  };

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("id, name, unit_id")
      .eq("status", "active")
      .order("name");
    
    if (data) {
      setAllBarbers(data);
      setBarbers(data);
    }
  };

  const fetchProductions = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    let query = supabase
      .from("daily_productions")
      .select("*, barbers!inner(name, unit_id)")
      .gte("date", format(dateRange.from, "yyyy-MM-dd"))
      .lte("date", format(dateRange.to, "yyyy-MM-dd"))
      .order("date", { ascending: false });

    // Aplicar filtro de unidade
    if (selectedUnit !== "all") {
      query = query.eq("barbers.unit_id", selectedUnit);
    }

    // Aplicar filtro de barbeiro
    if (selectedBarber !== "all") {
      query = query.eq("barber_id", selectedBarber);
    }

    const { data } = await query;
    if (data) {
      setProductions((data ?? []) as DailyProduction[]);
    }
  };

  const handleEdit = (production: DailyProduction) => {
    setEditingProduction(production);
  };

  const handleAuditSuccess = async () => {
    await Promise.all([fetchStats(), fetchProductions()]);
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
        description: "Os dados foram atualizados automaticamente.",
      });
      setDeletingProductionId(null);
      
      // Forçar reload completo dos dados
      await Promise.all([
        fetchStats(),
        fetchProductions(),
      ]);
    }
  };

  const getBarberName = (production: DailyProduction) => {
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
          <CardTitle>Performance Individual dos Barbeiros</CardTitle>
          <CardDescription>Receitas e métricas por barbeiro no período selecionado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Período</Label>
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                  <TableHead className="text-right">Faturamento Total (R$)</TableHead>
                  <TableHead className="text-right">Serviços Básicos (R$)</TableHead>
                  <TableHead className="text-right">Serviços Extras (R$)</TableHead>
                  <TableHead className="text-right">Produtos (R$)</TableHead>
                  <TableHead className="text-right">Comissão (R$)</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Clientes Atendidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Agrupar produções por barbeiro
                  const barberStats = new Map<string, {
                    name: string;
                    servicesBasicTotal: number;
                    servicesExtraTotal: number;
                    productsTotal: number;
                    commissionTotal: number;
                    clientsTotal: number;
                  }>();

                  productions.forEach((production: DailyProduction) => {
                    const barberId = production.barber_id;
                    const barberName = production.barbers?.name || "Barbeiro Desconhecido";

                    if (!barberStats.has(barberId)) {
                      barberStats.set(barberId, {
                        name: barberName,
                        servicesBasicTotal: 0,
                        servicesExtraTotal: 0,
                        productsTotal: 0,
                        commissionTotal: 0,
                        clientsTotal: 0,
                      });
                    }

                    const stats = barberStats.get(barberId)!;

                    const txBasic = Number(production.tx_basic_total) || 0;
                    const txExtra = Number(production.tx_extra_total) || 0;
                    const txProducts = Number(production.tx_products_total) || 0;
                    const hasTxSource = txBasic + txExtra + txProducts > 0;

                    if (hasTxSource) {
                      stats.servicesBasicTotal += txBasic;
                      stats.servicesExtraTotal += txExtra;
                      stats.productsTotal += txProducts;
                    } else if (production.services_basic_total !== null || production.services_extra_total !== null) {
                      stats.servicesBasicTotal += Number(production.services_basic_total) || 0;
                      stats.servicesExtraTotal += Number(production.services_extra_total) || 0;
                      stats.productsTotal += Number(production.products_total) || 0;
                    } else {
                      stats.servicesBasicTotal += Number(production.services_total) || 0;
                      stats.productsTotal += Number(production.products_total) || 0;
                    }

                    stats.commissionTotal += Number(production.commission_earned);
                    stats.clientsTotal += Number(production.clients_count);
                  });

                  const barberArray = Array.from(barberStats.entries()).map(([id, stats]) => ({
                    id,
                    ...stats,
                    totalRevenue: stats.servicesBasicTotal + stats.servicesExtraTotal + stats.productsTotal,
                  }));

                  // Ordenar por faturamento total (decrescente)
                  barberArray.sort((a, b) => b.totalRevenue - a.totalRevenue);

                  if (barberArray.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          Nenhum lançamento encontrado no período
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return barberArray.map((barber) => (
                    <TableRow key={barber.id}>
                      <TableCell className="font-medium">{barber.name}</TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        R$ {barber.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {barber.servicesBasicTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {barber.servicesExtraTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {barber.productsTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-success">
                        R$ {barber.commissionTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{barber.clientsTotal}</TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
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
              <Label>Período</Label>
              <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>
            <div className="flex-1">
              <Label>Unidade</Label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Unidades</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <TableHead className="text-right">Serviços Básicos (R$)</TableHead>
                  <TableHead className="text-right">Serviços Extras (R$)</TableHead>
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
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Nenhum lançamento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  productions.map((production) => (
                    <TableRow key={production.id}>
                      <TableCell>{format(parse(production.date as string, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{getBarberName(production)}</TableCell>
                      <TableCell className="text-right">
                        R$ {(Number(production.services_basic_total ?? production.services_total ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {(Number(production.services_extra_total ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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

      {editingProduction && organizationId && (
        <TransactionManagerModal
          open={!!editingProduction}
          onOpenChange={(open) => { if (!open) setEditingProduction(null); }}
          barberId={editingProduction.barber_id}
          barberName={allBarbers.find(b => b.id === editingProduction.barber_id)?.name || "Barbeiro"}
          organizationId={organizationId}
          dailyProductionId={editingProduction.id}
          date={editingProduction.date}
          onSuccess={handleAuditSuccess}
          auditMode={true}
        />
      )}

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
