# Ad Platform Spec — Strategy Addendum

**Purpose:** This addendum covers everything that needs adding or changing in the main spec to support the 12 advertising strategies Claude will help execute. Feed this to Claude alongside the main spec.

---

## SUMMARY OF GAPS IN THE MAIN SPEC

The original spec covers the core API endpoints, database, and dashboards but is missing infrastructure for:

1. **Video viewer custom audiences** — building retarget pools from video engagement
2. **Organic post tracking** — comment farming and engagement audiences
3. **Multi-tier lookalike management** — tracking source quality (lead vs signed vs payout)
4. **Placement-level optimisation** — Reels vs Feed vs Stories cost tracking
5. **Lead form quality scoring** — higher intent vs volume, qualifying question data
6. **Pixel warming campaign tracking** — separating warming campaigns from lead campaigns
7. **Time-of-day / day-of-week analytics** — hourly heatmaps and scheduling
8. **Creative fatigue detection** — age tracking, rotation alerts
9. **Creative tagging** — UGC vs polished, emotional angle, format type
10. **Exclusion audience automation** — auto-sync converted leads, CRM contacts, thank-you page visitors
11. **Emotional cycle scheduling** — creative rotation by day of week
12. **Comment monitoring** — tracking organic engagement for retargeting

---

## 1. NEW DATABASE TABLES

Add these tables to the schema in the main spec.

### 1.1 Creative Tags (supports strategies 8, 9, 12)

```sql
-- Tag system for creative analysis by Claude
CREATE TABLE creative_tags (
  id UUID PRIMARY KEY,
  creative_id UUID REFERENCES creatives(id),
  tag_category VARCHAR(50) NOT NULL,
  tag_value VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categories to use:
-- 'style'         → 'ugc', 'polished', 'testimonial', 'selfie', 'text_overlay'
-- 'emotion'       → 'anger', 'hope', 'urgency', 'empathy', 'fear'
-- 'angle'         → 'gambling', 'credit_card', 'general_debt', 'lender_specific'
-- 'format'        → 'video_vertical', 'video_horizontal', 'image', 'carousel'
-- 'hook_type'     → 'question', 'statement', 'statistic', 'story'
-- 'lender_mention' → 'vanquis', 'loans2go', '118money', 'lending_stream', 'none'

CREATE INDEX idx_creative_tags_category ON creative_tags(tag_category, tag_value);
CREATE INDEX idx_creative_tags_creative ON creative_tags(creative_id);
```

### 1.2 Creative Lifecycle Tracking (supports strategy 8)

```sql
-- Track creative age and fatigue signals
CREATE TABLE creative_lifecycle (
  id UUID PRIMARY KEY,
  creative_id UUID REFERENCES creatives(id),
  ad_id UUID REFERENCES ads(id),
  platform ENUM('meta', 'tiktok'),
  first_served_date DATE,
  days_active INTEGER DEFAULT 0,
  -- Fatigue indicators
  peak_ctr DECIMAL(6,4),
  current_ctr DECIMAL(6,4),
  ctr_decline_pct DECIMAL(6,2),        -- % drop from peak
  peak_cpl DECIMAL(10,4),
  current_cpl DECIMAL(10,4),
  cpl_increase_pct DECIMAL(6,2),       -- % increase from best
  peak_frequency DECIMAL(6,2),
  current_frequency DECIMAL(6,2),
  -- Status
  fatigue_status ENUM('fresh', 'performing', 'declining', 'fatigued', 'retired'),
  fatigue_flagged_at TIMESTAMP,
  retired_at TIMESTAMP,
  replacement_creative_id UUID,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_creative_lifecycle_status ON creative_lifecycle(fatigue_status);
CREATE INDEX idx_creative_lifecycle_active ON creative_lifecycle(days_active);
```

### 1.3 Audience Management (expanded — supports strategies 1, 2, 3, 11)

