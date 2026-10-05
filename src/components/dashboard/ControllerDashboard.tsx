import { User } from "@supabase/supabase-js";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Loader2, ClipboardList } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
import { useOrganization } from "@/hooks/useOrganization";
import ControllerEntryPanel from "./controller/ControllerEntryPanel";

interface ControllerDashboardProps {
  user: User;
}

// Painel do CONTROLADOR. Login próprio, enxerga apenas a área de lançamento
// diária de assinaturas (cancelamentos, renovações automáticas e vendas online)
// — sem o menu do gestor.
export default function ControllerDashboard({ user }: ControllerDashboardProps) {
  const navigate = useNavigate();
  const { organizationId, loading } = useOrganization();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
      <header className="glass-strong border-b border-white/[0.06] sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src={logo} alt="Performance Barber" className="h-12 w-auto sm:h-16" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-foreground">Controladoria</h1>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  Lançamento diário de assinaturas
                </p>
              </div>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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
        {loading ? (
          <Card className="w-full max-w-sm mx-auto bg-card border-border shadow-card-custom">
            <CardContent className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando sua área...</p>
            </CardContent>
          </Card>
        ) : organizationId ? (
          <ControllerEntryPanel organizationId={organizationId} />
        ) : (
          <Card className="bg-card border-border shadow-card-custom">
            <CardContent className="py-8 text-center space-y-2">
              <h2 className="text-lg font-semibold">Não foi possível identificar sua organização</h2>
              <p className="text-sm text-muted-foreground">
                Peça ao gestor para revisar o vínculo do seu acesso de controlador.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
