import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Building2, Users, DollarSign, TrendingUp, UserPlus, XCircle, Edit, Pencil, Repeat, Loader2, Ban } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import logo from "@/assets/performance-barber-logo-transparent.png";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { managerAuthSchema, type ManagerAuthFormData } from "@/lib/validations/manager";
import { organizationEditSchema, type OrganizationEditFormData } from "@/lib/validations/organization";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface SuperAdminDashboardProps {
  user: User;
}

interface Organization {
  id: string;
  name: string;
  stripe_customer_id: string;
  subscription_status: string;
  created_at: string;
  has_subscription_module: boolean;
}

interface OrganizationStats {
  total_organizations: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  monthly_revenue: number;
}

interface Manager {
  user_id: string;
  email: string;
  organization_name: string;
  organization_id: string;
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAccountData, setNewAccountData] = useState({
    organizationName: "",
    managerEmail: "",
    managerPassword: "",
  });
  const [creating, setCreating] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [showEditManagerDialog, setShowEditManagerDialog] = useState(false);
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showEditOrgDialog, setShowEditOrgDialog] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [editingOrg, setEditingOrg] = useState(false);

  const form = useForm<ManagerAuthFormData>({
    resolver: zodResolver(managerAuthSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const orgForm = useForm<OrganizationEditFormData>({
    resolver: zodResolver(organizationEditSchema),
    defaultValues: {
      organizationName: "",
      managerName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

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
    fetchManagers();
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

  const handleCreateFreeAccount = async () => {
    if (!newAccountData.organizationName || !newAccountData.managerEmail || !newAccountData.managerPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-free-account", {
        body: newAccountData,
      });

      if (error) throw error;

      toast({
        title: "Conta criada!",
        description: "Conta gratuita criada com sucesso",
      });

      setShowCreateDialog(false);
      setNewAccountData({ organizationName: "", managerEmail: "", managerPassword: "" });
      fetchOrganizations();
    } catch (error) {
      console.error("Error creating free account:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar conta",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeAccess = async (orgId: string) => {
    try {
      const { error } = await supabase.functions.invoke("revoke-free-access", {
        body: { organizationId: orgId },
      });

      if (error) throw error;

      toast({
        title: "Acesso revogado",
        description: "Acesso gratuito revogado com sucesso",
      });

      fetchOrganizations();
    } catch (error) {
      console.error("Error revoking access:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao revogar acesso",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } finally {
      setIsSigningOut(false);
    }
  };

  const fetchManagers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-managers");

      if (error) throw error;

      setManagers(data?.managers || []);
    } catch (error) {
      console.error("Error fetching managers:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar gerentes",
        variant: "destructive",
      });
    }
  };

  const handleEditManager = (manager: Manager) => {
    setSelectedManager(manager);
    form.reset({
      email: manager.email,
      password: "",
    });
    setShowEditManagerDialog(true);
  };

  const handleUpdateManager = async (data: ManagerAuthFormData) => {
    if (!selectedManager) return;

    try {
      setUpdating(true);

      const { error } = await supabase.functions.invoke("update-manager-auth", {
        body: {
          manager_user_id: selectedManager.user_id,
          email: data.email,
          password: data.password || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Dados do gerente atualizados com sucesso",
      });

      setShowEditManagerDialog(false);
      setSelectedManager(null);
      form.reset();
      fetchManagers();
    } catch (error) {
      console.error("Error updating manager:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar gerente",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleEditOrganization = async (org: Organization) => {
    setSelectedOrganization(org);
    setEditingOrg(true);

    try {
      // Buscar o gerente da organização
      const { data: managerRole, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("organization_id", org.id)
        .eq("role", "manager")
        .maybeSingle();

      if (roleError) throw roleError;

      let managerEmail = "";
      let managerName = "";

      if (managerRole) {
        // Buscar dados do gerente via edge function
        const { data: managersData, error: managersError } = await supabase.functions.invoke("list-managers");
        
        if (!managersError && managersData) {
          const manager = managersData.managers.find((m: Manager) => m.user_id === managerRole.user_id);
          if (manager) {
            managerEmail = manager.email;
          }
        }

        // Buscar nome do perfil
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", managerRole.user_id)
          .maybeSingle();

        if (!profileError && profile) {
          managerName = profile.full_name || "";
        }
      }

      orgForm.reset({
        organizationName: org.name,
        managerName: managerName,
        email: managerEmail,
        password: "",
        confirmPassword: "",
      });

      setShowEditOrgDialog(true);
    } catch (error) {
      console.error("Error loading organization data:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados da organização",
        variant: "destructive",
      });
    } finally {
      setEditingOrg(false);
    }
  };

  const handleUpdateOrganization = async (data: OrganizationEditFormData) => {
    if (!selectedOrganization) return;

    try {
      setEditingOrg(true);

      const { error } = await supabase.functions.invoke("admin-update-manager", {
        body: {
          organization_id: selectedOrganization.id,
          organization_name: data.organizationName,
          manager_name: data.managerName,
          email: data.email,
          password: data.password || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Organização e gerente atualizados com sucesso",
      });

      setShowEditOrgDialog(false);
      setSelectedOrganization(null);
      orgForm.reset();
      fetchOrganizations();
      fetchManagers();
    } catch (error) {
      console.error("Error updating organization:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar organização",
        variant: "destructive",
      });
    } finally {
      setEditingOrg(false);
    }
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
      gratuita: "Gratuita",
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
                <>
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button variant="default">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Criar Conta Gratuita
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Conta Gratuita (Mentorado)</DialogTitle>
                        <DialogDescription>
                          Crie uma nova organização com acesso gratuito ao sistema
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="orgName">Nome da Barbearia</Label>
                          <Input
                            id="orgName"
                            value={newAccountData.organizationName}
                            onChange={(e) =>
                              setNewAccountData({ ...newAccountData, organizationName: e.target.value })
                            }
                            placeholder="Ex: Barbearia do João"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="email">Email do Gerente</Label>
                          <Input
                            id="email"
                            type="email"
                            value={newAccountData.managerEmail}
                            onChange={(e) =>
                              setNewAccountData({ ...newAccountData, managerEmail: e.target.value })
                            }
                            placeholder="gerente@email.com"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="password">Senha Temporária</Label>
                          <Input
                            id="password"
                            type="password"
                            value={newAccountData.managerPassword}
                            onChange={(e) =>
                              setNewAccountData({ ...newAccountData, managerPassword: e.target.value })
                            }
                            placeholder="Mínimo 6 caracteres"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowCreateDialog(false)}
                          disabled={creating}
                        >
                          Cancelar
                        </Button>
                        <Button onClick={handleCreateFreeAccount} disabled={creating}>
                          {creating ? "Criando..." : "Criar Conta"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    variant="outline" 
                    onClick={handleMigrateOrganization}
                    disabled={migrating}
                  >
                    {migrating ? "Migrando..." : "🔄 Transferir Organização"}
                  </Button>
                </>
              )}
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
        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="organizations">Organizações</TabsTrigger>
            <TabsTrigger value="managers">Gerentes</TabsTrigger>
          </TabsList>

          <TabsContent value="organizations">
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
                  <TableHead>Módulo Assinatura</TableHead>
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
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={org.has_subscription_module}
                          onCheckedChange={async (checked) => {
                            const { error } = await supabase
                              .from("organizations")
                              .update({ has_subscription_module: checked })
                              .eq("id", org.id);
                            
                            if (error) {
                              toast({
                                title: "Erro",
                                description: "Erro ao atualizar módulo",
                                variant: "destructive",
                              });
                            } else {
                              toast({
                                title: "Sucesso",
                                description: `Módulo de assinatura ${checked ? "habilitado" : "desabilitado"}`,
                              });
                              fetchOrganizations();
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {org.has_subscription_module ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(org.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {org.stripe_customer_id || "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditOrganization(org)}
                          disabled={editingOrg}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        {org.subscription_status === "gratuita" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevokeAccess(org.id)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Revogar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={org.subscription_status === "active" ? "destructive" : "default"}
                            onClick={() => handleToggleAccess(org.id, org.subscription_status)}
                          >
                            {org.subscription_status === "active" ? "Desativar" : "Ativar"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </CardContent>
          </Card>

          {/* Modal de Edição de Organização */}
          <Dialog open={showEditOrgDialog} onOpenChange={setShowEditOrgDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Editar Organização e Gerente</DialogTitle>
                <DialogDescription>
                  Atualize as informações da barbearia e do gerente responsável
                </DialogDescription>
              </DialogHeader>
              <Form {...orgForm}>
                <form onSubmit={orgForm.handleSubmit(handleUpdateOrganization)} className="space-y-4">
                  <FormField
                    control={orgForm.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Barbearia</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Barbearia do João" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={orgForm.control}
                    name="managerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Gerente</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: João Silva" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={orgForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email de Login</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} placeholder="gerente@email.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={orgForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nova Senha Temporária (deixe em branco para não alterar)</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="Mínimo 8 caracteres" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={orgForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Nova Senha</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="Digite a senha novamente" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowEditOrgDialog(false)}
                      disabled={editingOrg}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={editingOrg}>
                      {editingOrg ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="managers">
          <Card>
            <CardHeader>
              <CardTitle>Gerentes</CardTitle>
              <CardDescription>
                Edite email e senha dos gerentes cadastrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Organização</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managers.map((manager) => (
                    <TableRow key={manager.user_id}>
                      <TableCell className="font-medium">{manager.email}</TableCell>
                      <TableCell>{manager.organization_name}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditManager(manager)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={showEditManagerDialog} onOpenChange={setShowEditManagerDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Gerente</DialogTitle>
                <DialogDescription>
                  Atualize o email e/ou senha do gerente
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleUpdateManager)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nova Senha (deixe em branco para não alterar)</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={updating}>
                      {updating ? "Atualizando..." : "Atualizar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}