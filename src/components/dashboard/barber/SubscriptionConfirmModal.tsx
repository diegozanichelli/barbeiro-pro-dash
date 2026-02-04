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
import { Loader2, Crown, X, Check, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import BarberCombobox from "../manager/BarberCombobox";

interface SubscriptionEntry {
  id: string;
  plan: string;
  clientNotes: string;
}

interface SubscriptionConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string | null;
  organizationId: string;
  dailyProductionId: string | null;
  onComplete: () => void;
  /** If true, opens directly in form mode (for standalone subscription sales) */
  standaloneMode?: boolean;
  /** If true, shows a barber selector (for manager use) */
  showBarberSelector?: boolean;
}

export default function SubscriptionConfirmModal({
  open,
  onOpenChange,
  barberId: initialBarberId,
  organizationId,
  dailyProductionId,
  onComplete,
  standaloneMode = false,
  showBarberSelector = false,
}: SubscriptionConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"question" | "form">(standaloneMode ? "form" : "question");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  
  // Barber selection for manager mode
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(initialBarberId);
  
  // List of subscriptions to be saved
  const [subscriptionList, setSubscriptionList] = useState<SubscriptionEntry[]>([]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep(standaloneMode ? "form" : "question");
      setSubscriptionPlan("");
      setClientNotes("");
      setSubscriptionList([]);
      setSelectedBarberId(initialBarberId);
    }
  }, [open, standaloneMode, initialBarberId]);

  // Update step when standaloneMode changes while open
  useEffect(() => {
    if (open && standaloneMode) {
      setStep("form");
    }
  }, [standaloneMode, open]);

  // Update selectedBarberId when initialBarberId changes
  useEffect(() => {
    setSelectedBarberId(initialBarberId);
  }, [initialBarberId]);

  const isFormValid = subscriptionPlan.trim().length > 0 && clientNotes.trim().length > 0;
  const hasSubscriptions = subscriptionList.length > 0;

  const handleNoSubscription = () => {
    onOpenChange(false);
    onComplete();
  };

  const handleYesSubscription = () => {
    setStep("form");
  };

  const handleBack = () => {
    if (standaloneMode) {
      // In standalone mode, just close the modal
      onOpenChange(false);
    } else {
      setStep("question");
    }
  };

  const handleAddToList = () => {
    if (!isFormValid) return;
    
    const newEntry: SubscriptionEntry = {
      id: crypto.randomUUID(),
      plan: subscriptionPlan.trim(),
      clientNotes: clientNotes.trim(),
    };
    
    setSubscriptionList(prev => [...prev, newEntry]);
    setSubscriptionPlan("");
    setClientNotes("");
    
    toast.success("Assinatura adicionada à lista!");
  };

  const handleRemoveFromList = (id: string) => {
    setSubscriptionList(prev => prev.filter(item => item.id !== id));
  };

  const handleConfirmSubscriptions = async () => {
    if (subscriptionList.length === 0) {
      toast.error("Adicione pelo menos uma assinatura à lista");
      return;
    }
    
    setLoading(true);

    try {
      // Get or create daily production if not provided (only if selectedBarberId exists)
      // For reception sales (selectedBarberId = null), we don't need a daily_production
      let productionId: string | null = dailyProductionId;
      
      if (!productionId && selectedBarberId) {
        const today = new Date().toISOString().split("T")[0];
        
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
              date: new Date().toISOString().split("T")[0],
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

      // Insert each subscription as a separate transaction
      // selectedBarberId and productionId can be null for reception sales
      // source='barber' for barber self-registration, 'manager' for manager registration
      const source = showBarberSelector ? "manager" : "barber";
      const transactions = subscriptionList.map(sub => ({
        barber_id: selectedBarberId || null,
        organization_id: organizationId,
        daily_production_id: productionId || null,
        item_type: "subscription",
        item_name: `Assinatura ${sub.plan}`,
        description: sub.clientNotes,
        price_sold: 0,
        service_category: null,
        catalog_service_id: null,
        catalog_product_id: null,
        commission_rate_used: 0,
        commission_amount: 0,
        source, // 'barber' or 'manager'
      }));

      const { error } = await supabase.from("sale_transactions").insert(transactions);

      if (error) throw error;

      const totalPoints = subscriptionList.length * 10;
      toast.success(
        `${subscriptionList.length} ${subscriptionList.length === 1 ? 'assinatura registrada' : 'assinaturas registradas'}!`,
        {
          description: `+${totalPoints} pontos no Campeonato 🏆`,
        }
      );

      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error("Erro ao registrar assinaturas:", error);
      toast.error("Erro ao registrar assinaturas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            {step === "question" 
              ? "Esta venda incluiu uma nova Assinatura?" 
              : standaloneMode 
                ? "Registrar Assinaturas Avulsas" 
                : "Detalhes da Assinatura"}
          </DialogTitle>
          <DialogDescription>
            {step === "question" 
              ? <>Assinaturas vendidas geram <strong>+10 pontos</strong> no Campeonato</>
              : "Adicione uma ou mais assinaturas à lista"}
          </DialogDescription>
        </DialogHeader>

        {step === "question" ? (
          <DialogFooter className="flex-row gap-3 sm:flex-row mt-4">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleNoSubscription}
              disabled={loading}
            >
              <X className="w-4 h-4" />
              Não
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleYesSubscription}
              disabled={loading}
            >
              <Check className="w-4 h-4" />
              Sim, Incluiu
            </Button>
          </DialogFooter>
        ) : (
          <div className="flex-1 flex flex-col space-y-4 mt-4 overflow-hidden">
            {/* Barber Selector (for manager mode) */}
            {showBarberSelector && (
              <div className="space-y-2">
                <Label>
                  Atribuir ao barbeiro
                </Label>
                <BarberCombobox
                  organizationId={organizationId}
                  value={selectedBarberId}
                  onChange={setSelectedBarberId}
                  placeholder="Selecionar barbeiro..."
                  allowReception={true}
                />
              </div>
            )}
            
            {/* Form Fields */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="subscription-plan">
                  Qual o plano vendido? <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="subscription-plan"
                  placeholder="Ex: Gold, Prata, Duo..."
                  value={subscriptionPlan}
                  onChange={(e) => setSubscriptionPlan(e.target.value)}
                  autoFocus={!showBarberSelector}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-notes">
                  Nome do Cliente / Obs <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="client-notes"
                  placeholder="Nome do cliente para conferência"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={handleAddToList}
                disabled={!isFormValid}
              >
                <Plus className="w-4 h-4" />
                Adicionar à Lista (+)
              </Button>
            </div>

            {/* Subscription List */}
            {subscriptionList.length > 0 && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">
                    Assinaturas a Registrar ({subscriptionList.length})
                  </Label>
                  <span className="text-xs text-primary font-bold">
                    +{subscriptionList.length * 10} pts
                  </span>
                </div>
                <ScrollArea className="flex-1 border rounded-md p-2 max-h-40">
                  <div className="space-y-2">
                    {subscriptionList.map((sub, index) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{index + 1}. {sub.plan}</span>
                          <span className="text-muted-foreground"> — {sub.clientNotes}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleRemoveFromList(sub.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Footer Buttons */}
            <DialogFooter className="flex-row gap-3 sm:flex-row mt-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleBack}
                disabled={loading}
              >
                <ArrowLeft className="w-4 h-4" />
                {standaloneMode ? "Cancelar" : "Voltar"}
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleConfirmSubscriptions}
                disabled={loading || !hasSubscriptions}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Concluir ({subscriptionList.length})
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
