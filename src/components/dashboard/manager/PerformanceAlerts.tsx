import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { getManausDate } from "@/lib/dateUtils";

interface PerformanceAlert {
  id: string;
  barber_id: string;
  alerta_tipo: string;
  valor_deficit_r$: number;
  percentual_atingido: number;
  dias_restantes: number;
  created_at: string;
  barber: {
    name: string;
  } | null;
}

export function PerformanceAlerts() {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['performance-alerts'],
    queryFn: async () => {
      // Calcular primeiro dia do mês atual para filtrar apenas alertas do mês vigente
      const hoje = getManausDate();
      const primeiroDiaMes = startOfMonth(hoje);
      const mesReferenciaStr = format(primeiroDiaMes, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from('performance_alerts')
        .select(`
          *,
          barber:barbers(name)
        `)
        .eq('status', 'ativo')
        .eq('mes_referencia', mesReferenciaStr)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PerformanceAlert[];
    },
  });

  const handleResolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('performance_alerts')
      .update({ status: 'resolvido' })
      .eq('id', alertId);

    if (error) {
      toast.error('Erro ao resolver alerta');
      return;
    }

    toast.success('Alerta resolvido');
    refetch();
  };

  const handleIgnoreAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('performance_alerts')
      .update({ status: 'ignorado' })
      .eq('id', alertId);

    if (error) {
      toast.error('Erro ao ignorar alerta');
      return;
    }

    toast.success('Alerta ignorado');
    refetch();
  };

  const getAlertColor = (tipo: string) => {
    switch (tipo) {
      case 'Meta Impossível':
        return 'destructive';
      case 'Abaixo do Ritmo':
        return 'default';
      case 'Risco Moderado':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getAlertIcon = (tipo: string) => {
    switch (tipo) {
      case 'Meta Impossível':
        return <X className="h-4 w-4" />;
      case 'Abaixo do Ritmo':
        return <TrendingDown className="h-4 w-4" />;
      case 'Risco Moderado':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  // Filtrar apenas alertas com barbeiros válidos (da mesma organização)
  const filteredAlerts = alerts?.filter(alert => alert.barber !== null) || [];
  const activeAlertsCount = filteredAlerts.length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alertas de Performance</CardTitle>
          <CardDescription>Carregando alertas...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Alertas de Performance
                    {activeAlertsCount > 0 && (
                      <Badge variant="destructive">
                        {activeAlertsCount}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {activeAlertsCount === 0 
                      ? "Todos os barbeiros estão no ritmo esperado"
                      : `${activeAlertsCount} barbeiro(s) em risco`}
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {activeAlertsCount === 0 ? (
              <Alert>
                <AlertDescription>
                  Nenhum alerta ativo no momento. Todos os barbeiros estão no ritmo esperado! 🎉
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {filteredAlerts.map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={getAlertColor(alert.alerta_tipo)} className="flex items-center gap-1">
                            {getAlertIcon(alert.alerta_tipo)}
                            {alert.alerta_tipo}
                          </Badge>
                          <span className="font-semibold truncate">{alert.barber?.name ?? 'Barbeiro Removido'}</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Deficit</p>
                            <p className="font-medium text-destructive">
                              R$ {alert.valor_deficit_r$.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">% Atingido</p>
                            <p className="font-medium">
                              {alert.percentual_atingido.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Dias Restantes</p>
                            <p className="font-medium">
                              {alert.dias_restantes}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveAlert(alert.id);
                          }}
                        >
                          Resolver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleIgnoreAlert(alert.id);
                          }}
                        >
                          Ignorar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