```sql
-- Replace the basic audience_syncs table from main spec with this
DROP TABLE IF EXISTS audience_syncs;

CREATE TABLE audiences (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_audience_id VARCHAR(100),
  name VARCHAR(255),
  -- Type and source tracking
  audience_type ENUM('custom', 'lookalike', 'engagement', 'video_viewer', 
                      'website_visitor', 'crm_exclusion', 'lead_form_submitter'),
  source_type ENUM('video_viewers', 'post_engagers', 'commenters', 
                    'website_visitors', 'pixel_events', 'crm_leads', 
                    'crm_signed_clients', 'crm_payout_clients', 
                    'crm_all_contacts', 'lead_form', 'lookalike_1pct', 
                    'lookalike_2pct', 'lookalike_5pct'),
  -- For lookalikes: what was the seed audience quality?
  lookalike_seed_audience_id UUID REFERENCES audiences(id),
  lookalike_percentage DECIMAL(4,2),
  -- Quality scoring
  source_quality_rank INTEGER,          -- 1 = payout clients (best), 2 = signed, 3 = leads, 4 = engagement
  -- Sizing
  audience_size INTEGER,
  match_rate DECIMAL(5,2),              -- for CRM uploads: what % matched
  -- Usage tracking
  is_exclusion BOOLEAN DEFAULT FALSE,    -- is this used as an exclusion audience?
  campaigns_using INTEGER DEFAULT 0,
  -- Sync
  last_synced_at TIMESTAMP,
  sync_status ENUM('syncing', 'complete', 'failed', 'stale'),
  auto_sync BOOLEAN DEFAULT FALSE,       -- should Windmill auto-refresh this?
  sync_frequency_hours INTEGER DEFAULT 24,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audiences_type ON audiences(audience_type, source_type);
CREATE INDEX idx_audiences_exclusion ON audiences(is_exclusion) WHERE is_exclusion = TRUE;
CREATE INDEX idx_audiences_auto_sync ON audiences(auto_sync) WHERE auto_sync = TRUE;
```

### 1.4 Video Viewer Audiences (supports strategy 1)

```sql
-- Track which videos are building audiences and how fast
CREATE TABLE video_audience_pools (
  id UUID PRIMARY KEY,
  creative_id UUID REFERENCES creatives(id),
  platform ENUM('meta', 'tiktok'),
  audience_id UUID REFERENCES audiences(id),
  -- Video engagement tiers
  viewers_3sec INTEGER DEFAULT 0,
  viewers_25pct INTEGER DEFAULT 0,
  viewers_50pct INTEGER DEFAULT 0,
  viewers_75pct INTEGER DEFAULT 0,
  viewers_95pct INTEGER DEFAULT 0,
  -- Pool growth
  pool_size INTEGER DEFAULT 0,
  pool_size_yesterday INTEGER DEFAULT 0,
  daily_growth_rate DECIMAL(6,2),
  -- Video details
  video_angle VARCHAR(100),             -- 'gambling_question', 'lender_profits', 'testimonial' etc
  video_hook TEXT,                       -- first line / hook text
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_video_pools_creative ON video_audience_pools(creative_id);
```

### 1.5 Organic Engagement Tracking (supports strategy 2)

```sql
-- Track organic posts and their engagement for retargeting
CREATE TABLE organic_posts (
  id UUID PRIMARY KEY,
  platform ENUM('meta_fb', 'meta_ig', 'tiktok'),
  platform_post_id VARCHAR(100),
  post_type ENUM('video', 'image', 'text', 'carousel', 'reel', 'story'),
  content_text TEXT,
  post_url TEXT,
  -- Engagement metrics
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  -- Comment mining
  comments_with_lender_names INTEGER DEFAULT 0,
  comments_indicating_interest INTEGER DEFAULT 0,
  -- Audience building
  engagement_audience_id UUID REFERENCES audiences(id),
  engagement_audience_size INTEGER DEFAULT 0,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  published_at TIMESTAMP,
  last_checked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual comments for lead identification
CREATE TABLE organic_comments (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES organic_posts(id),
  platform_comment_id VARCHAR(100),
  commenter_name VARCHAR(255),
  comment_text TEXT,
  -- AI analysis
  mentions_lender BOOLEAN DEFAULT FALSE,
  lender_mentioned VARCHAR(100),
  indicates_interest BOOLEAN DEFAULT FALSE,
  sentiment ENUM('positive', 'negative', 'neutral', 'angry', 'hopeful'),
  -- Follow-up
  replied_to BOOLEAN DEFAULT FALSE,
  reply_text TEXT,
  replied_at TIMESTAMP,
  -- Lead conversion
  converted_to_lead BOOLEAN DEFAULT FALSE,
  lead_id UUID REFERENCES ad_leads(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_organic_comments_interest ON organic_comments(indicates_interest) 
  WHERE indicates_interest = TRUE;
CREATE INDEX idx_organic_comments_lender ON organic_comments(mentions_lender) 
  WHERE mentions_lender = TRUE;
```

### 1.6 Campaign Categories (supports strategies 4, 6, 12)

