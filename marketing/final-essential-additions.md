# Ad Platform Spec — Final Addendum: Essential Additions

**Purpose:** This addendum covers six critical additions to the platform. Feed this to Claude alongside the other four spec documents.

---

## 1. DUPLICATE LEAD DETECTION

People will message you on Facebook, then WhatsApp, then fill in a form. Without dedup, you count them as three leads, waste follow-up effort, and inflate your CPL numbers.

```sql
CREATE TABLE lead_matches (
  id UUID PRIMARY KEY,
  primary_lead_id UUID REFERENCES ad_leads(id),
  duplicate_lead_id UUID REFERENCES ad_leads(id),
  match_type ENUM('email', 'phone', 'name_and_phone', 'name_and_email', 
                   'facebook_id', 'manual'),
  confidence DECIMAL(4,2),                 -- 0-1 confidence score
  status ENUM('suspected', 'confirmed', 'rejected', 'merged'),
  merged_at TIMESTAMP,
  merged_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lead_matches_primary ON lead_matches(primary_lead_id);
CREATE INDEX idx_lead_matches_duplicate ON lead_matches(duplicate_lead_id);
```

**Windmill job: Duplicate Detector**
```
Name: duplicate_detector
Schedule: Every 30 minutes

Steps:
1. For new leads in last 30 minutes:
   a. Search existing leads by email (exact match)
   b. Search by phone (normalised to +44 format)
   c. Search by name + partial phone/email
   d. Search by Facebook PSID / Instagram SCID across conversations
2. If match found:
   - If high confidence (email match): auto-merge, link conversations
   - If medium confidence (name + phone): flag for review
   - If already a CRM client: link and skip re-qualification
3. Update blended_performance to avoid double-counting leads
4. Update conversation records to link duplicates
```

**Impact on CPL tracking:** Without dedup, your blended CPL looks artificially low because you're counting the same person multiple times. With dedup, you get the true number.

---

## 2. WEBHOOK RELIABILITY & MESSAGE QUEUE

If a webhook fails (server restart, API timeout, network blip), you lose messages. For a legal practice, that's unacceptable — someone reaching out for help shouldn't fall through the cracks.

```sql
CREATE TABLE webhook_queue (
  id UUID PRIMARY KEY,
  channel ENUM('fb_messenger', 'instagram_dm', 'whatsapp', 'email', 'sms', 'tiktok_dm'),
  raw_payload JSONB NOT NULL,
  -- Processing status
  status ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter'),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_attempt_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  error_message TEXT,
  -- Processing result
  conversation_id UUID,
  message_id UUID,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_queue_pending ON webhook_queue(status, next_retry_at) 
  WHERE status IN ('pending', 'failed');
```

**Architecture:**
1. Webhook endpoint receives payload → immediately INSERT into webhook_queue → return 200
2. Separate Windmill job processes the queue (every 10 seconds)
3. If processing fails: increment attempts, set next_retry_at with exponential backoff
4. After max_attempts: move to dead_letter, alert team
5. Dead letter queue reviewed daily

This means you never lose a message, even if Claude's API is down or your database has a hiccup.

**Windmill job: Queue Processor**
```
Name: webhook_queue_processor
Schedule: Every 10 seconds
Language: TypeScript

Steps:
1. SELECT from webhook_queue WHERE status IN ('pending', 'failed') 
   AND (next_retry_at IS NULL OR next_retry_at <= NOW())
   ORDER BY created_at ASC LIMIT 10
2. For each queued item:
   a. SET status = 'processing'
   b. Parse payload, identify channel
   c. Route to message_router logic (same as the comms addendum)
   d. If success: SET status = 'completed', store conversation_id and message_id
   e. If failure: 
      - INCREMENT attempts
      - SET next_retry_at = NOW() + (2^attempts * 30 seconds)  -- exponential backoff
      - SET status = 'failed', store error_message
      - If attempts >= max_attempts: SET status = 'dead_letter', ALERT team
3. Log all processing results
```

