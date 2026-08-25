import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Lock, CheckCircle2 } from "lucide-react";
import { ChampionshipBarber, getTicketTier } from "@/hooks/useChampionshipPoints";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { brl, int } from "@/lib/currency";

interface ChampionshipLeaderboardProps {
  data: ChampionshipBarber[];
  championshipName: string;
}

export default function ChampionshipLeaderboard({ data, championshipName }: ChampionshipLeaderboardProps) {
  const getPosition = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    if (index < 3) return medals[index];
    return `${index + 1}º`;
  };

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-warning" />
          🏆 {championshipName}
        </CardTitle>
        <CardDescription>
          Ranking por pontos de gamificação - Validado com faturamento mínimo de R$ 15.000
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {data.map((barber, index) => (
            <div
              key={barber.barber_id}
              className={`relative p-4 rounded-lg transition-colors ${
                !barber.is_validated 
                  ? "bg-muted/30 opacity-60" 
                  : index < 3 
                    ? "bg-gradient-to-r from-warning/20 to-primary/20 border border-warning/30" 
                    : "bg-secondary/50 hover:bg-secondary"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Position */}
                  <span className={`${index < 3 ? "text-3xl" : "text-xl font-bold text-muted-foreground w-10 text-center"}`}>
                    {getPosition(index)}
                  </span>

                  {/* Validation Status */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        {barber.is_validated ? (
                          <CheckCircle2 className="w-6 h-6 text-success" />
                        ) : (
                          <Lock className="w-6 h-6 text-muted-foreground" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent>
                        {barber.is_validated 
                          ? `✅ Validado - Faturamento: ${brl(barber.total_revenue)}`
                          : `🔒 Bloqueado - Falta ${brl(15000 - barber.total_revenue)} para validar`
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Name and Unit */}
                  <div>
                    <p className={`font-bold ${!barber.is_validated ? "text-muted-foreground" : ""}`}>
                      {barber.barber_name}
                    </p>
                    <p className="text-sm text-muted-foreground">({barber.unit_name})</p>
                  </div>
                </div>

                {/* Points */}
                <div className="text-right">
                  <p className={`text-2xl font-bold ${!barber.is_validated ? "text-muted-foreground" : "text-warning"}`}>
                    {barber.total_points} pts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    R$ {int(barber.total_revenue)} faturado
                  </p>
                </div>
              </div>

              {/* Points Breakdown */}
              <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <span className="text-muted-foreground">Faturamento:</span>
                      <span className={`ml-1 font-semibold ${!barber.is_validated ? "text-muted-foreground" : "text-foreground"}`}>
                        {barber.points_faturamento} pts
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {brl(barber.total_revenue)} ÷ 1000 × 10 = {barber.points_faturamento} pts
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <span className="text-muted-foreground">Ticket:</span>
                      <span className={`ml-1 font-semibold ${!barber.is_validated ? "text-muted-foreground" : "text-foreground"}`}>
                        {barber.points_ticket} pts
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Ticket Médio: {brl(barber.ticket_medio)} - {getTicketTier(barber.ticket_medio)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <span className="text-muted-foreground">Produtos:</span>
                      <span className={`ml-1 font-semibold ${!barber.is_validated ? "text-muted-foreground" : "text-foreground"}`}>
                        {barber.points_produtos} pts
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {barber.products_count} produtos × 5 = {barber.points_produtos} pts
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <span className="text-muted-foreground">Extras:</span>
                      <span className={`ml-1 font-semibold ${!barber.is_validated ? "text-muted-foreground" : "text-foreground"}`}>
                        {barber.points_extras} pts
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {barber.extras_count} serviços extras × 3 = {barber.points_extras} pts
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      <span className="text-muted-foreground">Assinaturas:</span>
                      <span className={`ml-1 font-semibold ${!barber.is_validated ? "text-muted-foreground" : "text-foreground"}`}>
                        {barber.points_assinaturas} pts
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {barber.subscriptions_count} assinaturas × 10 = {barber.points_assinaturas} pts
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ))}

          {data.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado de produção encontrado para o período selecionado.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
