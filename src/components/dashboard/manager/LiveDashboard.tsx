import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Radio, Loader2, Pencil, ChevronLeft, ChevronRight, Calendar, FileText, Crown, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, subDays, addDays, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/hooks/useOrganization";
import LiveTop3Ranking from "./LiveTop3Ranking";
import QuickSaleModal from "./QuickSaleModal";
import TransactionManagerModal from "./TransactionManagerModal";
import SubscriptionWizardModal from "./SubscriptionWizardModal";
import SubscriptionAuditModal from "./SubscriptionAuditModal";
import { calculateRemainingWorkDays, getTodayString, getManausDate } from "@/lib/dateUtils";

interface Barber {
  id: string;
  name: string;
  unit_id: string;
  unit_name: string;
  services_commission: number;
}

interface DailyProduction {
  barber_id: string;
  services_basic_total: number | null;
  services_extra_total: number | null;
  services_total: number;
  products_total: number;
  clients_count: number;
  commission_earned: number;
  confirmed_presence: boolean;
}

interface MonthProduction {
  barber_id: string;
  commission_earned: number;
  confirmed_presence: boolean;
  services_total: number;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number;
  clients_count: number;
}

interface MonthlyGoal {
  barber_id: string;
  target_commission: number;
  work_days: number;
}

interface Unit {
  id: string;
  name: string;
}

