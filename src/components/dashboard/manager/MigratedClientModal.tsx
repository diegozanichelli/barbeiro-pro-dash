import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarIcon, Info, Loader2, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { isValidPhone, sanitizePhone } from "@/lib/phoneUtils";

interface MigratedClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onComplete: () => void;
}

interface PlanOpt {
  id: string;
  name: string;
  price: number;
}
interface UnitOpt {
  id: string;
  name: string;
}

export default function MigratedClientModal({
  open,
  onOpenChange,
  organizationId,
  onComplete,
}: MigratedClientModalProps) {
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [units, setUnits] = useState<UnitOpt[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    (async () => {
      const [p, u] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select("id, name, price")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("price"),
        supabase
          .from("units")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("name"),
      ]);
      setPlans(p.data || []);
      setUnits(u.data || []);
    })();
  }, [open, organizationId]);

  useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
      setPlanId("");
      setUnitId("");
      setStartedAt(new Date());
      setSaving(false);
    }
  }, [open]);

  const isCompleteName = (n: string) => {
    const parts = n.trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 && parts[0].length >= 2;
  };

  const canSubmit =
    isValidPhone(phone) &&
    isCompleteName(name) &&
    planId &&
    unitId &&
    startedAt &&
    startedAt <= new Date();

  const handleSubmit = async () => {
    if (!canSubmit || !organizationId) return;
    setSaving(true);
    try {
      const normalizedPhone = sanitizePhone(phone);
      const startedDate = format(startedAt, "yyyy-MM-dd");

      // Check existing clients by phone (supports legacy duplicates)
      const { data: existingByPhone, error: existingErr } = await supabase
        .from("clients")
        .select("id, name, subscription_plan_id")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", normalizedPhone)
        .order("created_at", { ascending: true })
        .limit(5);
      if (existingErr) throw existingErr;

      const normalizedName = name.trim().toLowerCase();
      const exactDuplicate = (existingByPhone || []).find((c) => (c.name || "").trim().toLowerCase() === normalizedName);
      const existing = exactDuplicate || (existingByPhone || [])[0];

      if (existing) {
        const { error } = await supabase
          .from("clients")
          .update({
            name: name.trim(),
            subscription_plan_id: planId,
            subscription_started_at: startedDate,
            subscription_unit_id: unitId,
            migrated_from_legacy: true,
          })
          .eq("id", existing.id);
        if (error) throw error;
        toast.success(exactDuplicate ? "Cliente já existente identificado e atualizado" : "Cliente existente atualizado com o plano migrado");
      } else {
        const { error } = await supabase.from("clients").insert({
          organization_id: organizationId,
          name: name.trim(),
          mobile_phone: normalizedPhone,
          subscription_plan_id: planId,
          subscription_started_at: startedDate,
          subscription_unit_id: unitId,
          migrated_from_legacy: true,
        });
        if (error) throw error;
        toast.success("Cliente migrado cadastrado com sucesso");
      }

      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao cadastrar cliente migrado:", err);
      toast.error(err.message || "Erro ao salvar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Cadastrar cliente migrado
          </DialogTitle>
          <DialogDescription>
            Para clientes vindos do sistema antigo que já têm plano em vigência.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-500/40 bg-amber-500/10">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-xs">
            Esse cadastro <strong>não gera venda nem comissão</strong>. Use apenas
            para registrar clientes que já são assinantes em outro sistema.
          </AlertDescription>
        </Alert>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="mig-name">Nome completo *</Label>
            <Input
              id="mig-name"
              placeholder="João da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mig-phone">Telefone (com DDD) *</Label>
            <Input
              id="mig-phone"
              placeholder="(92) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plano *</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — R$ {Number(p.price).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Unidade de origem *</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data de início do plano *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startedAt && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startedAt
                    ? format(startedAt, "PPP", { locale: ptBR })
                    : "Escolha uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startedAt}
                  onSelect={(d) => d && setStartedAt(d)}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Quando esse plano começou a vigorar no sistema antigo.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar cadastro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