```sql
-- Categorise campaigns for different purposes
-- Add this column to the campaigns table:
ALTER TABLE campaigns ADD COLUMN campaign_category ENUM(
  'lead_generation',        -- main lead campaigns
  'retarget',               -- retargeting warm audiences
  'pixel_warming',          -- cheap traffic to build pixel data
  'engagement',             -- engagement/comment farming
  'brand_awareness',        -- top of funnel awareness
  'lookalike_test'          -- testing new lookalike audiences
) DEFAULT 'lead_generation';

ALTER TABLE campaigns ADD COLUMN emotional_angle ENUM(
  'anger', 'hope', 'urgency', 'empathy', 'fear', 'mixed', 'none'
) DEFAULT 'none';

ALTER TABLE campaigns ADD COLUMN scheduled_days VARCHAR(20);
  -- e.g. 'mon,wed' for anger on Monday, hope on Wednesday etc
```

---

## 2. ADDITIONAL METRICS TO TRACK IN daily_metrics

Add these columns to the `daily_metrics` table:

```sql
-- Placement breakdown (supports strategy 4 — Breakout Technique)
ALTER TABLE daily_metrics ADD COLUMN placement VARCHAR(50);
-- Values: 'feed', 'stories', 'reels', 'audience_network', 'messenger', 
--         'instagram_feed', 'instagram_stories', 'instagram_reels',
--         'instagram_explore', 'tiktok_feed'

-- Time of day breakdown (supports strategy 7)
ALTER TABLE daily_metrics ADD COLUMN hour_of_day INTEGER;  -- 0-23

-- Day of week (supports strategies 7, 12)
ALTER TABLE daily_metrics ADD COLUMN day_of_week INTEGER;  -- 0=Mon, 6=Sun

-- Creative fatigue signals
ALTER TABLE daily_metrics ADD COLUMN creative_days_active INTEGER;

-- Lead quality (supports strategy 5)
ALTER TABLE daily_metrics ADD COLUMN leads_higher_intent INTEGER DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN leads_standard INTEGER DEFAULT 0;
```

**Update the Windmill data sync jobs** to request these additional breakdowns:

For Meta, add these to the insights request:
```
breakdowns=publisher_platform,platform_position,hourly_stats_aggregated_by_advertiser_time_zone
```

For TikTok, add these dimensions:
```
"dimensions": ["campaign_id", "adgroup_id", "stat_time_hour", "placement"]
```

---

## 3. ADDITIONAL META API ENDPOINTS NEEDED

### 3.1 Video Viewer Custom Audiences (Strategy 1)

```
POST /{ad_account_id}/customaudiences

Body:
{
  "name": "Video Viewers - Gambling Question Ad - 50%",
  "subtype": "ENGAGEMENT",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [{
        "event_sources": [{"type": "page", "id": "{page_id}"}],
        "retention_seconds": 2592000,   // 30 days
        "filter": {
          "operator": "and",
          "filters": [{
            "field": "event",
            "operator": "eq",
            "value": "video_watched"
          }, {
            "field": "video_watched.video_id",
            "operator": "eq",
            "value": "{video_id}"
          }, {
            "field": "video_watched.percent",
            "operator": "gte",
            "value": 50
          }]
        }
      }]
    }
  }
}
```

**Video engagement tiers to create audiences for:**
- 3 second views (broad warm pool)
- 25% watched (showed some interest)
- 50% watched (genuine interest)
- 75% watched (high intent)
- 95% watched (very high intent)

**Per video angle, create all 5 tiers. Then stack them:**

```
POST /{ad_account_id}/customaudiences

Body:
{
  "name": "MASTER RETARGET POOL - All Video Viewers 50%+",
  "subtype": "CUSTOM",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [
        // Include all individual video viewer audiences
        {"event_sources": [{"type": "audience", "id": "{audience_1_id}"}]},
        {"event_sources": [{"type": "audience", "id": "{audience_2_id}"}]},
        {"event_sources": [{"type": "audience", "id": "{audience_3_id}"}]}
        // ... all video viewer audiences
      ]
    }
  }
}
```

### 3.2 Post Engagement Audiences (Strategy 2)

```
POST /{ad_account_id}/customaudiences

Body:
{
  "name": "Page Engagers - Last 30 Days",
  "subtype": "ENGAGEMENT",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [{
        "event_sources": [{"type": "page", "id": "{page_id}"}],
        "retention_seconds": 2592000,
        "filter": {
          "operator": "or",
          "filters": [
            {"field": "event", "operator": "eq", "value": "page_engaged"},
            {"field": "event", "operator": "eq", "value": "post_engaged"},
            {"field": "event", "operator": "eq", "value": "page_and_cta_clicked"}
          ]
        }
      }]
    }
  }
}
```

