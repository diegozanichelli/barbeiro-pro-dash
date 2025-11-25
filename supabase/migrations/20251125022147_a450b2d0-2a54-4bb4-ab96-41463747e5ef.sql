-- Create performance_alerts table
CREATE TABLE public.performance_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  mes_referencia DATE NOT NULL, -- Data referente ao mês (ex: 2025-01-01)
  alerta_tipo TEXT NOT NULL CHECK (alerta_tipo IN ('Abaixo do Ritmo', 'Meta Impossível', 'Risco Moderado')),
  valor_deficit_r$ NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentual_atingido NUMERIC(5,2), -- Percentual da meta atingida até o momento
  dias_restantes INTEGER, -- Dias úteis restantes no mês
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'resolvido', 'ignorado')),
  UNIQUE(barber_id, mes_referencia, alerta_tipo)
);

-- Enable RLS
ALTER TABLE public.performance_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for performance_alerts
CREATE POLICY "Managers can view alerts in their organization"
ON public.performance_alerts
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can view all alerts"
ON public.performance_alerts
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "System can manage all alerts"
ON public.performance_alerts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_performance_alerts_organization ON public.performance_alerts(organization_id);
CREATE INDEX idx_performance_alerts_barber ON public.performance_alerts(barber_id);
CREATE INDEX idx_performance_alerts_status ON public.performance_alerts(status);
CREATE INDEX idx_performance_alerts_mes ON public.performance_alerts(mes_referencia);

-- Trigger for updated_at
CREATE TRIGGER update_performance_alerts_updated_at
BEFORE UPDATE ON public.performance_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;