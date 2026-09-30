import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Lock, CheckCircle2, Settings } from "lucide-react";
import { ChampionshipBarber, getTicketTier } from "@/hooks/useChampionshipPoints";
import { ChampionshipConfig, DEFAULT_CHAMPIONSHIP_CONFIG } from "@/hooks/useChampionshipConfig";
import { Button } from "@/components/ui/button";
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
  config?: ChampionshipConfig;
  onConfigure?: () => void;
}

export default function ChampionshipLeaderboard({
  data,
  championshipName,
  config = DEFAULT_CHAMPIONSHIP_CONFIG,
  onConfigure,
}: ChampionshipLeaderboardProps) {
  const getPosition = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    if (index < 3) return medals[index];
    return `${index + 1}º`;
  };

  const Metric = ({
    label,
    points,
    explanation,
    dimmed,
    negative,
  }: {
    label: string;
    points: number;
    explanation: string;
    dimmed: boolean;
    negative?: boolean;
  }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="text-left">
          <span className="text-muted-foreground">{label}:</span>
          <span
            className={`ml-1 font-semibold ${
              dimmed ? "text-muted-foreground" : negative ? "text-destructive" : "text-foreground"
            }`}
          >
            {points} pts
          </span>
        </TooltipTrigger>
        <TooltipContent>{explanation}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-warning" />
              🏆 {championshipName}
            </CardTitle>
            <CardDescription>
              {config.validation_enabled
                ? `Ranking por pontos - Validado com faturamento mínimo de ${brl(config.min_revenue)}`
                : "Ranking por pontos de gamificação"}
            </CardDescription>
          </div>
          {onConfigure && (
            <Button variant="outline" size="sm" onClick={onConfigure}>
              <Settings className="mr-2 h-4 w-4" />
              Configurar Campanha
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {data.map((barber, index) => {
            const dimmed = !barber.is_validated;
            return (
              <div
                key={barber.barber_id}
                className={`relative p-4 rounded-lg transition-colors ${
                  dimmed
                    ? "bg-muted/30 opacity-60"
                    : index < 3
                      ? "bg-gradient-to-r from-warning/20 to-primary/20 border border-warning/30"
                      : "bg-secondary/50 hover:bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`${
                        index < 3 ? "text-3xl" : "text-xl font-bold text-muted-foreground w-10 text-center"
                      }`}
                    >
                      {getPosition(index)}
                    </span>

                    {config.validation_enabled && (
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
                              : `🔒 Bloqueado - Falta ${brl(
                                  Math.max(config.min_revenue - barber.total_revenue, 0)
                                )} para validar`}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <div>
                      <p className={`font-bold ${dimmed ? "text-muted-foreground" : ""}`}>
                        {barber.barber_name}
                      </p>
                      <p className="text-sm text-muted-foreground">({barber.unit_name})</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-2xl font-bold ${dimmed ? "text-muted-foreground" : "text-warning"}`}>
                      {barber.total_points} pts
                    </p>
                    <p className="text-xs text-muted-foreground">
                      R$ {int(barber.total_revenue)} faturado
                    </p>
                  </div>
                </div>

                {/* Points Breakdown */}
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                  {config.revenue_enabled && (
                    <Metric
                      label="Faturamento"
                      points={barber.points_faturamento}
                      dimmed={dimmed}
                      explanation={`${brl(barber.total_revenue)} ÷ 1000 × ${
                        config.revenue_points_per_1000
                      } = ${barber.points_faturamento} pts`}
                    />
                  )}
                  {config.ticket_enabled && (
                    <Metric
                      label="Ticket"
                      points={barber.points_ticket}
                      dimmed={dimmed}
                      explanation={`Ticket médio ${brl(barber.ticket_medio)} - ${getTicketTier(
                        barber.ticket_medio,
                        config
                      )}`}
                    />
                  )}
                  {config.products_enabled && (
                    <Metric
                      label="Produtos"
                      points={barber.points_produtos}
                      dimmed={dimmed}
                      explanation={`${barber.products_count} produtos × ${config.product_points} = ${barber.points_produtos} pts`}
                    />
                  )}
                  {config.extras_enabled && (
                    <Metric
                      label="Extras"
                      points={barber.points_extras}
                      dimmed={dimmed}
                      explanation={`${barber.extras_count} extras × ${config.extra_points} pts (${barber.extras_high_count} acima de ${brl(
                        config.extra_high_threshold
                      )} valem ${config.extra_high_multiplier}×) = ${barber.points_extras} pts`}
                    />
                  )}
                  {config.subscriptions_enabled && (
                    <Metric
                      label="Assinaturas"
                      points={barber.points_assinaturas}
                      dimmed={dimmed}
                      explanation={`${barber.subscriptions_count} assinaturas × ${config.subscription_points} pts, com o peso de cada plano = ${barber.points_assinaturas} pts`}
                    />
                  )}
                  {(config.penalty_unconverted_enabled || config.penalty_dayoff_enabled) && (
                    <Metric
                      label="Penalidades"
                      points={barber.points_penalties}
                      dimmed={dimmed}
                      negative
                      explanation={[
                        config.penalty_unconverted_enabled
                          ? `${barber.new_clients_unconverted} clientes novos sem adesão × -${config.penalty_unconverted_points} pts`
                          : null,
                        config.penalty_dayoff_enabled
                          ? `${barber.days_off_count} folgas/faltas × -${config.penalty_dayoff_points} pts`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    />
                  )}
                </div>
              </div>
            );
          })}

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
