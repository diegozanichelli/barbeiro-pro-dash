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
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
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
  barbers: { name: string } | null;
  subscription_plans: { name: string; price: number } | null;
  units: { name: string } | null;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

export default function SubscriptionAuditModal({
  open,
  onOpenChange,
  organizationId,
  onRefresh,
}: SubscriptionAuditModalProps) {
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
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
    }
  }, [open, organizationId]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sale_transactions")
        .select("id, created_at, description, item_name, price_sold, barber_id, subscription_plan_id, unit_id, barbers(name), subscription_plans(name, price), units(name)")
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .order("created_at", { ascending: false })
        .limit(20);

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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            👁️ Auditoria de Assinaturas
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma venda de assinatura encontrada.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">🕒</TableHead>
                <TableHead>👤 Cliente</TableHead>
                <TableHead>👑 Plano</TableHead>
                <TableHead>💼 Vendedor</TableHead>
                <TableHead className="text-right">💰 Valor</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
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
