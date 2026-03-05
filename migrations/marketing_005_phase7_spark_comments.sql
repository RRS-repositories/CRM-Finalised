-- =============================================================================
-- Marketing Module — Phase 7: Spark Ads Pipeline, Comment Engagement, Live Streams
-- =============================================================================

-- Spark Ads pipeline: organic → paid Spark Ad tracking
CREATE TABLE IF NOT EXISTS spark_ads_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES tiktok_content(id) ON DELETE SET NULL,
  tiktok_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  stage VARCHAR(20) DEFAULT 'monitoring' CHECK (stage IN ('monitoring', 'qualified', 'approved', 'live', 'completed', 'rejected')),
  auth_code VARCHAR(255),
  auth_code_expires_at TIMESTAMP,
  spark_ad_id VARCHAR(100),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  qualification_reason TEXT,
  views_at_qualification INTEGER,
  engagement_rate_at_qual DECIMAL(8,4),
  spark_spend DECIMAL(10,2) DEFAULT 0,
  spark_impressions INTEGER DEFAULT 0,
  spark_clicks INTEGER DEFAULT 0,
  spark_leads INTEGER DEFAULT 0,
  spark_cpl DECIMAL(10,4),
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  launched_at TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- TikTok comments: engagement tracking with AI analysis
CREATE TABLE IF NOT EXISTS tiktok_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES tiktok_content(id) ON DELETE SET NULL,
  tiktok_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  platform_comment_id VARCHAR(100),
  author_username VARCHAR(100),
  author_user_id VARCHAR(50),
  comment_text TEXT NOT NULL,
  parent_comment_id UUID REFERENCES tiktok_comments(id) ON DELETE SET NULL,
  is_reply BOOLEAN DEFAULT FALSE,
  reply_text TEXT,
  replied_at TIMESTAMP,
  replied_by VARCHAR(50) CHECK (replied_by IN ('bot', 'human', 'template')),
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'negative', 'neutral', 'question', 'lead_signal')),
  is_lead_signal BOOLEAN DEFAULT FALSE,
  lead_keywords TEXT[],
  ai_analysis JSONB,
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'flagged', 'ignored', 'converted')),
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- TikTok live streams
CREATE TABLE IF NOT EXISTS tiktok_lives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'prep', 'live', 'completed', 'cancelled')),
  duration_minutes INTEGER,
  peak_viewers INTEGER DEFAULT 0,
  total_viewers INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  gifts_value DECIMAL(10,2) DEFAULT 0,
  topics TEXT[],
  ai_prep_notes TEXT,
  ai_summary TEXT,
  recording_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_spark_pipeline_stage ON spark_ads_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_spark_pipeline_content ON spark_ads_pipeline(content_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_comments_content ON tiktok_comments(content_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_comments_status ON tiktok_comments(status, priority);
CREATE INDEX IF NOT EXISTS idx_tiktok_comments_lead ON tiktok_comments(is_lead_signal) WHERE is_lead_signal = TRUE;
CREATE INDEX IF NOT EXISTS idx_tiktok_comments_sentiment ON tiktok_comments(sentiment);
CREATE INDEX IF NOT EXISTS idx_tiktok_lives_account ON tiktok_lives(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_lives_status ON tiktok_lives(status);
