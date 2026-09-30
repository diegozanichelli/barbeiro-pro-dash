import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trophy, Save } from "lucide-react";
import { ChampionshipConfig } from "@/hooks/useChampionshipConfig";
import { brl } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ChampionshipConfig;
  onSave: (next: ChampionshipConfig) => Promise<void>;
}

interface PlanRow {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

function num(value: string, fallback = 0) {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export default function ChampionshipCampaignModal({ open, onOpenChange, config, onSave }: Props) {
  const { organizationId } = useOrganization();
  const [draft, setDraft] = useState<ChampionshipConfig>(config);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  useEffect(() => {
    if (!open || !organizationId) return;
    supabase
      .from("subscription_plans")
      .select("id, name, price, active")
      .eq("organization_id", organizationId)
      .order("price", { ascending: true })
      .then(({ data }) => setPlans((data as PlanRow[]) || []));
  }, [open, organizationId]);

  const set = <K extends keyof ChampionshipConfig>(key: K, value: ChampionshipConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setTier = (index: number, field: "min" | "points", value: number) =>
    setDraft((prev) => ({
      ...prev,
      ticket_tiers: prev.ticket_tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));

  const setMultiplier = (planId: string, value: number) =>
    setDraft((prev) => ({
      ...prev,
      plan_multipliers: { ...prev.plan_multipliers, [planId]: value },
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      toast.success("Regras da campanha salvas!");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + (error?.message || "tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const SectionHeader = ({
    title,
    description,
    enabled,
    onToggle,
  }: {
    title: string;
    description: string;
    enabled: boolean;
    onToggle: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" />
            Configurar Campanha
          </DialogTitle>
          <DialogDescription>
            Escolha quais indicadores valem pontos, quanto cada um vale e os pesos por plano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Geral */}
          <div className="space-y-3">
            <Label htmlFor="camp-name">Nome da campanha</Label>
            <Input
              id="camp-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Campeonato Anual, Copa de Verão..."
            />
            <SectionHeader
              title="Trava de validação por faturamento"
              description="Só valida a pontuação de quem atingir o faturamento mínimo."
              enabled={draft.validation_enabled}
              onToggle={(v) => set("validation_enabled", v)}
            />
            {draft.validation_enabled && (
              <div className="space-y-1">
                <Label htmlFor="min-rev">Faturamento mínimo (R$)</Label>
                <Input
                  id="min-rev"
                  type="number"
                  value={draft.min_revenue}
                  onChange={(e) => set("min_revenue", num(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Faturamento */}
          <div className="space-y-3">
            <SectionHeader
              title="Faturamento"
              description="Pontos a cada R$ 1.000 faturados no período."
              enabled={draft.revenue_enabled}
              onToggle={(v) => set("revenue_enabled", v)}
            />
            {draft.revenue_enabled && (
              <div className="space-y-1">
                <Label htmlFor="rev-pts">Pontos por R$ 1.000</Label>
                <Input
                  id="rev-pts"
                  type="number"
                  value={draft.revenue_points_per_1000}
                  onChange={(e) => set("revenue_points_per_1000", num(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Ticket médio */}
          <div className="space-y-3">
            <SectionHeader
              title="Ticket médio"
              description="Bônus por faixa de ticket médio alcançado."
              enabled={draft.ticket_enabled}
              onToggle={(v) => set("ticket_enabled", v)}
            />
            {draft.ticket_enabled && (
              <div className="space-y-2">
                {draft.ticket_tiers.map((tier, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Ticket a partir de (R$)</Label>
                      <Input
                        type="number"
                        value={tier.min}
                        onChange={(e) => setTier(i, "min", num(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Pontos</Label>
                      <Input
                        type="number"
                        value={tier.points}
                        onChange={(e) => setTier(i, "points", num(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Assinaturas */}
          <div className="space-y-3">
            <SectionHeader
              title="Assinaturas"
              description="Pontos por nova venda de assinatura, com peso por plano."
              enabled={draft.subscriptions_enabled}
              onToggle={(v) => set("subscriptions_enabled", v)}
            />
            {draft.subscriptions_enabled && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="sub-pts">Pontos base por assinatura</Label>
                  <Input
                    id="sub-pts"
                    type="number"
                    value={draft.subscription_points}
                    onChange={(e) => set("subscription_points", num(e.target.value))}
                  />
                </div>
                <div className="space-y-2 rounded-lg bg-secondary/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Peso de cada plano (1 = pontos base, 1,5 = 50% a mais)
                  </p>
                  {plans.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum plano cadastrado.</p>
                  )}
                  {plans.map((plan) => {
                    const mult = Number(draft.plan_multipliers[plan.id] ?? 1);
                    return (
                      <div key={plan.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {plan.name} {!plan.active && "(inativo)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {brl(Number(plan.price))} · vale{" "}
                            {Math.round(draft.subscription_points * (mult || 1))} pts
                          </p>
                        </div>
                        <Input
                          className="w-24"
                          type="number"
                          step="0.1"
                          value={mult}
                          onChange={(e) => setMultiplier(plan.id, num(e.target.value, 1))}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Extras */}
          <div className="space-y-3">
            <SectionHeader
              title="Serviços extras"
              description="Pontos por serviço extra vendido, com bônus para valores altos."
              enabled={draft.extras_enabled}
              onToggle={(v) => set("extras_enabled", v)}
            />
            {draft.extras_enabled && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Pontos por extra</Label>
                  <Input
                    type="number"
                    value={draft.extra_points}
                    onChange={(e) => set("extra_points", num(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Acima de (R$)</Label>
                  <Input
                    type="number"
                    value={draft.extra_high_threshold}
                    onChange={(e) => set("extra_high_threshold", num(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Multiplicador</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.extra_high_multiplier}
                    onChange={(e) => set("extra_high_multiplier", num(e.target.value, 1))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Produtos */}
          <div className="space-y-3">
            <SectionHeader
              title="Produtos"
              description="Pontos por produto vendido."
              enabled={draft.products_enabled}
              onToggle={(v) => set("products_enabled", v)}
            />
            {draft.products_enabled && (
              <div className="space-y-1">
                <Label htmlFor="prod-pts">Pontos por produto</Label>
                <Input
                  id="prod-pts"
                  type="number"
                  value={draft.product_points}
                  onChange={(e) => set("product_points", num(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="h-px w-full bg-border" />

          {/* Penalidades */}
          <div className="space-y-3">
            <p className="font-semibold text-destructive">Penalidades</p>
            <SectionHeader
              title="Cliente novo que não virou assinante"
              description="Desconta pontos por cliente novo atendido sem adesão."
              enabled={draft.penalty_unconverted_enabled}
              onToggle={(v) => set("penalty_unconverted_enabled", v)}
            />
            {draft.penalty_unconverted_enabled && (
              <div className="space-y-1">
                <Label className="text-xs">Pontos perdidos por cliente</Label>
                <Input
                  type="number"
                  value={draft.penalty_unconverted_points}
                  onChange={(e) => set("penalty_unconverted_points", num(e.target.value))}
                />
              </div>
            )}
            <SectionHeader
              title="Folgas e faltas"
              description="Desconta pontos por dia registrado como folga ou falta."
              enabled={draft.penalty_dayoff_enabled}
              onToggle={(v) => set("penalty_dayoff_enabled", v)}
            />
            {draft.penalty_dayoff_enabled && (
              <div className="space-y-1">
                <Label className="text-xs">Pontos perdidos por dia</Label>
                <Input
                  type="number"
                  value={draft.penalty_dayoff_points}
                  onChange={(e) => set("penalty_dayoff_points", num(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar regras"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
