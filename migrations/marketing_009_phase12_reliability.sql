-- Phase 12: Reliability, Financial Tracking + Lender Intelligence

-- ─── Webhook Queue (queue-first reliability) ─────────────────────
CREATE TABLE IF NOT EXISTS webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(30) NOT NULL CHECK (source IN ('facebook', 'whatsapp', 'tiktok', 'instagram', 'meta_leads')),
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_queue (status, created_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_webhook_queue_dead ON webhook_queue (status) WHERE status = 'dead_letter';

-- ─── API Credentials Health ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  credential_type VARCHAR(30) NOT NULL CHECK (credential_type IN ('oauth_token', 'api_key', 'webhook_secret', 'app_secret')),
  platform VARCHAR(20) CHECK (platform IN ('meta', 'tiktok', 'whatsapp', 'claude', 'sendgrid', 'twilio')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'error', 'refreshing')),
  expires_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  last_test_result VARCHAR(20) CHECK (last_test_result IN ('success', 'failed', 'timeout')),
  last_refreshed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_credentials_status ON api_credentials (status);
CREATE INDEX IF NOT EXISTS idx_api_credentials_expiry ON api_credentials (expires_at) WHERE status != 'expired';

-- ─── Lead Deduplication Matches ──────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES ad_leads(id) ON DELETE CASCADE,
  matched_lead_id UUID REFERENCES ad_leads(id) ON DELETE SET NULL,
  matched_contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  match_type VARCHAR(30) NOT NULL CHECK (match_type IN ('email_exact', 'phone_normalized', 'name_partial', 'facebook_psid', 'multi_field')),
  confidence DECIMAL(5,2) NOT NULL,
  match_details JSONB DEFAULT '{}',
  resolution VARCHAR(20) DEFAULT 'pending' CHECK (resolution IN ('pending', 'merged', 'not_duplicate', 'ignored')),
  resolved_by VARCHAR(100),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_matches_lead ON lead_matches (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_matches_resolution ON lead_matches (resolution) WHERE resolution = 'pending';

-- ─── Case Financials (Fee Tracking + ROI) ────────────────────────
CREATE TABLE IF NOT EXISTS case_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id INT REFERENCES contacts(id) ON DELETE CASCADE,
  ad_lead_id UUID REFERENCES ad_leads(id) ON DELETE SET NULL,
  source_platform VARCHAR(30),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  case_status VARCHAR(30) DEFAULT 'active' CHECK (case_status IN ('active', 'submitted', 'upheld', 'rejected', 'fos_referred', 'fos_won', 'fos_lost', 'settled', 'closed')),
  lender_name VARCHAR(255),
  claim_amount DECIMAL(12,2),
  compensation_awarded DECIMAL(12,2),
  fee_percentage DECIMAL(5,2) DEFAULT 25.00,
  fee_amount DECIMAL(12,2),
  fee_band VARCHAR(20) CHECK (fee_band IN ('band_1', 'band_2', 'band_3', 'band_4', 'band_5')),
  ad_spend_attributed DECIMAL(10,2),
  profit DECIMAL(12,2) GENERATED ALWAYS AS (COALESCE(fee_amount, 0) - COALESCE(ad_spend_attributed, 0)) STORED,
  roi_percentage DECIMAL(8,2),
  outcome_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_financials_contact ON case_financials (contact_id);
CREATE INDEX IF NOT EXISTS idx_case_financials_status ON case_financials (case_status, outcome_date);
CREATE INDEX IF NOT EXISTS idx_case_financials_source ON case_financials (source_platform, created_at);

-- ─── Lender Intelligence ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lender_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name VARCHAR(255) NOT NULL UNIQUE,
  total_claims INT DEFAULT 0,
  claims_submitted INT DEFAULT 0,
  claims_upheld INT DEFAULT 0,
  claims_rejected INT DEFAULT 0,
  fos_referrals INT DEFAULT 0,
  fos_wins INT DEFAULT 0,
  fos_losses INT DEFAULT 0,
  upheld_rate DECIMAL(5,2) DEFAULT 0,
  fos_win_rate DECIMAL(5,2) DEFAULT 0,
  avg_compensation DECIMAL(12,2) DEFAULT 0,
  avg_fee DECIMAL(12,2) DEFAULT 0,
  total_revenue DECIMAL(14,2) DEFAULT 0,
  total_ad_spend DECIMAL(12,2) DEFAULT 0,
  cost_per_lead DECIMAL(10,2) DEFAULT 0,
  lead_to_sign_rate DECIMAL(5,2) DEFAULT 0,
  avg_days_to_resolve INT DEFAULT 0,
  ai_recommendation TEXT,
  ai_updated_at TIMESTAMPTZ,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lender_intelligence_name ON lender_intelligence (lender_name);
