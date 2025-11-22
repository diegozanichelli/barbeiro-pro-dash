import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Target, TrendingUp, Users, DollarSign, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
import DailyProductionForm from "./barber/DailyProductionForm";
import ProductionHistory from "./barber/ProductionHistory";
import Leaderboard from "./Leaderboard";
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
          setBarber(payload.new as BarberData);
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
      const totalCommission = productions.reduce((sum, p) => sum + Number(p.commission_earned), 0);
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

      setStats({
        accumulated_commission: totalCommission,
        days_worked: productions.length,
        total_clients: totalClients,
        total_services: totalServicesRevenue,
        total_products: totalProductsRevenue,
        average_ticket: totalClients > 0 ? totalRevenue / totalClients : 0,
        services_conversion: totalClients > 0 ? (totalServicesCount / totalClients) * 100 : 0,
        products_conversion: totalClients > 0 ? (totalProductsCount / totalClients) * 100 : 0,
      });
    } else {
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
        <Tabs defaultValue="daily" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily">Meu Painel</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-6">
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

            {/* Formulário de Lançamento */}
            <DailyProductionForm 
              barberId={barber.id} 
              onSuccess={handleFormSuccess}
              initialData={editingProduction}
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
      </div>
    </div>
  );
}
