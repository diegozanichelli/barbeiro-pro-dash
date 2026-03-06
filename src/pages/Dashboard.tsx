import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import ManagerDashboard from "@/components/dashboard/ManagerDashboard";
import BarberDashboard from "@/components/dashboard/BarberDashboard";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      setUserRole(data.role);
    } catch (error) {
      console.error("Error fetching user role:", error);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializeSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        navigate("/auth");
        return;
      }

      fetchUserRole(currentUser.id);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserRole(null);
          setLoading(false);
          navigate("/auth");
          return;
        }
        if (session) {
          setUser(session.user);
          fetchUserRole(session.user.id);
        }
      }
    );

    initializeSession();

    return () => subscription.unsubscribe();
  }, [fetchUserRole, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando seu dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <h2 className="text-lg font-semibold">Não foi possível identificar seu perfil</h2>
          <p className="text-sm text-muted-foreground">
            Faça login novamente. Se o erro persistir, verifique o vínculo de papel do usuário.
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        {userRole === "super_admin" ? (
          <SuperAdminDashboard user={user} />
        ) : userRole === "manager" ? (
          <ManagerDashboard user={user} />
        ) : (
          <BarberDashboard user={user} />
        )}
      </div>
    </ProtectedRoute>
  );
}
