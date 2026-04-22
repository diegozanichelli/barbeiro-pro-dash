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
import { Plus, Radio, Loader2, Pencil, ChevronLeft, ChevronRight, Calendar, FileText, Crown, Eye, UserCheck, CalendarOff, XCircle, EllipsisVertical, TrendingUp, Users, DollarSign, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";

interface BarberRow {
  id: string;
  name: string;
  unit_id: string;
  services_commission: number;
  units: { name: string };
}

interface ManagerTransaction {
  barber_id: string | null;
  price_sold: number;
  item_type: string;
  service_category: string | null;
}

interface Barber {
  id: string;
  name: string;
  unit_id: string;
  unit_name: string;
  services_commission: number;
}

interface DailyProduction {
  date: string;
  presence_type?: string | null;
  tx_basic_total?: number | null;
  tx_extra_total?: number | null;
  tx_products_total?: number | null;
  manual_basic_total?: number | null;
  manual_extra_total?: number | null;
  manual_products_total?: number | null;

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
  date: string;
  presence_type: string | null;

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
  const todayManausDate = getManausDate();
  const { holidayDates } = useOrganizationHolidays({
    organizationId,
    month: todayManausDate.getMonth() + 1,
    year: todayManausDate.getFullYear(),
  });
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
    mode?: "barber" | "reception";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [yesterdayRevenue, setYesterdayRevenue] = useState<number | null>(null);

  // Date navigation state
  const todayManaus = getTodayString();
  const [selectedDate, setSelectedDate] = useState(todayManaus);
  const isViewingToday = selectedDate === todayManaus;
  
  const selectedDateObj = parseISO(selectedDate);
  const currentMonth = selectedDateObj.getMonth() + 1;
  const currentYear = selectedDateObj.getFullYear();

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setBarbers([]);
      setProductions([]);
      setMonthProductions([]);
      setGoals([]);
      setUnits([]);
      setManagerTransactions([]);
      setTotalRevenue(0);
      setIsLoading(false);
      return;
    }

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
        const mappedBarbers = (barbersData as BarberRow[]).map((b) => ({
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

      // Fetch manager transactions directly from sale_transactions for the selected day
      const nextDay = format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd");
      const { data: managerTxData } = await supabase
        .from("sale_transactions")
        .select("barber_id, price_sold, item_type, service_category")
        .eq("organization_id", organizationId)
        .eq("source", "manager")
        .gte("created_at", selectedDate + "T00:00:00-04:00")
        .lt("created_at", nextDay + "T00:00:00-04:00");

      setManagerTransactions(managerTxData || []);

      // Fetch month's productions for days worked calculation and average ticket
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const { data: monthProductionsData } = await supabase
        .from("daily_productions")
        .select(`
          barber_id,
          date,
          commission_earned, 
          confirmed_presence,
          presence_type,
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

      // Fetch yesterday's revenue for comparison
      const yesterday = format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd");
      const dayAfterYesterday = selectedDate;
      const { data: yesterdayTxData } = await supabase
        .from("sale_transactions")
        .select("barber_id, price_sold, item_type")
        .eq("organization_id", organizationId)
        .eq("source", "manager")
        .gte("created_at", yesterday + "T00:00:00-04:00")
        .lt("created_at", dayAfterYesterday + "T00:00:00-04:00");

      const yRevenue = (yesterdayTxData || [])
        .filter(t => t.item_type !== 'subscription')
        .reduce((sum, t) => sum + (t.price_sold || 0), 0);
      setYesterdayRevenue(yRevenue);
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

  // State for manager transactions read directly from sale_transactions
  const [managerTransactions, setManagerTransactions] = useState<ManagerTransaction[]>([]);

  // Calculate total revenue from managerTransactions (Ao Vivo)
  // Calculate total revenue combining confirmed barber data + unconfirmed manager transactions
  useEffect(() => {
    const relevantBarbers = selectedUnit === "all"
      ? barbers
      : barbers.filter((b) => b.unit_id === selectedUnit);

    const newTotal = relevantBarbers.reduce((sum, barber) => {
      return sum + getBarberRevenue(barber.id);
    }, 0);

    if (newTotal !== totalRevenue && totalRevenue > 0) {
      setIsGlowing(true);
      setTimeout(() => setIsGlowing(false), 2000);
    }
    setTotalRevenue(newTotal);
  }, [managerTransactions, productions, selectedUnit, barbers]);

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
    // Verificar se é folga/falta
    const production = productions.find((p) => p.barber_id === barberId);
    if (production && production.confirmed_presence && 
        (production.presence_type === 'day_off' || production.presence_type === 'absence')) {
      return 0;
    }
    // AO VIVO é sempre a fonte de verdade - usar transações do gestor
    return managerTransactions
      .filter(t => t.barber_id === barberId && t.item_type !== 'subscription')
      .reduce((sum, t) => sum + (t.price_sold || 0), 0);
  };

  const getBarberProduction = (barberId: string) => {
    return productions.find((p) => p.barber_id === barberId);
  };

  const handleEditClick = async (barber: Barber) => {
    const { data: production } = await supabase
      .from("daily_productions")
      .select("id")
      .eq("barber_id", barber.id)
      .eq("date", selectedDate)
      .maybeSingle();

    setEditModal({
      open: true,
      barberId: barber.id,
      barberName: barber.name,
      dailyProductionId: production?.id || "",
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

    setViewTransactionsModal({
      open: true,
      barberId: barber.id,
      barberName: barber.name,
      dailyProductionId: production?.id || "",
      date: selectedDate,
    });
  };

  const handleRegisterDayStatus = async (barber: Barber, status: "present" | "day_off" | "absence" | "optional_sunday") => {
    if (!organizationId) return;

    const revenue = getBarberRevenue(barber.id);
    if (revenue > 0) {
      toast.error("Este barbeiro já possui vendas no dia. Remova as vendas antes de marcar status.");
      return;
    }

    try {
      const { data: existingProduction, error: fetchError } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("barber_id", barber.id)
        .eq("date", selectedDate)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const payload = {
        confirmed_presence: true,
        presence_type: status,
        services_basic_total: 0,
        services_extra_total: 0,
        services_total: 0,
        products_total: 0,
        clients_count: 0,
        services_count: 0,
        products_count: 0,
        manual_basic_total: 0,
        manual_extra_total: 0,
        manual_products_total: 0,
        manual_clients_count: 0,
      };

      if (existingProduction?.id) {
        const { error: updateError } = await supabase
          .from("daily_productions")
          .update(payload)
          .eq("id", existingProduction.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("daily_productions")
          .insert({
            organization_id: organizationId,
            barber_id: barber.id,
            date: selectedDate,
            commission_earned: 0,
            ...payload,
          });

        if (insertError) throw insertError;
      }

      const labels = {
        present: "Presença sem venda",
        day_off: "Folga",
        absence: "Falta",
        optional_sunday: "Domingo opcional",
      } as const;

      toast.success(`${labels[status]} registrada para ${barber.name}.`);
      fetchData();
    } catch (error) {
      console.error("Erro ao registrar status do dia:", error);
      toast.error("Não foi possível registrar o status do dia.");
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

    // Calculate remaining commission to achieve
    const remainingCommission = Math.max(0, goal.target_commission - totalEarnedMonth);

    // Dynamic divisor: remaining calendar days - future off/absence marks
    const remainingCalendarDays = calculateRemainingWorkDays(getManausDate(), holidayDates);
    const futureOffDays = barberMonthProductions.filter(
      (p) => p.date >= selectedDate && ["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? "")
    ).length;
    const daysToUse = Math.max(1, remainingCalendarDays - futureOffDays);

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

  const getBarberAverageTicket = (barberId: string): number | null => {
    // 1. Tentar ticket individual do barbeiro (se 5+ atendimentos no mês)
    const barberMonthProds = monthProductions.filter(p => p.barber_id === barberId);
    const barberClients = barberMonthProds.reduce((sum, p) => sum + (p.clients_count || 0), 0);
    if (barberClients >= 5) {
      const barberRevenue = barberMonthProds.reduce((sum, p) => {
        const servicesTotal =
          p.services_basic_total !== null || p.services_extra_total !== null
            ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
            : p.services_total || 0;
        return sum + servicesTotal + (p.products_total || 0);
      }, 0);
      if (barberRevenue > 0) return barberRevenue / barberClients;
    }

    // 2. Fallback: ticket médio global da unidade/organização
    const filteredMonthProductions = selectedUnit === "all"
      ? monthProductions
      : monthProductions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const totalClientsMonth = filteredMonthProductions.reduce(
      (sum, p) => sum + (p.clients_count || 0), 0
    );
    const totalRevenueMonth = filteredMonthProductions.reduce((sum, p) => {
      const servicesTotal =
        p.services_basic_total !== null || p.services_extra_total !== null
          ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
          : p.services_total || 0;
      return sum + servicesTotal + (p.products_total || 0);
    }, 0);

    if (totalClientsMonth > 0 && totalRevenueMonth > 0) {
      return totalRevenueMonth / totalClientsMonth;
    }

    // 3. Fallback: transações do dia
    const filteredTx = selectedUnit === "all"
      ? managerTransactions
      : managerTransactions.filter((t) => {
          const barber = barbers.find((b) => b.id === t.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const totalClients = filteredTx.filter(
      t => t.item_type === "service" && t.service_category === "basic"
    ).length;

    if (totalClients > 0 && totalRevenue > 0) {
      return totalRevenue / totalClients;
    }

    // Sem dados suficientes
    return null;
  };

  const getCutsRemaining = (barberId: string, barber: Barber): { cuts: number | null; monetaryRemaining: number } => {
    const revenue = getBarberRevenue(barberId);
    const target = getBarberDailyTarget(barber);
    const remaining = target - revenue;
    if (remaining <= 0) return { cuts: 0, monetaryRemaining: 0 };

    const avgTicket = getBarberAverageTicket(barberId);
    if (avgTicket === null || avgTicket <= 0) {
      return { cuts: null, monetaryRemaining: remaining };
    }
    return { cuts: Math.ceil(remaining / avgTicket), monetaryRemaining: remaining };
  };

  // Helper para verificar se há lançamento manual pendente de conferência
  const hasPendingManualEntry = (barberId: string) => {
    const production = productions.find((p) => p.barber_id === barberId);
    if (!production) return false;
    const txTotal = 
      (production.tx_basic_total || 0) +
      (production.tx_extra_total || 0) +
      (production.tx_products_total || 0);
    const manualTotal =
      (production.manual_basic_total || 0) +
      (production.manual_extra_total || 0) +
      (production.manual_products_total || 0);
    return txTotal === 0 && manualTotal > 0;
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
  const sortedBarbers = [...filteredBarbers].sort((a, b) => {
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

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedBarbers.length / ITEMS_PER_PAGE);
  const paginatedBarbers = sortedBarbers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1); }, [selectedUnit]);

  const rankingData = filteredBarbers.map((b) => ({
    id: b.id,
    name: b.name,
    revenue: getBarberRevenue(b.id),
  }));

  // Monthly revenue from monthProductions
  const monthRevenueTotal = useMemo(() => {
    const prods = selectedUnit === "all"
      ? monthProductions
      : monthProductions.filter(p => {
          const b = barbers.find(bb => bb.id === p.barber_id);
          return b?.unit_id === selectedUnit;
        });
    return prods.reduce((sum, p) => {
      const svc = (p.services_basic_total !== null || p.services_extra_total !== null)
        ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
        : (p.services_total || 0);
      return sum + svc + (p.products_total || 0);
    }, 0);
  }, [monthProductions, selectedUnit, barbers]);

  const monthClientsTotal = useMemo(() => {
    const prods = selectedUnit === "all"
      ? monthProductions
      : monthProductions.filter(p => {
          const b = barbers.find(bb => bb.id === p.barber_id);
          return b?.unit_id === selectedUnit;
        });
    return prods.reduce((sum, p) => sum + (p.clients_count || 0), 0);
  }, [monthProductions, selectedUnit, barbers]);

  // Unit rankings (today's revenue per unit)
  const unitRankingData = useMemo(() => {
    const unitMap = new Map<string, { name: string; revenue: number }>();
    units.forEach(u => unitMap.set(u.id, { name: u.name, revenue: 0 }));
    barbers.forEach(b => {
      const rev = getBarberRevenue(b.id);
      const existing = unitMap.get(b.unit_id);
      if (existing) existing.revenue += rev;
    });
    return Array.from(unitMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [units, barbers, managerTransactions, productions]);

  // Monthly team goal progress
  const teamMonthlyGoal = useMemo(() => {
    const relevantBarbers = selectedUnit === "all" ? barbers : barbers.filter(b => b.unit_id === selectedUnit);
    const relevantGoals = goals.filter(g => relevantBarbers.some(b => b.id === g.barber_id));

    // Convert commission targets to revenue targets using each barber's commission rate
    const totalTarget = relevantGoals.reduce((sum, g) => {
      const barber = relevantBarbers.find(b => b.id === g.barber_id);
      const rate = barber?.services_commission || 50;
      return sum + (rate > 0 ? g.target_commission / (rate / 100) : g.target_commission);
    }, 0);

    // Sum actual revenue (not commission) from month productions
    const totalEarned = relevantBarbers.reduce((sum, b) => {
      const barberProds = monthProductions.filter(p => p.barber_id === b.id);
      return sum + barberProds.reduce((s, p) => {
        if ((Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) > 0) {
          return s + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + (Number(p.products_total) || 0);
        }
        return s + (Number(p.services_total) || 0) + (Number(p.products_total) || 0);
      }, 0);
    }, 0);

    const pct = totalTarget > 0 ? Math.min((totalEarned / totalTarget) * 100, 100) : 0;
    return { totalTarget, totalEarned, pct };
  }, [barbers, goals, monthProductions, selectedUnit]);

  // Yesterday comparison
  const revenueComparison = useMemo(() => {
    if (yesterdayRevenue === null || yesterdayRevenue === 0) return null;
    const diff = totalRevenue - yesterdayRevenue;
    const pct = (diff / yesterdayRevenue) * 100;
    return { diff, pct, isUp: diff >= 0 };
  }, [totalRevenue, yesterdayRevenue]);

  // Check if barber is idle (no sales, it's today, after 11h Manaus)
  const manausHour = todayManausDate.getHours();
  const isAfter11 = isViewingToday && manausHour >= 11;

  if (isLoading) {
    return (
      <div className="min-h-[260px] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando painel Ao Vivo...</p>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="min-h-[260px] flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <p className="text-base font-medium text-foreground">Não foi possível identificar a organização.</p>
          <p className="text-sm text-muted-foreground">Recarregue a página para tentar novamente.</p>
        </div>
      </div>
    );
  }

  // KPI calculations
  const totalClientsToday = filteredBarbers.reduce((sum, b) => {
    const txCount = managerTransactions
      .filter(t => t.barber_id === b.id && t.item_type === "service" && t.service_category === "basic")
      .length;
    return sum + txCount;
  }, 0);

  const averageTicketToday = totalClientsToday > 0 ? totalRevenue / totalClientsToday : 0;
  const monthAvgTicket = monthClientsTotal > 0 ? monthRevenueTotal / monthClientsTotal : 0;

  const topBarberToday = rankingData.reduce((top, b) => b.revenue > (top?.revenue || 0) ? b : top, rankingData[0]);

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <motion.div
        className="space-y-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Row 1: Title + Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isViewingToday ? (
              <div className="relative">
                <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                <div className="absolute inset-0 bg-red-500/20 rounded-full blur-md animate-pulse" />
              </div>
            ) : (
              <Calendar className="w-5 h-5 text-muted-foreground" />
            )}
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              {isViewingToday ? "AO VIVO" : "HISTÓRICO"}
            </h2>
            {isViewingToday && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse text-[10px] px-1.5 py-0">
                LIVE
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md shadow-amber-500/20 text-xs h-8"
              onClick={() => setSubscriptionWizardOpen(true)}
            >
              <Crown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Vender Assinatura</span>
              <span className="sm:hidden">Assinatura</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 bg-card/50 backdrop-blur-sm"
              onClick={() => setSubscriptionAuditOpen(true)}
              title="Auditar Últimas Vendas"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Row 2: Date Picker + Unit Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPreviousDay} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 px-3 bg-card/60 backdrop-blur-sm border-border/40 text-sm font-medium capitalize gap-1.5"
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {format(parseISO(selectedDate), "EEE, dd/MM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={parseISO(selectedDate)}
                  onSelect={(date) => {
                    if (date) {
                      const formatted = format(date, "yyyy-MM-dd");
                      if (formatted <= todayManaus) {
                        setSelectedDate(formatted);
                      }
                    }
                  }}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" onClick={goToNextDay} disabled={isViewingToday} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            {!isViewingToday && (
              <Button variant="secondary" size="sm" onClick={goToToday} className="h-7 text-xs px-2">
                Hoje
              </Button>
            )}
          </div>

          <div className="ml-auto">
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card/50 backdrop-blur-sm border-border/40">
                <SelectValue placeholder="Unidade" />
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
        </div>

      </motion.div>

      {/* Monthly Team Goal Progress */}
      {teamMonthlyGoal.totalTarget > 0 && (
        <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Meta Mensal da Equipe</span>
              </div>
              <span className={`text-sm font-bold ${teamMonthlyGoal.pct >= 80 ? "text-green-500" : teamMonthlyGoal.pct >= 50 ? "text-amber-500" : "text-red-500"}`}>
                {teamMonthlyGoal.pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-3 bg-muted/50 rounded-full overflow-hidden mb-2">
              <motion.div
                className={`h-full rounded-full ${teamMonthlyGoal.pct >= 80 ? "bg-green-500" : teamMonthlyGoal.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                initial={{ width: 0 }}
                animate={{ width: `${teamMonthlyGoal.pct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Vendas: {teamMonthlyGoal.totalEarned.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
              <span>
                Meta Vendas: {teamMonthlyGoal.totalTarget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content: Barber Table + Ranking Sidebar */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Barber Table */}
        <div className="flex-1 min-w-0">
          <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
            <div>
              {/* Table Header */}
              <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr_1.3fr_1fr_80px] gap-x-3 px-4 py-3 border-b border-border/30 bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                <div>Barbeiro</div>
                <div className="text-right">Meta</div>
                <div className="text-right">Vendido</div>
                <div className="text-right">Ticket</div>
                <div className="text-right">Falta</div>
                <div className="text-center">Progresso</div>
                <div className="text-center">Status</div>
                <div className="text-center">Ações</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border/20">
                {paginatedBarbers.map((barber, index) => {
                  const revenue = getBarberRevenue(barber.id);
                  const target = getBarberDailyTarget(barber);
                  const percentage = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
                  const cutsRemaining = getCutsRemaining(barber.id, barber);
                  const progressColor = getProgressColor(percentage);

                  // Calculate today's ticket for this barber
                  const barberTxToday = managerTransactions.filter(t => t.barber_id === barber.id);
                  const barberClientsToday = barberTxToday.filter(t => t.item_type === "service" && t.service_category === "basic").length;
                  const barberTicketToday = barberClientsToday > 0 ? revenue / barberClientsToday : 0;

                  const remaining = Math.max(0, target - revenue);

                  // Status badge
                  const prod = getBarberProduction(barber.id);
                  const isGoalMet = percentage >= 100 && revenue > 0;
                  const isDayOff = prod?.confirmed_presence && prod?.presence_type === 'day_off' && revenue === 0;
                  const isAbsent = prod?.confirmed_presence && prod?.presence_type === 'absence' && revenue === 0;
                  const isPresent = prod?.confirmed_presence && !isDayOff && !isAbsent && revenue === 0;
                  const isIdle = isAfter11 && revenue === 0 && !isDayOff && !isAbsent && !isPresent;

                  return (
                    <motion.div
                      key={barber.id}
                      className={`grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr_1.3fr_1fr_80px] gap-x-3 px-4 py-3 items-center transition-colors hover:bg-muted/10 ${
                        isGoalMet ? "bg-green-500/5" : isIdle ? "bg-red-500/5 border-l-2 border-l-red-500/50" : ""
                      }`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.03 * index }}
                    >
                      {/* Barbeiro */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className={`h-9 w-9 shrink-0 border ${isGoalMet ? "border-green-500/50 ring-1 ring-green-500/30" : "border-border/50"}`}>
                          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                            {getInitials(barber.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{barber.name}</p>
                          {hasPendingManualEntry(barber.id) && (
                            <Badge variant="outline" className="text-[10px] h-4 bg-warning/10 text-warning border-warning/30 mt-0.5">
                              <FileText className="w-2.5 h-2.5 mr-0.5" />
                              Aguardando
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground font-medium">
                          {target > 0 ? target.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                        </span>
                      </div>

                      {/* Vendido */}
                      <div className="text-right">
                        <span className={`text-sm font-bold ${revenue > 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                        {barberClientsToday > 0 && (
                          <p className="text-[10px] text-muted-foreground">({barberClientsToday} atd)</p>
                        )}
                      </div>

                      {/* Ticket */}
                      <div className="text-right">
                        <span className="text-sm text-foreground font-medium">
                          {barberTicketToday > 0
                            ? barberTicketToday.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "—"}
                        </span>
                      </div>

                      {/* Falta */}
                      <div className="text-right">
                        <span className={`text-sm font-medium ${remaining > 0 ? "text-foreground" : "text-green-500"}`}>
                          {remaining > 0
                            ? remaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "✓"}
                        </span>
                      </div>

                      {/* Progresso */}
                      <div className="px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${progressColor}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.8, ease: "easeOut", delay: 0.03 * index }}
                            />
                          </div>
                          <span className={`text-xs font-bold shrink-0 w-10 text-right ${percentage >= 100 ? "text-green-500" : "text-muted-foreground"}`}>
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex justify-center">
                        {isGoalMet && (
                          <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30 whitespace-nowrap">
                            META BATIDA!
                          </Badge>
                        )}
                        {isDayOff && (
                          <Badge className="text-[10px] bg-blue-500/20 text-blue-500 border-blue-500/30 whitespace-nowrap">
                            <CalendarOff className="w-3 h-3 mr-0.5" />Folga
                          </Badge>
                        )}
                        {isAbsent && (
                          <Badge className="text-[10px] bg-red-500/20 text-red-500 border-red-500/30 whitespace-nowrap">
                            <XCircle className="w-3 h-3 mr-0.5" />Falta
                          </Badge>
                        )}
                        {isPresent && (
                          <Badge className="text-[10px] bg-orange-500/20 text-orange-500 border-orange-500/30 whitespace-nowrap">
                            <UserCheck className="w-3 h-3 mr-0.5" />S/ vendas
                          </Badge>
                        )}
                        {!isGoalMet && !isDayOff && !isAbsent && !isPresent && revenue > 0 && (
                          <Badge className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/30 whitespace-nowrap">
                            EM ANDAMENTO
                          </Badge>
                        )}
                        {!isGoalMet && !isDayOff && !isAbsent && !isPresent && revenue === 0 && isIdle && (
                          <Badge className="text-[10px] bg-red-500/20 text-red-500 border-red-500/30 whitespace-nowrap animate-pulse">
                            ⚠️ PARADO
                          </Badge>
                        )}
                        {!isGoalMet && !isDayOff && !isAbsent && !isPresent && revenue === 0 && !isIdle && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleViewTransactions(barber)}
                          title="Ver comandas"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={!organizationId}
                          onClick={() => {
                            if (!organizationId) {
                              toast.error("Organização não identificada.");
                              return;
                            }
                            setQuickSaleModal({
                              open: true,
                              barberId: barber.id,
                              barberName: barber.name,
                            });
                          }}
                          title="Adicionar venda"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Mais opções">
                              <EllipsisVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(revenue > 0 || managerTransactions.some(t => t.barber_id === barber.id)) && (
                              <DropdownMenuItem onClick={() => handleEditClick(barber)}>
                                <Pencil className="w-3.5 h-3.5 mr-2" />Editar lançamento
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleRegisterDayStatus(barber, "present")}>
                              Presença sem venda
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRegisterDayStatus(barber, "day_off")}>
                              Folga
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRegisterDayStatus(barber, "absence")}>
                              Falta
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRegisterDayStatus(barber, "optional_sunday")}>
                              Domingo opcional
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Total Row */}
              {sortedBarbers.length > 0 && (
                <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr_1.3fr_1fr_80px] gap-x-3 px-4 py-3 border-t border-border/50 bg-muted/30">
                  <div className="text-sm font-bold text-foreground">TOTAL</div>
                  <div className="text-right text-sm font-bold text-muted-foreground">
                    {sortedBarbers.reduce((s, b) => s + getBarberDailyTarget(b), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                  <div className="text-right text-sm font-bold text-primary">
                    {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                  <div className="text-right text-sm font-bold text-foreground">
                    {averageTicketToday > 0 ? averageTicketToday.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                  </div>
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground">
                  {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedBarbers.length)} de {sortedBarbers.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar: Faturamento + Rankings (Independent Scroll) */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-4 space-y-3">
            {/* Faturamento Card */}
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  💰 FATURAMENTO
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {/* Hoje + Este Mês */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className={`rounded-lg border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-2 transition-all duration-500 ${
                    isGlowing && isViewingToday ? "animate-glow shadow-[0_0_20px_hsl(38_92%_50%/0.5)]" : ""
                  }`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px]">📅</span>
                      <p className="text-[9px] text-primary font-bold uppercase">HOJE</p>
                    </div>
                    <motion.p
                      className="text-sm font-extrabold text-primary leading-tight truncate"
                      key={totalRevenue}
                      initial={{ scale: 1.05, opacity: 0.7 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </motion.p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[9px] text-muted-foreground">{totalClientsToday} atd</p>
                      {revenueComparison && (
                        <span className={`text-[9px] font-bold ${revenueComparison.isUp ? "text-green-500" : "text-red-500"}`}>
                          {revenueComparison.isUp ? "▲" : "▼"} {Math.abs(revenueComparison.pct).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card/60 p-2">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px]">📊</span>
                      <p className="text-[9px] text-foreground font-bold uppercase">MÊS</p>
                    </div>
                    <p className="text-sm font-extrabold text-foreground leading-tight truncate">
                      {monthRevenueTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{monthClientsTotal} atd</p>
                  </div>
                </div>

                {/* Ticket Médio */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg bg-muted/30 border border-border/30 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground font-medium uppercase">Ticket Médio</p>
                    <p className="text-xs font-bold text-foreground">
                      {averageTicketToday > 0
                        ? averageTicketToday.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "R$ 0,00"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/30 border border-border/30 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground font-medium uppercase">Ticket Mês</p>
                    <p className="text-xs font-bold text-foreground">
                      {monthAvgTicket > 0
                        ? monthAvgTicket.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "R$ 0,00"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ranking Filiais */}
            {units.length > 1 && (
              <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    🏢 RANKING FILIAIS
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-0.5">
                    {unitRankingData.map((unit, index) => {
                      const medals = ["🥇", "🥈", "🥉"];
                      return (
                        <motion.div
                          key={unit.id}
                          className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                            index === 0 ? "bg-amber-500/10 border border-amber-500/30" : index < 3 ? "bg-card/60 border border-border/20" : ""
                          }`}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {index < 3 ? (
                              <span className="text-sm shrink-0">{medals[index]}</span>
                            ) : (
                              <span className="text-[10px] font-bold text-muted-foreground w-4 text-center shrink-0">{index + 1}º</span>
                            )}
                            <span className={`text-xs truncate ${index < 3 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                              {unit.name}
                            </span>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${index === 0 ? "text-primary" : "text-foreground"}`}>
                            {unit.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Ranking Barbeiros Top 3 */}
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  🏆 BARBEIROS
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <LiveTop3Ranking barbers={rankingData} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
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
        initialDate={selectedDate}
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
        sourceFilter="manager"
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
        sourceFilter="manager"
        readOnly
      />
    </div>
  );
}
