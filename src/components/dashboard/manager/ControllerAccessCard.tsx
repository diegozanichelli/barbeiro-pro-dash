import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/lib/edgeError";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, Plus, Check, X } from "lucide-react";

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

// Provisiona o login do CONTROLADOR (papel próprio). Fica na tela de Barbeiros,
// onde já vivem os acessos da equipe.
export default function ControllerAccessCard() {
  const { organizationId } = useOrganization();
  const [controllers, setControllers] = useState<{ user_id: string; name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const isPasswordValid =
    form.password.length >= 8 &&
    /[A-Z]/.test(form.password) &&
    /[a-z]/.test(form.password) &&
    /[0-9]/.test(form.password);

  const fetchControllers = async () => {
    if (!organizationId) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "controller");
    const ids = (roles || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setControllers([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name]));
    setControllers(ids.map((id) => ({ user_id: id, name: nameById.get(id) || "Controlador" })));
  };

  useEffect(() => {
    fetchControllers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleCreate = async () => {
    if (!isPasswordValid) {
      toast.error("A senha não atende aos requisitos.");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("create-controller", {
        body: { name: form.name, email: form.email, password: form.password },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, "Falha ao criar controlador"));
      if (data?.error) throw new Error(data.error);
      toast.success("Controlador criado! Login: " + form.email);
      setDialogOpen(false);
      setForm({ name: "", email: "", password: "" });
      fetchControllers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar controlador");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Acesso do Controlador
            </CardTitle>
            <CardDescription>
              Login próprio para lançar cancelamentos, renovações automáticas e vendas online de assinatura.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm({ name: "", email: "", password: "" })}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Controlador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Controlador</DialogTitle>
                <DialogDescription>
                  Crie o login da controladoria. Ele verá apenas a área de lançamento de assinaturas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nome do controlador"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email (login)</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="controlador@exemplo.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <PasswordCheck label="8+ caracteres" met={form.password.length >= 8} />
                    <PasswordCheck label="Maiúscula" met={/[A-Z]/.test(form.password)} />
                    <PasswordCheck label="Minúscula" met={/[a-z]/.test(form.password)} />
                    <PasswordCheck label="Número" met={/[0-9]/.test(form.password)} />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={loading || !form.name || !form.email || !isPasswordValid}
                >
                  {loading ? "Criando..." : "Criar controlador"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {controllers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum controlador cadastrado ainda.
          </p>
        ) : (
          <ul className="space-y-1">
            {controllers.map((c) => (
              <li key={c.user_id} className="flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
