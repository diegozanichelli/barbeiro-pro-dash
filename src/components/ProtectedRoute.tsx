import { useSubscriptionCheck } from "@/hooks/useSubscriptionCheck";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const { status, loading } = useSubscriptionCheck();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Validando acesso ao dashboard...</p>
        </div>
      </div>
    );
  }

  // If no access and not loading, don't return null (blank screen).
  if (!status?.has_access) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold">Acesso indisponível</h2>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar seu acesso ao dashboard no momento.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
            <Button onClick={() => navigate("/auth")}>Ir para login</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