### 3.3 Organic Post Comment Retrieval (Strategy 2)

```
GET /{post_id}/comments?fields=id,from,message,created_time,like_count
```

Use this in a Windmill job to pull comments, then run them through Claude to identify:
- Comments mentioning specific lender names
- Comments indicating the person has been affected by irresponsible lending
- Sentiment analysis

### 3.4 Website Custom Audiences for Pixel Warming (Strategy 6)

```
POST /{ad_account_id}/customaudiences

Body:
{
  "name": "Website Visitors - Blog Readers - 30 Days",
  "subtype": "WEBSITE",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [{
        "event_sources": [{"type": "pixel", "id": "{pixel_id}"}],
        "retention_seconds": 2592000,
        "filter": {
          "operator": "and",
          "filters": [{
            "field": "url",
            "operator": "i_contains",
            "value": "/blog/"
          }]
        }
      }]
    }
  }
}
```

### 3.5 Multi-Tier Lookalike Creation (Strategy 3)

```
POST /{ad_account_id}/customaudiences

// Tier 1: Lookalike from PAYOUT clients (highest quality seed)
Body:
{
  "name": "LAL 1% - Payout Clients",
  "subtype": "LOOKALIKE",
  "origin_audience_id": "{payout_clients_audience_id}",
  "lookalike_spec": {
    "type": "similarity",
    "ratio": 0.01,
    "country": "GB"
  }
}

// Tier 2: Lookalike from SIGNED clients
// Same structure, origin = signed clients audience, ratio 0.01

// Tier 3: Lookalike from all leads
// Same structure, origin = all leads audience, ratio 0.01 and 0.02
```

### 3.6 Exclusion Audience Endpoints (Strategy 11)

**Upload CRM contacts as exclusion audience:**
```
POST /{custom_audience_id}/users

Body:
{
  "payload": {
    "schema": ["EMAIL", "PHONE", "FN", "LN"],
    "data": [
      ["hash(email)", "hash(phone)", "hash(firstname)", "hash(lastname)"],
      // ... more rows
    ]
  }
}
```

**All data must be SHA256 hashed before upload.** Windmill job handles this.

**Thank-you page visitor audience:**
```
POST /{ad_account_id}/customaudiences

Body:
{
  "name": "EXCLUDE - Thank You Page Visitors",
  "subtype": "WEBSITE",
  "rule": {
    "inclusions": {
      "operator": "or",
      "rules": [{
        "event_sources": [{"type": "pixel", "id": "{pixel_id}"}],
        "retention_seconds": 7776000,  // 90 days
        "filter": {
          "field": "url",
          "operator": "i_contains",
          "value": "/thank-you"
        }
      }]
    }
  }
}
```

---

## 4. ADDITIONAL TIKTOK API ENDPOINTS NEEDED

### 4.1 Custom Audience from Engagement

```
POST /dmp/custom_audience/create/

Body:
{
  "advertiser_id": "YOUR_ID",
  "custom_audience_name": "Video Viewers 50%+ - Last 30 Days",
  "audience_type": "ENGAGEMENT",
  "engagement_type": "VIDEO",
  "engagement_conditions": {
    "video_ids": ["video_id_1", "video_id_2"],
    "watched_percent": 50,
    "retention_days": 30
  }
}
```

### 4.2 Lookalike from Custom Audience

```
POST /dmp/lookalike/create/

Body:
{
  "advertiser_id": "YOUR_ID",
  "lookalike_name": "LAL - Signed Clients - Narrow",
  "source_audience_id": "signed_clients_audience_id",
  "lookalike_spec": {
    "location_ids": [2826], // UK
    "expansion_type": "NARROW"   // NARROW, BALANCED, or BROAD
  }
}
```

### 4.3 Ad Scheduling (Strategy 7)

TikTok supports dayparting at the ad group level:

```
POST /adgroup/create/  (or /adgroup/update/)

Body includes:
{
  "schedule_type": "SCHEDULE_FROM_NOW",
  "dayparting": {
    "monday": "000000001111111111111111",    // 1 = active, 0 = paused (24 chars, one per hour)
    "tuesday": "000000001111111111111111",
    "wednesday": "000000001111111111111111",
    "thursday": "000000001111111111111111",
    "friday": "000000001111111111111111",
    "saturday": "111111111111111111111111",  // all day
    "sunday": "111111111111111111111111"
  }
}
```

