import { useEffect, useState } from "react";
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
import { Users, Plus, Pencil, Trash2 } from "lucide-react";

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
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;

          const { data, error: updateAuthError } = await supabase.functions.invoke("update-barber-auth", {
            body: {
              barber_id: editingBarber.id,
              email: formData.email || undefined,
              password: formData.password || undefined,
            },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          });

          if (updateAuthError) {
            const serverMsg = (updateAuthError as any)?.context?.error || (updateAuthError as any)?.message;
            throw new Error(serverMsg || "Falha ao atualizar dados de autenticação");
          }

          if (data?.success) {
            toast.success("Barbeiro e dados de autenticação atualizados!");
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
      setFormData({ name: "", unit_id: "", services_commission: "50", products_commission: "15", status: "active", email: "", password: "" });
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
      status: barber.status,
      email: "",
      password: "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este barbeiro?")) return;

    try {
      const { error } = await supabase.from("barbers").delete().eq("id", id);
      if (error) throw error;
      toast.success("Barbeiro excluído!");
      fetchBarbers();
    } catch (error: any) {
      toast.error(error.message);
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
                  setFormData({ name: "", unit_id: "", services_commission: "50", products_commission: "15", status: "active", email: "", password: "" });
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Barbeiro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBarber ? "Editar" : "Novo"} Barbeiro</DialogTitle>
                <DialogDescription>Preencha os dados do barbeiro</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingBarber}
                    minLength={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editingBarber 
                      ? "Preencha apenas se desejar redefinir a senha do barbeiro"
                      : "O barbeiro usará este email e senha para fazer login"
                    }
                  </p>
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
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
