import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, DollarSign, Sparkles, Scissors, Snowflake, Gift, Users, Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SCENARIOS = [
  {
    id: "cliente_achou_caro",
    label: "💰 Cliente achou caro",
    icon: DollarSign,
    description: "Como justificar o valor",
  },
  {
    id: "oferecer_pomada",
    label: "🧴 Como oferecer pomada?",
    icon: Sparkles,
    description: "Script para venda de produtos",
  },
  {
    id: "mudanca_visual",
    label: "✂️ Sugerir mudança de visual",
    icon: Scissors,
    description: "Incentivar novo estilo",
  },
  {
    id: "cliente_caspa",
    label: "❄️ Cliente com caspa",
    icon: Snowflake,
    description: "Oferecer tratamento delicadamente",
  },
  {
    id: "servico_extra",
    label: "🎁 Oferecer serviço extra",
    icon: Gift,
    description: "Upsell natural",
  },
  {
    id: "fidelizacao",
    label: "👥 Fidelizar cliente",
    icon: Users,
    description: "Garantir retorno",
  },
];

interface SalesHelpModalProps {
  barberId: string;
  organizationId: string;
}

export default function SalesHelpModal({ barberId, organizationId }: SalesHelpModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleScenarioClick = async (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setLoading(true);
    setError(null);
    setScript(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Sessão não encontrada");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("barber-ai-assistant", {
        body: {
          type: "sales_help",
          barberId,
          organizationId,
          scenario: scenarioId,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("Error fetching sales help:", fnError);
        setError("Erro ao gerar script de vendas");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setScript(data?.message || "Script não disponível no momento.");
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedScenario(null);
    setScript(null);
    setError(null);
  };

  const handleCopy = async () => {
    if (script) {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success("Script copiado!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after animation
    setTimeout(() => {
      setSelectedScenario(null);
      setScript(null);
      setError(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 h-14 px-5 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground z-40"
          size="lg"
        >
          <Lightbulb className="w-5 h-5 mr-2" />
          Ajuda para Vender 💡
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            {selectedScenario ? "Script de Vendas" : "Assistente de Vendas IA"}
          </DialogTitle>
          <DialogDescription>
            {selectedScenario
              ? "Leia o script abaixo para o cliente"
              : "Escolha a situação e receba um script na hora"}
          </DialogDescription>
        </DialogHeader>

        {!selectedScenario ? (
          <div className="grid grid-cols-1 gap-3 py-4">
            {SCENARIOS.map((scenario) => (
              <Card
                key={scenario.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-border"
                onClick={() => handleScenarioClick(scenario.id)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-full bg-primary/10">
                    <scenario.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{scenario.label}</p>
                    <p className="text-xs text-muted-foreground">{scenario.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Gerando script...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive mb-4">{error}</p>
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </div>
            ) : (
              <>
                <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
                  <CardContent className="p-4">
                    <p className="text-foreground font-medium leading-relaxed whitespace-pre-wrap">
                      {script}
                    </p>
                  </CardContent>
                </Card>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleBack} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                  </Button>
                  <Button onClick={handleCopy} className="flex-1">
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
