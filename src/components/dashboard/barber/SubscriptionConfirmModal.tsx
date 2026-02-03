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
import { Loader2, Crown, X, Check, ArrowLeft } from "lucide-react";

interface SubscriptionConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  organizationId: string;
  dailyProductionId: string;
  onComplete: () => void;
}

export default function SubscriptionConfirmModal({
  open,
  onOpenChange,
  barberId,
  organizationId,
  dailyProductionId,
  onComplete,
}: SubscriptionConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"question" | "form">("question");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep("question");
      setSubscriptionPlan("");
      setClientNotes("");
    }
  }, [open]);

  const isFormValid = subscriptionPlan.trim().length > 0 && clientNotes.trim().length > 0;

  const handleNoSubscription = () => {
    onOpenChange(false);
    onComplete();
  };

  const handleYesSubscription = () => {
    setStep("form");
  };

  const handleBack = () => {
    setStep("question");
  };

  const handleConfirmSubscription = async () => {
    if (!isFormValid) return;
    
    setLoading(true);

    try {
      // Registrar transação de assinatura com detalhes
      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: barberId,
        organization_id: organizationId,
        daily_production_id: dailyProductionId,
        item_type: "subscription",
        item_name: `Assinatura ${subscriptionPlan.trim()}`,
        description: clientNotes.trim(),
        price_sold: 0,
        service_category: null,
        catalog_service_id: null,
        catalog_product_id: null,
        commission_rate_used: 0,
        commission_amount: 0,
      });

      if (error) throw error;

      toast.success("Assinatura registrada!", {
        description: "+10 pontos no Campeonato 🏆",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            {step === "question" 
              ? "Esta venda incluiu uma nova Assinatura?" 
              : "Detalhes da Assinatura"}
          </DialogTitle>
          <DialogDescription>
            {step === "question" 
              ? <>Assinaturas vendidas geram <strong>+10 pontos</strong> no Campeonato</>
              : "Preencha os detalhes para registro"}
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
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="subscription-plan">
                Qual o plano vendido? <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subscription-plan"
                placeholder="Ex: Gold, Prata, Duo..."
                value={subscriptionPlan}
                onChange={(e) => setSubscriptionPlan(e.target.value)}
                autoFocus
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

            <DialogFooter className="flex-row gap-3 sm:flex-row mt-6">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleBack}
                disabled={loading}
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleConfirmSubscription}
                disabled={loading || !isFormValid}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar
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
