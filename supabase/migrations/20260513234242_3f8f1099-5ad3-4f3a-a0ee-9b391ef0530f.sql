CREATE TABLE IF NOT EXISTS public.performance_alert_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  metas_processadas integer NOT NULL DEFAULT 0,
  alerts_created integer NOT NULL DEFAULT 0,
  alerts_updated integer NOT NULL DEFAULT 0,
  pacing_errors integer NOT NULL DEFAULT 0,
  other_errors integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS idx_perf_alert_run_logs_ran_at
  ON public.performance_alert_run_logs (ran_at DESC);

ALTER TABLE public.performance_alert_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view alert run logs"
  ON public.performance_alert_run_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage alert run logs"
  ON public.performance_alert_run_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));