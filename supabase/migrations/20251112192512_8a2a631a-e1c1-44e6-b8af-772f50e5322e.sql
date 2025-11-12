-- Drop the existing check constraint
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS valid_subscription_status;

-- Add the updated check constraint with 'gratuita' included
ALTER TABLE public.organizations ADD CONSTRAINT valid_subscription_status 
CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'gratuita'));