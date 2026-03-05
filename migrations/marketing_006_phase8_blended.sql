-- Phase 8: Cross-Platform + Blended Performance
-- Run: psql $DATABASE_URL -f migrations/marketing_006_phase8_blended.sql

-- Blended performance: weekly/monthly cross-channel cost tracking
CREATE TABLE IF NOT EXISTS blended_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Channel breakdown
  tiktok_organic_leads INT DEFAULT 0,
  tiktok_organic_spend DECIMAL(12,2) DEFAULT 0,
  tiktok_spark_leads INT DEFAULT 0,
  tiktok_spark_spend DECIMAL(12,2) DEFAULT 0,
  tiktok_paid_leads INT DEFAULT 0,
  tiktok_paid_spend DECIMAL(12,2) DEFAULT 0,
  meta_paid_leads INT DEFAULT 0,
  meta_paid_spend DECIMAL(12,2) DEFAULT 0,
  meta_organic_leads INT DEFAULT 0,
  meta_organic_spend DECIMAL(12,2) DEFAULT 0,
  cross_platform_retarget_leads INT DEFAULT 0,
  cross_platform_retarget_spend DECIMAL(12,2) DEFAULT 0,

  -- Totals
  total_leads INT GENERATED ALWAYS AS (
    tiktok_organic_leads + tiktok_spark_leads + tiktok_paid_leads +
    meta_paid_leads + meta_organic_leads + cross_platform_retarget_leads
  ) STORED,
  total_spend DECIMAL(12,2) GENERATED ALWAYS AS (
    tiktok_organic_spend + tiktok_spark_spend + tiktok_paid_spend +
    meta_paid_spend + meta_organic_spend + cross_platform_retarget_spend
  ) STORED,

  -- Signed/won metrics (filled from CRM data)
  leads_signed INT DEFAULT 0,
  leads_won INT DEFAULT 0,
  total_compensation DECIMAL(14,2) DEFAULT 0,
  total_fees DECIMAL(14,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_type, period_start)
);

-- Cross-platform journeys: multi-touch attribution
CREATE TABLE IF NOT EXISTS cross_platform_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  ad_lead_id UUID REFERENCES ad_leads(id) ON DELETE SET NULL,

  first_touch_platform VARCHAR(50) CHECK (first_touch_platform IN (
    'tiktok_organic', 'tiktok_paid', 'tiktok_spark', 'meta_paid', 'meta_organic', 'direct', 'referral'
  )),
  first_touch_content_id UUID,
  first_touch_at TIMESTAMPTZ,

  touch_sequence JSONB DEFAULT '[]',
  total_touches INT DEFAULT 1,

  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  conversion_type VARCHAR(50),

  primary_attribution VARCHAR(50) CHECK (primary_attribution IN (
    'tiktok_organic', 'tiktok_spark', 'tiktok_paid', 'meta_paid', 'meta_retarget', 'cross_platform_retarget', 'direct'
  )),
  attributed_cost DECIMAL(12,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hashtag performance tracking
CREATE TABLE IF NOT EXISTS hashtag_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag VARCHAR(100) NOT NULL,
  hashtag_type VARCHAR(30) DEFAULT 'broad' CHECK (hashtag_type IN ('broad', 'niche', 'lender_specific', 'trending')),
  times_used INT DEFAULT 0,
  avg_views_when_used DECIMAL(12,2) DEFAULT 0,
  avg_engagement_rate DECIMAL(6,4) DEFAULT 0,
  best_performing_content_id UUID REFERENCES tiktok_content(id) ON DELETE SET NULL,
  total_hashtag_views BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hashtag)
);

-- Trending sounds tracking
CREATE TABLE IF NOT EXISTS trending_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_id VARCHAR(100),
  sound_name VARCHAR(255) NOT NULL,
  artist VARCHAR(255),
  times_used INT DEFAULT 0,
  avg_views_when_used DECIMAL(12,2) DEFAULT 0,
  is_currently_trending BOOLEAN DEFAULT FALSE,
  first_spotted_at TIMESTAMPTZ DEFAULT NOW(),
  peak_date DATE,
  content_ideas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sound_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blended_period ON blended_performance(period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_journeys_contact ON cross_platform_journeys(contact_id);
CREATE INDEX IF NOT EXISTS idx_journeys_attribution ON cross_platform_journeys(primary_attribution);
CREATE INDEX IF NOT EXISTS idx_journeys_converted ON cross_platform_journeys(converted) WHERE converted = TRUE;
CREATE INDEX IF NOT EXISTS idx_hashtag_type ON hashtag_performance(hashtag_type);
CREATE INDEX IF NOT EXISTS idx_trending_sounds_trending ON trending_sounds(is_currently_trending) WHERE is_currently_trending = TRUE;