For Meta, use `adset_schedule` on ad set creation:
```json
{
  "adset_schedule": [
    {"start_minute": 1200, "end_minute": 1440, "days": [0,1,2,3,4]},
    {"start_minute": 0, "end_minute": 1440, "days": [5,6]}
  ],
  "pacing_type": ["day_parting"]
}
```

---

## 5. NEW WINDMILL JOBS

### 5.1 Comment Mining Job (Strategy 2)

```
Name: comment_mining
Schedule: Every 30 minutes
Language: TypeScript

Steps:
1. GET list of active organic posts from organic_posts table
2. For each post, GET /{post_id}/comments since last_checked_at
3. For each new comment:
   a. INSERT into organic_comments
   b. Send comment text to Claude API with prompt:
      "Analyse this comment on a post about irresponsible lending claims.
       Does it mention a specific lender? If so which one?
       Does the commenter appear to be someone affected by irresponsible lending?
       Sentiment: angry/hopeful/neutral/negative?
       Return JSON: {mentions_lender: bool, lender: string, indicates_interest: bool, sentiment: string}"
   c. Update organic_comments with Claude's analysis
   d. If indicates_interest = true, flag for manual follow-up
4. Update organic_posts.last_checked_at
5. Update engagement counts on organic_posts
```

### 5.2 Creative Fatigue Monitor (Strategy 8)

```
Name: creative_fatigue_monitor
Schedule: Daily at 06:00
Language: TypeScript

Steps:
1. For each active ad with creative:
   a. Calculate days_active since first_served_date
   b. Get peak CTR and current 3-day average CTR
   c. Get best CPL and current 3-day average CPL
   d. Calculate decline percentages
2. Update creative_lifecycle table
3. Apply fatigue rules:
   - If CTR declined >30% from peak AND days_active > 7 → status = 'declining'
   - If CTR declined >50% from peak OR CPL increased >40% → status = 'fatigued'
   - If days_active > 14 AND any decline → flag for rotation
4. For fatigued creatives, send to Claude:
   "This creative has been running for X days. CTR dropped from X to X.
    CPL increased from £X to £X. The creative tags are: [tags].
    Suggest 3 replacement creative concepts that:
    - Use the same emotional angle but fresh execution
    - Address the same audience segment
    - Incorporate learnings from the current top performers"
5. Insert recommendations into ai_reports
6. Send alert if any creative flagged as fatigued
```

### 5.3 Audience Auto-Sync Job (Strategies 1, 3, 11)

```
Name: audience_auto_sync
Schedule: Daily at 05:00
Language: TypeScript

Steps:
1. Query audiences where auto_sync = true
2. For each audience by source_type:

   CRM EXCLUSIONS (strategy 11):
   a. Query CRM for all contacts with status = 'converted' or 'signed'
   b. Hash emails and phones (SHA256)
   c. POST to Meta /{audience_id}/users with hashed data
   d. POST to TikTok /dmp/custom_audience/file/upload/
   e. Update audience size and match rate

   VIDEO VIEWER POOLS (strategy 1):
   a. Check if any new video ads have been created
   b. For new videos, create engagement audiences at all 5 tiers
   c. Add new audiences to the master retarget pool
   d. Update video_audience_pools with current sizes

   LOOKALIKE REFRESH (strategy 3):
   a. Check if seed audiences have grown significantly (>20% since last refresh)
   b. If so, recreate lookalikes from updated seed
   c. Update audience records

   ENGAGEMENT AUDIENCES (strategy 2):
   a. Recreate post engagement audiences (Meta auto-updates these, 
      but log the current sizes)

3. Log all sync results
4. Alert if any sync failed
```

### 5.4 Pixel Warming Tracker (Strategy 6)

```
Name: pixel_warming_tracker
Schedule: Daily at 08:00
Language: TypeScript

Steps:
1. Query campaigns where campaign_category = 'pixel_warming'
2. For each warming campaign, pull metrics:
   - Website visitors driven
   - Cost per website visit
   - Pixel events fired (PageView, ViewContent, etc)
3. Track pixel learning progress:
   - Day 1-7: Collecting initial data
   - Day 8-14: Algorithm learning
   - Day 15-21: Should be optimising
   - Day 21+: Ready to switch to lead campaigns
4. Send to Claude:
   "Pixel warming campaign '{name}' has been running for {days} days.
    {visitors} website visitors at £{cost_per_visit} each.
    {pixel_events} pixel events recorded.
    Is this pixel sufficiently warmed to start running lead generation campaigns?
    What signals indicate readiness?"
5. Store analysis in ai_reports
6. Alert when pixel is deemed ready
```