**Windmill job: Dead Letter Monitor**
```
Name: dead_letter_monitor
Schedule: Every hour
Language: TypeScript

Steps:
1. COUNT items in webhook_queue WHERE status = 'dead_letter' AND created_at > NOW() - 24h
2. If count > 0:
   - Send alert: "⚠️ {count} messages failed to process after max retries. 
     Channels affected: {list}. Review needed."
   - Include sample of failed payloads for diagnosis
3. Daily at 08:00: send summary of all dead letter items for manual review
```

---

## 3. TOKEN & API KEY MANAGEMENT

Across Meta, TikTok, WhatsApp, Claude, SMS provider, and email — that's a lot of tokens that expire, get revoked, or hit rate limits. One expired token and an entire channel goes dark without you knowing.

```sql
CREATE TABLE api_credentials (
  id UUID PRIMARY KEY,
  service ENUM('meta_marketing', 'meta_messenger', 'meta_whatsapp', 
               'tiktok_marketing', 'tiktok_content', 'claude', 
               'twilio', 'email_smtp', 'email_imap'),
  credential_type ENUM('access_token', 'refresh_token', 'api_key', 'webhook_secret'),
  -- Encrypted storage
  credential_value_encrypted TEXT NOT NULL,
  -- Expiry
  expires_at TIMESTAMP,
  days_until_expiry INTEGER GENERATED ALWAYS AS 
    (EXTRACT(DAY FROM expires_at - NOW())) STORED,
  -- Refresh
  auto_refresh BOOLEAN DEFAULT FALSE,
  last_refreshed_at TIMESTAMP,
  refresh_failures INTEGER DEFAULT 0,
  -- Status
  status ENUM('active', 'expiring_soon', 'expired', 'revoked', 'refreshing'),
  last_used_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Windmill job: Credential Health Monitor**
```
Name: credential_health_monitor
Schedule: Every 6 hours
Language: TypeScript

Steps:
1. Check all credentials:
   - If expires_at < NOW() + 7 days → status = 'expiring_soon', ALERT
   - If expires_at < NOW() + 24 hours → CRITICAL ALERT
   - If expires_at < NOW() → status = 'expired', CRITICAL ALERT, disable dependent jobs
   - If auto_refresh = true AND expiring_soon → attempt refresh:
     Meta tokens: POST /oauth/access_token with refresh_token
     TikTok tokens: POST /oauth2/refresh_token/
2. Test each credential with a lightweight API call:
   - Meta: GET /me (should return page/account info)
   - TikTok: GET /advertiser/info/
   - Claude: Simple completion request
   - Twilio: GET /Accounts/{sid}
   - WhatsApp: GET /{phone_id}
3. If test fails:
   - Log specific error
   - ALERT: "🔴 {service} credential test FAILED: {error}. 
     Channel may be down. Action needed."
