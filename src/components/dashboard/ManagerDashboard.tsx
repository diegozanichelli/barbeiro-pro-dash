import { User } from "@supabase/supabase-js";
import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
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

interface ManagerDashboardProps {
  user: User;
}

export default function ManagerDashboard({ user }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("live");
  const { hasSubscriptionModule } = useSubscriptionModule();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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
            <Button variant="outline" size="sm" onClick={handleSignOut} className="shrink-0">
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Sair</span>
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

          <TabsContent value="ai-usage" className="mt-0">
            <AIUsageTracking />
          </TabsContent>

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