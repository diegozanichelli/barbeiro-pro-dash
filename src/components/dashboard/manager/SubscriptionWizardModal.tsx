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
  Scissors 
} from "lucide-react";
import { cn } from "@/lib/utils";
import BarberCombobox from "./BarberCombobox";
import { getTodayString } from "@/lib/dateUtils";

interface SubscriptionWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onComplete: () => void;
}

interface Unit {
  id: string;
  name: string;
}

type WizardStep = "client_type" | "attribution" | "details";

export default function SubscriptionWizardModal({
  open,
  onOpenChange,
  organizationId,
  onComplete,
}: SubscriptionWizardModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<WizardStep>("client_type");
  
  // Pergunta 1: Tipo de Cliente (Conversão)
  const [isNewClient, setIsNewClient] = useState<boolean | null>(null);
  
  // Pergunta 2: Atribuição (Gamificação)
  const [attributionType, setAttributionType] = useState<"reception" | "barber" | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  
  // Pergunta 3: Detalhes
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [clientName, setClientName] = useState("");

  // Fetch units on mount
  useEffect(() => {
    const fetchUnits = async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      
      if (!error && data) {
        setUnits(data);
      }
    };
    fetchUnits();
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("client_type");
      setIsNewClient(null);
      setAttributionType(null);
      setSelectedBarberId(null);
      setSelectedUnitId(null);
      setSubscriptionPlan("");
      setClientName("");
    }
  }, [open]);

  const handleBack = () => {
    if (step === "attribution") {
      setStep("client_type");
    } else if (step === "details") {
      setStep("attribution");
    }
  };

  const handleNext = () => {
    if (step === "client_type" && isNewClient !== null) {
      setStep("attribution");
    } else if (step === "attribution") {
      if (attributionType === "reception" && selectedUnitId) {
        setSelectedBarberId(null);
        setStep("details");
      } else if (attributionType === "barber" && selectedBarberId) {
        setStep("details");
      }
    }
  };

  const canProceed = () => {
    if (step === "client_type") {
      return isNewClient !== null;
    }
    if (step === "attribution") {
      if (attributionType === "reception") return !!selectedUnitId;
      if (attributionType === "barber") return !!selectedBarberId;
      return false;
    }
    if (step === "details") {
      return subscriptionPlan.trim().length > 0 && clientName.trim().length > 0;
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;
    
    setLoading(true);
    const today = getTodayString();

    try {
      // Get or create daily production if barber is selected
      let productionId: string | null = null;
      let unitIdToSave: string | null = selectedUnitId;
      
      if (selectedBarberId) {
        // Get barber's unit_id for the transaction
        const { data: barberData } = await supabase
          .from("barbers")
          .select("unit_id")
          .eq("id", selectedBarberId)
          .single();
        
        if (barberData) {
          unitIdToSave = barberData.unit_id;
        }

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

      // Insert subscription transaction with unit_id
      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: selectedBarberId,
        organization_id: organizationId,
        daily_production_id: productionId,
        unit_id: unitIdToSave,
        item_type: "subscription",
        item_name: `Assinatura ${subscriptionPlan.trim()}`,
        description: clientName.trim(),
        price_sold: 0,
        service_category: null,
        catalog_service_id: null,
        catalog_product_id: null,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "manager",
        is_new_client: isNewClient,
      } as any);

      if (error) throw error;

      const attribution = selectedBarberId ? "do barbeiro" : "da Recepção";
      const conversionLabel = isNewClient ? "🆕 Cliente Novo" : "🏠 Cliente da Casa";
      
      toast.success(`Assinatura registrada!`, {
        description: `${conversionLabel} • Pontos ${attribution} • +10 pts 🏆`,
      });

      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error("Erro ao registrar assinatura:", error);
      toast.error("Erro ao registrar assinatura");
    } finally {
      setLoading(false);
    }
  };

  const getStepNumber = () => {
    if (step === "client_type") return 1;
    if (step === "attribution") return 2;
    return 3;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            Vender Assinatura
          </DialogTitle>
          <DialogDescription>
            Passo {getStepNumber()} de 3 — {
              step === "client_type" 
                ? "Tipo de Cliente" 
                : step === "attribution" 
                  ? "Atribuição de Pontos"
                  : "Detalhes do Plano"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* STEP 1: Tipo de Cliente (Conversão) */}
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
                  onClick={() => setIsNewClient(true)}
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
                  onClick={() => setIsNewClient(false)}
                >
                  <Users className="w-6 h-6" />
                  <span className="font-medium">Já é Cliente</span>
                  <span className="text-xs text-muted-foreground">Cliente da casa</span>
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Atribuição (Gamificação) */}
          {step === "attribution" && (
            <div className="space-y-4">
              <Label className="text-base font-medium">
                Quem realizou essa venda?
              </Label>
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

              {/* Unit Selector (if reception attribution) */}
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
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Isso permite rastrear qual recepção vendeu mais assinaturas
                  </p>
                </div>
              )}

              {/* Barber Selector (if barber attribution) */}
              {attributionType === "barber" && (
                <div className="space-y-2 pt-2">
                  <Label>Selecione o barbeiro:</Label>
                  <BarberCombobox
                    organizationId={organizationId}
                    value={selectedBarberId}
                    onChange={setSelectedBarberId}
                    placeholder="Buscar barbeiro..."
                    allowReception={false}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Detalhes */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subscription-plan">
                  Qual o plano vendido? <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="subscription-plan"
                  placeholder="Ex: Gold, Prata, Black, Duo..."
                  value={subscriptionPlan}
                  onChange={(e) => setSubscriptionPlan(e.target.value)}
                  autoFocus
                />
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
                <p>• Cliente: {isNewClient ? "🆕 Novo" : "🏠 Da casa"}</p>
                <p>• Pontos para: {selectedBarberId ? "💈 Barbeiro selecionado" : "🏢 Recepção (sem pontos)"}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-3 sm:flex-row">
          {step !== "client_type" ? (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleBack}
              disabled={loading}
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
          )}
          
          {step === "details" ? (
            <Button
              className="flex-1 gap-2"
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Registrar
                </>
              )}
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Próximo
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
