import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Pencil, Users } from "lucide-react";

interface ClientRow {
  id: string;
  name: string;
  mobile_phone: string;
  subscription_plan_id: string | null;
  updated_at: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
}

interface PurchaseHistoryRow {
  mobile_phone: string;
  item_name: string;
  purchased_at: string;
}

interface ClientSummary {
  hasPurchases: boolean;
  topItems: string[];
  lastPurchaseAt: string | null;
}

const formatPhone = (digits: string) => {
  const only = String(digits || "").replace(/\D/g, "").slice(0, 11);
  if (only.length <= 2) return only.length ? `(${only}` : "";
  if (only.length <= 7) return `(${only.slice(0, 2)}) ${only.slice(2)}`;
  return `(${only.slice(0, 2)}) ${only.slice(2, 7)}-${only.slice(7)}`;
};

export default function ClientsManagement() {
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [purchases, setPurchases] = useState<PurchaseHistoryRow[]>([]);

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPlanId, setFormPlanId] = useState<string>("none");

  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);

    const [clientsRes, plansRes, historyRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, mobile_phone, subscription_plan_id, updated_at")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("client_purchase_history")
        .select("mobile_phone, item_name, purchased_at")
        .eq("organization_id", organizationId)
        .order("purchased_at", { ascending: false })
        .limit(1500),
    ]);

    if (clientsRes.error) {
      toast.error("Erro ao carregar clientes");
      console.error(clientsRes.error);
    } else {
      setClients(clientsRes.data || []);
    }

    if (plansRes.error) {
      toast.error("Erro ao carregar planos");
      console.error(plansRes.error);
    } else {
      setPlans(plansRes.data || []);
    }

    if (historyRes.error) {
      toast.error("Erro ao carregar histórico de recompra");
      console.error(historyRes.error);
    } else {
      setPurchases(historyRes.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [organizationId]);

  const planNameById = useMemo(() => {
    const map = new Map<string, string>();
    plans.forEach((plan) => map.set(plan.id, plan.name));
    return map;
  }, [plans]);

  const purchaseSummaryByPhone = useMemo(() => {
    const grouped = new Map<string, PurchaseHistoryRow[]>();

    purchases.forEach((row) => {
      if (!grouped.has(row.mobile_phone)) grouped.set(row.mobile_phone, []);
      grouped.get(row.mobile_phone)!.push(row);
    });

    const summary = new Map<string, ClientSummary>();

    grouped.forEach((rows, phone) => {
      const countByItem = new Map<string, number>();
      rows.forEach((r) => {
        countByItem.set(r.item_name, (countByItem.get(r.item_name) || 0) + 1);
      });

      const topItems = [...countByItem.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([item]) => item);

      summary.set(phone, {
        hasPurchases: rows.length > 0,
        topItems,
        lastPurchaseAt: rows[0]?.purchased_at || null,
      });
    });

    return summary;
  }, [purchases]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) => {
      const planName = client.subscription_plan_id ? (planNameById.get(client.subscription_plan_id) || "") : "";
      return (
        client.name.toLowerCase().includes(q) ||
        client.mobile_phone.includes(q.replace(/\D/g, "")) ||
        planName.toLowerCase().includes(q)
      );
    });
  }, [clients, search, planNameById]);

  const openEdit = (client: ClientRow) => {
    setSelectedClient(client);
    setFormName(client.name);
    setFormPhone(client.mobile_phone);
    setFormPlanId(client.subscription_plan_id || "none");
    setEditOpen(true);
  };

  const handleSaveClient = async () => {
    if (!selectedClient) return;

    const name = formName.trim();
    const phone = formPhone.replace(/\D/g, "").slice(0, 11);

    if (name.length < 3) {
      toast.error("Nome deve ter ao menos 3 caracteres");
      return;
    }

    if (phone.length !== 11) {
      toast.error("Celular deve ter 11 dígitos");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("clients")
      .update({
        name,
        mobile_phone: phone,
        subscription_plan_id: formPlanId === "none" ? null : formPlanId,
      })
      .eq("id", selectedClient.id);

    setSaving(false);

    if (error) {
      toast.error(error.message || "Erro ao salvar cliente");
      return;
    }

    toast.success("Cliente atualizado com sucesso");
    setEditOpen(false);
    await loadData();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Clientes
        </CardTitle>
        <CardDescription>
          Veja plano atual, itens de recompra, histórico de compra e edite dados/plano do cliente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input
          placeholder="Buscar por nome, telefone ou plano..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredClients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nenhum cliente encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Já comprou?</TableHead>
                  <TableHead>Itens de recompra</TableHead>
                  <TableHead>Última compra</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const summary = purchaseSummaryByPhone.get(client.mobile_phone);
                  const planName = client.subscription_plan_id
                    ? (planNameById.get(client.subscription_plan_id) || "Plano não encontrado")
                    : "Sem plano";

                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="font-medium">{client.name}</div>
                        <div className="text-xs text-muted-foreground">{formatPhone(client.mobile_phone)}</div>
                      </TableCell>
                      <TableCell>{planName}</TableCell>
                      <TableCell>
                        {summary?.hasPurchases ? (
                          <Badge className="bg-green-600 text-white">Sim</Badge>
                        ) : (
                          <Badge variant="secondary">Não</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {summary?.topItems?.length ? summary.topItems.join(", ") : "Sem histórico"}
                      </TableCell>
                      <TableCell>
                        {summary?.lastPurchaseAt
                          ? new Date(summary.lastPurchaseAt).toLocaleString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Atualize nome, celular e o plano do cliente para próximos lançamentos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Celular</Label>
              <Input value={formatPhone(formPhone)} onChange={(e) => setFormPhone(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={formPlanId} onValueChange={setFormPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem plano</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveClient} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
