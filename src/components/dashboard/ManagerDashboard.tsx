import { User } from "@supabase/supabase-js";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, BarChart3, Users, Target, Trophy, Building2, TrendingUp, CalendarDays, Repeat, Radio, Bot, Package } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
import UnitsManagement from "./manager/UnitsManagement";
import BarbersManagement from "./manager/BarbersManagement";
import GoalsManagement from "./manager/GoalsManagement";
import DailyGoalsTracking from "./manager/DailyGoalsTracking";
import Leaderboard from "./Leaderboard";
import ManagerReports from "./manager/ManagerReports";
import BarberEvolution from "./manager/BarberEvolution";
import { PerformanceAlerts } from "./manager/PerformanceAlerts";
import SubscriptionEarningsForm from "./manager/SubscriptionEarningsForm";
import EarningsComparison from "./manager/EarningsComparison";
import { useSubscriptionModule } from "@/hooks/useSubscriptionModule";
import LiveDashboard from "./manager/LiveDashboard";
import AIUsageTracking from "./manager/AIUsageTracking";
import CatalogManagement from "./manager/CatalogManagement";
interface ManagerDashboardProps {
  user: User;
}
export default function ManagerDashboard({
  user
}: ManagerDashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("live");
  const {
    hasSubscriptionModule
  } = useSubscriptionModule();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };
  return <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Performance Barber" className="h-16 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Painel do Gestor
                </h1>
                <p className="text-sm text-muted-foreground">Bem-vindo, {user.email}</p>
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${hasSubscriptionModule ? 'grid-cols-12' : 'grid-cols-10'} lg:w-auto lg:inline-grid`}>
            <TabsTrigger value="live" className="gap-2">
              <Radio className="w-4 h-4 text-destructive" />
              <span className="hidden sm:inline bg-secondary">Ao Vivo</span>
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4 bg-secondary" />
              <span className="hidden sm:inline bg-secondary">Dashboard
            </span>
            </TabsTrigger>
            <TabsTrigger value="daily-goals" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Dia a Dia
            </span>
            </TabsTrigger>
            <TabsTrigger value="units" className="gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Unidades</span>
            </TabsTrigger>
            <TabsTrigger value="barbers" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Barbeiros</span>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Comissões
            </span>
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Metas</span>
            </TabsTrigger>
            <TabsTrigger value="evolution" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Evolução</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2">
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Rankings</span>
            </TabsTrigger>
            <TabsTrigger value="ai-usage" className="gap-2">
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">Uso IA</span>
            </TabsTrigger>
            {hasSubscriptionModule && <>
                <TabsTrigger value="subscription" className="gap-2">
                  <Repeat className="w-4 h-4" />
                  <span className="hidden sm:inline">Assinaturas</span>
                </TabsTrigger>
                <TabsTrigger value="comparison" className="gap-2">
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Money</span>
                </TabsTrigger>
              </>}
          </TabsList>

          <TabsContent value="live" className="space-y-6">
            <LiveDashboard />
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
            <PerformanceAlerts />
            <ManagerReports />
          </TabsContent>

          <TabsContent value="daily-goals">
            <DailyGoalsTracking />
          </TabsContent>

          <TabsContent value="units">
            <UnitsManagement />
          </TabsContent>

          <TabsContent value="barbers">
            <BarbersManagement />
          </TabsContent>

          <TabsContent value="catalog">
            <CatalogManagement />
          </TabsContent>

          <TabsContent value="goals">
            <GoalsManagement />
          </TabsContent>

          <TabsContent value="evolution">
            <BarberEvolution />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard />
          </TabsContent>

          <TabsContent value="ai-usage">
            <AIUsageTracking />
          </TabsContent>

          {hasSubscriptionModule && <>
              <TabsContent value="subscription">
                <SubscriptionEarningsForm />
              </TabsContent>

              <TabsContent value="comparison">
                <EarningsComparison />
              </TabsContent>
            </>}
        </Tabs>
      </div>
    </div>;
}