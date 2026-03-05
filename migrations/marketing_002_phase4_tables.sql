-- =============================================================================
-- Marketing Module — Phase 4: Creative Lifecycle, Audiences, AI Extensions
-- =============================================================================

-- Creative tags (style, emotion, angle, format, hook_type, lender_mention)
CREATE TABLE IF NOT EXISTS creative_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID REFERENCES creatives(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL CHECK (category IN ('style', 'emotion', 'angle', 'format', 'hook_type', 'lender_mention')),
  value VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creative lifecycle / fatigue tracking
CREATE TABLE IF NOT EXISTS creative_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID REFERENCES creatives(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  peak_ctr DECIMAL(8,4),
  current_ctr DECIMAL(8,4),
  peak_cpl DECIMAL(10,4),
  current_cpl DECIMAL(10,4),
  ctr_decline_pct DECIMAL(6,2),
  cpl_increase_pct DECIMAL(6,2),
  days_active INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'watch', 'fatigued', 'retired')),
  first_seen DATE,
  peak_date DATE,
  last_checked TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audiences (expanded audience management)
CREATE TABLE IF NOT EXISTS audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  platform_audience_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(30) CHECK (type IN ('custom', 'lookalike', 'saved', 'video_viewers', 'website_visitors', 'crm_segment')),
  description TEXT,
  size INTEGER,
  source_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Video audience pools — track video viewer audience growth
CREATE TABLE IF NOT EXISTS video_audience_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('meta', 'tiktok')),
  audience_id UUID REFERENCES audiences(id) ON DELETE SET NULL,
  video_source VARCHAR(50),
  retention_threshold INTEGER,
  pool_size INTEGER DEFAULT 0,
  pool_size_previous INTEGER DEFAULT 0,
  growth_rate DECIMAL(8,4),
  last_updated TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_creative_tags_creative ON creative_tags(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_tags_category ON creative_tags(category, value);
CREATE INDEX IF NOT EXISTS idx_creative_lifecycle_status ON creative_lifecycle(status);
CREATE INDEX IF NOT EXISTS idx_creative_lifecycle_creative ON creative_lifecycle(creative_id);
CREATE INDEX IF NOT EXISTS idx_audiences_platform ON audiences(platform, type);
CREATE INDEX IF NOT EXISTS idx_video_audience_pools_audience ON video_audience_pools(audience_id);
