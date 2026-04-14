import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Target, TrendingUp, TrendingDown, CheckCircle, AlertTriangle, XCircle, UserCheck, CalendarOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateRemainingWorkDays, getManausDate, getCurrentMonthYear, getTodayString } from "@/lib/dateUtils";
import MissingProductionsAlert from "./MissingProductionsAlert";
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";
interface GoalQueryRow {
  barber_id: string;
  target_commission: number;
  work_days: number;
  barbers: {
    id: string;
    name: string;
    unit_id: string;
    services_commission: number;
    units: { name: string } | null;
  } | null;
}

interface ProductionRow {
  barber_id: string;
  date: string;
  commission_earned: number;
  confirmed_presence: boolean;
  presence_type: string | null;
  services_total: number;
  products_total: number;
  services_basic_total: number | null;
  services_extra_total: number | null;
  tx_basic_total: number | null;
  tx_extra_total: number | null;
  tx_products_total: number | null;
}

interface BarberDailyGoal {
  barberId: string;
  barberName: string;
  unitName: string;
  targetRevenue: number;
  workDays: number;
  dailyRevenueTarget: number;
  servicesCommission: number;
  totalRevenueMonth: number;
  totalRevenueToday: number;
  daysWorked: number;
  progressPercent: number;
  expectedProgress: number;
  status: "ahead" | "on-track" | "behind" | "critical";
  confirmedPresenceToday: boolean;
  presenceType: string | null;
}

