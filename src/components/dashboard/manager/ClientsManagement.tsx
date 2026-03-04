import { useEffect, useMemo, useRef, useState } from "react";
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
  canEdit: boolean;
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

interface PurchaseFallbackClient {
  client_name: string | null;
  mobile_phone: string | null;
  created_at: string;
}

interface ClientSummary {
  hasPurchases: boolean;
  topItems: string[];
  lastPurchaseAt: string | null;
}

interface ClientsQuerySuccess {
  rows: ClientRow[];
  missingPlanSupport: boolean;
}

const formatPhone = (digits: string) => {
  const only = String(digits || "").replace(/\D/g, "").slice(0, 11);
  if (only.length <= 2) return only.length ? `(${only}` : "";
  if (only.length <= 7) return `(${only.slice(0, 2)}) ${only.slice(2)}`;
  return `(${only.slice(0, 2)}) ${only.slice(2, 7)}-${only.slice(7)}`;
};

const isMissingSchemaError = (error: unknown, tableName: string) => {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  const details = String(err?.details || "").toLowerCase();
  const table = tableName.toLowerCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes(table) ||
    details.includes(table)
  );
};

const isMissingColumnError = (error: unknown) => {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  const details = String(err?.details || "").toLowerCase();

  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (details.includes("column") && details.includes("does not exist"))
  );
};

const buildClientsFromSaleTransactions = (rows: PurchaseFallbackClient[]): ClientRow[] => {
  const byPhone = new Map<string, ClientRow>();

  rows.forEach((row) => {
    const phone = String(row.mobile_phone || "").replace(/\D/g, "").slice(0, 11);
    const name = String(row.client_name || "").trim();

    if (phone.length !== 11 || name.length < 3) return;

    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, {
        id: `fallback-${phone}`,
        name,
        mobile_phone: phone,
        subscription_plan_id: null,
        updated_at: row.created_at,
        canEdit: false,
      });
      return;
    }

    if (new Date(row.created_at).getTime() > new Date(existing.updated_at).getTime()) {
      byPhone.set(phone, {
        ...existing,
        name,
        updated_at: row.created_at,
      });
    }
  });

  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
};

const mapClientRows = (
  rows: Array<{ id: string; name: string; mobile_phone: string; updated_at?: string; subscription_plan_id?: string | null }>,
  missingPlanSupport: boolean,
): ClientRow[] => rows.map((client) => ({
  id: client.id,
  name: client.name,
  mobile_phone: client.mobile_phone,
  subscription_plan_id: missingPlanSupport ? null : client.subscription_plan_id || null,
  updated_at: client.updated_at || new Date().toISOString(),
  canEdit: true,
}));

const fetchClients = async (organizationId: string): Promise<ClientsQuerySuccess | { missingSchema: true } | { error: unknown }> => {
  const queries = [
    { select: "id, name, mobile_phone, subscription_plan_id, updated_at", missingPlanSupport: false },
    { select: "id, name, mobile_phone, updated_at", missingPlanSupport: true },
    { select: "id, name, mobile_phone", missingPlanSupport: true },
  ] as const;

  for (const query of queries) {
    const result = await supabase
      .from("clients")
      .select(query.select)
      .eq("organization_id", organizationId)
      .order("name");

    if (!result.error) {
      return {
        rows: mapClientRows((result.data || []) as any[], query.missingPlanSupport),
        missingPlanSupport: query.missingPlanSupport,
      };
    }

    if (isMissingSchemaError(result.error, "clients")) {
      return { missingSchema: true };
    }

    if (!isMissingColumnError(result.error)) {
      return { error: result.error };
    }
  }

  return { error: new Error("Não foi possível carregar clientes") };
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

  const warnedFallbackRef = useRef(false);
  const warnedPlanRef = useRef(false);

  const loadData = async () => {
    if (!organizationId) {
      setClients([]);
      setPlans([]);
      setPurchases([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [clientsResult, plansRes, historyRes] = await Promise.all([
      fetchClients(organizationId),
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

    if ("rows" in clientsResult) {
      setClients(clientsResult.rows);
      if (clientsResult.missingPlanSupport && !warnedPlanRef.current) {
        warnedPlanRef.current = true;
        toast.warning("Seu banco ainda não possui a coluna de plano em clientes. Aplique as migrations para habilitar plano.");
      }
    } else if ("missingSchema" in clientsResult) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("sale_transactions")
        .select("client_name, mobile_phone, created_at")
        .eq("organization_id", organizationId)
        .not("client_name", "is", null)
        .not("mobile_phone", "is", null)
        .order("created_at", { ascending: false })
        .limit(3000);

      if (fallbackError) {
        toast.error("Erro ao carregar clientes");
        console.error(fallbackError);
        setClients([]);
      } else {
        setClients(buildClientsFromSaleTransactions((fallbackRows || []) as PurchaseFallbackClient[]));
        if (!warnedFallbackRef.current) {
          warnedFallbackRef.current = true;
          toast.warning("Cadastro de clientes ainda não disponível. Exibindo clientes do histórico de vendas.");
        }
      }
    } else {
      toast.error("Erro ao carregar clientes");
      console.error(clientsResult.error);
      setClients([]);
    }

    if (plansRes.error) {
      if (!isMissingSchemaError(plansRes.error, "subscription_plans")) {
        toast.error("Erro ao carregar planos");
        console.error(plansRes.error);
      }
      setPlans([]);
    } else {
      setPlans(plansRes.data || []);
    }

    if (historyRes.error) {
      if (!isMissingSchemaError(historyRes.error, "client_purchase_history")) {
        toast.error("Erro ao carregar histórico de recompra");
        console.error(historyRes.error);
      }
      setPurchases([]);
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
      const planName = client.subscription_plan_id ? planNameById.get(client.subscription_plan_id) || "" : "";
      return (
        client.name.toLowerCase().includes(q) ||
        client.mobile_phone.includes(q.replace(/\D/g, "")) ||
        planName.toLowerCase().includes(q)
      );
    });
  }, [clients, search, planNameById]);

  const openEdit = (client: ClientRow) => {
    if (!client.canEdit) {
      toast.info("Este cliente veio do histórico de vendas. Aplique as migrations para editar via cadastro.");
      return;
    }

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
                    ? planNameById.get(client.subscription_plan_id) || "Plano não encontrado"
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
