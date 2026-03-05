import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import BarberEvolution from "./manager/BarberEvolution";
import { PerformanceAlerts } from "./manager/PerformanceAlerts";
import SubscriptionEarningsForm from "./manager/SubscriptionEarningsForm";
import EarningsComparison from "./manager/EarningsComparison";
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
            console.log(`Metas replicadas automaticamente: ${result.goals_created} para ${result.month}/${result.year}`);
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-row items-center justify-between gap-4">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-3 shrink-0">
              <img
                src={logo}
                alt="Performance Barber"
                className="h-10 md:h-12 w-auto"
              />
              <div className="hidden lg:block">
                <h1 className="text-base font-bold text-foreground leading-tight">
                  Painel do Gestor
                </h1>
                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Center/Right: Navigation */}
            <div className="flex-1 flex justify-end">
              <ManagerNavigation
                activeTab={activeTab}
                onTabChange={setActiveTab}
                hasSubscriptionModule={hasSubscriptionModule}
              />
            </div>

            {/* Far Right: Sign Out */}
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
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsContent value="live" className="space-y-6 mt-0">
            <LiveDashboard />
          </TabsContent>

          <TabsContent value="overview" className="space-y-6 mt-0">
            <PerformanceAlerts />
            <MonthlyOccurrencesSummary />
            <ManagerReports />
          </TabsContent>

          <TabsContent value="daily-goals" className="mt-0">
            <DailyGoalsTracking />
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

          <TabsContent value="goals" className="mt-0">
            <GoalsManagement />
          </TabsContent>

          <TabsContent value="evolution" className="mt-0">
            <BarberEvolution />
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-0">
            <Leaderboard />
          </TabsContent>

          <TabsContent value="payroll" className="mt-0">
            <MonthlyPayroll />
          </TabsContent>

          <TabsContent value="ai-usage" className="mt-0">
            <AIUsageTracking />
          </TabsContent>

          <TabsContent value="subscriptions" className="mt-0">
            <SubscriptionsTracking />
          </TabsContent>

          <TabsContent value="clients" className="mt-0">
            <ClientsManagement />
          </TabsContent>

          {hasSubscriptionModule && (
            <TabsContent value="plans" className="mt-0">
              <SubscriptionPlansManagement />
            </TabsContent>
          )}

          {hasSubscriptionModule && (
            <>
              <TabsContent value="subscription" className="mt-0">
                <SubscriptionEarningsForm />
              </TabsContent>

              <TabsContent value="comparison" className="mt-0">
                <EarningsComparison />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
