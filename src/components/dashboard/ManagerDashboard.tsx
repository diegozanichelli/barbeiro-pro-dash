import { User } from "@supabase/supabase-js";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, BarChart3, Users, Target, Trophy, Building2 } from "lucide-react";
import UnitsManagement from "./manager/UnitsManagement";
import BarbersManagement from "./manager/BarbersManagement";
import GoalsManagement from "./manager/GoalsManagement";
import Leaderboard from "./Leaderboard";
import ManagerReports from "./manager/ManagerReports";

interface ManagerDashboardProps {
  user: User;
}

export default function ManagerDashboard({ user }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-gold bg-clip-text text-transparent">
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
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="units" className="gap-2">
              <Building2 className="w-4 h-4" />
              Unidades
            </TabsTrigger>
            <TabsTrigger value="barbers" className="gap-2">
              <Users className="w-4 h-4" />
              Barbeiros
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="w-4 h-4" />
              Metas
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2">
              <Trophy className="w-4 h-4" />
              Rankings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <ManagerReports />
          </TabsContent>

          <TabsContent value="units">
            <UnitsManagement />
          </TabsContent>

          <TabsContent value="barbers">
            <BarbersManagement />
          </TabsContent>

          <TabsContent value="goals">
            <GoalsManagement />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
