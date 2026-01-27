import { useState, useEffect, useCallback } from "react";
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
import { Plus, Radio, Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import LiveTop3Ranking from "./LiveTop3Ranking";
import QuickSaleModal from "./QuickSaleModal";
import { calculateRemainingWorkDays } from "@/lib/dateUtils";

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
  }>({ open: false, barberId: "", barberName: "" });

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

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

      // Fetch today's productions
      const { data: productionsData } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("date", todayStr);

      if (productionsData) {
        setProductions(productionsData);
      }

      // Fetch month's productions for days worked calculation
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const { data: monthProductionsData } = await supabase
        .from("daily_productions")
        .select("barber_id, commission_earned, confirmed_presence")
        .eq("organization_id", organizationId)
        .gte("date", startOfMonth)
        .lte("date", todayStr);

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
  }, [organizationId, todayStr, currentMonth, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate total revenue when productions change
  useEffect(() => {
    const filteredProductions = selectedUnit === "all"
      ? productions
      : productions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const newTotal = filteredProductions.reduce((sum, p) => {
      const servicesTotal =
        p.services_basic_total !== null || p.services_extra_total !== null
          ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
          : p.services_total || 0;
      return sum + servicesTotal + (p.products_total || 0);
    }, 0);

    if (newTotal !== totalRevenue && totalRevenue > 0) {
      setIsGlowing(true);
      setTimeout(() => setIsGlowing(false), 2000);
    }
    setTotalRevenue(newTotal);
  }, [productions, selectedUnit, barbers, totalRevenue]);

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel("live-productions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_productions",
          filter: `date=eq.${todayStr}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, todayStr, fetchData]);

  const getBarberRevenue = (barberId: string) => {
    const production = productions.find((p) => p.barber_id === barberId);
    if (!production) return 0;

    const servicesTotal =
      production.services_basic_total !== null || production.services_extra_total !== null
        ? (production.services_basic_total || 0) + (production.services_extra_total || 0)
        : production.services_total || 0;

    return servicesTotal + (production.products_total || 0);
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
    const filteredProductions = selectedUnit === "all"
      ? productions
      : productions.filter((p) => {
          const barber = barbers.find((b) => b.id === p.barber_id);
          return barber?.unit_id === selectedUnit;
        });

    const totalClients = filteredProductions.reduce((sum, p) => sum + p.clients_count, 0);
    if (totalClients === 0) return 50; // Default average ticket
    return totalRevenue / totalClients;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-red-500 animate-pulse" />
          <h2 className="text-2xl font-bold text-foreground">AO VIVO</h2>
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

      {/* Total Revenue Card */}
      <Card
        className={`bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 transition-all duration-500 ${
          isGlowing ? "animate-glow shadow-[0_0_30px_hsl(38_92%_50%/0.6)]" : ""
        }`}
      >
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Faturamento Total Hoje
            </p>
            <p className="text-4xl sm:text-5xl font-bold text-primary">
              {totalRevenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {filteredBarbers.length} barbeiros ativos
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/* Barber Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBarbers.map((barber) => {
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
                      <p className="font-semibold text-foreground">{barber.name}</p>
                      <p className="text-xs text-muted-foreground">{barber.unit_name}</p>
                    </div>
                  </div>
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
          setQuickSaleModal((prev) => ({ ...prev, open }))
        }
        barberId={quickSaleModal.barberId}
        barberName={quickSaleModal.barberName}
        organizationId={organizationId || ""}
        onSuccess={fetchData}
      />
    </div>
  );
}
