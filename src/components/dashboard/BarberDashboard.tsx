import { User } from "@supabase/supabase-js";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Target, TrendingUp, TrendingDown, Users, DollarSign, Calendar, ChevronLeft, ChevronRight, Bell, X, ArrowUp, ArrowDown, CheckCircle, AlertTriangle, XCircle, Sparkles, Bot, Loader2, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import logo from "@/assets/performance-barber-logo-transparent.png";
import ProductionHistory from "./barber/ProductionHistory";
import Leaderboard from "./Leaderboard";

import AITipsTab from "./barber/AITipsTab";
import WarPlanWizard from "./barber/WarPlanWizard";
import ConfirmPresenceModal from "./barber/ConfirmPresenceModal";
import PendingDayReviews from "./barber/PendingDayReviews";
import DayReviewModal from "./barber/DayReviewModal";
import MissingProductionAlert from "./barber/MissingProductionAlert";
import { useSubscriptionModule } from "@/hooks/useSubscriptionModule";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateRemainingWorkDays, getManausDate, getCurrentMonthYear, getTodayString } from "@/lib/dateUtils";
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";
import PushNotificationToggle from "./barber/PushNotificationToggle";

interface BarberDashboardProps {
  user: User;
}

interface BarberData {
  id: string;
  name: string;
  services_commission: number;
  products_commission: number;
  organization_id: string;
}

interface MonthlyGoal {
  target_commission: number;
}

interface EditingProduction {
  id: string;
  date: string;
}

interface DailyProductionRow {
  id: string;
  date: string;
  services_basic_total: number | null;
  services_extra_total: number | null;
  services_total: number | null;
  products_total: number | null;
  clients_count: number | null;
  services_count: number | null;
  products_count: number | null;
  commission_earned: number | null;
  confirmed_presence: boolean | null;
  presence_type: string | null;
  tx_basic_total: number | null;
  tx_extra_total: number | null;
  tx_products_total: number | null;
  tx_clients_count: number | null;
  tx_services_count: number | null;
}

interface MonthlyStats {
  accumulated_commission: number;
  days_worked: number;
  total_clients: number;
  total_services: number;
  total_products: number;
  average_ticket: number;
  services_conversion: number;
  products_conversion: number;
}


interface LiveSale {
  id: string;
  created_at: string;
  client_name: string | null;
  item_name: string;
  item_type: string;
  price_sold: number;
}