4. Update api_credentials with last_used_at, status, last_error
```

**Dashboard widget: Credential Health Panel**

Add to the main overview dashboard:

| Service | Status | Expires | Last Tested | Action |
|---------|--------|---------|-------------|--------|
| Meta Marketing | 🟢 Active | 42 days | 2h ago | — |
| Meta Messenger | 🟢 Active | 42 days | 2h ago | — |
| WhatsApp | 🟡 Expiring | 5 days | 2h ago | Refresh |
| TikTok Marketing | 🟢 Active | 58 days | 2h ago | — |
| TikTok Content | 🔴 Expired | Expired | Failed | Fix Now |
| Claude API | 🟢 Active | No expiry | 2h ago | — |
| Twilio (SMS) | 🟢 Active | No expiry | 2h ago | — |

---

## 4. FEE TRACKING & PROFITABILITY BY SOURCE

This connects ad spend all the way through to actual fees earned, broken down by lead source. Without this, you know your CPL but not whether those leads actually make you money.

```sql
CREATE TABLE case_financials (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES ad_leads(id),
  crm_client_id UUID,
  -- Source attribution
  source_platform VARCHAR(50),             -- 'meta', 'tiktok', 'organic'
  source_campaign_id UUID REFERENCES campaigns(id),
  source_type VARCHAR(50),                 -- 'tiktok_organic', 'tiktok_spark', 'meta_paid', 
                                           -- 'cross_platform_retarget', 'messenger_bot', etc
  source_channel VARCHAR(50),              -- 'fb_messenger', 'whatsapp', 'lead_form', etc
  -- Acquisition cost
  acquisition_cost DECIMAL(10,4),          -- attributed ad spend for this lead
  -- Case outcome
  claim_status ENUM('registered', 'submitted', 'under_review', 'upheld', 
                     'rejected', 'partial_upheld', 'fos_referred', 'settled', 'closed'),
  lender VARCHAR(100),
  -- Financials
  compensation_amount DECIMAL(12,2),
  -- Fees (using your band structure)
  fee_band INTEGER,                        -- 1-5
  fee_percentage DECIMAL(5,2),
  fee_amount DECIMAL(10,2),
  fee_cap DECIMAL(10,2),
  vat_amount DECIMAL(10,2),
  total_fee_with_vat DECIMAL(10,2),
  -- Payment
  fee_invoiced BOOLEAN DEFAULT FALSE,
  fee_invoiced_at TIMESTAMP,
  fee_received BOOLEAN DEFAULT FALSE,
  fee_received_at TIMESTAMP,
  payment_method ENUM('client_direct', 'lender_direct', 'worldpay'),
  -- Profitability
  profit DECIMAL(10,2) GENERATED ALWAYS AS 
    (COALESCE(total_fee_with_vat, 0) - COALESCE(acquisition_cost, 0)) STORED,
  -- Timeline
  registered_at TIMESTAMP,
  submitted_at TIMESTAMP,
  resolved_at TIMESTAMP,
  days_to_resolve INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_case_financials_source ON case_financials(source_platform, source_type);
CREATE INDEX idx_case_financials_status ON case_financials(claim_status);
CREATE INDEX idx_case_financials_lender ON case_financials(lender);
CREATE INDEX idx_case_financials_received ON case_financials(fee_received) WHERE fee_received = TRUE;
```

**Fee band auto-calculation (matching your fee structure):**

```sql
CREATE OR REPLACE FUNCTION calculate_fee(compensation DECIMAL) 
RETURNS TABLE(band INT, percentage DECIMAL, fee DECIMAL, cap DECIMAL, vat DECIMAL, total DECIMAL) AS $$
BEGIN
  IF compensation BETWEEN 1 AND 1499 THEN
    band := 1; percentage := 30; cap := 420;
  ELSIF compensation BETWEEN 1500 AND 9999 THEN
    band := 2; percentage := 28; cap := 2500;
  ELSIF compensation BETWEEN 10000 AND 24999 THEN
    band := 3; percentage := 25; cap := 5000;
  ELSIF compensation BETWEEN 25000 AND 49999 THEN
    band := 4; percentage := 20; cap := 7500;
  ELSIF compensation >= 50000 THEN
    band := 5; percentage := 15; cap := 10000;
  END IF;
  
  fee := LEAST(compensation * percentage / 100, cap);
  vat := fee * 0.20;
  total := fee + vat;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
```

**Windmill job: Financial Sync**
```
Name: financial_sync
Schedule: Daily at 07:00
Language: TypeScript

Steps:
1. Query CRM for case status updates and settlements from yesterday
2. For each settled case:
   a. Find matching case_financials record (or create)
   b. Update compensation_amount, claim_status
   c. Calculate fee using band structure
   d. Update all financial fields
3. For each payment received:
   a. Update fee_received, fee_received_at
4. Aggregate into blended_performance table
5. Calculate ROI by source for dashboard
```

**Dashboard: ROI by Source**

This is the table that tells you exactly where to put your money:

| Source | Leads | Signed | Won | Compensation | Fees (inc VAT) | Ad Spend | Profit | ROI |
|--------|-------|--------|-----|-------------|---------------|---------|--------|-----|
| TikTok Organic | 450 | 189 | 142 | £485,000 | £135,800 | £0 | £135,800 | ∞ |
| TikTok Spark | 220 | 84 | 61 | £208,000 | £58,240 | £3,960 | £54,280 | 1,370% |
| Meta Retarget | 120 | 42 | 31 | £106,000 | £29,680 | £3,720 | £25,960 | 698% |
| Meta Paid | 280 | 62 | 43 | £147,000 | £41,160 | £22,960 | £18,200 | 79% |

**Additional dashboard widgets:**

**Revenue Pipeline:**
- Cases registered (estimated value based on lender averages)
- Cases submitted (estimated value)
- Cases under review (estimated value)
- Cases settled (actual value)
- Fees invoiced vs received

**Profitability Trend:**
- Monthly profit chart (fees earned minus ad spend)
- Monthly ROI trend line
- Projected revenue from current pipeline

**Source Quality Comparison:**
| Source | Lead → Signed % | Signed → Won % | Avg Compensation | Avg Fee | Avg Profit/Lead |
|--------|----------------|----------------|-----------------|---------|-----------------|

This shows whether cheap leads are actually cheap once you factor in conversion rates.

---

## 5. LENDER INTELLIGENCE DATABASE

The bot and Claude both get smarter with lender-specific data. Instead of generic responses, the bot can say "Vanquis has been upholding around 60% of claims we submit, with average compensation around £4,500."

```sql
CREATE TABLE lender_intelligence (
  id UUID PRIMARY KEY,
  lender_name VARCHAR(100) NOT NULL,
  legal_entity_name VARCHAR(255),
  company_number VARCHAR(20),
  -- Contact for claims
  complaints_address TEXT,
  complaints_email VARCHAR(255),
  -- Claim intelligence (updated from your CRM case data)
  total_claims_submitted INTEGER DEFAULT 0,
  claims_upheld INTEGER DEFAULT 0,
  claims_rejected INTEGER DEFAULT 0,
  claims_partial_upheld INTEGER DEFAULT 0,
  claims_fos_referred INTEGER DEFAULT 0,
  claims_fos_won INTEGER DEFAULT 0,
  upheld_rate DECIMAL(5,2),                -- % upheld on first complaint
  fos_success_rate DECIMAL(5,2),           -- % won at FOS stage
  avg_response_time_days INTEGER,          -- how long they take to respond
  typical_initial_offer_pct DECIMAL(5,2),  -- % of full redress typically offered first
  -- Financial outcomes
  avg_compensation DECIMAL(12,2),
  median_compensation DECIMAL(12,2),
  highest_compensation DECIMAL(12,2),
  total_compensation_recovered DECIMAL(14,2),
  avg_fee_earned DECIMAL(10,2),
  -- Marketing intelligence
  leads_generated_total INTEGER DEFAULT 0,
  leads_signed_total INTEGER DEFAULT 0,
  lead_to_signed_rate DECIMAL(5,2),
  avg_cpl_for_lender DECIMAL(10,4),        -- what it costs to acquire a lead mentioning this lender
  -- Organic/social data
  mention_count_organic INTEGER DEFAULT 0, -- how often mentioned in TikTok/FB comments
  mention_trend ENUM('increasing', 'stable', 'decreasing'),
  mention_sentiment ENUM('mostly_negative', 'mixed', 'mostly_positive'),
  -- Content performance
  best_performing_ad_headline TEXT,
  best_performing_tiktok_hook TEXT,
  avg_cpl_when_lender_named_in_ad DECIMAL(10,4),
  -- Current strategic notes
  current_status TEXT,                     -- e.g. "Processing quickly", "Rejecting most — FOS route better"
  recommended_approach TEXT,               -- e.g. "Submit direct first, escalate after 8 weeks"
  -- Dates
  last_claim_submitted_at TIMESTAMP,
  last_settlement_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_lender_name ON lender_intelligence(lender_name);
```

**Seed data for your current lenders:**

```sql
INSERT INTO lender_intelligence (lender_name, legal_entity_name, company_number) VALUES
  ('Vanquis Bank', 'Vanquis Bank Limited', NULL),
  ('Loans 2 Go', 'Loans 2 Go Limited', '4519020'),
  ('118 118 Money', '118 118 Money', NULL),
  ('Lending Stream', 'Gain Credit LLC', NULL),
  ('NewDay', 'NewDay Ltd', NULL),
  ('CashFloat', 'CashFloat', NULL),
  ('Capital One', 'Capital One (Europe) plc', NULL);
```

**Windmill job: Lender Intelligence Updater**
```
Name: lender_intelligence_updater
Schedule: Weekly on Sundays at 06:00
Language: TypeScript

Steps:
1. For each lender in lender_intelligence:
   a. Query CRM for all cases against this lender
   b. Calculate:
      - total_claims_submitted, upheld, rejected, FOS referred, FOS won
      - upheld_rate, fos_success_rate
      - avg/median/highest compensation
      - avg_response_time_days
   c. Query ad_leads for lead generation stats:
      - leads_generated_total, leads_signed_total, lead_to_signed_rate
      - avg_cpl_for_lender
   d. Query organic_comments and tiktok_comments for mention counts
   e. Update all fields

2. Send to Claude:
   "Here is updated lender intelligence for all lenders:
    {JSON dump of lender_intelligence table}
    
    For each lender, provide:
    1. Current recommended approach (submit direct vs go straight to FOS)
    2. Whether this lender is worth increasing ad spend to target specifically
    3. Any patterns in which claims succeed vs fail
    4. Suggested ad angles specific to this lender
    5. Update the current_status and recommended_approach fields"

3. Update lender_intelligence with Claude's recommendations
```

**Bot integration:**

Update the chatbot system prompt in the comms addendum to include:

```
LENDER KNOWLEDGE:
When the lead mentions a specific lender, reference the following data in your 
responses (naturally, don't dump stats):

{Dynamic insert from lender_intelligence table for the mentioned lender}

Example usage:
- "Vanquis is one of the lenders we deal with most frequently — we've had good 
   results with them" (if upheld_rate > 50%)
- "That lender can be a bit slower to respond, but we know how to handle them 
   and have a strong track record at the Financial Ombudsman stage" (if 
   upheld_rate low but fos_success_rate high)
- Don't quote specific percentages or amounts to leads — keep it general 
  and reassuring
```

**Dashboard: Lender Performance Page**

| Lender | Claims | Upheld % | FOS Win % | Avg Comp | Avg Fee | Leads | CPL | Lead→Sign % |
|--------|--------|----------|-----------|----------|---------|-------|-----|-------------|
| Vanquis | 142 | 62% | 78% | £4,500 | £1,080 | 320 | £3.20 | 44% |
| Loans 2 Go | 45 | 71% | 85% | £2,800 | £784 | 89 | £5.10 | 51% |
| Lending Stream | 38 | 58% | 72% | £1,900 | £532 | 65 | £4.80 | 58% |

**Lender Profitability Ranking:**
- Sort by: avg profit per lead (fee earned minus acquisition cost)
- Highlights which lenders are most profitable to target in ads
- Informs budget allocation decisions

---

## 6. LEAD SCORING

Not all leads are equal. A scoring system prioritises your human follow-up time on the leads most likely to sign.

```sql
ALTER TABLE ad_leads ADD COLUMN lead_score INTEGER DEFAULT 0;
ALTER TABLE ad_leads ADD COLUMN score_breakdown JSONB;
-- Structure: {"lender_mentioned": 20, "gambling_confirmed": 25, "organic_source": 15, ...}
ALTER TABLE ad_leads ADD COLUMN score_tier ENUM('hot', 'warm', 'cool', 'cold') 
  GENERATED ALWAYS AS (
    CASE 
      WHEN lead_score >= 80 THEN 'hot'
      WHEN lead_score >= 50 THEN 'warm'
      WHEN lead_score >= 20 THEN 'cool'
      ELSE 'cold'
    END
  ) STORED;

CREATE INDEX idx_lead_score ON ad_leads(lead_score DESC);
CREATE INDEX idx_lead_tier ON ad_leads(score_tier);
```

**Scoring rules:**

| Signal | Points | Reason |
|--------|--------|--------|
| Mentioned specific lender by name | +20 | Shows they know who they're claiming against |
| Confirmed gambling connection | +25 | Core qualification criteria |
| Credit taken within last 6 years | +15 | Within limitation period |
| Still owes money to lender | +10 | Motivation to claim, debt offset possible |
| Answered all qualification questions | +15 | Engaged and serious |
| Came from organic content (self-selected) | +15 | Higher intent than cold ad click |
| Came from retarget (showed repeat interest) | +10 | Visited/engaged multiple times |
| Engaged with multiple pieces of content | +10 | Invested time learning about claims |
| Mentioned specific amounts (debt, credit limit) | +10 | Detail = seriousness |
| Positive sentiment in conversation | +5 | Cooperative, likely to follow through |
| Responded to first message within 1 hour | +5 | Urgency and engagement |
| Came via WhatsApp (higher intent channel) | +5 | Chose to message directly |
| Lender is high-upheld-rate (from lender intelligence) | +10 | Stronger chance of success |
| Previous claim rejected elsewhere | -10 | May be harder case, but still worth pursuing |
| Vague or unclear about details | -10 | May not qualify or may not follow through |
| Only engaged with one message then went silent | -15 | Low engagement signal |

**Score tiers and actions:**

| Tier | Score | Action |
|------|-------|--------|
| 🔴 Hot | 80-100+ | Priority human follow-up within 1 hour. Best chance of signing. |
| 🟡 Warm | 50-79 | Standard bot qualification flow. Human follow-up within 4 hours if qualified. |
| 🔵 Cool | 20-49 | Bot continues qualifying. Nurture sequence if they go quiet. |
| ⚪ Cold | 0-19 | Bot attempts to qualify. If no engagement after follow-up sequence, archive. |

**Windmill job: Lead Scorer**
```
Name: lead_scorer
Schedule: Real-time (called by message_router after each conversation update)
         + batch recalculation daily at 06:00
Language: TypeScript

Steps (real-time, per conversation):
1. Load conversation and qualification_answers
2. Apply scoring rules based on available data
3. Check source attribution (organic, retarget, paid)
4. Check lender intelligence for lender quality bonus
5. Calculate total score and breakdown
6. UPDATE ad_leads with lead_score, score_breakdown, score_tier
7. If score just crossed into 'hot' tier:
   - ALERT: "🔥 Hot lead: {name}, score {score}. 
     Lender: {lender}. Gambling: confirmed. 
     Channel: {channel}. Action needed."

Steps (daily batch):
1. Recalculate all active lead scores (engagement signals may have changed)
2. Downgrade leads that have been unresponsive:
   - No response in 48h: -10
   - No response in 7 days: -20
   - Failed follow-up sequence: -30
3. Update score tiers
4. Generate daily lead quality report
```

**Dashboard integration:**

Add to the Unified Inbox:
- Lead score badge next to each conversation (🔴🟡🔵⚪)
- Sort conversations by score (hottest leads at top)
- Filter by tier

Add to Overview Dashboard:
- Lead quality distribution chart (pie chart: hot/warm/cool/cold)
- Average lead score by source (which channels produce highest quality leads)
- Score-to-conversion correlation (do higher scored leads actually sign at higher rates?)

Add to Bot Performance Dashboard:
- Average lead score at qualification completion
- Score distribution of bot-qualified vs human-qualified leads

---

## 7. INTEGRATION NOTES

### Where these fit in the build phases:

**Phase 1 (Foundation) — add:**
- webhook_queue table and queue processor job
- api_credentials table and health monitor job
- lead_matches table and duplicate detector job

**Phase 2 (Dashboard) — add:**
- Credential health panel on overview dashboard
- Lead score column and tier badges in all lead tables

**Phase 4 (AI Integration) — add:**
- Lead scorer job (real-time and batch)
- Lead score badges in unified inbox

**Phase 6 (Spark Ads & Engagement) — add:**
- Lender intelligence table and updater job
- Lender intelligence integration with bot system prompt
- Lender performance dashboard page

**Phase 7 (Cross-Platform & Blended) — add:**
- case_financials table and financial sync job
- ROI by source dashboard
- Revenue pipeline dashboard
- Fee band auto-calculation
