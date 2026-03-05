-- =============================================================================
-- Marketing Module — Phase 1: Core Tables
-- =============================================================================

-- Platform account connections (Meta, TikTok)
CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  account_id VARCHAR(50) NOT NULL,
  account_name VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  currency VARCHAR(3) DEFAULT 'GBP',
  timezone VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaigns (unified across platforms)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_campaign_id VARCHAR(50),
  platform_account_id UUID REFERENCES platform_accounts(id) ON DELETE SET NULL,
  name VARCHAR(255),
  objective VARCHAR(50),
  status VARCHAR(30) DEFAULT 'ACTIVE',
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ad Sets / Ad Groups
CREATE TABLE IF NOT EXISTS ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_adset_id VARCHAR(50),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255),
  status VARCHAR(30),
  targeting JSONB,
  bid_amount DECIMAL(10,4),
  daily_budget DECIMAL(10,2),
  optimization_goal VARCHAR(50),
  billing_event VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creatives
CREATE TABLE IF NOT EXISTS creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_creative_id VARCHAR(50),
  type VARCHAR(20) CHECK (type IN ('image', 'video', 'carousel')),
  headline VARCHAR(255),
  body_text TEXT,
  call_to_action VARCHAR(50),
  landing_url TEXT,
  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual Ads
CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_ad_id VARCHAR(50),
  ad_set_id UUID REFERENCES ad_sets(id) ON DELETE CASCADE,
  name VARCHAR(255),
  status VARCHAR(30),
  creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily performance metrics (one row per ad per day per platform)
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID REFERENCES ad_sets(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES ads(id) ON DELETE SET NULL,
  -- Spend
  spend DECIMAL(10,2),
  -- Reach & Impressions
  impressions INTEGER,
  reach INTEGER,
  frequency DECIMAL(6,2),
  -- Clicks
  clicks INTEGER,
  link_clicks INTEGER,
  -- Rates
  ctr DECIMAL(6,4),
  link_ctr DECIMAL(6,4),
  -- Costs
  cpm DECIMAL(10,4),
  cpc DECIMAL(10,4),
  cost_per_link_click DECIMAL(10,4),
  -- Conversions
  conversions INTEGER,
  conversion_rate DECIMAL(6,4),
  cost_per_conversion DECIMAL(10,4),
  -- Leads specifically
  leads INTEGER,
  cost_per_lead DECIMAL(10,4),
  -- Revenue
  conversion_value DECIMAL(12,2),
  roas DECIMAL(8,4),
  -- Video
  video_views INTEGER,
  video_views_25pct INTEGER,
  video_views_50pct INTEGER,
  video_views_75pct INTEGER,
  video_views_100pct INTEGER,
  avg_video_play_seconds DECIMAL(8,2),
  -- Engagement
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  follows INTEGER,
  -- Quality (Meta only)
  quality_ranking VARCHAR(30),
  engagement_rate_ranking VARCHAR(30),
  conversion_rate_ranking VARCHAR(30),
  -- Breakdowns stored as JSONB
  breakdown_by_age JSONB,
  breakdown_by_gender JSONB,
  breakdown_by_placement JSONB,
  breakdown_by_device JSONB,
  breakdown_by_country JSONB,
  -- Metadata
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, platform, ad_id)
);

-- Hourly metrics for real-time monitoring
CREATE TABLE IF NOT EXISTS hourly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMP NOT NULL,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  spend DECIMAL(10,2),
  impressions INTEGER,
  clicks INTEGER,
  leads INTEGER,
  cpm DECIMAL(10,4),
  cpc DECIMAL(10,4),
  cost_per_lead DECIMAL(10,4),
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Ad leads (links ad leads to CRM contacts)
CREATE TABLE IF NOT EXISTS ad_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_lead_id VARCHAR(100),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES ads(id) ON DELETE SET NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  form_data JSONB,
  crm_client_id UUID,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'rejected')),
  cost DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI analysis reports
CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE,
  report_type VARCHAR(30) CHECK (report_type IN ('daily_review', 'creative_analysis', 'budget_recommendation', 'anomaly_alert', 'weekly_summary')),
  platform VARCHAR(10) CHECK (platform IN ('meta', 'tiktok', 'all')),
  analysis TEXT,
  recommendations JSONB,
  flagged_campaigns JSONB,
  top_performers JSONB,
  underperformers JSONB,
  suggested_actions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- Indexes for Dashboard Performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign ON daily_metrics(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_platform_date ON daily_metrics(platform, date);
CREATE INDEX IF NOT EXISTS idx_hourly_metrics_hour ON hourly_metrics(hour);
CREATE INDEX IF NOT EXISTS idx_hourly_metrics_campaign ON hourly_metrics(campaign_id, hour);
CREATE INDEX IF NOT EXISTS idx_ai_reports_date ON ai_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_ad_leads_status ON ad_leads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_leads_campaign ON ad_leads(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(platform_account_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign ON ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_adset ON ads(ad_set_id);
