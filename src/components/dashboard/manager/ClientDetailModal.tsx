import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, ShoppingBag, CalendarDays, Crown, Phone, User } from "lucide-react";
import { formatPhone, isValidPhone, sanitizePhone } from "@/lib/phoneUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClientDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    id: string;
    name: string;
    mobile_phone: string;
    subscription_plan_id: string | null;
    subscription_started_at?: string | null;
    created_at: string;
  } | null;
  organizationId: string;
  onUpdated: () => void;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

interface PurchaseRecord {
  id: string;
  item_name: string;
  item_type: string;
  amount: number;
  quantity: number;
  purchased_at: string;
}

interface VisitRecord {
  date: string;
  barber_name: string;
  services_count: number;
  total: number;
}

export default function ClientDetailModal({
  open,
  onOpenChange,
  client,
  organizationId,
  onUpdated,
}: ClientDetailModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState<string>("none");
  const [subscriptionStartedAt, setSubscriptionStartedAt] = useState<string>("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setPhone(formatPhone(client.mobile_phone));
      setPlanId(client.subscription_plan_id || "none");
      setSubscriptionStartedAt(client.subscription_started_at || "");
      fetchData();
    }
  }, [open, client]);

  const fetchData = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const [plansRes, purchasesRes, visitsRes] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select("id, name, price")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("client_purchase_history")
          .select("id, item_name, item_type, amount, quantity, purchased_at")
          .eq("organization_id", organizationId)
          .eq("mobile_phone", client.mobile_phone)
          .order("purchased_at", { ascending: false })
          .limit(50),
        supabase
          .from("sale_transactions")
          .select("created_at, barber_id, item_type, price_sold")
          .eq("organization_id", organizationId)
          .eq("mobile_phone", client.mobile_phone)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      setPlans(plansRes.data || []);
      setPurchases((purchasesRes.data || []) as PurchaseRecord[]);

      // Group transactions by date as "visits"
      const visitMap = new Map<string, { total: number; services: number; barberIds: Set<string> }>();
      for (const tx of visitsRes.data || []) {
        const dateKey = format(new Date(tx.created_at), "yyyy-MM-dd");
        const existing = visitMap.get(dateKey) || { total: 0, services: 0, barberIds: new Set() };
        existing.total += Number(tx.price_sold) || 0;
        if (tx.item_type === "service") existing.services++;
        if (tx.barber_id) existing.barberIds.add(tx.barber_id);
        visitMap.set(dateKey, existing);
      }

      // Get barber names
      const barberIds = new Set<string>();
      visitMap.forEach((v) => v.barberIds.forEach((id) => barberIds.add(id)));
      let barberNames: Record<string, string> = {};
      if (barberIds.size > 0) {
        const { data: barbers } = await supabase
          .from("barbers")
          .select("id, name")
          .in("id", Array.from(barberIds));
        barberNames = Object.fromEntries((barbers || []).map((b) => [b.id, b.name]));
      }

      const visitList: VisitRecord[] = Array.from(visitMap.entries()).map(([date, v]) => ({
        date,
        barber_name: Array.from(v.barberIds)
          .map((id) => barberNames[id] || "Recepção")
          .join(", "),
        services_count: v.services,
        total: v.total,
      }));

      setVisits(visitList);
    } catch (err) {
      console.error("Erro ao carregar dados do cliente:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!client) return;

    const phoneDigits = sanitizePhone(phone);
    if (phoneDigits.length !== 11 || !isValidPhone(phone)) {
      toast.error("Informe um celular válido com DDD (11 dígitos)");
      return;
    }

    if (planId !== "none" && !subscriptionStartedAt) {
      toast.error("Selecione a data de início do plano");
      return;
    }

    setSaving(true);
    try {
      const oldPhone = sanitizePhone(client.mobile_phone || "");

      const { data: samePhoneClients, error: samePhoneErr } = await supabase
        .from("clients")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", phoneDigits)
        .neq("id", client.id)
        .limit(10);
      if (samePhoneErr) throw samePhoneErr;

      const normalizedTargetName = name.trim().toLowerCase();
      const exactDuplicate = (samePhoneClients || []).find((c) => (c.name || "").trim().toLowerCase() === normalizedTargetName);
      if (exactDuplicate) {
        toast.error("Já existe cliente com este mesmo nome e telefone");
        return;
      }

      const { error } = await supabase
        .from("clients")
        .update({
          name: name.trim(),
          mobile_phone: phoneDigits,
          subscription_plan_id: planId === "none" ? null : planId,
          subscription_started_at: planId === "none" ? null : subscriptionStartedAt,
        } as any)
        .eq("id", client.id);

      if (error) throw error;

      if (oldPhone && oldPhone !== phoneDigits) {
        await Promise.allSettled([
          supabase
            .from("sale_transactions")
            .update({ mobile_phone: phoneDigits })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", oldPhone),
          supabase
            .from("client_purchase_history")
            .update({ mobile_phone: phoneDigits })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", oldPhone),
        ]);
      }

      toast.success("Cliente atualizado com sucesso");
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };


  const handleDeleteClient = async () => {
    if (!client) return;

    const phoneDigits = sanitizePhone(client.mobile_phone || "");

    try {
      setDeleting(true);

      const [{ count: txCount, error: txErr }, { count: phCount, error: phErr }] = await Promise.all([
        supabase
          .from("sale_transactions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("mobile_phone", phoneDigits),
        supabase
          .from("client_purchase_history")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("mobile_phone", phoneDigits),
      ]);

      if (txErr) throw txErr;
      if (phErr) throw phErr;

      const hasHistory = (txCount || 0) > 0 || (phCount || 0) > 0;

      const baseConfirm = window.confirm("Tem certeza que deseja excluir permanentemente este cliente?");
      if (!baseConfirm) return;

      if (hasHistory) {
        const historyConfirm = window.confirm(
          `Este cliente já possui histórico de uso (${(txCount || 0) + (phCount || 0)} registro(s)). Deseja realmente excluir?`,
        );
        if (!historyConfirm) return;
      }

      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", client.id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      toast.success("Cliente excluído permanentemente");
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir cliente");
    } finally {
      setDeleting(false);
    }
  };
  const selectedPlan = plans.find((p) => p.id === planId);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const itemTypeBadge = (type: string) => {
    switch (type) {
      case "service":
        return <Badge variant="secondary" className="text-xs">Serviço</Badge>;
      case "product":
        return <Badge variant="outline" className="text-xs">Produto</Badge>;
      case "subscription":
        return <Badge className="text-xs bg-primary/20 text-primary">Assinatura</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {client.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 min-h-0">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="purchases">Compras</TabsTrigger>
            <TabsTrigger value="visits">Visitas</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nome</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-phone">Celular</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="client-phone"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(92) 99999-9999"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plano de Assinatura</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem plano</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <Crown className="w-3 h-3 text-primary" />
                        {p.name} — {formatCurrency(p.price)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan && planId !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Plano ativo: {selectedPlan.name} ({formatCurrency(selectedPlan.price)}/mês)
                </p>
              )}
            </div>

            {planId !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="subscription-started-at">Data de início do plano</Label>
                <Input
                  id="subscription-started-at"
                  type="date"
                  value={subscriptionStartedAt}
                  max={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setSubscriptionStartedAt(e.target.value)}
                />
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Cliente desde {format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </div>

            <div className="space-y-2">
              <Button onClick={handleSave} disabled={saving || deleting || !name.trim() || sanitizePhone(phone).length !== 11 || !isValidPhone(phone) || (planId !== "none" && !subscriptionStartedAt)} className="w-full gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Alterações
              </Button>

            </div>
          </TabsContent>

          <TabsContent value="purchases" className="mt-4">
            <ScrollArea className="h-[350px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : purchases.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma compra registrada
                </p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((p) => (
                    <Card key={p.id} className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{p.item_name}</span>
                          {itemTypeBadge(p.item_type)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(p.purchased_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0 ml-2">
                        {formatCurrency(p.amount)}
                      </span>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="visits" className="mt-4">
            <ScrollArea className="h-[350px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : visits.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma visita registrada
                </p>
              ) : (
                <div className="space-y-2">
                  {visits.map((v, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {format(new Date(v.date + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                          </span>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(v.total)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{v.barber_name}</span>
                        <span>•</span>
                        <span>{v.services_count} {v.services_count === 1 ? "serviço" : "serviços"}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" onClick={handleDeleteClient} disabled={saving || deleting} className="w-full gap-2">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Excluir cliente permanentemente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
