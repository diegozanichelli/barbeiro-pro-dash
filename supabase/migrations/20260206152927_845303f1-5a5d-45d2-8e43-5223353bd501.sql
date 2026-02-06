-- Add columns for AI coach message caching
ALTER TABLE daily_productions 
ADD COLUMN IF NOT EXISTS coach_message TEXT,
ADD COLUMN IF NOT EXISTS last_coach_at TIMESTAMPTZ;

-- Add index for faster cache lookup
CREATE INDEX IF NOT EXISTS idx_daily_productions_coach_cache 
ON daily_productions (barber_id, date, last_coach_at);