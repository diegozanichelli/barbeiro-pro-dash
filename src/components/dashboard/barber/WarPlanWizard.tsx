import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Target, Swords, ChevronRight, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { getManausDate } from "@/lib/dateUtils";

interface CatalogService {
  id: string;
  name: string;
  default_price: number;
  category: string;
}

interface WarPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  dailyTarget: number;
  todayRevenue: number;
  onComplete: (planText: string) => void;
}

const LOW_TICKET_THRESHOLD = 30;

export default function WarPlanWizard({
  open,
  onOpenChange,
  organizationId,
  dailyTarget,
  todayRevenue,
  onComplete,
}: WarPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [clientsCount, setClientsCount] = useState("");
  const [services, setServices] = useState<CatalogService[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [planText, setPlanText] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setClientsCount("");
      setSelectedServiceIds([]);
      setPlanText("");
    }
  }, [open]);

  const fetchServices = async () => {
    setLoadingServices(true);
    const { data } = await supabase
      .from("catalog_services")
      .select("id, name, default_price, category")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("default_price", { ascending: false });

    setServices(data || []);
    setLoadingServices(false);
  };

  const handleStep1Next = () => {
    if (!clientsCount || parseInt(clientsCount) <= 0) return;
    fetchServices();
    setStep(2);
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const generatePlan = () => {
    const numClients = parseInt(clientsCount);
    const gapToGoal = Math.max(0, dailyTarget - todayRevenue);
    const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
    const lowTicketServices = services.filter(
      (s) => !selectedServiceIds.includes(s.id) && s.default_price <= LOW_TICKET_THRESHOLD
    );

    if (gapToGoal <= 0) {
      const text = `🎯 Você já atingiu sua meta diária de R$ ${dailyTarget.toFixed(2)}! Continue vendendo para superar o resultado.`;
      setPlanText(text);
      setStep(3);
      return;
    }

    let lines: string[] = [];
    lines.push(`🎯 META DO DIA: R$ ${dailyTarget.toFixed(2)}`);
    if (todayRevenue > 0) {
      lines.push(`✅ Já faturado: R$ ${todayRevenue.toFixed(2)}`);
    }
    lines.push(`⚡ Falta: R$ ${gapToGoal.toFixed(2)}`);
    lines.push(`👥 Clientes na agenda: ${numClients}`);
    lines.push("");

    if (selectedServices.length > 0) {
      const avgSelectedPrice =
        selectedServices.reduce((s, sv) => s + sv.default_price, 0) / selectedServices.length;
      const clientsNeeded = Math.ceil(gapToGoal / avgSelectedPrice);
      const topService = selectedServices[0];

      lines.push(`🔥 ESTRATÉGIA PRINCIPAL:`);
      lines.push(
        `Para bater sua meta de R$ ${gapToGoal.toFixed(2)}, foque em oferecer "${topService.name}" (R$ ${topService.default_price.toFixed(2)}) para ${Math.min(clientsNeeded, numClients)} clientes.`
      );

      if (selectedServices.length > 1) {
        const others = selectedServices.slice(1).map((s) => s.name).join(", ");
        lines.push(`Alterne também com: ${others}.`);
      }
    }

    if (lowTicketServices.length > 0) {
      const bestLow = lowTicketServices[0];
      const avgTicket = numClients > 0 ? gapToGoal / numClients : 0;
      const boostPercent = avgTicket > 0 ? ((bestLow.default_price / avgTicket) * 100).toFixed(0) : "0";

      lines.push("");
      lines.push(`💡 ESTRATÉGIA EXTRA:`);
      lines.push(
        `Adicione "${bestLow.name}" (R$ ${bestLow.default_price.toFixed(2)}) em todos os atendimentos para aumentar seu ticket médio em ${boostPercent}%.`
      );

      if (lowTicketServices.length > 1) {
        const otherLow = lowTicketServices
          .slice(1, 3)
          .map((s) => `${s.name} (R$ ${s.default_price.toFixed(2)})`)
          .join(", ");
        lines.push(`Outras opções rápidas: ${otherLow}.`);
      }
    }

    lines.push("");
    lines.push(`💪 Bora pra cima! Cada cliente é uma oportunidade.`);

    const text = lines.join("\n");
    setPlanText(text);
    setStep(3);
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
            {step === 1 && "Sua Agenda"}
            {step === 2 && "Suas Armas"}
            {step === 3 && "Plano de Guerra"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Vamos montar sua estratégia do dia!"}
            {step === 2 && "Em quais serviços você está mais confiante hoje?"}
            {step === 3 && "Sua missão está definida. Execute!"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-2 justify-center py-2">
          {[1, 2, 3].map((s) => (
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
            />
            <Button
              className="w-full"
              onClick={handleStep1Next}
              disabled={!clientsCount || parseInt(clientsCount) <= 0}
            >
              Próximo
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            {loadingServices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedServiceIds.includes(service.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedServiceIds.includes(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{service.name}</p>
                        <p className="text-xs text-muted-foreground">
                          R$ {service.default_price.toFixed(2)} • {service.category === "basic" ? "Básico" : "Extra"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <Button
                  className="w-full"
                  onClick={generatePlan}
                  disabled={selectedServiceIds.length === 0}
                >
                  <Target className="w-4 h-4 mr-1" />
                  Gerar Plano de Guerra
                </Button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
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