export default function BarberDashboard({ user }: BarberDashboardProps) {
  const navigate = useNavigate();
  const { hasSubscriptionModule } = useSubscriptionModule();
  const today = getManausDate();
  const currentMonthNow = today.getMonth() + 1;
  const currentYearNow = today.getFullYear();

  // Estado para o mês/ano selecionado (default: mês atual)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthNow); // 1-12
  const [selectedYear, setSelectedYear] = useState(currentYearNow);
  const isCurrentMonth = selectedMonth === currentMonthNow && selectedYear === currentYearNow;
  
  const [barber, setBarber] = useState<BarberData | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoal | null>(null);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [dailyTarget, setDailyTarget] = useState(0);
  const [dailyTargetServices, setDailyTargetServices] = useState(0);
  const [scheduledOffDates, setScheduledOffDates] = useState<string[]>([]);
  const [missingLink, setMissingLink] = useState(false);
  const [editingProduction, setEditingProduction] = useState<EditingProduction | null>(null);
const [todayProduction, setTodayProduction] = useState<{
    id?: string;
    total: number;
    confirmed_presence: boolean;
    exists: boolean;
  } | null>(null);
  const [confirmingPresence, setConfirmingPresence] = useState(false);
  const [presenceModalOpen, setPresenceModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("daily");
  const [isSigningOut, setIsSigningOut] = useState(false);
  
  const [liveSales, setLiveSales] = useState<LiveSale[]>([]);
  const [reviewingDate, setReviewingDate] = useState<string | null>(null);
  const [warPlanMessage, setWarPlanMessage] = useState<string | null>(null);
  const [showWarPlanWizard, setShowWarPlanWizard] = useState(false);
  const [pacingStatus, setPacingStatus] = useState<"ahead" | "on-track" | "behind" | "critical" | null>(null);
  const [expectedPercent, setExpectedPercent] = useState<number | null>(null);
  
  // Estado para notificação de alteração de comissão
  const { holidayDates } = useOrganizationHolidays({
    organizationId: barber?.organization_id,
    month: selectedMonth,
    year: selectedYear,
  });
  const [commissionChange, setCommissionChange] = useState<{
    oldServices: number;
    newServices: number;
    oldProducts: number;
    newProducts: number;
    timestamp: Date;
  } | null>(null);
  const fetchBarberData = useCallback(async () => {
    const { data, error } = await supabase
      .from("barbers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar barbeiro:", error);
    }

    if (data) {
      setBarber(data);
      setMissingLink(false);
    } else {
      setMissingLink(true);
    }
  }, [user.id]);

  const fetchMonthlyGoal = useCallback(async () => {
    if (!barber) return;

    const todayStr = getTodayString();

    const [salesResponse, goalResponse] = await Promise.all([
      supabase
        .from("sale_transactions")
        .select("id, created_at, client_name, item_name, item_type, price_sold")
        .eq("barber_id", barber.id)
        .gte("created_at", `${todayStr}T00:00:00-04:00`)
        .lte("created_at", `${todayStr}T23:59:59-04:00`)
        .order("created_at", { ascending: false }),
      supabase
        .from("monthly_goals")
        .select("target_commission, work_days")
        .eq("barber_id", barber.id)
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .maybeSingle(),
    ]);

    if (!salesResponse.error) {
      setLiveSales((salesResponse.data || []) as LiveSale[]);
    }

    if (!goalResponse.error && goalResponse.data) {
      setMonthlyGoal({ target_commission: goalResponse.data.target_commission });
    } else {
      setMonthlyGoal(null);
    }
  }, [barber, selectedMonth, selectedYear]);

  // Alias for backward compat
  const fetchLivePanelData = fetchMonthlyGoal;

  const fetchMonthlyStats = useCallback(async () => {
    if (!barber) return;

    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const startDate = format(firstDay, "yyyy-MM-dd");
    const endDate = format(lastDay, "yyyy-MM-dd");

    const { data: productions, error: productionsError } = await supabase
      .from("daily_productions")
      .select("*")
      .eq("barber_id", barber.id)
      .gte("date", startDate)
      .lte("date", endDate);

    if (productionsError) {
      console.error("Erro ao buscar daily_productions:", productionsError);
      setStats({
        accumulated_commission: 0,
        days_worked: 0,
        total_clients: 0,
        total_services: 0,
        total_products: 0,
        average_ticket: 0,
        services_conversion: 0,
        products_conversion: 0,
      });
      setScheduledOffDates([]);
      setTodayProduction(null);
      return;
    }

    const typedProductions = (productions || []) as DailyProductionRow[];

    // Calcular consolidados diretamente de daily_productions
    // Prioridade: tx (gestor) > manual (barbeiro) > legado
    const getConsolidated = (p: DailyProductionRow) => {
      const txTotal = (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0);
      if (txTotal > 0) {
        return {
          basic: Number(p.tx_basic_total) || 0,
          extra: Number(p.tx_extra_total) || 0,
          products: Number(p.tx_products_total) || 0,
          clients: Number(p.tx_clients_count) || 0,
          services: Number(p.tx_services_count) || 0,
        };
      }
      if (p.services_basic_total != null || p.services_extra_total != null) {
        return {
          basic: Number(p.services_basic_total) || 0,
          extra: Number(p.services_extra_total) || 0,
          products: Number(p.products_total) || 0,
          clients: Number(p.clients_count) || 0,
          services: Number(p.services_count) || 0,
        };
      }
      return {
        basic: Number(p.services_total) || 0,
        extra: 0,
        products: Number(p.products_total) || 0,
        clients: Number(p.clients_count) || 0,
        services: Number(p.services_count) || 0,
      };
    };

    const totalClients = typedProductions.reduce((sum, p) => sum + getConsolidated(p).clients, 0);
    const totalServicesCount = typedProductions.reduce((sum, p) => sum + getConsolidated(p).services, 0);
    const totalServicesRevenue = typedProductions.reduce((sum, p) => { const c = getConsolidated(p); return sum + c.basic + c.extra; }, 0);
    const totalProductsRevenue = typedProductions.reduce((sum, p) => sum + getConsolidated(p).products, 0);
    const totalRevenue = totalServicesRevenue + totalProductsRevenue;

    const totalProductsCount = typedProductions.reduce((sum, p) => sum + Number(p.products_count), 0);

    // Usar commission_earned do banco (fonte única de verdade)
    const accumulatedCommission = typedProductions.reduce((sum, p) => sum + (Number(p.commission_earned) || 0), 0);

    // Contar dias trabalhados (mês completo por padrão), excluindo apenas
    // feriados e status explícitos de não trabalho.
    const daysWithProduction = typedProductions.filter((p) => {
      const dateObj = new Date(p.date + "T12:00:00");
      const dateKey = format(dateObj, "yyyy-MM-dd");

      if (holidayDates.includes(dateKey)) return false;
      if (["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? "")) return false;

      const total =
        (Number(p.services_basic_total) || 0) +
        (Number(p.services_extra_total) || 0) +
        (Number(p.products_total) || 0);
      return total > 0 || (p.confirmed_presence === true && (p.presence_type === "present" || p.presence_type === null));
    }).length;

    const futureOffDates = typedProductions
      .filter((p) => ["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? ""))
      .map((p) => p.date);
    setScheduledOffDates(futureOffDates);

    // Identificar produção de hoje para o card de confirmação de presença
    const todayStr = getTodayString();
    const todayProd = typedProductions.find((p) => p.date === todayStr);

    if (todayProd) {
      const c = getConsolidated(todayProd);
      const todayTotal = c.basic + c.extra + c.products;
      setTodayProduction({
        id: todayProd.id,
        total: todayTotal,
        confirmed_presence: todayProd.confirmed_presence || false,
        exists: true,
      });
    } else {
      const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
      if (selectedMonth === todayMonth && selectedYear === todayYear) {
        setTodayProduction({
          id: undefined,
          total: 0,
          confirmed_presence: false,
          exists: false,
        });
      } else {
        setTodayProduction(null);
      }
    }

    setStats({
      accumulated_commission: accumulatedCommission,
      days_worked: daysWithProduction,
      total_clients: totalClients,
      total_services: totalServicesRevenue,
      total_products: totalProductsRevenue,
      average_ticket: totalClients > 0 ? totalRevenue / totalClients : 0,
      services_conversion: totalClients > 0 ? (totalServicesCount / totalClients) * 100 : 0,
      products_conversion: totalClients > 0 ? (totalProductsCount / totalClients) * 100 : 0,
    });
  }, [barber, selectedYear, selectedMonth, holidayDates]);

  const calculateDailyTarget = useCallback(async () => {
    if (!monthlyGoal || !stats || !barber) return;

    const remaining = monthlyGoal.target_commission - stats.accumulated_commission;
    
    // Detectar o tipo de mês selecionado
    const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
    
    const isSelectedMonthCurrent = selectedMonth === currentMonth && selectedYear === currentYear;
    const isSelectedMonthPast = selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);
    const isSelectedMonthFuture = selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth);
    
    let daysToUse = 0;
    
    if (isSelectedMonthPast) {
      // Mês passado: zerar meta diária
      setDailyTarget(0);
      setDailyTargetServices(0);
      return;
    } else if (isSelectedMonthCurrent) {
      // Mês atual: cálculo 100% dinâmico (mês completo - ausências futuras - feriados)
      const manausDate = getManausDate();
      const selectedDate = new Date(selectedYear, selectedMonth - 1, manausDate.getDate());
      const remainingCalendarDays = calculateRemainingWorkDays(selectedDate, holidayDates);
      const futureOffCount = scheduledOffDates.filter((date) => date >= format(selectedDate, "yyyy-MM-dd")).length;
      daysToUse = Math.max(1, remainingCalendarDays - futureOffCount);
    } else if (isSelectedMonthFuture) {
      const firstDayOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
      const remainingCalendarDays = calculateRemainingWorkDays(firstDayOfMonth, holidayDates);
      const futureOffCount = scheduledOffDates.length;
      daysToUse = Math.max(1, remainingCalendarDays - futureOffCount);
    }

    const dailyTarget = daysToUse > 0 ? Math.max(0, remaining / daysToUse) : 0;
    setDailyTarget(dailyTarget);

    // Calcular meta diária de serviços (mesma lógica proporcional)
    const servicesTarget = monthlyGoal.target_commission > 0 
      ? dailyTarget * (stats.total_services / Math.max(1, stats.accumulated_commission))
      : 0;
    setDailyTargetServices(servicesTarget);
  }, [monthlyGoal, stats, barber, selectedMonth, selectedYear, holidayDates, scheduledOffDates]);

  const pacingCoachMessage = useMemo(() => {
    if (!isCurrentMonth || !monthlyGoal || !stats) return null;

    const today = getManausDate().getDay();
    const isThursdayOrFriday = today === 4 || today === 5;
    if (!isThursdayOrFriday) return null;

    const currentDate = getManausDate();
    const currentDayOfMonth = currentDate.getDate();
    const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
    const elapsedCalendarDays = currentDayOfMonth;
    const elapsedHolidays = holidayDates.filter((d) => d >= format(monthStart, "yyyy-MM-dd") && d <= format(currentDate, "yyyy-MM-dd")).length;
    const elapsedOff = scheduledOffDates.filter((d) => d <= format(currentDate, "yyyy-MM-dd")).length;
    const effectiveElapsed = Math.max(1, elapsedCalendarDays - elapsedHolidays - elapsedOff);
    const expectedByNow = (monthlyGoal.target_commission / Math.max(1, new Date(selectedYear, selectedMonth, 0).getDate())) * effectiveElapsed;

    if (stats.accumulated_commission >= expectedByNow) return null;

    return "IA: Notei que o seu ritmo esta semana foi mais baixo. Caso a sua barbearia funcione aos domingos, peça pro seu gestor para ir neste, para tentar compensar a semana mais fraca e bater a sua meta mensal.";
  }, [isCurrentMonth, monthlyGoal, stats, selectedYear, selectedMonth, holidayDates, scheduledOffDates]);

  useEffect(() => {
    fetchBarberData();

    // Realtime listener para atualizar quando gerente alterar comissões
    const barberChannel = supabase
      .channel('barbers-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'barbers',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const oldBarber = payload.old as BarberData;
          const newBarber = payload.new as BarberData;
          
          // Verificar se houve mudança nas comissões
          const servicesChanged = oldBarber.services_commission !== newBarber.services_commission;
          const productsChanged = oldBarber.products_commission !== newBarber.products_commission;
          
          if (servicesChanged || productsChanged) {
            setCommissionChange({
              oldServices: oldBarber.services_commission,
              newServices: newBarber.services_commission,
              oldProducts: oldBarber.products_commission,
              newProducts: newBarber.products_commission,
              timestamp: new Date(),
            });
            
            // Toast de notificação
            toast.success("Sua comissão foi atualizada pelo gerente!", {
              description: "Confira as novas taxas no banner acima.",
              duration: 5000,
            });
          }
          
          setBarber(newBarber);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(barberChannel);
    };
  }, [user, fetchBarberData]);

  useEffect(() => {
    if (barber) {
      fetchMonthlyGoal();
      fetchMonthlyStats();
      
      // Realtime listener para FORÇAR recálculo quando lançamentos forem alterados
      const productionsChannel = supabase
        .channel(`daily-productions-${barber.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'daily_productions',
            filter: `barber_id=eq.${barber.id}`,
          },
          (payload) => {
            // Forçar recálculo IMEDIATO das estatísticas
            fetchMonthlyStats();
            fetchMonthlyGoal();
          }
        )
        .subscribe();

      // Realtime listener para notificar quando uma nova venda for registrada
      const salesChannel = supabase
        .channel(`sale-notifications-${barber.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sale_transactions',
            filter: `barber_id=eq.${barber.id}`,
          },
          async (payload) => {
            const sale = payload.new as any;
            const valor = Number(sale.price_sold || 0);
            const itemName = sale.item_name || 'Item';
            const clientName = sale.client_name?.trim() || '';

            // Contar vendas do dia para esse barbeiro
            const today = getTodayString();
            const { count } = await supabase
              .from('sale_transactions')
              .select('id', { count: 'exact', head: true })
              .eq('barber_id', barber.id)
              .gte('created_at', `${today}T00:00:00-04:00`)
              .lte('created_at', `${today}T23:59:59-04:00`);

            const salesCount = count || 1;
            
            toast.success(`💰 Venda #${salesCount} do dia!`, {
              description: `${itemName}${clientName ? ` — ${clientName}` : ''}: R$ ${valor.toFixed(2)}`,
              duration: 6000,
            });

            // Atualizar lista de vendas ao vivo e stats
            fetchMonthlyGoal();
            fetchMonthlyStats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(productionsChannel);
        supabase.removeChannel(salesChannel);
      };
    }
  }, [barber, selectedMonth, selectedYear, fetchMonthlyGoal, fetchMonthlyStats]); // Recarregar quando mês/ano mudar

  useEffect(() => {
    if (monthlyGoal && stats && barber) {
      calculateDailyTarget();
    }
  }, [monthlyGoal, stats, barber, selectedMonth, selectedYear, calculateDailyTarget]);

  // Check localStorage for existing war plan
  useEffect(() => {
    if (!barber) return;
    const todayKey = `war_plan_${getTodayString()}_${barber.id}`;
    const saved = localStorage.getItem(todayKey);
    if (saved) {
      setWarPlanMessage(saved);
      setShowWarPlanWizard(false);
    } else {
      setShowWarPlanWizard(true);
    }
  }, [barber]);

  const handleWarPlanComplete = (planText: string) => {
    if (!barber) return;
    const todayKey = `war_plan_${getTodayString()}_${barber.id}`;
    localStorage.setItem(todayKey, planText);
    setWarPlanMessage(planText);
    setShowWarPlanWizard(false);
    setActiveTab("ai-tips");
  };
  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setIsSigningOut(false);
    }
  };

  // Funções para navegação de mês
  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleCurrentMonth = () => {
    const { month, year } = getCurrentMonthYear();
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const handleEditProduction = (production: EditingProduction) => {
    setEditingProduction({
      id: production.id,
      date: production.date,
    });
  };

  const handleFormSuccess = () => {
    // Forçar recálculo de TODOS os dados
    fetchMonthlyStats();
    fetchMonthlyGoal();
    fetchLivePanelData();
  };

  const handleOpenPresenceModal = () => {
    setPresenceModalOpen(true);
  };

  const handleConfirmPresence = async (subscriptionClientsCount: number, selectedDate?: string, presenceType?: string) => {
    if (!barber) return;
    
    setConfirmingPresence(true);
    
    // Usar data selecionada ou hoje como fallback
    const dateStr = selectedDate || getTodayString();
    let error = null;

    // Buscar se já existe produção para a data selecionada
    const { data: existingProd } = await supabase
      .from("daily_productions")
      .select("id, services_basic_total, services_extra_total, products_total, services_total")
      .eq("barber_id", barber.id)
      .eq("date", dateStr)
      .maybeSingle();

    // Validar se já existe faturamento na data selecionada
    if (existingProd) {
      const existingTotal = (Number(existingProd.services_basic_total) || 0) +
                           (Number(existingProd.services_extra_total) || 0) +
                           (Number(existingProd.products_total) || 0) +
                           (Number(existingProd.services_total) || 0);
      
      if (existingTotal > 0) {
        setConfirmingPresence(false);
        setPresenceModalOpen(false);
        toast.error("Não é possível confirmar presença nesta data", {
          description: `Já existe faturamento de R$ ${existingTotal.toFixed(2).replace('.', ',')} registrado em ${dateStr.split("-").reverse().join("/")}.`,
          duration: 5000,
        });
        return;
      }
    }

    const pType = presenceType || "present";

    if (existingProd?.id) {
      const result = await supabase
        .from("daily_productions")
        .update({ 
          confirmed_presence: true,
          presence_type: pType,
          clients_count: pType === "present" ? subscriptionClientsCount : 0,
          manual_clients_count: pType === "present" ? subscriptionClientsCount : 0
        })
        .eq("id", existingProd.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("daily_productions")
        .insert({
          barber_id: barber.id,
          organization_id: barber.organization_id,
          date: dateStr,
          services_basic_total: 0,
          services_extra_total: 0,
          products_total: 0,
          services_total: 0,
          clients_count: pType === "present" ? subscriptionClientsCount : 0,
          manual_clients_count: pType === "present" ? subscriptionClientsCount : 0,
          services_count: 0,
          products_count: 0,
          confirmed_presence: true,
          presence_type: pType
        });
      error = result.error;
    }

    setConfirmingPresence(false);
    setPresenceModalOpen(false);

    if (error) {
      toast.error("Erro ao confirmar presença");
      console.error("Erro ao confirmar presença:", error);
      return;
    }

    const isToday = dateStr === getTodayString();
    const dateLabel = isToday ? "hoje" : `em ${dateStr.split("-").reverse().join("/")}`;
    
    if (pType === "present") {
      if (subscriptionClientsCount > 0) {
        toast.success(`Registrado! Você atendeu ${subscriptionClientsCount} cliente${subscriptionClientsCount > 1 ? 's' : ''} de assinatura ${dateLabel}.`, {
          description: "Presença registrada. Dia contabilizado na meta.",
          duration: 4000,
        });
      } else {
        toast.success(`Presença registrada ${dateLabel}. Foco total!`, {
          description: "Dia contabilizado na meta.",
          duration: 4000,
        });
      }
    } else if (pType === "day_off") {
      toast.success(`Folga registrada ${dateLabel}.`, {
        description: "Você terá que compensar nos dias restantes.",
        duration: 4000,
      });
    } else if (pType === "absence") {
      toast.success(`Falta registrada ${dateLabel}.`, {
        duration: 4000,
      });
    }

    // Atualizar estado local se for hoje
    if (isToday) {
      setTodayProduction(prev => prev 
        ? { ...prev, confirmed_presence: true, exists: true } 
        : null
      );
    }
    
    // Recarregar estatísticas para refletir o novo cálculo
    fetchMonthlyStats();
    fetchLivePanelData();
  };

  if (missingLink) {
    return (
      <div className="min-h-screen bg-background">
        <header className="glass-strong border-b border-white/[0.06] sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Performance Barber" className="h-16 w-auto" />
                <h1 className="text-xl font-bold text-foreground">
                  Vinculação pendente
                </h1>
              </div>
              <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sair"}
              </Button>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-6">
          <Card className="bg-card border-border shadow-card-custom">
            <CardHeader>
              <CardTitle>Seu usuário não está vinculado a um barbeiro</CardTitle>
              <CardDescription>
                Peça ao gerente para associar sua conta a um cadastro de barbeiro e a uma unidade.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground">
                Após a vinculação, o painel e o lançamento diário ficarão disponíveis aqui.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!barber || !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm bg-card border-border shadow-card-custom">
          <CardContent className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando seu painel...</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const progressPercentage = monthlyGoal && monthlyGoal.target_commission > 0
    ? (stats.accumulated_commission / monthlyGoal.target_commission) * 100
    : 0;

  // Calcular dias úteis REAIS restantes no calendário (apenas para o mês atual)
  const daysLeft = isCurrentMonth ? calculateRemainingWorkDays(getManausDate(), holidayDates) : 0;
  
  // Calcular "Falta Ganhar" com proteção contra NaN
  const remaining = monthlyGoal 
    ? Math.max(0, monthlyGoal.target_commission - stats.accumulated_commission)
    : 0;

  // Nome do mês em português
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const selectedMonthName = monthNames[selectedMonth - 1];

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-strong border-b border-white/[0.06] sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src={logo} alt="Performance Barber" className="h-12 w-auto sm:h-16" />
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-primary/80">
                  Meu Painel Diário
                </p>
                <h1 className="truncate font-display text-xl font-semibold leading-tight text-foreground">
                  Olá, {barber.name}
                </h1>
                {isCurrentMonth && (
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground/80">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    Dias úteis restantes:{" "}
                    <span className="font-mono font-semibold text-foreground">{daysLeft}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <PushNotificationToggle 
                barberId={barber.id} 
                organizationId={barber.organization_id} 
                userId={user.id} 
              />
              <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saindo...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Banner de Alteração de Comissão */}
        {commissionChange && (
          <Card className="mb-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/30 animate-pulse-slow">
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/20 rounded-full">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-foreground flex items-center gap-2">
                      🎉 Sua comissão foi atualizada!
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Serviços:</span>
                        <span className="line-through text-muted-foreground">{commissionChange.oldServices}%</span>
                        <span className="font-bold text-primary flex items-center gap-1">
                          {commissionChange.newServices > commissionChange.oldServices ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )}
                          {commissionChange.newServices}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Produtos:</span>
                        <span className="line-through text-muted-foreground">{commissionChange.oldProducts}%</span>
                        <span className="font-bold text-primary flex items-center gap-1">
                          {commissionChange.newProducts > commissionChange.oldProducts ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )}
                          {commissionChange.newProducts}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Seus valores de comissão e metas já foram recalculados automaticamente.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setCommissionChange(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="daily">Meu Painel</TabsTrigger>
            <TabsTrigger value="live" className="flex items-center gap-1">
              <Radio className="w-3 h-3" />
              Ao vivo
            </TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
            <TabsTrigger value="ai-tips" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span className="hidden sm:inline">Dicas da IA</span>
              <span className="sm:hidden">IA</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-6">
            {/* Aviso: app do barbeiro é somente para acompanhamento */}
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">📋</span>
              <p className="text-xs text-muted-foreground">
                Este app é <strong className="text-foreground">somente para acompanhamento</strong>. Todos os lançamentos de venda são feitos pela recepção. Encontrou algum erro? Avise o gestor.
              </p>
            </div>
            {/* Alerta de Produções Pendentes */}
            {/* Dias Pendentes de Conferência (AO VIVO) */}
            <PendingDayReviews 
              barberId={barber.id} 
              onReview={(date) => setReviewingDate(date)} 
            />
            {/* Dias sem nenhum registro (sem vendas ao vivo) */}
            <MissingProductionAlert
              barberId={barber.id}
              organizationId={barber.organization_id}
              onStatusRegistered={() => {
                fetchMonthlyStats();
                fetchLivePanelData();
              }}
            />
            {/* Seletor de Mês/Ano */}
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePreviousMonth}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  <div className="flex-1 text-center">
                    <h2 className="text-2xl font-bold">
                      {selectedMonthName} {selectedYear}
                    </h2>
                    {!isCurrentMonth && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleCurrentMonth}
                        className="text-primary"
                      >
                        Voltar para o mês atual
                      </Button>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextMonth}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            {/* Card de Meta de Produção */}
            <Card className="bg-gradient-card border-border shadow-gold">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Target className="w-6 h-6 text-primary" />
                  {dailyTargetServices > 0 ? "SEU FOCO HOJE É VENDER:" : "META DIÁRIA"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dailyTargetServices > 0 ? (
                  <>
                    <div className="text-center space-y-3">
                      <p className="text-5xl font-bold text-primary">
                        R$ {dailyTargetServices.toFixed(2)}
                      </p>
                      <p className="text-lg font-semibold text-foreground uppercase tracking-wide">
                        (EM SERVIÇOS)
                      </p>
                    </div>
                    <div className="bg-card/50 border border-border rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground font-medium">
                        💡 <span className="font-bold">LEMBRETE:</span> Vender PRODUTOS ajuda a bater esta meta mais rápido!
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-3">
                    <p className="text-3xl font-bold text-muted-foreground">
                      N/A
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedMonth < currentMonthNow || selectedYear < currentYearNow
                        ? "Este mês já passou"
                        : "Aguardando dados"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {pacingCoachMessage && (
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-4">
                  <p className="text-sm text-foreground">
                    <strong>Coach IA:</strong> {pacingCoachMessage}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Confirmação de Presença standalone */}
            {isCurrentMonth && todayProduction !== null && todayProduction.total === 0 && !todayProduction.confirmed_presence && (
              <Card className="bg-card border-border shadow-card-custom">
                <CardContent className="pt-6 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full border-primary/50 hover:bg-primary/10"
                    onClick={handleOpenPresenceModal}
                    disabled={confirmingPresence}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {confirmingPresence ? "Confirmando..." : "Não vendi nada hoje (Confirmar Presença)"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Clique para informar que você compareceu, mesmo sem vendas.
                  </p>
                </CardContent>
              </Card>
            )}

            {isCurrentMonth && todayProduction !== null && todayProduction.total === 0 && todayProduction.confirmed_presence && (
              <div className="flex items-center justify-center gap-2 text-success rounded-lg border border-success/30 bg-success/5 p-3">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium text-sm">Presença confirmada para hoje</span>
              </div>
            )}

            {/* Card de Progresso Mensal */}
            <Card className="bg-card border-border shadow-card-custom">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-success" />
                  SEU PROGRESSO NO MÊS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sua Meta de Comissão Mensal:</span>
                    <span className="font-bold">
                      {monthlyGoal ? `R$ ${monthlyGoal.target_commission.toFixed(2)}` : "Sem meta cadastrada"}
                    </span>
                  </div>
                  {monthlyGoal ? (
                    <>
                      <Progress value={progressPercentage} className="h-3" />
                      <div className="flex justify-end text-sm">
                        <span className="text-success font-bold">{progressPercentage.toFixed(1)}%</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Peça ao gerente para cadastrar sua meta mensal
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-sm text-muted-foreground">Comissão Já Ganha</p>
                    <p className="text-2xl font-bold text-success">
                      R$ {stats.accumulated_commission.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Falta Ganhar</p>
                    <p className="text-2xl font-bold text-destructive">
                      R$ {remaining.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card de Métricas */}
            <Card className="bg-card border-border shadow-card-custom">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  SUAS MÉTRICAS DE EFICIÊNCIA
                </CardTitle>
                <CardDescription>{selectedMonthName} {selectedYear}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Vendas (Serviços)</p>
                    <p className="text-2xl font-bold text-success">R$ {stats.total_services.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Vendas (Produtos)</p>
                    <p className="text-2xl font-bold text-primary">R$ {stats.total_products.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Clientes Atendidos</p>
                    <p className="text-2xl font-bold">{stats.total_clients}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Ticket Médio</p>
                    <p className="text-2xl font-bold">R$ {stats.average_ticket.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Taxa de Venda (Serviços %)</p>
                    <p className="text-2xl font-bold text-success">{stats.services_conversion.toFixed(1)}%</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Taxa de Venda (Produtos %)</p>
                    <p className="text-2xl font-bold text-primary">{stats.products_conversion.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hub de conferência (somente leitura) */}
            <Card className="bg-card border-border shadow-card-custom">
              <CardHeader>
                <CardTitle className="text-base">Central de Conferência</CardTitle>
                <CardDescription>
                  Lançamentos são feitos pela recepção. Aqui você apenas acompanha e confirma.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    className="w-full"
                    onClick={() => setReviewingDate(getTodayString())}
                    disabled={!isCurrentMonth}
                  >
                    Conferir hoje
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setActiveTab("history")}
                  >
                    Ver histórico de conferências
                  </Button>
                </div>

                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Status de hoje</p>
                  <p className="text-sm font-semibold">
                    {todayProduction
                      ? todayProduction.total > 0
                        ? `Com lançamentos: R$ ${todayProduction.total.toFixed(2)}`
                        : todayProduction.confirmed_presence
                        ? "Presença confirmada sem vendas"
                        : "Sem confirmação ainda"
                      : "Sem dados para hoje"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="live" className="space-y-6">
            <Card className="bg-card border-border shadow-card-custom">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-primary" />
                  AO VIVO - SUA PRODUÇÃO DE HOJE
                </CardTitle>
                <CardDescription>
                  Painel somente leitura com meta diária, progresso e vendas realizadas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Barra de progresso do dia */}
                {(() => {
                  const todayTotal = todayProduction?.total ?? 0;
                  const target = dailyTargetServices > 0 ? dailyTargetServices : dailyTarget;
                  const dayProgress = target > 0 ? Math.min(100, (todayTotal / target) * 100) : 0;
                  const faltaHoje = Math.max(0, target - todayTotal);
                  const metaBatida = target > 0 && todayTotal >= target;
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progresso do dia</span>
                        <span className={`font-bold ${metaBatida ? 'text-success' : 'text-foreground'}`}>
                          {dayProgress.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={dayProgress} className={`h-4 ${metaBatida ? '[&>div]:bg-success' : ''}`} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>R$ {todayTotal.toFixed(2)} vendido</span>
                        {target > 0 ? (
                          metaBatida ? (
                            <span className="text-success font-semibold">🏆 Meta batida!</span>
                          ) : (
                            <span>Falta R$ {faltaHoje.toFixed(2)}</span>
                          )
                        ) : (
                          <span>Sem meta definida</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Produção de hoje</p>
                    <p className="text-2xl font-bold">R$ {todayProduction?.total.toFixed(2) ?? "0.00"}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Meta diária (comissão)</p>
                    <p className="text-2xl font-bold">R$ {dailyTarget.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Meta diária (serviços)</p>
                    <p className="text-2xl font-bold">R$ {dailyTargetServices.toFixed(2)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">O que e para quem você já vendeu hoje</h3>
                  {liveSales.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma venda registrada até o momento.</p>
                  ) : (
                    <div className="space-y-2">
                      {liveSales.map((sale) => (
                        <div key={sale.id} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{sale.client_name?.trim() || "Cliente não informado"}</p>
                            <p className="text-xs text-muted-foreground">
                              {sale.item_name} ({sale.item_type}) • {format(new Date(sale.created_at), "HH:mm")}
                            </p>
                          </div>
                          <p className="font-bold">R$ {Number(sale.price_sold || 0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <ProductionHistory
              barberId={barber.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onReview={(date) => setReviewingDate(date)}
            />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard viewerRole="barber" />
          </TabsContent>

          <TabsContent value="ai-tips" className="space-y-6">
            {monthlyGoal ? (
              <AITipsTab
                barberId={barber.id}
                organizationId={barber.organization_id}
                barberName={barber.name}
                monthlyGoal={monthlyGoal.target_commission}
                soldToday={todayProduction?.total || 0}
                soldThisMonth={stats.accumulated_commission}
                daysRemaining={daysLeft}
                dailyTarget={dailyTarget}
                warPlan={warPlanMessage}
              />
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center">
                  <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Dicas Indisponíveis
                  </h3>
                  <p className="text-muted-foreground">
                    Peça ao gerente para cadastrar sua meta mensal para desbloquear as dicas da IA.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Modal de Confirmação de Presença */}
        <ConfirmPresenceModal
          open={presenceModalOpen}
          onOpenChange={setPresenceModalOpen}
          onConfirm={handleConfirmPresence}
          isLoading={confirmingPresence}
        />

        {/* Modal de Conferência do Dia (AO VIVO) */}
        {reviewingDate && barber && (
          <DayReviewModal
            open={!!reviewingDate}
            onOpenChange={(open) => !open && setReviewingDate(null)}
            barberId={barber.id}
            organizationId={barber.organization_id}
            date={reviewingDate}
            onSuccess={handleFormSuccess}
          />
        )}

        {/* War Plan Wizard */}
        {barber && isCurrentMonth && monthlyGoal && (
          <WarPlanWizard
            open={showWarPlanWizard}
            onOpenChange={setShowWarPlanWizard}
            organizationId={barber.organization_id}
            dailyTarget={dailyTargetServices > 0 ? dailyTargetServices : dailyTarget}
            todayRevenue={todayProduction?.total || 0}
            onComplete={handleWarPlanComplete}
          />
        )}

      </div>
    </div>
  );
}