export default function LiveDashboard() {
  const { organizationId } = useOrganization();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [productions, setProductions] = useState<DailyProduction[]>([]);
  const [monthProductions, setMonthProductions] = useState<MonthProduction[]>([]);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isGlowing, setIsGlowing] = useState(false);
  const [quickSaleModal, setQuickSaleModal] = useState<{
    open: boolean;
    barberId: string;
    barberName: string;
    fromBridge?: boolean;
  }>({ open: false, barberId: "", barberName: "" });
  const [editModal, setEditModal] = useState<{
    open: boolean;
    barberId: string;
    barberName: string;
    dailyProductionId: string;
    date: string;
  }>({ open: false, barberId: "", barberName: "", dailyProductionId: "", date: "" });
  const [viewTransactionsModal, setViewTransactionsModal] = useState<{
    open: boolean;
    barberId: string;
    barberName: string;
    dailyProductionId: string;
    date: string;
  }>({ open: false, barberId: "", barberName: "", dailyProductionId: "", date: "" });

  // Subscription wizard modal
  const [subscriptionWizardOpen, setSubscriptionWizardOpen] = useState(false);
  const [subscriptionAuditOpen, setSubscriptionAuditOpen] = useState(false);

  // Date navigation state
  const todayManaus = getTodayString();
  const [selectedDate, setSelectedDate] = useState(todayManaus);
  const isViewingToday = selectedDate === todayManaus;
  
  const selectedDateObj = parseISO(selectedDate);
  const currentMonth = selectedDateObj.getMonth() + 1;
  const currentYear = selectedDateObj.getFullYear();

  const fetchData = useCallback(async () => {
    if (!organizationId) return;

    try {
      // Fetch barbers with units
      const { data: barbersData } = await supabase
        .from("barbers")
        .select(`
          id,
          name,
          unit_id,
          services_commission,
          units!inner(name)
        `)
        .eq("organization_id", organizationId)
        .eq("status", "active");

      if (barbersData) {
        const mappedBarbers = barbersData.map((b: any) => ({
          id: b.id,
          name: b.name,
          unit_id: b.unit_id,
          unit_name: b.units.name,
          services_commission: b.services_commission,
        }));
        setBarbers(mappedBarbers);
      }

      // Fetch selected day's productions
      const { data: productionsData } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("date", selectedDate);

      if (productionsData) {
        setProductions(productionsData);
      }

      // Fetch month's productions for days worked calculation and average ticket
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const { data: monthProductionsData } = await supabase
        .from("daily_productions")
        .select(`
          barber_id, 
          commission_earned, 
          confirmed_presence,
          services_total,
          services_basic_total,
          services_extra_total,
          products_total,
          clients_count
        `)
        .eq("organization_id", organizationId)
        .gte("date", startOfMonth)
        .lte("date", selectedDate);

      if (monthProductionsData) {
        setMonthProductions(monthProductionsData);
      }

      // Fetch monthly goals
      const { data: goalsData } = await supabase
        .from("monthly_goals")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("month", currentMonth)
        .eq("year", currentYear);

      if (goalsData) {
        setGoals(goalsData);
      }

      // Fetch units
      const { data: unitsData } = await supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active");

      if (unitsData) {
        setUnits(unitsData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, selectedDate, currentMonth, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Date navigation handlers
  const goToPreviousDay = () => {
    const prevDay = subDays(parseISO(selectedDate), 1);
    setSelectedDate(format(prevDay, "yyyy-MM-dd"));
  };

  const goToNextDay = () => {
    const nextDay = addDays(parseISO(selectedDate), 1);
    const maxDate = todayManaus;
    if (format(nextDay, "yyyy-MM-dd") <= maxDate) {
      setSelectedDate(format(nextDay, "yyyy-MM-dd"));
    }
  };

  const goToToday = () => {
    setSelectedDate(todayManaus);
  };

  // Calculate total revenue when productions change - EXCLUSIVAMENTE de tx_* (Ao Vivo)
  useEffect(() => {
    const filteredProductions = selectedUnit === "all"
      ? productions
      : productions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    // ISOLAMENTO: Usar APENAS campos tx_* para o total do Ao Vivo
    const newTotal = filteredProductions.reduce((sum, p) => {
      const txBasic = (p as any).tx_basic_total || 0;
      const txExtra = (p as any).tx_extra_total || 0;
      const txProducts = (p as any).tx_products_total || 0;
      return sum + txBasic + txExtra + txProducts;
    }, 0);

    if (newTotal !== totalRevenue && totalRevenue > 0) {
      setIsGlowing(true);
      setTimeout(() => setIsGlowing(false), 2000);
    }
    setTotalRevenue(newTotal);
  }, [productions, selectedUnit, barbers, totalRevenue]);

  // Realtime subscription for productions and transactions (only when viewing today)
  useEffect(() => {
    if (!organizationId || !isViewingToday) return;

    const channel = supabase
      .channel("live-productions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_productions",
          filter: `date=eq.${selectedDate}`,
        },
        () => {
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sale_transactions",
        },
        () => {
          // Quando transações mudam, re-fetch os dados para refletir os novos totais
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, selectedDate, isViewingToday, fetchData]);

  const getBarberRevenue = (barberId: string) => {
    const production = productions.find((p) => p.barber_id === barberId);
    if (!production) return 0;

    // Usar campos tx_* (dados do Ao Vivo/Gestor) para o dashboard em tempo real
    const txBasic = (production as any).tx_basic_total || 0;
    const txExtra = (production as any).tx_extra_total || 0;
    const txProducts = (production as any).tx_products_total || 0;

    return txBasic + txExtra + txProducts;
  };

  const getBarberProduction = (barberId: string) => {
    return productions.find((p) => p.barber_id === barberId);
  };

  const handleEditClick = async (barber: Barber) => {
    // Buscar daily_production_id com maybeSingle para não lançar erro se não existir
    const { data: production, error: fetchError } = await supabase
      .from("daily_productions")
      .select("id")
      .eq("barber_id", barber.id)
      .eq("date", selectedDate)
      .maybeSingle();

    if (fetchError) {
      toast.error("Erro ao buscar produção");
      return;
    }

    let dailyProductionId = production?.id;

    // Se não existe produção para esse dia, criar automaticamente com valores zerados
    if (!dailyProductionId) {
      const { data: newProd, error: insertError } = await supabase
        .from("daily_productions")
        .insert({
          barber_id: barber.id,
          date: selectedDate,
          organization_id: organizationId,
        })
        .select("id")
        .single();

      if (insertError || !newProd) {
        toast.error("Erro ao criar produção para edição");
        return;
      }

      dailyProductionId = newProd.id;
      // Recarregar produções para refletir o novo registro
      fetchData();
    }

    setEditModal({
      open: true,
      barberId: barber.id,
      barberName: barber.name,
      dailyProductionId,
      date: selectedDate,
    });
  };

  const handleViewTransactions = async (barber: Barber) => {
    const { data: production } = await supabase
      .from("daily_productions")
      .select("id")
      .eq("barber_id", barber.id)
      .eq("date", selectedDate)
      .maybeSingle();
    
    if (production) {
      setViewTransactionsModal({
        open: true,
        barberId: barber.id,
        barberName: barber.name,
        dailyProductionId: production.id,
        date: selectedDate,
      });
    } else {
      toast.info("Nenhuma comanda registrada para este barbeiro hoje");
    }
  };

  const getBarberDailyTarget = (barber: Barber) => {
    const goal = goals.find((g) => g.barber_id === barber.id);
    if (!goal) return 0;

    // Get barber's productions for the month
    const barberMonthProductions = monthProductions.filter(
      (p) => p.barber_id === barber.id
    );

    // Calculate total commission earned this month
    const totalEarnedMonth = barberMonthProductions.reduce(
      (sum, p) => sum + Number(p.commission_earned),
      0
    );

    // Count days worked: production > 0 OR confirmed_presence === true
    const daysWorked = barberMonthProductions.filter(
      (p) => Number(p.commission_earned) > 0 || p.confirmed_presence === true
    ).length;

    // Calculate remaining commission to achieve
    const remainingCommission = Math.max(0, goal.target_commission - totalEarnedMonth);

    // Calculate remaining work days (same logic as BarberDashboard)
    const remainingWorkDaysFromGoal = goal.work_days - daysWorked;
    const remainingCalendarDays = calculateRemainingWorkDays();
    const daysToUse = Math.max(1, Math.min(remainingWorkDaysFromGoal, remainingCalendarDays));

    // Daily commission target based on remaining amount / remaining days
    const dailyCommissionTarget = remainingCommission / daysToUse;

    // Calculate daily revenue target based on services commission rate
    const dailyRevenueTarget =
      barber.services_commission > 0
        ? dailyCommissionTarget / (barber.services_commission / 100)
        : 0;

    return dailyRevenueTarget;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 85) return "bg-green-500";
    if (percentage >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getAverageTicket = () => {
    // Primeiro: tentar calcular do mês inteiro (histórico mais robusto)
    // Usamos os campos legados para o ticket médio pois precisamos do histórico consolidado
    const filteredMonthProductions = selectedUnit === "all"
      ? monthProductions
      : monthProductions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const totalClientsMonth = filteredMonthProductions.reduce(
      (sum, p) => sum + (p.clients_count || 0), 
      0
    );
    
    const totalRevenueMonth = filteredMonthProductions.reduce((sum, p) => {
      const servicesTotal =
        p.services_basic_total !== null || p.services_extra_total !== null
          ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
          : p.services_total || 0;
      return sum + servicesTotal + (p.products_total || 0);
    }, 0);

    // Se há histórico no mês, usar ticket médio mensal
    if (totalClientsMonth > 0) {
      return totalRevenueMonth / totalClientsMonth;
    }

    // Fallback: usar tx_clients_count de hoje
    const filteredProductions = selectedUnit === "all"
      ? productions
      : productions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const totalClients = filteredProductions.reduce(
      (sum, p) => sum + ((p as any).tx_clients_count || 0), 
      0
    );
    
    if (totalClients > 0) {
      return totalRevenue / totalClients;
    }

    // Fallback final: valor padrão mais realista (R$ 70)
    return 70;
  };

  // Helper para verificar se há lançamento manual pendente de conferência
  const hasPendingManualEntry = (barberId: string) => {
    const production = productions.find((p) => p.barber_id === barberId);
    if (!production) return false;

    const txTotal = 
      ((production as any).tx_basic_total || 0) +
      ((production as any).tx_extra_total || 0) +
      ((production as any).tx_products_total || 0);

    const manualTotal =
      ((production as any).manual_basic_total || 0) +
      ((production as any).manual_extra_total || 0) +
      ((production as any).manual_products_total || 0);

    // Se tx é zero mas manual tem valor, há pendência de conferência
    return txTotal === 0 && manualTotal > 0;
  };

  const getCutsRemaining = (barberId: string, barber: Barber) => {
    const revenue = getBarberRevenue(barberId);
    const target = getBarberDailyTarget(barber);
    const remaining = target - revenue;
    if (remaining <= 0) return 0;

    const avgTicket = getAverageTicket();
    return Math.ceil(remaining / avgTicket);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const filteredBarbers = selectedUnit === "all"
    ? barbers
    : barbers.filter((b) => b.unit_id === selectedUnit);

  // Ordenar barbeiros: quem está mais longe da meta aparece primeiro (prioridade para o gestor)
  const sortedBarbers = useMemo(() => {
    return [...filteredBarbers].sort((a, b) => {
      const revenueA = getBarberRevenue(a.id);
      const revenueB = getBarberRevenue(b.id);
      const targetA = getBarberDailyTarget(a);
      const targetB = getBarberDailyTarget(b);
      
      // Calcular percentual atingido (0-100+)
      const percentA = targetA > 0 ? (revenueA / targetA) * 100 : 100;
      const percentB = targetB > 0 ? (revenueB / targetB) * 100 : 100;
      
      // Ordenar por menor percentual primeiro (quem mais precisa de atenção)
      return percentA - percentB;
    });
  }, [filteredBarbers, productions, goals, monthProductions]);

  const rankingData = filteredBarbers.map((b) => ({
    id: b.id,
    name: b.name,
    revenue: getBarberRevenue(b.id),
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {isViewingToday ? (
              <Radio className="w-6 h-6 text-red-500 animate-pulse" />
            ) : (
              <Calendar className="w-6 h-6 text-muted-foreground" />
            )}
            <h2 className="text-2xl font-bold text-foreground">
              {isViewingToday ? "AO VIVO" : "HISTÓRICO"}
            </h2>
          </div>

          <Select value={selectedUnit} onValueChange={setSelectedUnit}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por unidade" />
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

        {/* Date Navigation */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousDay}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg min-w-[200px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground capitalize">
              {format(parseISO(selectedDate), "EEEE, dd/MM", { locale: ptBR })}
            </span>
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextDay}
            disabled={isViewingToday}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {!isViewingToday && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToToday}
              className="ml-2"
            >
              Hoje
            </Button>
          )}
        </div>
      </div>

      {/* Subscription Button + Total Revenue */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Destacar botão de Assinatura */}
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            className="gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg"
            onClick={() => setSubscriptionWizardOpen(true)}
          >
            <Crown className="w-5 h-5" />
            Vender Assinatura
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 w-11 p-0"
            onClick={() => setSubscriptionAuditOpen(true)}
            title="Auditar Últimas Vendas"
          >
            <Eye className="w-5 h-5" />
          </Button>
        </div>

        {/* Total Revenue Card */}
        <Card
          className={`flex-1 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 transition-all duration-500 ${
            isGlowing && isViewingToday ? "animate-glow shadow-[0_0_30px_hsl(38_92%_50%/0.6)]" : ""
          }`}
        >
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">
                {isViewingToday ? "Faturamento Total Hoje" : `Faturamento em ${format(parseISO(selectedDate), "dd/MM/yyyy")}`}
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-primary">
                {totalRevenue.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredBarbers.length} barbeiros ativos
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 3 Ranking */}
      {rankingData.some((b) => b.revenue > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              🏆 Top 3 do Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LiveTop3Ranking barbers={rankingData} />
          </CardContent>
        </Card>
      )}

      {/* Barber Cards - Ordenados por quem mais precisa de atenção */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedBarbers.map((barber) => {
          const revenue = getBarberRevenue(barber.id);
          const target = getBarberDailyTarget(barber);
          const percentage = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
          const cutsRemaining = getCutsRemaining(barber.id, barber);
          const progressColor = getProgressColor(percentage);

          return (
            <Card key={barber.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-border">
                      <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                        {getInitials(barber.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{barber.name}</p>
                        {hasPendingManualEntry(barber.id) && (
                          <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                            <FileText className="w-3 h-3 mr-1" />
                            Aguardando
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{barber.unit_name}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => handleViewTransactions(barber)}
                      title="Ver comandas do gestor"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {revenue > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEditClick(barber)}
                        title="Editar lançamento"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        setQuickSaleModal({
                          open: true,
                          barberId: barber.id,
                          barberName: barber.name,
                        })
                      }
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-bold text-foreground">
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full transition-all duration-500 rounded-full ${progressColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-primary font-bold">
                      {revenue.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      / {target.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                </div>

                {/* Cuts Remaining */}
                {target > 0 && cutsRemaining > 0 && (
                  <div className="text-center py-2 px-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Faltam{" "}
                      <span className="font-bold text-primary">{cutsRemaining}</span>{" "}
                      cortes para bater a meta
                    </p>
                  </div>
                )}
                {target > 0 && cutsRemaining === 0 && revenue > 0 && (
                  <div className="text-center py-2 px-3 bg-green-500/20 rounded-lg">
                    <p className="text-sm text-green-500 font-bold">
                      🎉 Meta batida!
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Sale Modal */}
      <QuickSaleModal
        open={quickSaleModal.open}
        onOpenChange={(open) =>
          setQuickSaleModal((prev) => ({ ...prev, open, fromBridge: open ? prev.fromBridge : false }))
        }
        barberId={quickSaleModal.barberId}
        barberName={quickSaleModal.barberName}
        organizationId={organizationId || ""}
        onSuccess={fetchData}
        initialIsNewClient={quickSaleModal.fromBridge ? false : undefined}
      />

      {/* Edit Production Modal - Transaction Manager */}
      <TransactionManagerModal
        open={editModal.open}
        onOpenChange={(open) => setEditModal((prev) => ({ ...prev, open }))}
        barberId={editModal.barberId}
        barberName={editModal.barberName}
        organizationId={organizationId || ""}
        dailyProductionId={editModal.dailyProductionId}
        date={editModal.date}
        onSuccess={fetchData}
      />

      {/* Subscription Wizard Modal */}
      <SubscriptionWizardModal
        open={subscriptionWizardOpen}
        onOpenChange={setSubscriptionWizardOpen}
        organizationId={organizationId || ""}
        onComplete={fetchData}
        selectedDate={selectedDate}
        onBridgeToService={(barberId, _barberName) => {
          if (barberId) {
            const barber = barbers.find((b) => b.id === barberId);
            setQuickSaleModal({
              open: true,
              barberId,
              barberName: barber?.name || "Barbeiro",
              fromBridge: true,
            });
          }
        }}
      />

      {/* Subscription Audit Modal */}
      <SubscriptionAuditModal
        open={subscriptionAuditOpen}
        onOpenChange={setSubscriptionAuditOpen}
        organizationId={organizationId || ""}
        onRefresh={fetchData}
      />

      {/* View Transactions Modal */}
      <TransactionManagerModal
        open={viewTransactionsModal.open}
        onOpenChange={(open) => setViewTransactionsModal((prev) => ({ ...prev, open }))}
        barberId={viewTransactionsModal.barberId}
        barberName={viewTransactionsModal.barberName}
        organizationId={organizationId || ""}
        dailyProductionId={viewTransactionsModal.dailyProductionId}
        date={viewTransactionsModal.date}
        onSuccess={fetchData}
      />
    </div>
  );
}
