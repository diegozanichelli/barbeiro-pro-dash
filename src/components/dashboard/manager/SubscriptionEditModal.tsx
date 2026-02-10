import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const ACTION_OPTIONS = [
  { value: "new", label: "Nova" },
  { value: "renew", label: "Renovação" },
  { value: "upgrade", label: "Upgrade" },
  { value: "downgrade", label: "Downgrade" },
];

interface SubscriptionPlan {
  id: string;
  name: string;
}

interface TransactionToEdit {
  id: string;
  client_name: string | null;
  subscription_action: string | null;
  subscription_plan_id?: string | null;
  downgrade_reason: string | null;
  subscription_plans?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionToEdit | null;
  onSaved: () => void;
}

export default function SubscriptionEditModal({ open, onOpenChange, transaction, onSaved }: Props) {
  const [clientName, setClientName] = useState("");
  const [action, setAction] = useState("new");
  const [planId, setPlanId] = useState("");
  const [downgradeReason, setDowngradeReason] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      setClientName(transaction.client_name || "");
      setAction(transaction.subscription_action || "new");
      setPlanId(transaction.subscription_plan_id || "");
      setDowngradeReason(transaction.downgrade_reason || "");
      fetchPlans();
    }
  }, [open, transaction]);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (data) setPlans(data);
  };

  const handleSave = async () => {
    if (!transaction) return;
    setSaving(true);

    const selectedPlan = plans.find((p) => p.id === planId);
    const updateData: Record<string, unknown> = {
      client_name: clientName || null,
      subscription_action: action,
      subscription_plan_id: planId || null,
      downgrade_reason: action === "downgrade" ? downgradeReason || null : null,
    };
    if (selectedPlan) {
      updateData.item_name = `Assinatura ${selectedPlan.name}`;
    }

    const { error } = await supabase
      .from("sale_transactions")
      .update(updateData)
      .eq("id", transaction.id);

    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar alterações");
      return;
    }

    toast.success("Movimentação atualizada!");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Movimentação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do Cliente</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome do cliente" />
          </div>

          <div className="space-y-2">
            <Label>Ação</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {action === "downgrade" && (
            <div className="space-y-2">
              <Label>Motivo do Downgrade</Label>
              <Textarea
                value={downgradeReason}
                onChange={(e) => setDowngradeReason(e.target.value)}
                placeholder="Informe o motivo..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
