import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2 } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
import UnitsManagement from "./manager/UnitsManagement";
import BarbersManagement from "./manager/BarbersManagement";
import GoalsManagement from "./manager/GoalsManagement";
import DailyGoalsTracking from "./manager/DailyGoalsTracking";
import Leaderboard from "./Leaderboard";
import ManagerReports from "./manager/ManagerReports";
import BarberEvolutionChart from "./manager/BarberEvolutionChart";
import ShopEvolution from "./manager/ShopEvolution";
import UnitsComparison from "./manager/UnitsComparison";
import SubscriptionPerformanceReport from "./manager/SubscriptionPerformanceReport";
import SubscriptionAnalytics from "./manager/SubscriptionAnalytics";
import ReceptionPerformanceReport from "./manager/ReceptionPerformanceReport";
import { PerformanceAlerts } from "./manager/PerformanceAlerts";
import { useSubscriptionModule } from "@/hooks/useSubscriptionModule";
import LiveDashboard from "./manager/LiveDashboard";
import AIUsageTracking from "./manager/AIUsageTracking";
import CatalogManagement from "./manager/CatalogManagement";
import ManagerNavigation from "./manager/ManagerNavigation";
import SubscriptionsTracking from "./manager/SubscriptionsTracking";
import MonthlyPayroll from "./manager/MonthlyPayroll";
import SubscriptionPlansManagement from "./manager/SubscriptionPlansManagement";
import MonthlyOccurrencesSummary from "./manager/MonthlyOccurrencesSummary";
import ClientsManagement from "./manager/ClientsManagement";
import SendNotificationsButton from "./manager/SendNotificationsButton";
import MonthlyPresentation from "./manager/presentation/MonthlyPresentation";
import BestSalesDays from "./manager/BestSalesDays";
import BarberReportPage from "./manager/BarberReportPage";
import InactiveClientsReport from "./manager/InactiveClientsReport";
import ReportsAuditPanel from "./manager/ReportsAuditPanel";
import PerformanceDashboard from "./manager/PerformanceDashboard";
import ReportsFilterBar from "./manager/ReportsFilterBar";
import { ReportsFilterProvider } from "@/contexts/ReportsFilterProvider";


interface ManagerDashboardProps {
  user: User;
}

