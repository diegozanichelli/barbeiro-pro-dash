import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X, Loader2, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import BarberCombobox from "./BarberCombobox";

interface SubscriptionAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onRefresh?: () => void;
}

interface AuditTransaction {
  id: string;
  created_at: string;
  description: string | null;
  item_name: string;
  price_sold: number;
  barber_id: string | null;
  subscription_plan_id: string | null;
  unit_id: string | null;
  subscription_action: string | null;
  barbers: { name: string } | null;
  subscription_plans: { name: string; price: number } | null;
  units: { name: string } | null;
}

const ACTION_META: Record<string, { label: string; emoji: string; className: string }> = {
  new: { label: "Nova", emoji: "🆕", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" },
  renew: { label: "Renovação", emoji: "🔄", className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400" },
  upgrade: { label: "Upgrade", emoji: "⬆️", className: "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-400" },
  downgrade: { label: "Downgrade", emoji: "⬇️", className: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400" },
};

const getActionMeta = (action: string | null) =>
  (action && ACTION_META[action]) || { label: "Sem tipo", emoji: "❔", className: "bg-muted text-muted-foreground border-border" };

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

interface UnitOption {
  id: string;
  name: string;
}

export default function SubscriptionAuditModal({
  open,
  onOpenChange,
  organizationId,
  onRefresh,
}: SubscriptionAuditModalProps) {
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editBarberId, setEditBarberId] = useState<string | null>(null);
  const [editPlanId, setEditPlanId] = useState<string>("");
  const [editValue, setEditValue] = useState<string>("");

  useEffect(() => {
    if (open && organizationId) {
      fetchTransactions();
      fetchPlans();
      fetchUnits();
    }
  }, [open, organizationId]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sale_transactions")
        .select("id, created_at, description, item_name, price_sold, barber_id, subscription_plan_id, unit_id, subscription_action, barbers(name), subscription_plans(name, price), units(name)")
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions((data as any) || []);
    } catch (error) {
      console.error("Error fetching audit transactions:", error);
      toast.error("Erro ao carregar transações");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, price")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name");
    setPlans(data || []);
  };

  const fetchUnits = async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("name");
    setUnits(data || []);
  };

  // Filtered transactions by unit + action
  const filteredTransactions = transactions.filter((tx) => {
    const unitOk = selectedUnit === "all" || tx.unit_id === selectedUnit;
    const actionOk = selectedAction === "all" || (tx.subscription_action || "unknown") === selectedAction;
    return unitOk && actionOk;
  });

  // Aggregated stats per unit (from current loaded transactions)
  const unitStats = transactions.reduce<Record<string, { count: number; total: number; name: string }>>((acc, tx) => {
    const key = tx.unit_id || "no-unit";
    const name = tx.units?.name || "Sem unidade";
    if (!acc[key]) acc[key] = { count: 0, total: 0, name };
    acc[key].count += 1;
    acc[key].total += Number(tx.price_sold) || 0;
    return acc;
  }, {});

  // Aggregated stats per action
  const actionStats = transactions.reduce<Record<string, number>>((acc, tx) => {
    const key = tx.subscription_action || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const startEditing = (tx: AuditTransaction) => {
    setEditingId(tx.id);
    setEditBarberId(tx.barber_id);
    setEditPlanId(tx.subscription_plan_id || "");
    setEditValue(String(tx.price_sold));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditBarberId(null);
    setEditPlanId("");
    setEditValue("");
  };

  const handleSave = async (txId: string) => {
    setSaving(true);
    try {
      const selectedPlan = plans.find((p) => p.id === editPlanId);
      const priceValue = parseFloat(editValue);

      if (isNaN(priceValue) || priceValue < 0) {
        toast.error("Valor inválido");
        setSaving(false);
        return;
      }

      // Get unit_id from the selected barber
      let unitId: string | null = null;
      if (editBarberId) {
        const { data: barberData } = await supabase
          .from("barbers")
          .select("unit_id")
          .eq("id", editBarberId)
          .single();
        unitId = barberData?.unit_id || null;
      }

      const updatePayload: Record<string, any> = {
        barber_id: editBarberId,
        price_sold: priceValue,
        unit_id: unitId,
      };

      if (editPlanId && selectedPlan) {
        updatePayload.subscription_plan_id = editPlanId;
        updatePayload.item_name = `Assinatura ${selectedPlan.name}`;
      }

      const { error } = await supabase
        .from("sale_transactions")
        .update(updatePayload)
        .eq("id", txId);

      if (error) throw error;

      toast.success("Transação atualizada!");
      cancelEditing();
      fetchTransactions();
      onRefresh?.();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Erro ao salvar alteração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            👁️ Auditoria de Assinaturas
          </DialogTitle>
        </DialogHeader>

        {!loading && transactions.length > 0 && (
          <div className="space-y-3 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
                <Building2 className="w-3.5 h-3.5" />
                Filtrar por unidade:
              </Label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger className="h-9 text-sm w-full sm:w-[240px]">
                  <SelectValue placeholder="Todas as unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades ({transactions.length})</SelectItem>
                  {units.map((u) => {
                    const stat = unitStats[u.id];
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} {stat ? `(${stat.count})` : "(0)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por tipo de ação */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
                🎯 Tipo de movimento:
              </Label>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={selectedAction === "all" ? "default" : "outline"}
                  className="cursor-pointer text-xs font-normal"
                  onClick={() => setSelectedAction("all")}
                >
                  Todas <span className="font-semibold ml-1">({transactions.length})</span>
                </Badge>
                {(["new", "renew", "upgrade", "downgrade", "unknown"] as const).map((key) => {
                  const count = actionStats[key] || 0;
                  if (count === 0) return null;
                  const meta = getActionMeta(key === "unknown" ? null : key);
                  const isActive = selectedAction === key;
                  return (
                    <Badge
                      key={key}
                      variant="outline"
                      className={`cursor-pointer text-xs font-normal ${isActive ? meta.className : ""}`}
                      onClick={() => setSelectedAction(isActive ? "all" : key)}
                    >
                      <span className="mr-1">{meta.emoji}</span>
                      {meta.label} <span className="font-semibold ml-1">({count})</span>
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(unitStats).map(([key, stat]) => (
                <Badge
                  key={key}
                  variant={selectedUnit === key ? "default" : "secondary"}
                  className="cursor-pointer text-xs font-normal"
                  onClick={() => setSelectedUnit(selectedUnit === key ? "all" : key)}
                >
                  {stat.name}: <span className="font-semibold ml-1">{stat.count}</span>
                  <span className="ml-1.5 text-[10px] opacity-80">
                    {stat.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma venda de assinatura encontrada.
          </p>
        ) : filteredTransactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma assinatura nesta unidade.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">🕒</TableHead>
                <TableHead>👤 Cliente</TableHead>
                <TableHead>🏢 Unidade</TableHead>
                <TableHead>👑 Plano</TableHead>
                <TableHead>💼 Vendedor</TableHead>
                <TableHead className="text-right">💰 Valor</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((tx) => {
                const isEditing = editingId === tx.id;

                if (isEditing) {
                  return (
                    <TableRow key={tx.id} className="bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), "HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.description || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.units?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <Select value={editPlanId} onValueChange={setEditPlanId}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <BarberCombobox
                          organizationId={organizationId}
                          value={editBarberId}
                          onChange={(id) => setEditBarberId(id)}
                          allowReception={true}
                          placeholder="Vendedor"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-8 w-24 text-right text-xs"
                          step="0.01"
                          min="0"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600"
                            onClick={() => handleSave(tx.id)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {tx.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.units?.name ? (
                        <Badge variant="outline" className="font-normal">
                          <Building2 className="w-3 h-3 mr-1" />
                          {tx.units.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.subscription_plans?.name || tx.item_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.barbers?.name || "Recepção"}
                    </TableCell>
                    <TableCell className="text-sm text-right font-medium">
                      {tx.price_sold.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => startEditing(tx)}
                        title="Editar"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
