import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Crown,
  ArrowLeft,
  ArrowRight,
  Check,
  UserPlus,
  Users,
  Building2,
  Scissors,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import BarberCombobox from "./BarberCombobox";
import { getTodayString } from "@/lib/dateUtils";

interface SubscriptionWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onComplete: () => void;
  onBridgeToService?: (barberId: string | null, barberName: string) => void;
}

interface Unit {
  id: string;
  name: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

type WizardStep = "client_type" | "attribution" | "details" | "success";
type SubscriptionAction = "new" | "renew" | "upgrade" | "downgrade";

export default function SubscriptionWizardModal({
  open,
  onOpenChange,
  organizationId,
  onComplete,
  onBridgeToService,
}: SubscriptionWizardModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<WizardStep>("client_type");

  // Step 1
  const [isNewClient, setIsNewClient] = useState<boolean | null>(null);
  const [subscriptionAction, setSubscriptionAction] = useState<SubscriptionAction | null>(null);
  const [downgradeReason, setDowngradeReason] = useState("");

  // Step 2
  const [attributionType, setAttributionType] = useState<"reception" | "barber" | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedBarberUnitName, setSelectedBarberUnitName] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);

  // Step 3
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const [unitsRes, plansRes] = await Promise.all([
        supabase.from("units").select("id, name").eq("organization_id", organizationId).eq("status", "active").order("name"),
        supabase.from("subscription_plans").select("id, name, price").eq("active", true).eq("organization_id", organizationId).order("name"),
      ]);
      if (unitsRes.data) setUnits(unitsRes.data);
      if (plansRes.data) setPlans(plansRes.data);
    };
    if (open) fetchData();
  }, [open, organizationId]);

  useEffect(() => {
    if (!open) {
      setStep("client_type");
      setIsNewClient(null);
      setSubscriptionAction(null);
      setDowngradeReason("");
      setAttributionType(null);
      setSelectedBarberId(null);
      setSelectedBarberUnitName(null);
      setSelectedUnitId(null);
      setSelectedPlanId(null);
      setClientName("");
    }
  }, [open]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleBack = () => {
    if (step === "attribution") setStep("client_type");
    else if (step === "details") setStep("attribution");
  };

  const handleNext = () => {
    if (step === "client_type" && canProceed()) setStep("attribution");
    else if (step === "attribution" && canProceed()) setStep("details");
  };

  const canProceed = () => {
    if (step === "client_type") {
      if (isNewClient === null) return false;
      if (isNewClient) return true; // action = 'new' automatically
      return subscriptionAction !== null && (subscriptionAction !== "downgrade" || downgradeReason.trim().length > 0);
    }
    if (step === "attribution") {
      if (attributionType === "reception") return !!selectedUnitId;
      if (attributionType === "barber") return !!selectedBarberId;
      return false;
    }
    if (step === "details") {
      return !!selectedPlanId && clientName.trim().length > 0;
    }
    return false;
  };

  const handleSelectNewClient = (value: boolean) => {
    setIsNewClient(value);
    if (value) {
      setSubscriptionAction("new");
      setDowngradeReason("");
    } else {
      setSubscriptionAction(null);
    }
  };

  const handleSelectAction = (action: SubscriptionAction) => {
    setSubscriptionAction(action);
    if (action !== "downgrade") setDowngradeReason("");
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;
    setLoading(true);
    const today = getTodayString();

    try {
      let productionId: string | null = null;
      let unitIdToSave: string | null = selectedUnitId;

      if (selectedBarberId) {
        const { data: barberData } = await supabase
          .from("barbers")
          .select("unit_id")
          .eq("id", selectedBarberId)
          .single();
        if (barberData) unitIdToSave = barberData.unit_id;

        const { data: existingProd } = await supabase
          .from("daily_productions")
          .select("id")
          .eq("barber_id", selectedBarberId)
          .eq("date", today)
          .maybeSingle();

        if (existingProd) {
          productionId = existingProd.id;
        } else {
          const { data: newProd, error: createError } = await supabase
            .from("daily_productions")
            .insert({
              barber_id: selectedBarberId,
              organization_id: organizationId,
              date: today,
              clients_count: 0,
              services_count: 0,
              products_count: 0,
              services_basic_total: 0,
              services_extra_total: 0,
              products_total: 0,
            })
            .select("id")
            .single();
          if (createError) throw createError;
          productionId = newProd.id;
        }
      }

      const actionLabel = subscriptionAction === "new" ? "Nova" : subscriptionAction === "renew" ? "Renovação" : subscriptionAction === "upgrade" ? "Upgrade" : "Downgrade";

      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: selectedBarberId,
        organization_id: organizationId,
        daily_production_id: productionId,
        unit_id: unitIdToSave,
        item_type: "subscription",
        item_name: `Assinatura ${selectedPlan?.name || ""}`,
        description: clientName.trim(),
        price_sold: selectedPlan?.price || 0,
        service_category: null,
        catalog_service_id: null,
        catalog_product_id: null,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "manager",
        is_new_client: isNewClient,
        subscription_plan_id: selectedPlanId,
        subscription_action: subscriptionAction,
        downgrade_reason: subscriptionAction === "downgrade" ? downgradeReason.trim() : null,
      } as any);

      if (error) throw error;

      const attribution = selectedBarberId ? "do barbeiro" : "da Recepção";
      toast.success(`Assinatura registrada!`, {
        description: `${actionLabel} • R$ ${Number(selectedPlan?.price || 0).toFixed(2)} • Pontos ${attribution} 🏆`,
      });

      onComplete();
      setStep("success");
    } catch (error: any) {
      console.error("Erro ao registrar assinatura:", error);
      toast.error("Erro ao registrar assinatura");
    } finally {
      setLoading(false);
    }
  };

  const handleBridgeToService = () => {
    const barberName = selectedBarberId
      ? "Barbeiro" // Will be resolved by parent
      : "Recepção";
    onOpenChange(false);
    onBridgeToService?.(selectedBarberId, barberName);
  };

  const handleFinish = () => {
    onOpenChange(false);
  };

  const getStepNumber = () => {
    if (step === "client_type") return 1;
    if (step === "attribution") return 2;
    if (step === "details") return 3;
    return 4;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            {step === "success" ? "✅ Assinatura Confirmada!" : "Vender Assinatura"}
          </DialogTitle>
          {step !== "success" && (
            <DialogDescription>
              Passo {getStepNumber()} de 3 —{" "}
              {step === "client_type"
                ? "Tipo de Cliente"
                : step === "attribution"
                ? "Atribuição de Pontos"
                : "Detalhes do Plano"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* STEP 1 */}
          {step === "client_type" && (
            <div className="space-y-4">
              <Label className="text-base font-medium">
                É um cliente novo ou já era da casa?
              </Label>
              <p className="text-sm text-muted-foreground">
                Isso ajuda a medir a taxa de conversão de novos clientes em assinantes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={isNewClient === true ? "default" : "outline"}
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2",
                    isNewClient === true && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => handleSelectNewClient(true)}
                >
                  <UserPlus className="w-6 h-6" />
                  <span className="font-medium">Novo Cliente</span>
                  <span className="text-xs text-muted-foreground">Primeira vez</span>
                </Button>
                <Button
                  type="button"
                  variant={isNewClient === false ? "default" : "outline"}
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2",
                    isNewClient === false && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => handleSelectNewClient(false)}
                >
                  <Users className="w-6 h-6" />
                  <span className="font-medium">Já é Cliente</span>
                  <span className="text-xs text-muted-foreground">Cliente da casa</span>
                </Button>
              </div>

              {/* Sub-options for existing client */}
              {isNewClient === false && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium text-muted-foreground">Qual a ação?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={subscriptionAction === "renew" ? "default" : "outline"}
                      className={cn(
                        "h-auto py-3 flex flex-col items-center gap-1 text-xs",
                        subscriptionAction === "renew" && "ring-2 ring-primary ring-offset-2"
                      )}
                      onClick={() => handleSelectAction("renew")}
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span className="font-medium">Renovação</span>
                    </Button>
                    <Button
                      type="button"
                      variant={subscriptionAction === "upgrade" ? "default" : "outline"}
                      className={cn(
                        "h-auto py-3 flex flex-col items-center gap-1 text-xs",
                        subscriptionAction === "upgrade" && "ring-2 ring-primary ring-offset-2"
                      )}
                      onClick={() => handleSelectAction("upgrade")}
                    >
                      <ArrowUpCircle className="w-5 h-5" />
                      <span className="font-medium">Upgrade</span>
                    </Button>
                    <Button
                      type="button"
                      variant={subscriptionAction === "downgrade" ? "default" : "outline"}
                      className={cn(
                        "h-auto py-3 flex flex-col items-center gap-1 text-xs",
                        subscriptionAction === "downgrade" && "ring-2 ring-primary ring-offset-2"
                      )}
                      onClick={() => handleSelectAction("downgrade")}
                    >
                      <ArrowDownCircle className="w-5 h-5" />
                      <span className="font-medium">Downgrade</span>
                    </Button>
                  </div>

                  {subscriptionAction === "downgrade" && (
                    <div className="space-y-2 pt-1">
                      <Label htmlFor="downgrade-reason">
                        Motivo do Downgrade <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="downgrade-reason"
                        placeholder="Ex: Cliente quer reduzir gastos..."
                        value={downgradeReason}
                        onChange={(e) => setDowngradeReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === "attribution" && (
            <div className="space-y-4">
              <Label className="text-base font-medium">Quem realizou essa venda?</Label>
              <p className="text-sm text-muted-foreground">
                O profissional selecionado receberá +10 pontos no Campeonato.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={attributionType === "reception" ? "default" : "outline"}
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2",
                    attributionType === "reception" && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => {
                    setAttributionType("reception");
                    setSelectedBarberId(null);
                  }}
                >
                  <Building2 className="w-6 h-6" />
                  <span className="font-medium">Recepção</span>
                  <span className="text-xs text-muted-foreground">Venda espontânea</span>
                </Button>
                <Button
                  type="button"
                  variant={attributionType === "barber" ? "default" : "outline"}
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2",
                    attributionType === "barber" && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => setAttributionType("barber")}
                >
                  <Scissors className="w-6 h-6" />
                  <span className="font-medium">Barbeiro</span>
                  <span className="text-xs text-muted-foreground">Indicou/vendeu</span>
                </Button>
              </div>

              {attributionType === "reception" && (
                <div className="space-y-2 pt-2">
                  <Label>Selecione a unidade: <span className="text-destructive">*</span></Label>
                  <select
                    value={selectedUnitId || ""}
                    onChange={(e) => setSelectedUnitId(e.target.value || null)}
                    className="w-full h-10 px-3 py-2 bg-secondary border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">Selecione a unidade...</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {attributionType === "barber" && (
                <div className="space-y-2 pt-2">
                  <Label>Selecione o barbeiro:</Label>
                  <BarberCombobox
                    organizationId={organizationId}
                    value={selectedBarberId}
                    onChange={(barberId, unitName) => {
                      setSelectedBarberId(barberId);
                      setSelectedBarberUnitName(unitName ?? null);
                    }}
                    placeholder="Buscar barbeiro..."
                    allowReception={false}
                  />
                  {selectedBarberId && selectedBarberUnitName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3" />
                      Assinatura será registrada na unidade: <strong>{selectedBarberUnitName}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subscription-plan-select">
                  Qual o plano vendido? <span className="text-destructive">*</span>
                </Label>
                {plans.length > 0 ? (
                  <Select value={selectedPlanId || ""} onValueChange={(v) => setSelectedPlanId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o plano..." />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} — R$ {Number(plan.price).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                    Nenhum plano cadastrado. Cadastre em Gestão → Planos.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-name">
                  Nome do Cliente <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="client-name"
                  placeholder="Nome completo para conferência"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              {/* Summary */}
              <div className="mt-4 p-3 bg-muted rounded-lg space-y-1 text-sm">
                <p><strong>Resumo:</strong></p>
                <p>• Ação: {subscriptionAction === "new" ? "🆕 Nova Assinatura" : subscriptionAction === "renew" ? "🔄 Renovação" : subscriptionAction === "upgrade" ? "🔼 Upgrade" : "🔽 Downgrade"}</p>
                <p>• Plano: {selectedPlan ? `${selectedPlan.name} — R$ ${Number(selectedPlan.price).toFixed(2)}` : "—"}</p>
                <p>• Pontos para: {selectedBarberId ? "💈 Barbeiro selecionado" : "🏢 Recepção"}</p>
                {subscriptionAction === "downgrade" && downgradeReason && (
                  <p>• Motivo: {downgradeReason}</p>
                )}
              </div>
            </div>
          )}

          {/* SUCCESS STEP - Bridge */}
          {step === "success" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">
                  Assinatura registrada com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  O cliente vai realizar algum serviço agora?
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                {selectedBarberId && onBridgeToService && (
                  <Button
                    className="w-full gap-2"
                    onClick={handleBridgeToService}
                  >
                    <Scissors className="w-4 h-4" />
                    Sim, Lançar Serviço
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleFinish}
                >
                  Não, Finalizar
                </Button>
              </div>
            </div>
          )}
        </div>

        {step !== "success" && (
        <DialogFooter className="flex-row gap-3 sm:flex-row">
          {step !== "client_type" ? (
            <Button variant="outline" className="flex-1 gap-2" onClick={handleBack} disabled={loading}>
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
          )}

          {step === "details" ? (
            <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={loading || !canProceed()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Registrar</>}
            </Button>
          ) : (
            <Button className="flex-1 gap-2" onClick={handleNext} disabled={!canProceed()}>
              Próximo
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
