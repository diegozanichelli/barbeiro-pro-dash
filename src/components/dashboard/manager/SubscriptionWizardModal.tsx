import { useState, useEffect, useCallback } from "react";
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
  Phone,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import BarberCombobox from "./BarberCombobox";
import { getTodayString } from "@/lib/dateUtils";
import { formatPhone, isValidPhone, sanitizePhone } from "@/lib/phoneUtils";
import { assertPhoneForNewClient, translateSaleError } from "@/lib/saleGuards";
import { useClientHistory } from "@/hooks/useClientHistory";
import { useClientAutocomplete } from "@/hooks/useClientAutocomplete";
import { registerClientOrThrow } from "@/lib/clientRegistry";
import { recordClientPurchasesBestEffort } from "@/lib/clientPurchaseHistory";

const isSubscriptionPlanFieldMissing = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return (
    message.includes("subscription_plan_id") ||
    details.includes("subscription_plan_id") ||
    message.includes("schema cache")
  );
};

interface SubscriptionWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onComplete: () => void;
  onBridgeToService?: (barberId: string | null, barberName: string) => void;
  selectedDate?: string;
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
  selectedDate,
}: SubscriptionWizardModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<WizardStep>("client_type");

  // Step 1 - Client identification + Plan
  const [mobilePhone, setMobilePhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [isNewClient, setIsNewClient] = useState<boolean | null>(null);
  const [subscriptionAction, setSubscriptionAction] = useState<SubscriptionAction | null>(null);
  const [downgradeReason, setDowngradeReason] = useState("");
  const [manualOverride, setManualOverride] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Step 2 - Attribution
  const [attributionType, setAttributionType] = useState<"reception" | "barber" | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedBarberUnitName, setSelectedBarberUnitName] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Client history
  const clientHistory = useClientHistory(organizationId);
  const { nameSuggestions, phoneSuggestions, loading: loadingClientSuggestions } = useClientAutocomplete({
    organizationId,
    nameQuery: clientName,
    phoneQuery: mobilePhone,
    enabled: open,
  });

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
      setMobilePhone("");
      setPhoneError(null);
      setClientName("");
      setIsNewClient(null);
      setSubscriptionAction(null);
      setDowngradeReason("");
      setManualOverride(false);
      setSelectedPlanId(null);
      setAttributionType(null);
      setSelectedBarberId(null);
      setSelectedBarberUnitName(null);
      setSelectedUnitId(null);
      clientHistory.reset();
    }
  }, [open]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // Phone handlers
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatPhone(raw);
    setMobilePhone(formatted);

    const digits = sanitizePhone(raw);
    const matchedClient = phoneSuggestions.find((client) => client.mobile_phone === digits);
    if (matchedClient) {
      setClientName(matchedClient.name);
      if (!manualOverride) setIsNewClient(false);
    }
    if (digits.length === 11) {
      if (!isValidPhone(raw)) {
        setPhoneError("Telefone inválido");
      } else {
        setPhoneError(null);
      }
    } else {
      setPhoneError(null);
    }
  };

  const handlePhoneBlur = useCallback(async () => {
    const digits = sanitizePhone(mobilePhone);
    if (digits.length !== 11 || !isValidPhone(mobilePhone)) return;

    const res = await clientHistory.checkHistory(mobilePhone, clientName);
    if (!res) return;

    if (res.status === "phone_found" && res.suggestedName) {
      setClientName(res.suggestedName);
      if (!manualOverride) {
        setIsNewClient(false);
        setSubscriptionAction(null);
      }
    } else if (res.status === "name_found") {
      if (!manualOverride) {
        setIsNewClient(false);
        setSubscriptionAction(null);
      }
    } else if (res.status === "not_found") {
      if (!manualOverride) {
        setIsNewClient(true);
        setSubscriptionAction("new");
      }
    }
  }, [mobilePhone, clientName, manualOverride, clientHistory]);

  const handleNameBlur = useCallback(async () => {
    if (clientHistory.status === "not_found" || clientHistory.status === "idle") {
      const digits = sanitizePhone(mobilePhone);
      if (digits.length === 11 && isValidPhone(mobilePhone) && clientName.trim().length >= 3) {
        const res = await clientHistory.checkHistory(mobilePhone, clientName);
        if (res && res.status === "name_found" && !manualOverride) {
          setIsNewClient(false);
          setSubscriptionAction(null);
        }
      }
    }
  }, [mobilePhone, clientName, manualOverride, clientHistory]);

  const phoneDigits = sanitizePhone(mobilePhone);
  const isPhoneComplete = phoneDigits.length === 11 && isValidPhone(mobilePhone);

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
      if (!isPhoneComplete || clientHistory.checking || phoneError) return false;
      if (!clientName.trim()) return false;
      if (!selectedPlanId) return false;
      if (isNewClient === null) return false;
      if (isNewClient) return true;
      return subscriptionAction !== null && (subscriptionAction !== "downgrade" || downgradeReason.trim().length > 0);
    }
    if (step === "attribution") {
      if (attributionType === "reception") return !!selectedUnitId;
      if (attributionType === "barber") return !!selectedBarberId;
      return false;
    }
    if (step === "details") {
      return true; // Summary only
    }
    return false;
  };

  const handleSelectNewClient = (value: boolean) => {
    setManualOverride(true);
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
    if (!selectedPlanId || !clientName.trim()) return;
    setLoading(true);
    const dateStr = selectedDate || getTodayString();
    const phoneSanitized = sanitizePhone(mobilePhone) || null;

    try {
      const guard = assertPhoneForNewClient({
        subscriptionAction,
        isNewClient,
        mobilePhone,
      });
      if (!guard.ok) {
        toast.error(guard.message);
        return;
      }
      if (!phoneSanitized || phoneSanitized.length !== 11 || !isValidPhone(mobilePhone)) {
        toast.error("Celular válido com DDD é obrigatório (11 dígitos).");
        return;
      }

      const registeredClient = await registerClientOrThrow({
        organizationId,
        clientName,
        mobilePhone: phoneSanitized,
      });

      const { error: assignPlanError } = await (supabase
        .from("clients") as any)
        .update({ subscription_plan_id: selectedPlanId })
        .eq("organization_id", organizationId)
        .eq("mobile_phone", registeredClient.mobilePhone);

      if (assignPlanError && !isSubscriptionPlanFieldMissing(assignPlanError)) throw assignPlanError;

      if (registeredClient.reusedByPhone && registeredClient.clientName !== clientName.trim()) {
        toast.info(`Cliente identificado pelo celular: ${registeredClient.clientName}`);
      }

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
          .eq("date", dateStr)
          .maybeSingle();

        if (existingProd) {
          productionId = existingProd.id;
        } else {
          const { data: newProd, error: createError } = await supabase
            .from("daily_productions")
            .insert({
              barber_id: selectedBarberId,
              organization_id: organizationId,
              date: dateStr,
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

      const createdAt = selectedDate ? `${selectedDate}T12:00:00-04:00` : new Date().toISOString();
      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: selectedBarberId,
        organization_id: organizationId,
        daily_production_id: productionId,
        unit_id: unitIdToSave,
        item_type: "subscription",
        item_name: `Assinatura ${selectedPlan?.name || ""}`,
        description: registeredClient.clientName,
        client_name: registeredClient.clientName,
        mobile_phone: registeredClient.mobilePhone,
        price_sold: selectedPlan?.price || 0,
        service_category: null,
        catalog_service_id: null,
        catalog_product_id: null,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "manager",
        created_at: createdAt,
        is_new_client: isNewClient,
        subscription_plan_id: selectedPlanId,
        subscription_action: subscriptionAction,
        downgrade_reason: subscriptionAction === "downgrade" ? downgradeReason.trim() : null,
      } as any);

      if (error) throw error;

      await recordClientPurchasesBestEffort({
        organizationId,
        clientName: registeredClient.clientName,
        mobilePhone: registeredClient.mobilePhone,
        purchases: [
          {
            itemName: `Assinatura ${selectedPlan?.name || ""}`,
            itemType: "subscription",
            amount: selectedPlan?.price || 0,
            quantity: 1,
            purchasedAt: createdAt,
          },
        ],
      });

      const attribution = selectedBarberId ? "do barbeiro" : "da Recepção";
      toast.success(`Assinatura registrada!`, {
        description: `${actionLabel} • R$ ${Number(selectedPlan?.price || 0).toFixed(2)} • Pontos ${attribution} 🏆`,
      });

      onComplete();
      setStep("success");
    } catch (error: any) {
      console.error("Erro ao registrar assinatura:", error);
      toast.error(error?.message || "Erro ao registrar assinatura");
    } finally {
      setLoading(false);
    }
  };

  const handleBridgeToService = () => {
    const barberName = selectedBarberId
      ? "Barbeiro"
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

  // Client Status Badge
  const renderClientBadge = () => {
    if (clientHistory.checking) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verificando histórico...
        </Badge>
      );
    }
    if (clientHistory.status === "phone_found") {
      return (
        <Badge className="gap-1 text-xs bg-green-600 hover:bg-green-700 text-white border-0">
          <Smartphone className="h-3 w-3" />
          Identificado pelo Celular ({clientHistory.visitCount} {clientHistory.visitCount === 1 ? "visita" : "visitas"})
        </Badge>
      );
    }
    if (clientHistory.status === "name_found") {
      return (
        <Badge className="gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0">
          <Users className="h-3 w-3" />
          Histórico encontrado pelo nome. Vinculando celular...
        </Badge>
      );
    }
    if (clientHistory.status === "not_found" && isPhoneComplete) {
      return (
        <Badge className="gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0">
          <UserPlus className="h-3 w-3" />
          Primeiro registro deste cliente
        </Badge>
      );
    }
    if (manualOverride) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Classificação alterada manualmente
        </Badge>
      );
    }
    return null;
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
                ? "Identificação + Plano"
                : step === "attribution"
                ? "Atribuição de Pontos"
                : "Resumo"}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* STEP 1: Client Identification + Plan */}
          {step === "client_type" && (
            <div className="space-y-4">
              {/* Client Name (required) */}
              <div className="space-y-1">
                <Label htmlFor="sub-client-name" className="text-sm font-medium">
                  Nome do Cliente <span className="text-destructive">*</span>
                  {clientHistory.status === "phone_found" && (
                    <span className="text-muted-foreground font-normal"> (auto-preenchido)</span>
                  )}
                </Label>
                <Input
                  id="sub-client-name"
                  placeholder="Nome completo para conferência"
                  value={clientName}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setClientName(nextName);
                    const matchedClient = nameSuggestions.find(
                      (client) => client.name.toLowerCase() === nextName.trim().toLowerCase()
                    );
                    if (matchedClient) {
                      setMobilePhone(formatPhone(matchedClient.mobile_phone));
                      if (!manualOverride) setIsNewClient(false);
                    }
                  }}
                  onBlur={handleNameBlur}
                  list="subscription-name-suggestions"
                />
              </div>
              <datalist id="subscription-name-suggestions">
                {nameSuggestions.map((client) => (
                  <option key={client.id} value={client.name}>
                    {formatPhone(client.mobile_phone)}
                  </option>
                ))}
              </datalist>

              {/* Mobile Phone (required) */}
              <div className="space-y-1">
                <Label htmlFor="sub-mobile-phone" className="text-sm font-medium">
                  Celular do Cliente <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="sub-mobile-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 99999-9999"
                    value={mobilePhone}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    className={cn("h-10 pl-10", phoneError && "border-destructive")}
                    maxLength={15}
                    list="subscription-phone-suggestions"
                  />
                </div>
                {phoneError && (
                  <p className="text-xs text-destructive font-medium">{phoneError}</p>
                )}
                <datalist id="subscription-phone-suggestions">
                  {phoneSuggestions.map((client) => (
                    <option key={client.id} value={formatPhone(client.mobile_phone)}>
                      {client.name}
                    </option>
                  ))}
                </datalist>
              </div>

              {(loadingClientSuggestions && (clientName.trim().length >= 2 || phoneDigits.length >= 3)) && (
                <p className="text-xs text-muted-foreground">Buscando sugestões de clientes...</p>
              )}

              {/* Client Status Badge */}
              {renderClientBadge() && (
                <div>{renderClientBadge()}</div>
              )}

              {/* Plan Selection */}
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

              {/* Client Type */}
              <div className="space-y-2">
                <Label className="text-base font-medium">Tipo de Cliente</Label>
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
              </div>

              {/* Sub-options for existing client */}
              {isNewClient === false && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium text-muted-foreground">Qual a ação?</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      type="button"
                      variant={subscriptionAction === "new" ? "default" : "outline"}
                      className={cn(
                        "h-auto py-3 flex flex-col items-center gap-1 text-xs",
                        subscriptionAction === "new" && "ring-2 ring-primary ring-offset-2"
                      )}
                      onClick={() => handleSelectAction("new")}
                    >
                      <Crown className="w-5 h-5" />
                      <span className="font-medium">Nova</span>
                      <span className="text-[10px] text-muted-foreground">1ª assinatura</span>
                    </Button>
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

          {/* STEP 2: Attribution */}
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

          {/* STEP 3: Summary (read-only) */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3 text-sm">
                <p className="font-bold text-base">Resumo da Assinatura</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{clientName.trim()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Celular:</span>
                    <span className="font-medium">{mobilePhone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plano:</span>
                    <span className="font-medium">{selectedPlan ? `${selectedPlan.name} — R$ ${Number(selectedPlan.price).toFixed(2)}` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ação:</span>
                    <span className="font-medium">
                      {subscriptionAction === "new" ? "🆕 Nova Assinatura" : subscriptionAction === "renew" ? "🔄 Renovação" : subscriptionAction === "upgrade" ? "🔼 Upgrade" : "🔽 Downgrade"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pontos para:</span>
                    <span className="font-medium">{selectedBarberId ? "💈 Barbeiro" : "🏢 Recepção"}</span>
                  </div>
                  {subscriptionAction === "downgrade" && downgradeReason && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Motivo:</span>
                      <span className="font-medium">{downgradeReason}</span>
                    </div>
                  )}
                </div>
              </div>
              {renderClientBadge() && (
                <div>{renderClientBadge()}</div>
              )}
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
              {clientHistory.checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Próximo
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
