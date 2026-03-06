import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Bot, Sparkles, DollarSign, Scissors, Snowflake, Gift, Users, 
  Loader2, ArrowLeft, Copy, Check, Lightbulb
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AIDailyCoachCard from "./AIDailyCoachCard";
import CoachingNudgeCard from "./CoachingNudgeCard";
import WarPlanCard from "./WarPlanCard";

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

interface AITipsTabProps {
  barberId: string;
  organizationId: string;
  barberName: string;
  monthlyGoal: number;
  soldToday: number;
  soldThisMonth: number;
  daysRemaining: number;
  dailyTarget: number;
  warPlan?: string | null;
}

export default function AITipsTab({
  barberId,
  organizationId,
  barberName,
  monthlyGoal,
  soldToday,
  soldThisMonth,
  daysRemaining,
  dailyTarget,
  warPlan,
}: AITipsTabProps) {
  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleScenarioClick = async (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setDialogOpen(true);
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

  const handleCopy = async () => {
    if (script) {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success("Script copiado!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setTimeout(() => {
      setSelectedScenario(null);
      setScript(null);
      setError(null);
    }, 200);
  };

  const selectedScenarioData = SCENARIOS.find(s => s.id === selectedScenario);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <div className="p-2 rounded-full bg-primary/10">
          <Bot className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Dicas da IA</h2>
          <p className="text-sm text-muted-foreground">Suas ferramentas de inteligência artificial</p>
        </div>
      </div>

      {/* Plano de Guerra ou Dica do Coach IA */}
      {warPlan ? (
        <WarPlanCard planText={warPlan} />
      ) : (
        <AIDailyCoachCard
          barberId={barberId}
          organizationId={organizationId}
          barberName={barberName}
          monthlyGoal={monthlyGoal}
          soldToday={soldToday}
          soldThisMonth={soldThisMonth}
          daysRemaining={daysRemaining}
          dailyTarget={dailyTarget}
        />
      )}

      {/* Dica de Vendas */}
      <CoachingNudgeCard barberId={barberId} />

      {/* Scripts de Venda */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <Lightbulb className="w-5 h-5" />
            SCRIPTS DE VENDA
          </CardTitle>
          <CardDescription>
            Escolha uma situação e receba um script personalizado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SCENARIOS.map((scenario) => (
              <Card
                key={scenario.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-border hover:border-primary/50"
                onClick={() => handleScenarioClick(scenario.id)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2 rounded-full bg-primary/10 shrink-0">
                    <scenario.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{scenario.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{scenario.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog para Script */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedScenarioData && (
                <>
                  <selectedScenarioData.icon className="w-5 h-5 text-primary" />
                  {selectedScenarioData.label}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Leia o script abaixo para o cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Gerando script...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive mb-4">{error}</p>
                <Button variant="outline" onClick={handleCloseDialog}>
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
                  <Button variant="outline" onClick={handleCloseDialog} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Fechar
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