export default function ManagerDashboard({ user }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("live");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { hasSubscriptionModule } = useSubscriptionModule();

  // Auto-replicar metas silenciosamente ao carregar o dashboard
  useEffect(() => {
    const replicateGoals = async () => {
      try {
        const { data, error } = await supabase.rpc('auto_replicate_goals');
        if (error) {
          console.error("Erro ao replicar metas:", error);
        } else if (data && typeof data === 'object' && 'goals_created' in data) {
          const result = data as { goals_created: number; month: number; year: number };
          if (result.goals_created > 0) {
          }
        }
      } catch (err) {
        console.error("Erro na replicação de metas:", err);
      }
    };
    
    replicateGoals();
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-background md:pl-14">
      <ManagerNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasSubscriptionModule={hasSubscriptionModule}
      />

      <header className="glass-strong border-b border-white/[0.06] sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 shrink-0 md:pl-2">
              <img
                src={logo}
                alt="Performance Barber"
                className="h-10 md:h-12 w-auto"
              />
              <div className="hidden lg:block">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-primary/80">
                  Performance Barber
                </p>
                <h1 className="font-display text-base font-semibold leading-tight text-foreground">
                  Painel do Gestor
                </h1>
                <p className="text-xs text-muted-foreground/80 truncate max-w-[200px]">
                  {user.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SendNotificationsButton />
              <Button variant="outline" size="sm" onClick={handleSignOut} className="shrink-0" disabled={isSigningOut}>
                {isSigningOut ? (
                  <>
                    <Loader2 className="w-4 h-4 md:mr-2 animate-spin" />
                    <span className="hidden md:inline">Saindo...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">Sair</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <ReportsFilterProvider>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* "Hoje" reúne as duas telas do dia: o Ao Vivo, onde a recepção lança,
              e o acompanhamento de metas, que era só uma leitura dos mesmos dados. */}
          <TabsContent value="live" className="space-y-6 mt-0">
            <Tabs defaultValue="ao-vivo" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
                <TabsTrigger value="ao-vivo">Ao Vivo</TabsTrigger>
                <TabsTrigger value="metas-do-dia">Metas do dia</TabsTrigger>
              </TabsList>
              <TabsContent value="ao-vivo" className="mt-0">
                <LiveDashboard />
              </TabsContent>
              <TabsContent value="metas-do-dia" className="mt-0">
                <DailyGoalsTracking />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="overview" className="space-y-6 mt-0">
            <PerformanceAlerts />
            <MonthlyOccurrencesSummary />
            <PerformanceDashboard />
          </TabsContent>

          <TabsContent value="entries" className="mt-0">
            <ManagerReports />
          </TabsContent>

          <TabsContent value="units" className="mt-0">
            <UnitsManagement />
          </TabsContent>

          <TabsContent value="barbers" className="mt-0">
            <BarbersManagement />
          </TabsContent>

          <TabsContent value="catalog" className="mt-0">
            <CatalogManagement />
          </TabsContent>

          {/* Cliente é um assunto só: a base e quem parou de voltar. */}
          <TabsContent value="clients" className="mt-0">
            <Tabs defaultValue="base" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
                <TabsTrigger value="base">Clientes</TabsTrigger>
                <TabsTrigger value="inativos">Inativos</TabsTrigger>
              </TabsList>
              <TabsContent value="base" className="mt-0">
                <ClientsManagement />
              </TabsContent>
              <TabsContent value="inativos" className="mt-0">
                <InactiveClientsReport />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="goals" className="mt-0">
            <GoalsManagement />
          </TabsContent>

          {/* Setor Barbeiro: tudo que responde "como está cada um" num lugar só —
              a ficha do período, a evolução no ano e os rankings da equipe. */}
          <TabsContent value="report-barber" className="mt-0 space-y-4">
            <ReportsFilterBar fields={["year", "unit"]} />
            <Tabs defaultValue="ficha" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
                <TabsTrigger value="ficha">Ficha</TabsTrigger>
                <TabsTrigger value="evolucao">Evolução</TabsTrigger>
                <TabsTrigger value="rankings">Rankings</TabsTrigger>
              </TabsList>
              <TabsContent value="ficha" className="mt-0">
                <BarberReportPage />
              </TabsContent>
              <TabsContent value="evolucao" className="mt-0">
                <BarberEvolutionChart />
              </TabsContent>
              <TabsContent value="rankings" className="mt-0">
                <Leaderboard />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Setor Unidades */}
          <TabsContent value="report-units" className="mt-0 space-y-4">
            <ReportsFilterBar fields={["month", "year"]} />
            <UnitsComparison />
          </TabsContent>

          {/* Setor Negócio: como evoluímos e quando vendemos */}
          <TabsContent value="report-business" className="mt-0 space-y-4">
            <ReportsFilterBar fields={["year", "unit"]} />
            <Tabs defaultValue="evolucao" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
                <TabsTrigger value="evolucao">Evolução</TabsTrigger>
                <TabsTrigger value="melhores-dias">Melhores dias</TabsTrigger>
              </TabsList>
              <TabsContent value="evolucao" className="mt-0">
                <ShopEvolution />
              </TabsContent>
              <TabsContent value="melhores-dias" className="mt-0">
                <BestSalesDays />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Desempenho da recepção é operação, não relatório de resultado */}
          <TabsContent value="reception" className="mt-0">
            <ReceptionPerformanceReport />
          </TabsContent>

          <TabsContent value="monthly-presentation" className="mt-0">
            <MonthlyPresentation />
          </TabsContent>


          <TabsContent value="payroll" className="mt-0">
            <MonthlyPayroll />
          </TabsContent>

          <TabsContent value="reports-audit" className="mt-0">
            <ReportsAuditPanel onNavigate={setActiveTab} />
          </TabsContent>

          <TabsContent value="ai-usage" className="mt-0">
            <AIUsageTracking />
          </TabsContent>


          {/* Acompanhamento e planos são o mesmo assunto, e o segundo só existe
              quando o módulo de assinaturas está ligado. */}
          <TabsContent value="subscriptions" className="mt-0">
            <Tabs defaultValue="acompanhamento" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid sm:grid-cols-4">
                <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
                <TabsTrigger value="conversao">Conversão</TabsTrigger>
                <TabsTrigger value="carteira">Carteira</TabsTrigger>
                {hasSubscriptionModule && <TabsTrigger value="planos">Planos</TabsTrigger>}
              </TabsList>
              <TabsContent value="acompanhamento" className="mt-0">
                <SubscriptionsTracking />
              </TabsContent>
              <TabsContent value="conversao" className="mt-0">
                <SubscriptionPerformanceReport />
              </TabsContent>
              <TabsContent value="carteira" className="mt-0">
                <SubscriptionAnalytics />
              </TabsContent>
              {hasSubscriptionModule && (
                <TabsContent value="planos" className="mt-0">
                  <SubscriptionPlansManagement />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>


        </Tabs>
        </ReportsFilterProvider>
      </div>
    </div>
  );
}