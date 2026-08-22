import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function SubscriptionBlocked() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Carregar e-mail do usuário
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null);
    });
  }, []);

  // Bloqueio agressivo de navegação: empurra várias entradas no histórico
  // e re-empurra em qualquer popstate (back/forward).
  useEffect(() => {
    const path = location.pathname;
    // Empilha múltiplas entradas para neutralizar back repetido
    for (let i = 0; i < 5; i++) {
      window.history.pushState({ blocked: true }, "", path);
    }
    const onPopState = () => {
      window.history.pushState({ blocked: true }, "", path);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Desencoraja fechar a aba sem sair pelo botão
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [location.pathname]);

  // Polling silencioso a cada 60s — se admin reativar, libera automaticamente
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("check-subscription-status");
        if (data?.has_access) {
          navigate("/dashboard");
        }
      } catch {
        // silencioso — próxima tentativa em 60s
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Lock className="w-10 h-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Assinatura Expirada</CardTitle>
          <CardDescription className="text-base mt-2">
            Sua assinatura está expirada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Para reativá-la, entre em contato com o administrador do sistema.
            O acesso será restabelecido automaticamente assim que a assinatura
            for liberada.
          </p>

          {userEmail && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Conta atual</p>
              <p className="text-sm font-medium break-all">{userEmail}</p>
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              disabled={loggingOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {loggingOut ? "Saindo..." : "Sair"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
