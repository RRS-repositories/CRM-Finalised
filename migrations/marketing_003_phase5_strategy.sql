-- =============================================================================
-- Marketing Module — Phase 5: Strategy Features (War Room, Placement, Time-of-Day, Emotional Cycle)
-- =============================================================================

-- Add strategy columns to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_category VARCHAR(30);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS emotional_angle VARCHAR(50);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_days JSONB; -- e.g. ["monday","tuesday"]

-- Add breakdown columns to daily_metrics
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS placement VARCHAR(50);
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS hour_of_day INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS day_of_week INTEGER; -- 0=Sun, 6=Sat
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS creative_days_active INTEGER;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS leads_higher_intent INTEGER DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS leads_standard INTEGER DEFAULT 0;

-- Index for time-of-day and placement queries
CREATE INDEX IF NOT EXISTS idx_daily_metrics_hour ON daily_metrics(hour_of_day) WHERE hour_of_day IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_metrics_day ON daily_metrics(day_of_week) WHERE day_of_week IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_metrics_placement ON daily_metrics(placement) WHERE placement IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_category ON campaigns(campaign_category) WHERE campaign_category IS NOT NULL;