### 5.5 Time-of-Day Optimiser (Strategy 7)

```
Name: time_of_day_analysis
Schedule: Weekly on Mondays at 07:00
Language: TypeScript

Steps:
1. Query hourly_metrics for last 7 days
2. Aggregate by hour_of_day and day_of_week:
   - CPL by hour
   - CTR by hour
   - Conversion rate by hour
   - Spend by hour
3. Send to Claude:
   "Here is hourly and day-of-week performance data for all campaigns.
    Target audience: people affected by gambling/irresponsible lending in the UK.
    
    Identify:
    1. Best performing hours (lowest CPL, highest CTR)
    2. Worst performing hours (wasted spend)
    3. Recommended ad schedule (which hours to run heavy, light, or pause)
    4. Day-of-week patterns
    5. Specific dayparting config for Meta and TikTok ad sets
    
    Format the dayparting as the actual API values I can plug into 
    Meta adset_schedule and TikTok dayparting fields."
4. Store recommendations in ai_reports
5. Optionally: auto-update ad set schedules via API (with approval flag)
```

### 5.6 Emotional Cycle Scheduler (Strategy 12)

```
Name: emotional_cycle_manager
Schedule: Daily at 00:01
Language: TypeScript

Steps:
1. Check today's day of week
2. Query campaigns table for campaigns with emotional_angle set
3. Based on the scheduled_days field:
   - If today matches scheduled_days → ensure campaign status = ACTIVE
   - If today doesn't match → PAUSE the campaign
4. API calls:
   Meta: POST /{campaign_id} with {"status": "ACTIVE"} or {"status": "PAUSED"}
   TikTok: POST /campaign/update/ with {"campaign_id": "X", "operation_status": "ENABLE"/"DISABLE"}
5. Log all status changes
```

---

## 6. NEW DASHBOARD PAGES & WIDGETS

### 6.1 Audience Manager Page (expanded from main spec)

**Audience Health Dashboard:**
- Total retarget pool size (combined all video viewers + engagers)
- Pool growth rate (daily new additions)
- Breakdown: video viewers vs post engagers vs website visitors
- Chart: retarget pool size over time

**Audience Quality Ladder:**
```
┌─────────────────────────────────────────────────────┐
│ SEED QUALITY          │ AUDIENCE        │ SIZE      │
├───────────────────────┼─────────────────┼───────────┤
│ ★★★★★ Payout Clients │ LAL 1% Payout   │ 450,000   │
│ ★★★★  Signed Clients │ LAL 1% Signed   │ 450,000   │
│ ★★★   All Leads      │ LAL 1% Leads    │ 450,000   │
│ ★★    Video 95%      │ Retarget Pool   │ 28,000    │
│ ★     Video 50%      │ Retarget Pool   │ 85,000    │
│ ★     Post Engagers  │ Retarget Pool   │ 12,000    │
│ ★     Website Visitors│ Pixel Warm Pool │ 45,000    │
└───────────────────────┴─────────────────┴───────────┘
```

**Exclusion Audiences Panel:**
- List of all exclusion audiences with sizes and last sync date
- Status indicators: green = synced today, yellow = stale, red = failed
- One-click force sync button

**Video Audience Builder:**
- List of all video creatives
- For each: audience sizes at each engagement tier (3s, 25%, 50%, 75%, 95%)
- Growth rate per video
- Button: "Add to Master Retarget Pool"

### 6.2 Creative War Room Page

**Creative Grid with Fatigue Indicators:**
- Each creative shown as a card with:
  - Thumbnail
  - Tags (style, emotion, angle)
  - Days active
  - Fatigue status badge: 🟢 Fresh, 🟡 Declining, 🔴 Fatigued
  - Key metrics: CTR, CPL, ROAS
  - CTR trend sparkline (last 14 days)

**Fatigue Timeline:**
- Gantt-style chart showing each creative's lifecycle
- Visual: when it peaked, when it started declining, when flagged

**Creative Performance by Tag:**
- Table: Average CPL by style tag (UGC vs polished vs testimonial)
- Table: Average CPL by emotion tag (anger vs hope vs urgency)
- Table: Average CPL by angle tag (gambling vs credit card vs general)
- Chart: UGC vs polished performance over time