export default function DailyGoalsTracking() {
  const { organizationId } = useOrganization();
  const [barberGoals, setBarberGoals] = useState<BarberDailyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);

  const today = getManausDate();
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const todayStr = getTodayString();
  const { holidayDates } = useOrganizationHolidays({ organizationId, month: currentMonth, year: currentYear });

  // Calculate elapsed goal days in month (full month default, excluding holidays only)
  const getWorkingDaysPassed = () => {
    let count = 0;
    for (let d = 1; d <= today.getDate(); d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const dateKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!holidayDates.includes(dateKey)) {
        count++;
      }
    }
    return count;
  };

  const workingDaysPassed = getWorkingDaysPassed();

  // useEffect moved after function declarations

  const fetchUnits = useCallback(async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (data) setUnits(data);
  }, []);

  const fetchDailyGoals = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);

    try {
      // Fetch monthly goals for current month with barber commission rates
      const { data: goals, error: goalsError } = await supabase
        .from("monthly_goals")
        .select(`
          id,
          barber_id,
          target_commission,
          work_days,
          barbers (
            id,
            name,
            unit_id,
            services_commission,
            units (
              name
            )
          )
        `)
        .eq("month", currentMonth)
        .eq("year", currentYear);

      if (goalsError) throw goalsError;

      // Fetch productions for current month
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const { data: productions, error: prodError } = await supabase
        .from("daily_productions")
        .select("barber_id, date, commission_earned, confirmed_presence, presence_type, services_total, products_total, services_basic_total, services_extra_total, tx_basic_total, tx_extra_total, tx_products_total")
        .gte("date", startOfMonth)
        .lte("date", todayStr);

      if (prodError) throw prodError;

      // Calculate daily goals for each barber
      const barberGoalsData: BarberDailyGoal[] = (goals || []).map((goal: GoalQueryRow) => {
        const barberProductions = ((productions || []) as ProductionRow[]).filter(
          (p) => p.barber_id === goal.barber_id
        );

        // Helper to get revenue from a production row
        const getRevenue = (p: ProductionRow) => {
          if ((Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0) > 0) {
            return (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0);
          }
          if (p.services_basic_total != null || p.services_extra_total != null) {
            return (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + (Number(p.products_total) || 0);
          }
          return (Number(p.services_total) || 0) + (Number(p.products_total) || 0);
        };

        const totalRevenueMonth = barberProductions.reduce(
          (sum, p) => sum + getRevenue(p),
          0
        );

        const todayProduction = barberProductions.find(
          (p) => p.date === todayStr
        );
        const totalRevenueToday = todayProduction ? getRevenue(todayProduction) : 0;
        
        // Verifica se confirmou presença hoje sem vendas e qual tipo
        const confirmedPresenceToday = todayProduction?.confirmed_presence === true && totalRevenueToday === 0;
        const todayPresenceType = todayProduction?.presence_type ?? null;

        // Contar dias trabalhados em calendário dinâmico
        const daysWorked = barberProductions.filter(p => {
          const dateKey = p.date;
          if (holidayDates.includes(dateKey)) return false;
          if (["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? "")) return false;
          return getRevenue(p) > 0 || (p.confirmed_presence === true && (p.presence_type === 'present' || p.presence_type === null));
        }).length;
        
        // Convert monthly commission target to revenue target
        const servicesCommission = goal.barbers?.services_commission || 50;
        const targetRevenue = servicesCommission > 0
          ? goal.target_commission / (servicesCommission / 100)
          : goal.target_commission;
        
        // Calculate remaining revenue to achieve
        const remainingRevenue = Math.max(0, targetRevenue - totalRevenueMonth);
        
        // Divisor dinâmico: dias restantes no mês - dias futuros marcados como ausência
        const remainingCalendarDays = calculateRemainingWorkDays(getManausDate(), holidayDates);
        const futureOffDays = barberProductions.filter(
          (p) => p.date >= todayStr && ["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? "")
        ).length;
        const daysToUse = Math.max(1, remainingCalendarDays - futureOffDays);
        
        // Daily revenue target based on remaining amount / remaining days
        const dailyRevenueTarget = remainingRevenue / daysToUse;
        
        const progressPercent = (totalRevenueMonth / targetRevenue) * 100;
        
        // Expected progress based on working days passed
        const monthDays = new Date(currentYear, currentMonth, 0).getDate();
        const expectedProgress = (workingDaysPassed / monthDays) * 100;
        
        // Determine status
        let status: BarberDailyGoal["status"];
        const progressDiff = progressPercent - expectedProgress;
        
        if (progressDiff >= 10) {
          status = "ahead";
        } else if (progressDiff >= -5) {
          status = "on-track";
        } else if (progressDiff >= -20) {
          status = "behind";
        } else {
          status = "critical";
        }

        return {
          barberId: goal.barber_id,
          barberName: goal.barbers?.name || "Barbeiro",
          unitName: goal.barbers?.units?.name || "Unidade",
          targetRevenue,
          workDays: goal.work_days,
          dailyRevenueTarget,
          servicesCommission,
          totalRevenueMonth,
          totalRevenueToday,
          daysWorked,
          progressPercent: Math.min(progressPercent, 100),
          expectedProgress: Math.min(expectedProgress, 100),
          status,
          confirmedPresenceToday,
          presenceType: todayPresenceType,
        };
      });

      // Sort by status (critical first) then by progress
      barberGoalsData.sort((a, b) => {
        const statusOrder = { critical: 0, behind: 1, "on-track": 2, ahead: 3 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return a.progressPercent - b.progressPercent;
      });

      setBarberGoals(barberGoalsData);
    } catch (error) {
      console.error("Erro ao carregar metas diárias:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, currentMonth, currentYear, todayStr, holidayDates, workingDaysPassed]);

  useEffect(() => {
    fetchUnits();
    fetchDailyGoals();
  }, [fetchUnits, fetchDailyGoals]);

  const filteredGoals = useMemo(() => {
    if (filterUnit === "all") return barberGoals;
    return barberGoals.filter((goal) => {
      const barber = units.find((u) => u.name === goal.unitName);
      return barber?.id === filterUnit || goal.unitName === units.find(u => u.id === filterUnit)?.name;
    });
  }, [barberGoals, filterUnit, units]);

  const getStatusBadge = (status: BarberDailyGoal["status"]) => {
    switch (status) {
      case "ahead":
        return (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
            <TrendingUp className="w-3 h-3 mr-1" />
            Acima da Meta
          </Badge>
        );
      case "on-track":
        return (
          <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            No Ritmo
          </Badge>
        );
      case "behind":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Atenção
          </Badge>
        );
      case "critical":
        return (
          <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            Crítico
          </Badge>
        );
    }
  };

  const getProgressColor = (status: BarberDailyGoal["status"]) => {
    switch (status) {
      case "ahead":
        return "bg-green-500";
      case "on-track":
        return "bg-blue-500";
      case "behind":
        return "bg-yellow-500";
      case "critical":
        return "bg-red-500";
    }
  };

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerta de Produções Pendentes */}
      <MissingProductionsAlert />
      
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                Acompanhamento Diário de Metas
              </CardTitle>
              <CardDescription>
                {months[currentMonth - 1]} de {currentYear} • Dia útil {workingDaysPassed} do mês
              </CardDescription>
            </div>
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger className="w-48">
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
        </CardHeader>
        <CardContent>
          {filteredGoals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma meta cadastrada para este mês</p>
              <p className="text-sm">Vá até a aba "Metas" para adicionar metas mensais</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredGoals.map((goal) => (
                <Card 
                  key={goal.barberId} 
                  className={`border ${
                    goal.status === "critical" 
                      ? "border-red-500/30 bg-red-500/5" 
                      : goal.status === "behind"
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : "border-border"
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Barber Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">
                            {goal.barberName}
                          </h3>
                          {getStatusBadge(goal.status)}
                          {goal.confirmedPresenceToday && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {(!goal.presenceType || goal.presenceType === 'present') ? (
                                    <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">
                                      <UserCheck className="w-3 h-3 mr-1" />
                                      Presente s/ vendas
                                    </Badge>
                                  ) : goal.presenceType === 'day_off' ? (
                                    <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">
                                      <CalendarOff className="w-3 h-3 mr-1" />
                                      Folga
                                    </Badge>
                                  ) : goal.presenceType === 'absence' ? (
                                    <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
                                      <XCircle className="w-3 h-3 mr-1" />
                                      Falta
                                    </Badge>
                                  ) : null}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {(!goal.presenceType || goal.presenceType === 'present')
                                    ? <p>Confirmou presença hoje, mas não registrou vendas</p>
                                    : goal.presenceType === 'day_off'
                                    ? <p>Folga registrada para hoje</p>
                                    : <p>Falta/atestado registrado para hoje</p>
                                  }
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{goal.unitName}</p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-6">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Meta Diária (Faturamento)</p>
                          <p className="font-semibold text-foreground">
                            R$ {goal.dailyRevenueTarget.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Vendas Hoje</p>
                          <p className={`font-semibold ${
                            goal.totalRevenueToday >= goal.dailyRevenueTarget 
                              ? "text-green-500" 
                              : goal.totalRevenueToday > 0 
                              ? "text-yellow-500" 
                              : "text-muted-foreground"
                          }`}>
                            R$ {goal.totalRevenueToday.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Vendas no Mês</p>
                          <p className="font-semibold text-foreground">
                            R$ {goal.totalRevenueMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Meta Mensal (Vendas)</p>
                          <p className="font-semibold text-foreground">
                            R$ {goal.targetRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Progresso: {goal.progressPercent.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">
                          Esperado: {goal.expectedProgress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="relative">
                        <Progress 
                          value={goal.progressPercent} 
                          className="h-3"
                        />
                        {/* Expected progress marker */}
                        <div 
                          className="absolute top-0 h-3 w-0.5 bg-foreground/50"
                          style={{ left: `${goal.expectedProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{goal.daysWorked} dias trabalhados</span>
                        <span>
                          {goal.progressPercent >= goal.expectedProgress ? (
                            <span className="text-green-500 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              +{(goal.progressPercent - goal.expectedProgress).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-red-500 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3" />
                              {(goal.progressPercent - goal.expectedProgress).toFixed(1)}%
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
