import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface SubscriptionPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubscriptionPlan | null;
  availableServices: { id: string; name: string }[];
  initialServiceIds: string[];
  onSave: (name: string, price: number, serviceIds: string[]) => Promise<void>;
}

export default function SubscriptionPlanModal({
  open,
  onOpenChange,
  plan,
  availableServices,
  initialServiceIds,
  onSave,
}: SubscriptionPlanModalProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName(plan?.name || "");
      setPrice(plan?.price ? String(plan.price) : "");
      setSelectedServiceIds(initialServiceIds || []);
    }
  }, [open, plan, initialServiceIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setLoading(true);
    try {
      await onSave(name.trim(), parseFloat(price), selectedServiceIds);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Nome do Plano</Label>
            <Input
              id="plan-name"
              placeholder="Ex: Plano Gold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-price">Preço (R$)</Label>
            <Input
              id="plan-price"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex: 90.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Serviços incluídos no plano</Label>
            <div className="max-h-52 overflow-y-auto rounded-md border p-3 space-y-2">
              {availableServices.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum serviço ativo cadastrado.</p>
              ) : (
                availableServices.map((service) => {
                  const checked = selectedServiceIds.includes(service.id);
                  return (
                    <label key={service.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setSelectedServiceIds((prev) => {
                            if (value) return [...prev, service.id];
                            return prev.filter((id) => id !== service.id);
                          });
                        }}
                      />
                      <span>{service.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !price}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
