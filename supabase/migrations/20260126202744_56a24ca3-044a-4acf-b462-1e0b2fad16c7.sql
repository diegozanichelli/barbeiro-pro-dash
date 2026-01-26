-- Create table to track AI assistant usage
CREATE TABLE public.ai_assistant_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('daily_insight', 'sales_help')),
  scenario TEXT, -- For sales_help, stores which scenario was used
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_assistant_usage ENABLE ROW LEVEL SECURITY;

-- Policy for barbers to insert their own usage
CREATE POLICY "Barbers can insert their own usage"
ON public.ai_assistant_usage
FOR INSERT
WITH CHECK (
  barber_id IN (
    SELECT id FROM public.barbers 
    WHERE user_id = auth.uid()
  )
);

-- Policy for managers to view usage in their organization
CREATE POLICY "Managers can view organization usage"
ON public.ai_assistant_usage
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('manager', 'super_admin')
  )
);

-- Create index for faster queries
CREATE INDEX idx_ai_usage_org_created ON public.ai_assistant_usage(organization_id, created_at DESC);
CREATE INDEX idx_ai_usage_barber ON public.ai_assistant_usage(barber_id, created_at DESC);