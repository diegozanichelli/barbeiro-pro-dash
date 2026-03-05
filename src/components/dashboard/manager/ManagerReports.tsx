import { useEffect, useState, useCallback, useMemo } from "react";
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
  manual_basic_total?: number | null;
  manual_extra_total?: number | null;
  manual_products_total?: number | null;
  products_total: number;
  services_count: number;
  products_count: number;
  clients_count: number;
  commission_earned: number;
  barbers?: {
    id?: string;
    unit_id?: string;
    name?: string;
    services_commission?: number;
    products_commission?: number;
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

interface BarberPerformanceRow {
  id: string;
  name: string;
  servicesBasicTotal: number;
  servicesExtraTotal: number;
  productsTotal: number;
  commissionTotal: number;
  clientsTotal: number;
  totalRevenue: number;
}

interface ClientCountTransaction {
  daily_production_id: string | null;
  source: string | null;
  created_at: string;
  client_name: string | null;
  mobile_phone: string | null;
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
  const today = getManausDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [editingProduction, setEditingProduction] = useState<DailyProduction | null>(null);
  const [deletingProductionId, setDeletingProductionId] = useState<string | null>(null);
  const [productionClientCounts, setProductionClientCounts] = useState<Map<string, number>>(new Map());

  const getProductionTotals = useCallback((production: DailyProduction) => {
    const manualBasic = Number(production.manual_basic_total ?? 0);
    const manualExtra = Number(production.manual_extra_total ?? 0);
    const manualProducts = Number(production.manual_products_total ?? 0);
    const txBasic = Number(production.tx_basic_total ?? 0);
    const txExtra = Number(production.tx_extra_total ?? 0);
    const txProducts = Number(production.tx_products_total ?? 0);
    const legacyBasic = Number(production.services_basic_total ?? production.services_total ?? 0);
    const legacyExtra = Number(production.services_extra_total ?? 0);
    const legacyProducts = Number(production.products_total ?? 0);

    const hasManual = manualBasic + manualExtra + manualProducts > 0;
    const hasTx = txBasic + txExtra + txProducts > 0;

    if (hasManual) {
      return { basic: manualBasic, extra: manualExtra, products: manualProducts };
    }

    if (hasTx) {
      return { basic: txBasic, extra: txExtra, products: txProducts };
    }

    return { basic: legacyBasic, extra: legacyExtra, products: legacyProducts };
  }, []);

  const getEffectiveCommission = useCallback((production: DailyProduction) => {
    const savedCommission = Number(production.commission_earned) || 0;
    if (savedCommission > 0) {
      return savedCommission;
    }

    const { basic, extra, products } = getProductionTotals(production);
    const totalRevenue = basic + extra + products;
    if (totalRevenue <= 0) {
      return 0;
    }

    const servicesRate = Number(production.barbers?.services_commission ?? 0) / 100;
    const productsRate = Number(production.barbers?.products_commission ?? 0) / 100;

    return ((basic + extra) * servicesRate) + (products * productsRate);
  }, [getProductionTotals]);

  const buildClientCountMap = useCallback((transactions: ClientCountTransaction[]) => {
    const grouped = new Map<string, Set<string>>();

    transactions.forEach((tx) => {
      if (!tx.daily_production_id) return;

      const checkoutIdentity = [
        tx.source || "unknown",
        tx.mobile_phone || tx.client_name || "sem-cliente",
        tx.created_at,
      ].join("|");

      if (!grouped.has(tx.daily_production_id)) {
        grouped.set(tx.daily_production_id, new Set());
      }

      grouped.get(tx.daily_production_id)?.add(checkoutIdentity);
    });

    return new Map(Array.from(grouped.entries()).map(([id, keys]) => [id, keys.size]));
  }, []);

  const getProductionClientsCount = useCallback((production: DailyProduction) => {
    const txCount = productionClientCounts.get(production.id) || 0;
    return txCount > 0 ? txCount : Number(production.clients_count) || 0;
  }, [productionClientCounts]);


  const fetchStats = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;

    const goalReferenceDate = dateRange.from;
    const startDate = format(dateRange.from, "yyyy-MM-dd");
    const endDate = format(dateRange.to, "yyyy-MM-dd");

    // Faturamento consolidado via RPC (sem view)
    const rpcParams: { p_date_from: string; p_date_to: string; p_unit_id?: string; p_barber_id?: string } = {
      p_date_from: startDate,
      p_date_to: endDate,
    };
    if (selectedUnit !== "all") rpcParams.p_unit_id = selectedUnit;
    if (selectedBarber !== "all") rpcParams.p_barber_id = selectedBarber;

    let commissionsQuery = supabase
      .from("daily_productions")
      .select("id, barber_id, commission_earned, clients_count, services_total, services_basic_total, services_extra_total, products_total, tx_basic_total, tx_extra_total, tx_products_total, manual_basic_total, manual_extra_total, manual_products_total, barbers!inner(id, unit_id, services_commission, products_commission)")
      .gte("date", startDate)
      .lte("date", endDate);

    if (selectedUnit !== "all") {
      commissionsQuery = commissionsQuery.eq("barbers.unit_id", selectedUnit);
    }

    if (selectedBarber !== "all") {
      commissionsQuery = commissionsQuery.eq("barber_id", selectedBarber);
    }

    // Buscar barbeiros ativos
    let barbersQuery = supabase
      .from("barbers")
      .select("id")
      .eq("status", "active");

    if (selectedUnit !== "all") {
      barbersQuery = barbersQuery.eq("unit_id", selectedUnit);
    }

    // Buscar metas do mês
    let goalsQuery = supabase
      .from("monthly_goals")
      .select("*, barbers!inner(id, unit_id)")
      .eq("month", goalReferenceDate.getMonth() + 1)
      .eq("year", goalReferenceDate.getFullYear());

    if (selectedUnit !== "all") {
      goalsQuery = goalsQuery.eq("barbers.unit_id", selectedUnit);
    }

    const [rpcRes, commissionsRes, barbersRes, goalsRes] = await Promise.all([
      supabase.rpc("get_manager_report_stats", rpcParams),
      commissionsQuery,
      barbersQuery,
      goalsQuery,
    ]);

    if (rpcRes.error) {
      console.error("Erro RPC get_manager_report_stats:", rpcRes.error);
    }

    const safeCommissions = (commissionsRes.data || []) as DailyProduction[];
    const commissionProductionIds = safeCommissions.map((p) => p.id).filter(Boolean);

    let commissionClientMap = new Map<string, number>();
    if (commissionProductionIds.length > 0) {
      const { data: txData } = await supabase
        .from("sale_transactions")
        .select("daily_production_id, source, created_at, client_name, mobile_phone")
        .in("daily_production_id", commissionProductionIds);

      commissionClientMap = buildClientCountMap((txData || []) as ClientCountTransaction[]);
    }

    const rpcRow = rpcRes.data?.[0];
    const totalRevenue = Number(rpcRow?.total_revenue ?? 0);
    const totalClients = safeCommissions.reduce((sum, production) => {
      const txCount = commissionClientMap.get(production.id) || 0;
      return sum + (txCount > 0 ? txCount : Number(production.clients_count) || 0);
    }, 0);

    const totalCommission = safeCommissions.reduce(
      (sum, production) => sum + getEffectiveCommission(production),
      0,
    );

    const barberCommissions = new Map<string, number>();
    safeCommissions.forEach((row) => {
      const current = barberCommissions.get(row.barber_id) || 0;
      barberCommissions.set(row.barber_id, current + getEffectiveCommission(row));
    });

    let goalsAchieved = 0;
    if (goalsRes.data) {
      goalsRes.data.forEach((goal) => {
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
      totalBarbers: barbersRes.data?.length || 0,
    });
  }, [buildClientCountMap, dateRange, getEffectiveCommission, selectedBarber, selectedUnit]);

  const fetchUnits = useCallback(async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    
    if (data) {
      setUnits(data);
    }
  }, []);

  const fetchBarbers = useCallback(async () => {
    const { data } = await supabase
      .from("barbers")
      .select("id, name, unit_id")
      .eq("status", "active")
      .order("name");
    
    if (data) {
      setAllBarbers(data);
      setBarbers(data);
    }
  }, []);

  const fetchProductions = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    let query = supabase
      .from("daily_productions")
      .select("*, barbers!inner(name, unit_id, services_commission, products_commission)")
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
      const typedProductions = (data ?? []) as DailyProduction[];
      setProductions(typedProductions);

      const productionIds = typedProductions.map((p) => p.id);
      if (productionIds.length === 0) {
        setProductionClientCounts(new Map());
        return;
      }

      const { data: txData } = await supabase
        .from("sale_transactions")
        .select("daily_production_id, source, created_at, client_name, mobile_phone")
        .in("daily_production_id", productionIds);

      setProductionClientCounts(buildClientCountMap((txData || []) as ClientCountTransaction[]));
    }
  }, [buildClientCountMap, dateRange, selectedBarber, selectedUnit]);

  useEffect(() => {
    fetchUnits();
    fetchBarbers();
  }, [fetchUnits, fetchBarbers]);

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
  }, [dateRange, selectedBarber, selectedUnit, fetchStats, fetchProductions]);

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

  const barberPerformanceRows = useMemo<BarberPerformanceRow[]>(() => {
    const barberStats = new Map<string, Omit<BarberPerformanceRow, "id" | "totalRevenue">>();

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

      const stats = barberStats.get(barberId);
      if (!stats) return;

      const totals = getProductionTotals(production);
      stats.servicesBasicTotal += totals.basic;
      stats.servicesExtraTotal += totals.extra;
      stats.productsTotal += totals.products;
      stats.commissionTotal += getEffectiveCommission(production);
      stats.clientsTotal += getProductionClientsCount(production);
    });

    return Array.from(barberStats.entries())
      .map(([id, stats]) => ({
        id,
        ...stats,
        totalRevenue: stats.servicesBasicTotal + stats.servicesExtraTotal + stats.productsTotal,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [productions, getEffectiveCommission, getProductionClientsCount, getProductionTotals]);

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
                {barberPerformanceRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum lançamento encontrado no período
                    </TableCell>
                  </TableRow>
                ) : (
                  barberPerformanceRows.map((barber) => (
                    <TableRow key={barber.id}>
                      <TableCell className="font-medium">{barber.name}</TableCell>
                      <TableCell className="text-right font-semibold">
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
                      <TableCell className="text-right text-success">
                        R$ {barber.commissionTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{barber.clientsTotal}</TableCell>
                      <TableCell className="text-right">
                        {barber.clientsTotal > 0
                          ? (barber.totalRevenue / barber.clientsTotal).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "R$ 0,00"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
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
                        R$ {(() => {
                          const totals = getProductionTotals(production);
                          return totals.basic.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {(() => {
                          const totals = getProductionTotals(production);
                          return totals.extra.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {(() => {
                          const totals = getProductionTotals(production);
                          return totals.products.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                        })()}
                      </TableCell>
                      <TableCell className="text-right">{production.services_count}</TableCell>
                      <TableCell className="text-right">{production.products_count}</TableCell>
                      <TableCell className="text-right">{getProductionClientsCount(production)}</TableCell>
                      <TableCell className="text-right">
                        R$ {getEffectiveCommission(production).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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

