import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Target, TrendingUp, Users, DollarSign, Calendar, ChevronLeft, ChevronRight, Bell, X, ArrowUp, ArrowDown, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/performance-barber-logo-transparent.png";
import DailyProductionForm from "./barber/DailyProductionForm";
import BarberSaleForm from "./barber/BarberSaleForm";
import ProductionHistory from "./barber/ProductionHistory";
import Leaderboard from "./Leaderboard";
import CoachingNudgeCard from "./barber/CoachingNudgeCard";
import MissingProductionAlert from "./barber/MissingProductionAlert";
import SubscriptionEarningsCard from "./barber/SubscriptionEarningsCard";
import AIDailyCoachCard from "./barber/AIDailyCoachCard";
import SalesHelpModal from "./barber/SalesHelpModal";
import { useSubscriptionModule } from "@/hooks/useSubscriptionModule";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateRemainingWorkDays } from "@/lib/dateUtils";

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
  work_days: number;
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

export default function BarberDashboard({ user }: BarberDashboardProps) {
  const navigate = useNavigate();
  const { hasSubscriptionModule } = useSubscriptionModule();
  const now = new Date();
  
  // Estado para o mês/ano selecionado (default: mês atual)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  
  const [barber, setBarber] = useState<BarberData | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoal | null>(null);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [dailyTarget, setDailyTarget] = useState(0);
  const [dailyTargetServices, setDailyTargetServices] = useState(0);
  const [missingLink, setMissingLink] = useState(false);
  const [editingProduction, setEditingProduction] = useState<any>(null);
const [todayProduction, setTodayProduction] = useState<{
    id?: string;
    total: number;
    confirmed_presence: boolean;
    exists: boolean;
  } | null>(null);
  const [confirmingPresence, setConfirmingPresence] = useState(false);
  
  // Estado para notificação de alteração de comissão
  const [commissionChange, setCommissionChange] = useState<{
    oldServices: number;
    newServices: number;
    oldProducts: number;
    newProducts: number;
    timestamp: Date;
  } | null>(null);
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
          console.log('Comissão atualizada pelo gerente:', payload);
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
  }, [user]);

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
            console.log('Lançamento alterado (INSERT/UPDATE/DELETE):', payload);
            // Forçar recálculo IMEDIATO das estatísticas
            fetchMonthlyStats();
            fetchMonthlyGoal();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(productionsChannel);
      };
    }
  }, [barber, selectedMonth, selectedYear]); // Recarregar quando mês/ano mudar

  useEffect(() => {
    if (monthlyGoal && stats && barber) {
      calculateDailyTarget();
    }
  }, [monthlyGoal, stats, barber, selectedMonth, selectedYear]);

  const fetchBarberData = async () => {
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
  };

  const fetchMonthlyGoal = async () => {
    if (!barber) return;

    const { data, error } = await supabase
      .from("monthly_goals")
      .select("*")
      .eq("barber_id", barber.id)
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar meta mensal:", error);
    }

    if (data) {
      setMonthlyGoal(data);
    } else {
      setMonthlyGoal(null);
    }
  };

  const fetchMonthlyStats = async () => {
    if (!barber) return;

    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);

    const { data: productions } = await supabase
      .from("daily_productions")
      .select("*")
      .eq("barber_id", barber.id)
      .gte("date", format(firstDay, "yyyy-MM-dd"))
      .lte("date", format(lastDay, "yyyy-MM-dd"));

    if (productions && productions.length > 0) {
      const totalClients = productions.reduce((sum, p) => sum + Number(p.clients_count), 0);
      const totalServicesCount = productions.reduce((sum, p) => sum + Number(p.services_count), 0);
      const totalProductsCount = productions.reduce((sum, p) => sum + Number(p.products_count), 0);
      
      // Calcular total de serviços com retrocompatibilidade
      const totalServicesRevenue = productions.reduce((sum, p) => {
        // Se tem os novos campos, soma Basic + Extra
        if (p.services_basic_total !== null || p.services_extra_total !== null) {
          return sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0);
        }
        // Senão, usa o campo antigo
        return sum + Number(p.services_total || 0);
      }, 0);
      
      const totalProductsRevenue = productions.reduce((sum, p) => sum + Number(p.products_total || 0), 0);
      const totalRevenue = totalServicesRevenue + totalProductsRevenue;

      // RECALCULAR comissão com as taxas ATUAIS do barbeiro (não usar valor histórico do BD)
      // Isso permite que quando o gerente alterar a comissão, o dashboard mostre o novo valor em tempo real
      const recalculatedCommission = (totalServicesRevenue * (barber.services_commission / 100)) + 
                                      (totalProductsRevenue * (barber.products_commission / 100));

      // Contar dias com produção real OU com presença confirmada
      const daysWithProduction = productions.filter(p => {
        const total = (Number(p.services_basic_total) || 0) + 
                      (Number(p.services_extra_total) || 0) + 
                      (Number(p.products_total) || 0);
        return total > 0 || p.confirmed_presence === true;
      }).length;

      // Identificar produção de hoje para o card de confirmação de presença
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const todayProd = productions.find(p => p.date === todayStr);
      
      if (todayProd) {
        const todayTotal = (Number(todayProd.services_basic_total) || 0) +
                          (Number(todayProd.services_extra_total) || 0) +
                          (Number(todayProd.products_total) || 0);
        setTodayProduction({
          id: todayProd.id,
          total: todayTotal,
          confirmed_presence: todayProd.confirmed_presence || false,
          exists: true
        });
      } else {
        // Registro NÃO existe - assumir R$ 0,00 e permitir confirmação
        setTodayProduction({
          id: undefined,
          total: 0,
          confirmed_presence: false,
          exists: false
        });
      }

      setStats({
        accumulated_commission: recalculatedCommission,
        days_worked: daysWithProduction,
        total_clients: totalClients,
        total_services: totalServicesRevenue,
        total_products: totalProductsRevenue,
        average_ticket: totalClients > 0 ? totalRevenue / totalClients : 0,
        services_conversion: totalClients > 0 ? (totalServicesCount / totalClients) * 100 : 0,
        products_conversion: totalClients > 0 ? (totalProductsCount / totalClients) * 100 : 0,
      });
    } else {
      // Nenhuma produção no mês - mas ainda precisamos tratar o dia de hoje
      const todayDate = new Date();
      const todayMonth = todayDate.getMonth() + 1;
      const todayYear = todayDate.getFullYear();
      
      // Só mostrar card de hoje se estamos no mês atual
      if (selectedMonth === todayMonth && selectedYear === todayYear) {
        setTodayProduction({
          id: undefined,
          total: 0,
          confirmed_presence: false,
          exists: false
        });
      } else {
        setTodayProduction(null);
      }
      
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
    }
  };

  const calculateDailyTarget = async () => {
    if (!monthlyGoal || !stats || !barber) return;

    const remaining = monthlyGoal.target_commission - stats.accumulated_commission;
    
    // Detectar o tipo de mês selecionado
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear;
    const isPastMonth = selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);
    const isFutureMonth = selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth);
    
    let daysToUse = 0;
    
    if (isPastMonth) {
      // Mês passado: zerar meta diária
      setDailyTarget(0);
      setDailyTargetServices(0);
      return;
    } else if (isCurrentMonth) {
      // Mês atual: calcular dias restantes baseados nos dias configurados
      const workDaysConfigured = monthlyGoal.work_days;
      const daysWorked = stats.days_worked;
      const remainingWorkDaysFromGoal = workDaysConfigured - daysWorked;
      
      // Dias restantes no calendário (para urgência)
      const selectedDate = new Date(selectedYear, selectedMonth - 1, today.getDate());
      const remainingCalendarDays = calculateRemainingWorkDays(selectedDate);
      
      // Usar o MENOR entre dias configurados restantes e dias no calendário
      // Isso cria urgência quando o tempo está acabando
      daysToUse = Math.max(1, Math.min(remainingWorkDaysFromGoal, remainingCalendarDays));
    } else if (isFutureMonth) {
      // Mês futuro: usar dias cadastrados na meta
      daysToUse = monthlyGoal.work_days;
    }

    if (daysToUse > 0) {
      const dailyCommission = remaining / daysToUse;
      setDailyTarget(dailyCommission);

      // Calcular meta de serviços: 100% da meta diária convertida para venda de serviços
      const servicesTarget = barber.services_commission > 0 
        ? dailyCommission / (barber.services_commission / 100)
        : 0;

      setDailyTargetServices(servicesTarget);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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
    const today = new Date();
    setSelectedMonth(today.getMonth() + 1);
    setSelectedYear(today.getFullYear());
  };

  const handleEditProduction = (production: any) => {
    setEditingProduction({
      id: production.id,
      date: production.date,
      servicesBasicTotal: (production.services_basic_total || 0).toString(),
      servicesExtraTotal: (production.services_extra_total || 0).toString(),
      productsTotal: (production.products_total || 0).toString(),
      clientsCount: (production.clients_count || 0).toString(),
      servicesCount: (production.services_count || 0).toString(),
      productsCount: (production.products_count || 0).toString(),
    });
  };

  const handleFormSuccess = () => {
    // Forçar recálculo de TODOS os dados
    fetchMonthlyStats();
    fetchMonthlyGoal();
    setEditingProduction(null); // Limpar edição e fechar modal
  };

  const handleConfirmPresence = async () => {
    if (!barber) return;
    
    setConfirmingPresence(true);
    
    const todayStr = format(new Date(), "yyyy-MM-dd");
    let error = null;

    if (todayProduction?.exists && todayProduction.id) {
      // Registro EXISTE: fazer UPDATE
      const result = await supabase
        .from("daily_productions")
        .update({ confirmed_presence: true })
        .eq("id", todayProduction.id);
      error = result.error;
    } else {
      // Registro NÃO EXISTE: fazer INSERT com valores zerados
      const result = await supabase
        .from("daily_productions")
        .insert({
          barber_id: barber.id,
          organization_id: barber.organization_id,
          date: todayStr,
          services_basic_total: 0,
          services_extra_total: 0,
          products_total: 0,
          services_total: 0,
          clients_count: 0,
          services_count: 0,
          products_count: 0,
          confirmed_presence: true
        });
      error = result.error;
    }

    setConfirmingPresence(false);

    if (error) {
      toast.error("Erro ao confirmar presença");
      console.error("Erro ao confirmar presença:", error);
      return;
    }

    toast.success("Dia contabilizado. Foco total amanhã!", {
      description: "Sua presença foi registrada para o cálculo de metas.",
      duration: 4000,
    });

    // Atualizar estado local
    setTodayProduction(prev => prev 
      ? { ...prev, confirmed_presence: true, exists: true } 
      : null
    );
    
    // Recarregar estatísticas para refletir o novo cálculo
    fetchMonthlyStats();
  };

  const handleCloseEditModal = () => {
    setEditingProduction(null);
  };

  if (missingLink) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Performance Barber" className="h-16 w-auto" />
                <h1 className="text-xl font-bold text-foreground">
                  Vinculação pendente
                </h1>
              </div>
              <Button variant="outline" onClick={handleSignOut}>Sair</Button>
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
    return <div>Carregando...</div>;
  }
  const progressPercentage = monthlyGoal && monthlyGoal.target_commission > 0
    ? (stats.accumulated_commission / monthlyGoal.target_commission) * 100
    : 0;

  // Calcular dias úteis REAIS restantes no calendário (apenas para o mês atual)
  const today = new Date();
  const isCurrentMonth = selectedMonth === today.getMonth() + 1 && selectedYear === today.getFullYear();
  const daysLeft = isCurrentMonth ? calculateRemainingWorkDays() : 0;
  
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
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Performance Barber" className="h-16 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Olá, {barber.name}!
                </h1>
                {isCurrentMonth && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Dias úteis restantes no mês: <span className="font-bold text-foreground">{daysLeft}</span>
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
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

        <Tabs defaultValue="daily" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily">Meu Painel</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-6">
            {/* Alerta de Produções Pendentes */}
            {isCurrentMonth && <MissingProductionAlert barberId={barber.id} />}
            
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
                      {selectedMonth < today.getMonth() + 1 || selectedYear < today.getFullYear()
                        ? "Este mês já passou"
                        : "Aguardando dados"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card de Faturamento de Hoje com Confirmação de Presença */}
            {isCurrentMonth && todayProduction !== null && (
              <Card className="bg-card border-border shadow-card-custom">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    MEU FATURAMENTO HOJE
                  </CardTitle>
                  <CardDescription>
                    {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-foreground">
                      R$ {todayProduction.total.toFixed(2)}
                    </p>
                  </div>
                  
                  {/* Se faturamento = 0 e NÃO confirmou presença ainda */}
                  {todayProduction.total === 0 && !todayProduction.confirmed_presence && (
                    <div className="pt-4 border-t border-border">
                      <Button
                        variant="outline"
                        className="w-full border-primary/50 hover:bg-primary/10"
                        onClick={() => handleConfirmPresence()}
                        disabled={confirmingPresence}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {confirmingPresence ? "Confirmando..." : "Não vendi nada hoje (Confirmar Presença)"}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Clique para informar que você compareceu, mesmo sem vendas.
                        Isso contabiliza o dia na sua meta.
                      </p>
                    </div>
                  )}
                  
                  {/* Se já confirmou presença */}
                  {todayProduction.total === 0 && todayProduction.confirmed_presence && (
                    <div className="flex items-center justify-center gap-2 text-success pt-4 border-t border-border">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Presença confirmada para hoje</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Card do Coach IA - Dica Diária Personalizada */}
            {isCurrentMonth && monthlyGoal && (
              <AIDailyCoachCard
                barberId={barber.id}
                organizationId={barber.organization_id}
                barberName={barber.name}
                monthlyGoal={monthlyGoal.target_commission}
                soldToday={todayProduction?.total || 0}
                soldThisMonth={stats.accumulated_commission}
                daysRemaining={daysLeft}
                dailyTarget={dailyTarget}
              />
            )}

            {/* Card de Dica de Vendas - Coaching Nudge (legado) */}
            {isCurrentMonth && <CoachingNudgeCard barberId={barber.id} />}

            {/* Card de Ganhos de Assinatura */}
            {hasSubscriptionModule && (
              <SubscriptionEarningsCard 
                barberId={barber.id} 
                selectedMonth={selectedMonth} 
                selectedYear={selectedYear} 
              />
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

            {/* Formulário de Lançamento - PDV Visual */}
            <BarberSaleForm 
              barberId={barber.id}
              organizationId={barber.organization_id}
              onSuccess={handleFormSuccess}
            />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <ProductionHistory
              barberId={barber.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onEdit={handleEditProduction}
            />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard viewerRole="barber" />
          </TabsContent>
        </Tabs>

        {/* Modal de Edição */}
        <Dialog open={!!editingProduction} onOpenChange={handleCloseEditModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Lançamento</DialogTitle>
              <DialogDescription>
                Corrija os dados do seu lançamento de produção
              </DialogDescription>
            </DialogHeader>
            {editingProduction && (
              <DailyProductionForm 
                barberId={barber.id} 
                onSuccess={handleFormSuccess}
                initialData={editingProduction}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Botão Flutuante de Assistente de Vendas IA */}
        {isCurrentMonth && barber && <SalesHelpModal barberId={barber.id} organizationId={barber.organization_id} />}
      </div>
    </div>
  );
}
