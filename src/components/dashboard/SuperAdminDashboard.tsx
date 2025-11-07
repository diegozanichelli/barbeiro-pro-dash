import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Building2, Users, DollarSign, TrendingUp } from "lucide-react";
import logo from "@/assets/performance-barber-logo-transparent.png";
import { useToast } from "@/hooks/use-toast";

interface SuperAdminDashboardProps {
  user: User;
}

interface Organization {
  id: string;
  name: string;
  stripe_customer_id: string;
  subscription_status: string;
  created_at: string;
}

interface OrganizationStats {
  total_organizations: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  monthly_revenue: number;
}

export default function SuperAdminDashboard({ user }: SuperAdminDashboardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<OrganizationStats>({
    total_organizations: 0,
    active_subscriptions: 0,
    trial_subscriptions: 0,
    monthly_revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const checkSuperAdminRole = async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!error && data) {
        setIsSuperAdmin(true);
      }
    };

    checkSuperAdminRole();
    fetchOrganizations();
  }, [user.id]);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrganizations(data || []);
      
      // Calculate stats
      const stats = {
        total_organizations: data?.length || 0,
        active_subscriptions: data?.filter(org => org.subscription_status === "active").length || 0,
        trial_subscriptions: data?.filter(org => org.subscription_status === "trial").length || 0,
        monthly_revenue: (data?.filter(org => org.subscription_status === "active").length || 0) * 99,
      };
      setStats(stats);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar organizações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccess = async (orgId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "canceled" : "active";
      
      const { error } = await supabase
        .from("organizations")
        .update({ subscription_status: newStatus })
        .eq("id", orgId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Acesso ${newStatus === "active" ? "ativado" : "desativado"} com sucesso`,
      });

      fetchOrganizations();
    } catch (error) {
      console.error("Error toggling access:", error);
      toast({
        title: "Erro",
        description: "Erro ao alterar status",
        variant: "destructive",
      });
    }
  };

  const handleMigrateOrganization = async () => {
    if (!isSuperAdmin) {
      toast({
        title: "Não autorizado",
        description: "Você não tem permissão para executar esta operação",
        variant: "destructive",
      });
      return;
    }

    setMigrating(true);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-organization", {
        body: {
          oldManagerEmail: "cassiano.diego@gmail.com",
          newManagerEmail: "diego_zanichelli@outlook.com",
          newManagerPassword: "barbeiro123",
        },
      });

      if (error) throw error;

      toast({
        title: "Migração concluída!",
        description: `Novo gerente criado: diego_zanichelli@outlook.com (senha: barbeiro123)`,
      });

      fetchOrganizations();
    } catch (error) {
      console.error("Error migrating organization:", error);
      toast({
        title: "Erro na migração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      trial: "secondary",
      delinquent: "destructive",
      canceled: "outline",
    };

    const labels: Record<string, string> = {
      active: "Ativa",
      trial: "Trial",
      delinquent: "Inadimplente",
      canceled: "Cancelada",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {labels[status] || status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Performance Barber" className="h-16 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Super Admin - Performance Barber
                </h1>
                <p className="text-sm text-muted-foreground">Gerenciamento de Organizações</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isSuperAdmin && (
                <Button 
                  variant="default" 
                  onClick={handleMigrateOrganization}
                  disabled={migrating}
                >
                  {migrating ? "Migrando..." : "🔄 Transferir Organização"}
                </Button>
              )}
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Organizações
              </CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_organizations}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Assinaturas Ativas
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.active_subscriptions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Em Trial
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.trial_subscriptions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Mensal
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {stats.monthly_revenue.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Todas as Organizações</CardTitle>
            <CardDescription>
              Gerencie todas as barbearias cadastradas na plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da Barbearia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>{getStatusBadge(org.subscription_status)}</TableCell>
                    <TableCell>
                      {new Date(org.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {org.stripe_customer_id || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={org.subscription_status === "active" ? "destructive" : "default"}
                        onClick={() => handleToggleAccess(org.id, org.subscription_status)}
                      >
                        {org.subscription_status === "active" ? "Desativar" : "Ativar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}