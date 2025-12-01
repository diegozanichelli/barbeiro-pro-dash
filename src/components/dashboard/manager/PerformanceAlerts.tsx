import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['performance-alerts'],
    queryFn: async () => {
      // Calcular primeiro dia do mês atual para filtrar apenas alertas do mês vigente
      const hoje = new Date();
      const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const mesReferenciaStr = primeiroDiaMes.toISOString().split('T')[0];

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

  const activeAlertsCount = alerts?.length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Alertas de Performance
              {activeAlertsCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {activeAlertsCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Barbeiros em risco de não atingir a meta do mês
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeAlertsCount === 0 ? (
          <Alert>
            <AlertDescription>
              Nenhum alerta ativo no momento. Todos os barbeiros estão no ritmo esperado! 🎉
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {alerts?.filter(alert => alert.barber !== null).map((alert) => (
              <Card key={alert.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={getAlertColor(alert.alerta_tipo)} className="flex items-center gap-1">
                          {getAlertIcon(alert.alerta_tipo)}
                          {alert.alerta_tipo}
                        </Badge>
                        <span className="font-semibold">{alert.barber?.name ?? 'Barbeiro Removido'}</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Deficit</p>
                          <p className="font-medium text-destructive">
                            R$ {alert.valor_deficit_r$.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">% Atingido</p>
                          <p className="font-medium">
                            {alert.percentual_atingido.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Dias Restantes</p>
                          <p className="font-medium">
                            {alert.dias_restantes} dias
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Alerta criado em {new Date(alert.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        Resolver
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleIgnoreAlert(alert.id)}
                      >
                        Ignorar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
