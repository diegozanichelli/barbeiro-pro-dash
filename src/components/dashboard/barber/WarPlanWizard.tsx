import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Target, Swords, ChevronRight, Sparkles, AlertCircle } from "lucide-react";

interface WarPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  barberId: string;
  barberName: string;
  monthlyGoal: number;
  soldThisMonth: number;
  dailyTarget: number;
  todayRevenue: number;
  daysRemaining: number;
  onComplete: (planText: string) => void;
}

export default function WarPlanWizard({
  open,
  onOpenChange,
  organizationId,
  barberId,
  barberName,
  monthlyGoal,
  soldThisMonth,
  dailyTarget,
  todayRevenue,
  daysRemaining,
  onComplete,
}: WarPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [clientsCount, setClientsCount] = useState("");
  const [planText, setPlanText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setClientsCount("");
      setPlanText("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const generatePlan = async () => {
    const numClients = parseInt(clientsCount) || 0;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("barber-ai-assistant", {
        body: {
          type: "war_plan",
          barberId,
          organizationId,
          barberName,
          monthlyGoal,
          soldThisMonth,
          dailyTarget,
          todayRevenue,
          daysRemaining,
          clientsInAgenda: numClients,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("War plan error:", fnError);
        setError("Não consegui gerar o plano agora. Tenta de novo em alguns segundos.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      const text = (data?.message || "").trim();
      if (!text) {
        setError("Resposta vazia do servidor. Tenta novamente.");
        setLoading(false);
        return;
      }

      setPlanText(text);
      setStep(2);
    } catch (err) {
      console.error("War plan unexpected error:", err);
      setError("Erro inesperado. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    onComplete(planText);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Swords className="w-5 h-5 text-primary" />
            {step === 1 ? "Sua Agenda" : "Plano de Guerra"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Em 5 segundos monto um briefing com seus dados reais."
              : "Briefing executivo baseado nos seus últimos 30 dias."}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de passos */}
        <div className="flex gap-2 justify-center py-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step ? "w-8 bg-primary" : s < step ? "w-8 bg-primary/40" : "w-8 bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <label className="text-sm font-medium text-foreground">
              Quantos clientes na agenda hoje?
            </label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Ex: 8"
              value={clientsCount}
              onChange={(e) => setClientsCount(e.target.value.replace(/\D/g, ""))}
              onFocus={(e) => e.target.select()}
              className="text-center text-2xl font-bold h-14"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground text-center">
              Pode digitar 0 se ainda não souber — vou usar seu histórico.
            </p>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={generatePlan}
              disabled={loading || clientsCount === ""}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando seus dados...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-1" />
                  Gerar Plano de Guerra
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <Card className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-primary/30">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                  {planText}
                </p>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={handleFinish}>
              <Sparkles className="w-4 h-4 mr-1" />
              Fechar e Ver no Painel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
