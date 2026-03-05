-- Phase 11: Lead Scoring columns on ad_leads
-- Adds scoring fields for automated lead qualification

ALTER TABLE ad_leads
  ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS score_tier VARCHAR(10) DEFAULT 'cold'
    CHECK (score_tier IN ('hot', 'warm', 'cool', 'cold')),
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ad_leads_score ON ad_leads (lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_ad_leads_tier ON ad_leads (score_tier, created_at DESC);
