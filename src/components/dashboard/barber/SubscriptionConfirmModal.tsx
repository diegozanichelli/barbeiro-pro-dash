import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Crown, X, Check } from "lucide-react";

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

  const handleNoSubscription = () => {
    onOpenChange(false);
    onComplete();
  };

  const handleYesSubscription = async () => {
    setLoading(true);

    try {
      // Registrar transação de assinatura
      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: barberId,
        organization_id: organizationId,
        daily_production_id: dailyProductionId,
        item_type: "subscription",
        item_name: "Venda de Assinatura",
        price_sold: 0, // Valor já contabilizado nos serviços
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
            Esta venda incluiu uma nova Assinatura?
          </DialogTitle>
          <DialogDescription>
            Assinaturas vendidas geram <strong>+10 pontos</strong> no Campeonato
          </DialogDescription>
        </DialogHeader>

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
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                Sim, Vendi uma Assinatura
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
