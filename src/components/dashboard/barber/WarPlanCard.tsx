import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, Target, Moon, Trophy } from "lucide-react";
import { getManausDate } from "@/lib/dateUtils";
import { brl } from "@/lib/currency";

const CLOSING_HOUR = 23;

interface WarPlanCardProps {
  planText: string;
  soldToday?: number;
  dailyTarget?: number;
}

export default function WarPlanCard({ planText, soldToday = 0, dailyTarget = 0 }: WarPlanCardProps) {
  const manausHour = getManausDate().getHours();
  const isClosingTime = manausHour >= CLOSING_HOUR;
  const metGoal = dailyTarget > 0 && soldToday >= dailyTarget;

  if (isClosingTime && dailyTarget > 0) {
    return (
      <Card className={`bg-gradient-to-br ${metGoal ? 'from-success/20 via-success/10' : 'from-orange-500/20 via-orange-500/10'} to-card border-primary/40 shadow-lg`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className={`p-2 rounded-full ${metGoal ? 'bg-success/20' : 'bg-orange-500/20'}`}>
              {metGoal ? <Trophy className="w-5 h-5 text-success" /> : <Moon className="w-5 h-5 text-orange-500" />}
            </div>
            <span className={`${metGoal ? 'text-success' : 'text-orange-500'} uppercase tracking-wide font-bold`}>
              {metGoal ? 'Balanço do Dia 🏆' : 'Balanço do Dia'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-card/60 border border-primary/20 p-4 space-y-2">
            {metGoal ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  🎉 Parabéns! Você bateu a meta diária de {brl(dailyTarget)}!
                </p>
                <p className="text-sm text-muted-foreground">
                  Produção hoje: {brl(soldToday)}. Descanse bem e volte amanhã com a mesma energia! 💪
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  Hoje você produziu {brl(soldToday)} de uma meta de {brl(dailyTarget)}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Faltaram {brl(dailyTarget - soldToday)}. Amanhã é dia de compensar — foco redobrado! 🔥
                </p>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Balanço gerado às {manausHour}h. Bom descanso!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/20 via-primary/10 to-card border-primary/40 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="p-2 rounded-full bg-primary/20">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <span className="text-primary uppercase tracking-wide font-bold">
            Plano de Guerra
          </span>
          <Target className="w-4 h-4 text-primary/60 ml-auto" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-card/60 border border-primary/20 p-4">
          <p className="text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
            {planText}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Plano válido até o final do dia. Foco e execução! 💪
        </p>
      </CardContent>
    </Card>
  );
}
