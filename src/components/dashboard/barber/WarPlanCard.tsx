import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords, Target } from "lucide-react";

interface WarPlanCardProps {
  planText: string;
}

export default function WarPlanCard({ planText }: WarPlanCardProps) {
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
