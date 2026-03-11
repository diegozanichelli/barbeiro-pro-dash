import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Plus, Pencil, Trash2, Check, X } from "lucide-react";

function PasswordCheck({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {met ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <X className="w-3.5 h-3.5 text-destructive" />
      )}
      <span className={met ? "text-green-500" : "text-destructive"}>{label}</span>
    </div>
  );
}

export default function BarbersManagement() {
  const [barbers, setBarbers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    unit_id: "",
    services_commission: "50",
    products_commission: "15",
    subscription_commission: "0",
    status: "active",
    email: "",
    password: "",
  });

  useEffect(() => {
    fetchBarbers();
    fetchUnits();
  }, []);

  const fetchBarbers = async () => {
    const { data } = await supabase
      .from("barbers")
      .select("*, units(name)")
      .order("name");
    if (data) setBarbers(data);
  };

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("*").eq("status", "active");
    if (data) setUnits(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const barberData = {
        name: formData.name,
        unit_id: formData.unit_id,
        services_commission: Number(formData.services_commission),
        products_commission: Number(formData.products_commission),
        subscription_commission_rate: Number(formData.subscription_commission),
        status: formData.status,
      };

      if (editingBarber) {
        // Atualizar dados do barbeiro na tabela barbers
        const { error } = await supabase
          .from("barbers")
          .update(barberData)
          .eq("id", editingBarber.id);
        if (error) throw error;

        // Se houver email ou senha para atualizar, chamar a Edge Function
        if (formData.email || formData.password) {
          console.log("Atualizando dados de autenticação...");
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;

          if (!accessToken) {
            throw new Error("Sessão expirada. Faça login novamente.");
          }

          const { data, error: updateAuthError } = await supabase.functions.invoke("update-barber-auth", {
            body: {
              barber_id: editingBarber.id,
              email: formData.email || undefined,
              password: formData.password || undefined,
            },
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          console.log("Resposta da função:", { data, error: updateAuthError });

          if (updateAuthError) {
            console.error("Erro da edge function:", updateAuthError);
            const errorMsg = data?.error || updateAuthError.message || "Falha ao atualizar dados de autenticação";
            throw new Error(errorMsg);
          }

          if (data?.success) {
            toast.success("Barbeiro e dados de autenticação atualizados!");
          } else {
            throw new Error(data?.error || "Falha ao atualizar dados de autenticação");
          }
        } else {
          toast.success("Barbeiro atualizado!");
        }
      } else {
        // Garantir envio do JWT do gestor ao chamar a função
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        const { data, error } = await supabase.functions.invoke("create-barber", {
          body: {
            name: formData.name,
            email: formData.email,
            password: formData.password,
            unit_id: formData.unit_id,
            services_commission: Number(formData.services_commission),
            products_commission: Number(formData.products_commission),
            subscription_commission_rate: Number(formData.subscription_commission),
            status: formData.status,
          },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        
        if (error) {
          const serverMsg = (error as any)?.context?.error || (error as any)?.message;
          throw new Error(serverMsg || "Falha ao criar barbeiro");
        }
        toast.success("Barbeiro criado com sucesso! Login: " + formData.email);
      }

      setDialogOpen(false);
      setFormData({ name: "", unit_id: "", services_commission: "50", products_commission: "15", subscription_commission: "0", status: "active", email: "", password: "" });
      setEditingBarber(null);
      fetchBarbers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (barber: any) => {
    setEditingBarber(barber);
    setFormData({
      name: barber.name,
      unit_id: barber.unit_id,
      services_commission: String(barber.services_commission),
      products_commission: String(barber.products_commission),
      subscription_commission: String(barber.subscription_commission_rate || 0),
      status: barber.status,
      email: "",
      password: "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este barbeiro? Todos os dados de login serão removidos permanentemente.")) return;

    try {
      const { data, error } = await supabase.functions.invoke("delete-barber", {
        body: { barberId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Barbeiro e dados de login excluídos!");
      fetchBarbers();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir barbeiro");
    }
  };

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Gestão de Barbeiros
            </CardTitle>
            <CardDescription>Gerencie sua equipe de barbeiros</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingBarber(null);
                  setFormData({ name: "", unit_id: "", services_commission: "50", products_commission: "15", subscription_commission: "0", status: "active", email: "", password: "" });
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Barbeiro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingBarber ? "Editar" : "Novo"} Barbeiro</DialogTitle>
                <DialogDescription>Preencha os dados do barbeiro</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_id">Unidade</Label>
                  <Select value={formData.unit_id} onValueChange={(value) => setFormData({ ...formData, unit_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {editingBarber ? "Novo Email de Login (deixe em branco para não alterar)" : "Email de Login"}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="barbeiro@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required={!editingBarber}
                  />
                  {editingBarber && (
                    <p className="text-xs text-muted-foreground">
                      Preencha apenas se desejar alterar o email atual
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {editingBarber ? "Nova Senha (deixe em branco para não alterar)" : "Senha Temporária"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingBarber}
                    minLength={8}
                  />
                  {(!editingBarber || formData.password.length > 0) && (
                    <div className="space-y-1 mt-2">
                      <PasswordCheck label="Mínimo 8 caracteres" met={formData.password.length >= 8} />
                      <PasswordCheck label="Letra maiúscula (A-Z)" met={/[A-Z]/.test(formData.password)} />
                      <PasswordCheck label="Letra minúscula (a-z)" met={/[a-z]/.test(formData.password)} />
                      <PasswordCheck label="Número (0-9)" met={/[0-9]/.test(formData.password)} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="services_commission">Comissão Serviços (%)</Label>
                    <Input
                      id="services_commission"
                      type="number"
                      step="0.01"
                      value={formData.services_commission}
                      onChange={(e) => setFormData({ ...formData, services_commission: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="products_commission">Comissão Produtos (%)</Label>
                    <Input
                      id="products_commission"
                      type="number"
                      step="0.01"
                      value={formData.products_commission}
                      onChange={(e) => setFormData({ ...formData, products_commission: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_commission">Taxa de Comissão - Assinaturas (%)</Label>
                  <Input
                    id="subscription_commission"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formData.subscription_commission}
                    onChange={(e) => setFormData({ ...formData, subscription_commission: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Altere manualmente quando quiser promover o barbeiro (ex: de 10% para 15%)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                </div>
                <div className="pt-4 border-t mt-4">
                  <Button type="submit" className="w-full" disabled={loading || isPasswordInvalid}>
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Comissão Serv.</TableHead>
              <TableHead>Comissão Prod.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {barbers.map((barber) => (
              <TableRow key={barber.id}>
                <TableCell className="font-medium">{barber.name}</TableCell>
                <TableCell>{barber.units?.name}</TableCell>
                <TableCell>{barber.services_commission}%</TableCell>
                <TableCell>{barber.products_commission}%</TableCell>
                <TableCell>
                  <Badge variant={barber.status === "active" ? "default" : "secondary"}>
                    {barber.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(barber)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(barber.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
