-- =============================================================================
-- Marketing Module — Phase 6: TikTok Organic Infrastructure
-- =============================================================================

-- TikTok account management (multi-account)
CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name VARCHAR(255) NOT NULL,
  tiktok_username VARCHAR(100),
  tiktok_user_id VARCHAR(50),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content pillars (seeded with 5 defaults)
CREATE TABLE IF NOT EXISTS content_pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3b82f6',
  target_pct INTEGER DEFAULT 20,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default content pillars
INSERT INTO content_pillars (name, description, color, target_pct, sort_order) VALUES
  ('Educational', 'Informative content about claims process, rights, and financial literacy', '#3b82f6', 25, 1),
  ('Success Stories', 'Client testimonials, case studies, and win announcements', '#10b981', 20, 2),
  ('Behind the Scenes', 'Office life, team introductions, day-in-the-life content', '#f59e0b', 15, 3),
  ('Trending/Entertainment', 'Trend participation, humour, relatable content', '#ec4899', 20, 4),
  ('Direct Response', 'Clear CTAs, offers, urgency-driven content', '#ef4444', 20, 5)
ON CONFLICT DO NOTHING;

-- TikTok content calendar
CREATE TABLE IF NOT EXISTS tiktok_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  pillar_id UUID REFERENCES content_pillars(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  script TEXT,
  hook TEXT,
  call_to_action VARCHAR(255),
  hashtags TEXT[],
  sounds VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scripted', 'filmed', 'editing', 'scheduled', 'published', 'archived')),
  scheduled_date DATE,
  scheduled_time TIME,
  published_at TIMESTAMP,
  platform_video_id VARCHAR(100),
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  format VARCHAR(20) CHECK (format IN ('short', 'medium', 'long', 'live', 'story')),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- TikTok organic post performance metrics
CREATE TABLE IF NOT EXISTS tiktok_organic_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES tiktok_content(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  profile_visits INTEGER DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,
  avg_watch_time DECIMAL(8,2),
  completion_rate DECIMAL(6,4),
  reach INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(content_id, date)
);

-- Cross-account promotion tracking
CREATE TABLE IF NOT EXISTS cross_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  target_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  content_id UUID REFERENCES tiktok_content(id) ON DELETE SET NULL,
  promotion_type VARCHAR(30) CHECK (promotion_type IN ('duet', 'stitch', 'mention', 'comment', 'share', 'collab')),
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tiktok_content_account ON tiktok_content(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_content_pillar ON tiktok_content(pillar_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_content_status ON tiktok_content(status);
CREATE INDEX IF NOT EXISTS idx_tiktok_content_scheduled ON tiktok_content(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiktok_organic_metrics_content ON tiktok_organic_metrics(content_id, date);
CREATE INDEX IF NOT EXISTS idx_cross_promotions_source ON cross_promotions(source_account_id);