**AI Creative Suggestions Panel:**
- Latest Claude creative recommendations
- Based on what's working and what's fatiguing
- "Generate New Concepts" button that triggers a Claude analysis

### 6.3 Placement Optimisation Page (Strategy 4)

**Placement Cost Comparison:**
| Placement | CPM | CPC | CPL | CTR | Spend | Leads | % of Total Spend |
|-----------|-----|-----|-----|-----|-------|-------|-------------------|
| FB Feed | £X | £X | £X | X% | £X | X | X% |
| FB Reels | £X | £X | £X | X% | £X | X | X% |
| FB Stories | £X | £X | £X | X% | £X | X | X% |
| IG Feed | £X | £X | £X | X% | £X | X | X% |
| IG Reels | £X | £X | £X | X% | £X | X | X% |
| IG Stories | £X | £X | £X | X% | £X | X | X% |
| Audience Network | £X | £X | £X | X% | £X | X | X% |
| TikTok Feed | £X | £X | £X | X% | £X | X | X% |

**Placement Trend Chart:**
- Line chart showing CPM by placement over last 30 days
- Highlights where Reels/Stories are cheaper than Feed

**AI Placement Recommendations:**
- Claude analysis of where budget is being wasted on expensive placements
- Specific recommendations for shifting spend to cheaper placements

### 6.4 Time-of-Day Heatmap Page (Strategy 7)

**Performance Heatmap:**
- 7 rows (Mon-Sun) × 24 columns (hours)
- Colour intensity = CPL (green = cheap, red = expensive)
- Toggle metric: CPL / CTR / Conversion Rate / Spend

**Best/Worst Hours Table:**
| Rank | Hour | Day | CPL | CTR | Leads | Spend |
|------|------|-----|-----|-----|-------|-------|
| Best | 22:00 | Saturday | £2.10 | 3.2% | 15 | £31.50 |
| Best | 21:00 | Sunday | £2.45 | 2.8% | 12 | £29.40 |
| ... | | | | | | |
| Worst | 09:00 | Tuesday | £12.80 | 0.4% | 1 | £12.80 |

**Current Ad Schedule Display:**
- Visual representation of which hours ads are currently running
- Side-by-side with the optimal schedule Claude recommends
- "Apply Recommended Schedule" button

### 6.5 Comment Mining Dashboard (Strategy 2)

**Recent Comments Feed:**
- Live feed of comments flagged as indicating interest
- Each shows: commenter name, comment text, lender mentioned, post it's on
- Action buttons: "Reply with Link", "Add to Leads", "Dismiss"

**Comment Analytics:**
- Comments per day trend
- Top lenders mentioned in comments
- Conversion rate: comment → lead → signed client

**Organic Post Performance:**
- List of organic posts with engagement metrics
- Which posts generated the most interest-indicating comments
- Engagement audience size built from each post

### 6.6 Pixel Warming Dashboard (Strategy 6)

**Pixel Health Monitor:**
- Warming campaign: days running, visitors driven, cost per visit
- Pixel events chart: daily event volume over time
- Pixel learning status: Collecting → Learning → Optimising → Ready
- Estimated readiness date

**Comparison:**
- Lead campaign performance BEFORE pixel warming (historical)
- Lead campaign performance AFTER pixel warming
- CPL difference, conversion rate difference

### 6.7 Emotional Cycle Calendar (Strategy 12)

**Weekly Calendar View:**
| | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday |
|--|--------|---------|-----------|----------|--------|----------|--------|
| Theme | 😠 Anger | — | 🌟 Hope | — | ⚡ Urgency | 🌟 Hope | ⚡ Urgency |
| Active Campaigns | [list] | [list] | [list] | [list] | [list] | [list] | [list] |
| Budget | £X | £X | £X | £X | £X | £X | £X |

**Emotional Angle Performance:**
- Which emotional angle produces the lowest CPL
- Which produces the highest conversion rate
- Best day-of-week for each emotion

---

## 7. UPDATED AI PROMPTS FOR CLAUDE

### 7.1 Comprehensive Daily Review (updated)

Add to the existing daily review prompt:

```
Additional analysis required:

CREATIVE FATIGUE:
- Which creatives have been running >10 days with declining CTR?
- Which creatives should be rotated out this week?
- Suggest 3 replacement concepts for each fatigued creative

AUDIENCE HEALTH:
- Current retarget pool size and growth rate
- Are any audiences becoming saturated (frequency >3)?
- Should we create new video content to grow the warm pool?

PLACEMENT OPTIMISATION:
- Which placements are delivering cheapest CPL?
- How much budget is going to expensive placements?
- Specific budget shift recommendations by placement

TIME OF DAY:
- Were there any hours yesterday where we overspent for poor results?
- Should we adjust the ad schedule based on recent data?

EXCLUSIONS:
- Estimated wasted spend on people who've already converted
- Is the exclusion audience up to date?

PIXEL WARMING STATUS:
- If warming campaigns running: progress assessment
- If not: should we start one?
```

### 7.2 Creative Generation Prompt (new)

```
You are a direct response ad creative strategist for a UK law firm that helps 
people claim compensation for irresponsible lending (gambling-related debt, 
unaffordable credit cards, high-cost loans).

Current top performing creatives and their metrics:
{JSON data with creative text, tags, CPL, CTR, conversion rate}

Current fatigued creatives that need replacing:
{JSON data}

Generate 5 new ad concepts. For each provide:
1. HOOK (first 3 seconds / first line) — must stop the scroll
2. BODY TEXT — the message
3. CTA — call to action text
4. STYLE — UGC/selfie/testimonial/text overlay
5. EMOTIONAL ANGLE — anger/hope/urgency/empathy
6. TARGET ANGLE — gambling/credit card/specific lender/general debt
7. RECOMMENDED PLACEMENT — Reels/Feed/Stories
8. WHY — based on current data, why this should work

Rules:
- Prioritise UGC/selfie style (outperforming polished 3-5x)
- Hooks must be questions or shocking statements
- Keep body text conversational, not corporate
- Must be compliant with SRA advertising rules for solicitors
- Reference real outcomes where possible
```

### 7.3 Comment Analysis Prompt (new)

```
Analyse these comments from an organic social media post about irresponsible lending.

Post content: "{post_text}"

Comments:
{JSON array of comments}

For each comment, return JSON:
{
  "comment_id": "X",
  "mentions_lender": true/false,
  "lender_name": "string or null",
  "indicates_interest": true/false,
  "interest_confidence": "high/medium/low",
  "sentiment": "angry/hopeful/neutral/negative",
  "suggested_reply": "string — a helpful reply that invites them to learn more 
                      without being pushy, compliant with SRA rules"
}

Only flag indicates_interest as true if the commenter appears to have personally 
been affected by irresponsible lending. General agreement with the post is not 
enough — look for personal language like "this happened to me", mentions of 
specific amounts, specific lenders, or questions about how to claim.
```

---

## 8. UPDATED IMPLEMENTATION PHASES

Adjust the main spec phases to incorporate strategy support:

### Phase 1 — Foundation (Week 1-2)
- [ ] All database tables including new ones from this addendum
- [ ] Meta and TikTok API setup
- [ ] Windmill setup
- [ ] Data sync jobs (with placement + hourly breakdowns)
- [ ] Basic overview dashboard

### Phase 2 — Core Dashboard (Week 3-4)
- [ ] Campaign performance page
- [ ] Placement optimisation page
- [ ] Time-of-day heatmap page
- [ ] Spend & budget monitoring
- [ ] Lead analytics with CRM integration

### Phase 3 — Audience Infrastructure (Week 5-6)
- [ ] Audience manager page
- [ ] Video viewer audience auto-creation
- [ ] CRM exclusion auto-sync job
- [ ] Lookalike audience management (multi-tier)
- [ ] Master retarget pool builder
- [ ] Pixel warming tracker

### Phase 4 — Creative & AI (Week 7-8)
- [ ] Creative war room page with fatigue tracking
- [ ] Creative tagging system
- [ ] Creative fatigue monitor Windmill job
- [ ] AI command centre with Claude chat
- [ ] Daily AI analysis job (comprehensive prompt)
- [ ] Creative generation prompts

### Phase 5 — Engagement & Automation (Week 9-10)
- [ ] Comment mining dashboard
- [ ] Comment mining Windmill job with Claude analysis
- [ ] Organic post tracking
- [ ] Emotional cycle calendar and scheduler
- [ ] Emotional cycle Windmill job
- [ ] Time-of-day optimiser job

### Phase 6 — Ad Management & Full Loop (Week 11-12)
- [ ] Campaign builder UI
- [ ] Creative upload with auto-tagging
- [ ] Ad scheduling controls
- [ ] Lead form configuration
- [ ] Full automation: Claude recommends → you approve → Windmill executes
