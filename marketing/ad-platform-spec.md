# Ad Management & Analytics Module — Technical Specification

**For:** Rowan Rose CRM (Custom AWS/Node.js)
**Purpose:** Connect Facebook, Instagram, and TikTok ad platforms to the CRM with full analytics dashboards and AI-powered optimisation via Claude API.
**Architecture:** CRM UI → Node.js Backend → Database ← Windmill (scheduled jobs) ← Claude API (analysis)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CRM UI (Frontend)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Dashboard │  │ Campaign │  │ Ad       │  │ AI      │ │
│  │ Analytics │  │ Builder  │  │ Creative │  │ Insights│ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                 Node.js Backend API                       │
│  /api/ads/campaigns  /api/ads/insights  /api/ads/create  │
│  /api/ads/ai-analysis  /api/ads/audiences                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              Database (PostgreSQL / MySQL)                │
│  campaigns | ad_sets | ads | daily_metrics | ai_reports  │
│  audiences | creatives | platform_accounts               │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                  Windmill (Job Engine)                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ Data Sync  │ │ Ad Actions │ │ AI Analysis│           │
│  │ (15 min)   │ │ (on demand)│ │ (daily)    │           │
│  └────────────┘ └────────────┘ └────────────┘           │
└─────────┬──────────────┬──────────────┬─────────────────┘
          │              │              │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌────┴────┐
    │ Meta API  │  │ TikTok API│  │Claude API│
    │ (FB + IG) │  │           │  │          │
    └───────────┘  └───────────┘  └──────────┘
```

---

## 2. Windmill Jobs — What It Handles

Windmill sits between your CRM database and the ad platforms. It runs scheduled scripts (Python or TypeScript) that:

### Job 1: Data Sync (runs every 15 minutes)
- Pulls campaign, ad set, and ad-level performance data from Meta and TikTok
- Writes metrics to the database
- Handles API rate limiting, retries, and error logging
- Backfills attribution data (Meta updates conversions retroactively up to 7 days)

### Job 2: Ad Creation/Modification (triggered on demand)
- When you click "Launch Campaign" in the CRM, a webhook fires to Windmill
- Windmill executes the script that pushes campaign structure, targeting, budget, and creative to Meta/TikTok APIs
- Returns the platform campaign IDs back to the CRM database

### Job 3: AI Analysis (runs daily at 7am)
- Pulls yesterday's performance data from the database
- Sends structured data to Claude API with prompts like:
  - "Analyse these campaigns. Identify which have CPL above £X. Suggest budget reallocation."
  - "Compare creative performance. Which ad copy/image combinations are winning?"
  - "Flag any campaigns spending over budget with declining ROAS"
- Writes Claude's analysis back to the `ai_reports` table for display in the CRM

### Job 4: Alerts (runs every hour)
- Monitors for spend anomalies, CPM spikes, budget exhaustion
- Sends WhatsApp/email alerts when thresholds are breached

### Job 5: Audience Sync (runs daily)
- Pushes CRM contact segments to Meta Custom Audiences and TikTok Audiences
- Syncs lookalike audience creation requests

---

## 3. Meta Marketing API — Endpoints & Data

**Base URL:** `https://graph.facebook.com/v21.0`
**Auth:** OAuth 2.0 access token with `ads_management` and `ads_read` permissions

### 3.1 Account & Campaign Structure

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| List ad accounts | GET | `/me/adaccounts` | Returns all accounts the token has access to |
| Get account info | GET | `/{ad_account_id}` | Fields: name, currency, timezone, spend_cap |
| List campaigns | GET | `/{ad_account_id}/campaigns` | Fields: id, name, objective, status, daily_budget, lifetime_budget, budget_remaining |
| Get campaign | GET | `/{campaign_id}` | Individual campaign details |
| List ad sets | GET | `/{campaign_id}/adsets` | Fields: id, name, targeting, bid_amount, billing_event, optimization_goal, status |
| List ads | GET | `/{adset_id}/ads` | Fields: id, name, status, creative |
| Get ad creative | GET | `/{ad_id}/adcreatives` | Fields: title, body, image_url, video_id, call_to_action_type, link_url |

### 3.2 Insights (Performance Data) — THE KEY ENDPOINT

**Endpoint:** `GET /{object_id}/insights`

Where `{object_id}` can be an ad account, campaign, ad set, or individual ad.

**Parameters:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `fields` | See metrics table below | Which metrics to return |
| `date_preset` | `today`, `yesterday`, `last_7d`, `last_30d`, `this_month`, `last_month` | Quick date ranges |
| `time_range` | `{"since":"2025-01-01","until":"2025-01-31"}` | Custom date range |
| `time_increment` | `1` (daily), `7` (weekly), `monthly`, `all_days` | Granularity |
| `breakdowns` | `age`, `gender`, `country`, `publisher_platform`, `platform_position`, `device_platform` | Segment data |
| `level` | `campaign`, `adset`, `ad` | Aggregation level |
| `filtering` | `[{"field":"campaign.name","operator":"CONTAIN","value":"irresponsible"}]` | Filter results |

**Core Metrics to Pull (fields parameter):**

| Metric | Field Name | What It Is |
|--------|-----------|------------|
| **Spend** | `spend` | Total amount spent |
| **Impressions** | `impressions` | Number of times ads were shown |
| **Reach** | `reach` | Unique people who saw the ad |
| **Views** | `views` | Replacing reach from Nov 2025 onwards |
| **Clicks (all)** | `clicks` | All clicks including reactions, comments |
| **Link clicks** | `inline_link_clicks` | Clicks to destination URL only |
| **CTR** | `ctr` | Click-through rate (all clicks) |
| **Link CTR** | `inline_link_click_ctr` | CTR for link clicks specifically |
| **CPM** | `cpm` | Cost per 1,000 impressions |
| **CPC (all)** | `cpc` | Cost per click (all clicks) |
| **CPC (link)** | `cost_per_inline_link_click` | Cost per link click |
| **Cost per result** | `cost_per_action_type` | Cost per conversion/lead/etc |
| **Conversions** | `actions` | Array of action types and counts |
| **Conversion values** | `action_values` | Revenue/value from conversions |
| **Leads** | `actions` (filter `action_type=lead`) | Lead form submissions |
| **Cost per lead** | `cost_per_action_type` (filter `action_type=lead`) | CPL |
| **Frequency** | `frequency` | Average times each person saw the ad |
| **ROAS** | `purchase_roas` | Return on ad spend |
| **Video views** | `video_p25_watched_actions`, `video_p50_watched_actions`, `video_p75_watched_actions`, `video_p100_watched_actions` | Video completion rates |
| **Quality ranking** | `quality_ranking` | Ad quality vs competitors |
| **Engagement rate ranking** | `engagement_rate_ranking` | Engagement vs competitors |
| **Conversion rate ranking** | `conversion_rate_ranking` | Conversion rate vs competitors |

**Example Insights Request:**
```
GET /act_123456789/insights?
  fields=campaign_name,spend,impressions,clicks,inline_link_clicks,cpm,cpc,
         cost_per_inline_link_click,ctr,inline_link_click_ctr,actions,
         cost_per_action_type,frequency,reach,purchase_roas,
         quality_ranking,engagement_rate_ranking,conversion_rate_ranking
  &time_range={"since":"2025-02-01","until":"2025-02-25"}
  &time_increment=1
  &level=campaign
  &breakdowns=publisher_platform
```

### 3.3 Campaign Creation

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create campaign | POST | `/{ad_account_id}/campaigns` | name, objective (OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_SALES), status, daily_budget or lifetime_budget, special_ad_categories |
| Create ad set | POST | `/{ad_account_id}/adsets` | campaign_id, name, targeting (locations, age_min, age_max, genders, interests, custom_audiences), billing_event, optimization_goal, bid_amount, daily_budget, start_time, end_time |
| Create ad creative | POST | `/{ad_account_id}/adcreatives` | name, object_story_spec (page_id, link_data or video_data including message, link, caption, image_hash/video_id, call_to_action) |
| Create ad | POST | `/{ad_account_id}/ads` | adset_id, creative (creative_id), name, status |
| Upload image | POST | `/{ad_account_id}/adimages` | Multipart file upload, returns image_hash |
| Upload video | POST | `/{ad_account_id}/advideos` | Multipart file upload, returns video_id |

### 3.4 Audience Management

| Action | Method | Endpoint |
|--------|--------|----------|
| Create custom audience | POST | `/{ad_account_id}/customaudiences` |
| Add users to audience | POST | `/{custom_audience_id}/users` |
| Create lookalike | POST | `/{ad_account_id}/customaudiences` |
| List audiences | GET | `/{ad_account_id}/customaudiences` |

### 3.5 Lead Ads (for your irresponsible lending funnels)

| Action | Method | Endpoint |
|--------|--------|----------|
| Get lead forms | GET | `/{page_id}/leadgen_forms` |
| Get leads from form | GET | `/{form_id}/leads` |
| Subscribe to real-time leads | POST | `/{page_id}/subscribed_apps` (with `leadgen` field) |

**Important Meta API Notes:**
- Rate limits are based on a rolling 1-hour window; build exponential backoff
- Attribution data can change for up to 7 days after initial report — backfill daily
- Meta deprecated 100+ unique metrics in 2024; use the fields listed above
- From Feb 2025, Advantage+ Shopping/App campaigns use unified API structure
- `impressions` metric on Page Insights replaced by `views` from Nov 2025
- Always use API version v21.0 or later

---

## 4. TikTok Marketing API — Endpoints & Data

**Base URL:** `https://business-api.tiktok.com/open_api/v1.3`
**Auth:** Access token via OAuth 2.0 (TikTok for Business developer app)

### 4.1 Account & Campaign Structure

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Get advertiser info | GET | `/advertiser/info/` | advertiser_id, currency, timezone |
| List campaigns | GET | `/campaign/get/` | Params: advertiser_id, filtering, page, page_size |
| List ad groups | GET | `/adgroup/get/` | Params: advertiser_id, campaign_ids, filtering |
| List ads | GET | `/ad/get/` | Params: advertiser_id, adgroup_ids, filtering |

### 4.2 Reporting (Performance Data) — THE KEY ENDPOINT

**Endpoint:** `POST /report/integrated/get/`

This is TikTok's unified reporting endpoint. Send a POST with JSON body.

**Request Body Structure:**
```json
{
  "advertiser_id": "YOUR_ADVERTISER_ID",
  "report_type": "BASIC",
  "data_level": "AUCTION_CAMPAIGN",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": [
    "spend", "impressions", "clicks", "cpm", "cpc",
    "ctr", "reach", "frequency", "conversion",
    "cost_per_conversion", "conversion_rate",
    "video_play_actions", "video_watched_2s",
    "video_watched_6s", "average_video_play",
    "result", "cost_per_result", "result_rate"
  ],
  "start_date": "2025-02-01",
  "end_date": "2025-02-25",
  "page": 1,
  "page_size": 100
}
```

**Data Levels:**

| data_level | What it reports on |
|------------|-------------------|
| `AUCTION_CAMPAIGN` | Campaign level |
| `AUCTION_ADGROUP` | Ad group level |
| `AUCTION_AD` | Individual ad level |
| `AUCTION_ADVERTISER` | Account level |

**Core Metrics Available:**

| Metric | Field Name | What It Is |
|--------|-----------|------------|
| **Spend** | `spend` | Total cost |
| **Impressions** | `impressions` | Times ad was shown |
| **Clicks** | `clicks` | Total clicks |
| **CTR** | `ctr` | Click-through rate |
| **CPM** | `cpm` | Cost per 1,000 impressions |
| **CPC** | `cpc` | Cost per click |
| **Reach** | `reach` | Unique users reached |
| **Frequency** | `frequency` | Average views per user |
| **Conversions** | `conversion` | Total conversion events |
| **Cost per conversion** | `cost_per_conversion` | CPA |
| **Conversion rate** | `conversion_rate` | CVR |
| **Results** | `result` | Optimisation results based on objective |
| **Cost per result** | `cost_per_result` | Cost per optimisation result |
| **Video views** | `video_play_actions` | Total video plays |
| **2s video views** | `video_watched_2s` | Views of 2+ seconds |
| **6s video views** | `video_watched_6s` | Views of 6+ seconds |
| **Avg play time** | `average_video_play` | Average watch duration |
| **Video completion** | `video_views_p25`, `video_views_p50`, `video_views_p75`, `video_views_p100` | Completion percentages |
| **Likes** | `likes` | Post likes |
| **Comments** | `comments` | Post comments |
| **Shares** | `shares` | Post shares |
| **Follows** | `follows` | New follows from ad |
| **Profile visits** | `profile_visits` | Profile page views |

**Dimension Breakdowns:**

| Dimension | Purpose |
|-----------|---------|
| `stat_time_day` | Daily breakdown |
| `stat_time_hour` | Hourly breakdown |
| `country_code` | By country |
| `gender` | By gender |
| `age` | By age group |
| `platform` | By device platform |
| `placement` | By ad placement |
| `ac` | By creative material |

### 4.3 Campaign Creation

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create campaign | POST | `/campaign/create/` | advertiser_id, campaign_name, objective_type (TRAFFIC, CONVERSIONS, APP_INSTALL, LEAD_GENERATION, REACH, VIDEO_VIEWS), budget, budget_mode (BUDGET_MODE_DAY, BUDGET_MODE_TOTAL) |
| Create ad group | POST | `/adgroup/create/` | advertiser_id, campaign_id, adgroup_name, placement_type, placements, location_ids, age_groups, gender, budget, schedule_type, billing_event, bid_type, bid, optimization_goal, pixel_id |
| Upload image | POST | `/file/image/ad/upload/` | Multipart upload, returns image_id |
| Upload video | POST | `/file/video/ad/upload/` | Multipart upload, returns video_id |
| Create ad | POST | `/ad/create/` | advertiser_id, adgroup_id, creatives (array of creative objects with image_ids/video_id, ad_text, call_to_action, landing_page_url) |

### 4.4 Audience Management

| Action | Method | Endpoint |
|--------|--------|----------|
| Create custom audience | POST | `/dmp/custom_audience/create/` |
| Upload audience file | POST | `/dmp/custom_audience/file/upload/` |
| Create lookalike | POST | `/dmp/lookalike/create/` |
| List audiences | GET | `/dmp/custom_audience/list/` |

### 4.5 Lead Generation

| Action | Method | Endpoint |
|--------|--------|----------|
| Get lead data | GET | `/pages/leads/get/` |
| Subscribe to webhooks | POST | Webhook configuration in TikTok Business Center |

**Important TikTok API Notes:**
- Rate limit: 10 requests per second per app, 600 per minute
- Reporting data has a 3-hour delay minimum
- Video uploads can take time to process — poll status before creating ads
- TikTok requires minimum budgets: ~$500/campaign, ~$20/day per ad group
- The reporting endpoint uses POST not GET

---

## 5. Instagram — Covered by Meta API

Instagram ads are managed entirely through the Meta Marketing API. There is no separate Instagram ads API. When you create campaigns through Meta's API:

- Set `publisher_platforms` to include `instagram` in the ad set targeting
- Instagram-specific placements: `instagram_feed`, `instagram_stories`, `instagram_reels`, `instagram_explore`
- Creative specs differ slightly (e.g. Stories require 9:16 aspect ratio)
- Insights breakdowns by `publisher_platform` will separate Facebook vs Instagram performance

For organic Instagram analytics (follower counts, post engagement, profile views), use the Instagram Graph API:
- **Base URL:** `https://graph.facebook.com/v21.0`
- **Endpoint:** `GET /{ig_user_id}/insights` with metrics like `impressions`, `reach`, `follower_count`, `profile_views`
- **Media insights:** `GET /{media_id}/insights` for individual post performance

---

## 6. Database Schema

These tables store everything the Windmill jobs pull in and the CRM UI reads from.

### 6.1 Core Tables

```sql
-- Platform account connections
CREATE TABLE platform_accounts (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
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
CREATE TABLE campaigns (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_campaign_id VARCHAR(50),
  platform_account_id UUID REFERENCES platform_accounts(id),
  name VARCHAR(255),
  objective VARCHAR(50),
  status VARCHAR(30),
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ad Sets / Ad Groups
CREATE TABLE ad_sets (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_adset_id VARCHAR(50),
  campaign_id UUID REFERENCES campaigns(id),
  name VARCHAR(255),
  status VARCHAR(30),
  targeting JSONB,
  bid_amount DECIMAL(10,4),
  daily_budget DECIMAL(10,2),
  optimization_goal VARCHAR(50),
  billing_event VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual Ads
CREATE TABLE ads (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_ad_id VARCHAR(50),
  ad_set_id UUID REFERENCES ad_sets(id),
  name VARCHAR(255),
  status VARCHAR(30),
  creative_id UUID REFERENCES creatives(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creatives
CREATE TABLE creatives (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_creative_id VARCHAR(50),
  type ENUM('image', 'video', 'carousel'),
  headline VARCHAR(255),
  body_text TEXT,
  call_to_action VARCHAR(50),
  landing_url TEXT,
  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Metrics Tables (populated by Windmill every 15 min)

```sql
-- Daily performance metrics (one row per ad per day per platform)
CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  platform ENUM('meta', 'tiktok'),
  campaign_id UUID REFERENCES campaigns(id),
  ad_set_id UUID REFERENCES ad_sets(id),
  ad_id UUID REFERENCES ads(id),
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
  -- Video (if applicable)
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
  -- Breakdowns stored as JSONB for flexibility
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
CREATE TABLE hourly_metrics (
  id UUID PRIMARY KEY,
  hour TIMESTAMP NOT NULL,
  platform ENUM('meta', 'tiktok'),
  campaign_id UUID REFERENCES campaigns(id),
  spend DECIMAL(10,2),
  impressions INTEGER,
  clicks INTEGER,
  leads INTEGER,
  cpm DECIMAL(10,4),
  cpc DECIMAL(10,4),
  cost_per_lead DECIMAL(10,4),
  synced_at TIMESTAMP DEFAULT NOW()
);

-- AI analysis reports
CREATE TABLE ai_reports (
  id UUID PRIMARY KEY,
  report_date DATE,
  report_type ENUM('daily_review', 'creative_analysis', 'budget_recommendation', 'anomaly_alert', 'weekly_summary'),
  platform ENUM('meta', 'tiktok', 'all'),
  analysis TEXT,
  recommendations JSONB,
  flagged_campaigns JSONB,
  top_performers JSONB,
  underperformers JSONB,
  suggested_actions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lead tracking (links ad leads to CRM clients)
CREATE TABLE ad_leads (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_lead_id VARCHAR(100),
  campaign_id UUID REFERENCES campaigns(id),
  ad_id UUID REFERENCES ads(id),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  form_data JSONB,
  crm_client_id UUID,  -- links to your existing CRM clients table
  status ENUM('new', 'contacted', 'qualified', 'converted', 'rejected'),
  cost DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audience sync tracking
CREATE TABLE audience_syncs (
  id UUID PRIMARY KEY,
  platform ENUM('meta', 'tiktok'),
  platform_audience_id VARCHAR(100),
  audience_name VARCHAR(255),
  audience_type ENUM('custom', 'lookalike'),
  contact_count INTEGER,
  last_synced_at TIMESTAMP,
  sync_status ENUM('syncing', 'complete', 'failed'),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.3 Indexes for Dashboard Performance

```sql
-- Essential indexes for fast dashboard queries
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX idx_daily_metrics_campaign ON daily_metrics(campaign_id, date);
CREATE INDEX idx_daily_metrics_platform_date ON daily_metrics(platform, date);
CREATE INDEX idx_hourly_metrics_hour ON hourly_metrics(hour);
CREATE INDEX idx_hourly_metrics_campaign ON hourly_metrics(campaign_id, hour);
CREATE INDEX idx_ai_reports_date ON ai_reports(report_date);
CREATE INDEX idx_ad_leads_status ON ad_leads(status, created_at);
CREATE INDEX idx_ad_leads_campaign ON ad_leads(campaign_id, created_at);
```

---

## 7. Analytics Dashboard — Pages & Widgets

### 7.1 Overview Dashboard (Home Page)

This is the first thing you see when you open the ads section of the CRM. Everything at a glance.

**Top Row — KPI Cards (today vs yesterday, with % change arrows):**
- Total Spend (all platforms)
- Total Leads
- Average Cost Per Lead
- Average CPM
- Average CPC
- Overall ROAS

**Second Row — Spend & Leads Over Time:**
- Line chart: Daily spend (last 30 days) with leads overlaid as bars
- Separate lines for Meta vs TikTok
- Toggle: 7d / 14d / 30d / 90d / custom range

**Third Row — Platform Comparison:**
- Side-by-side comparison table: Meta vs TikTok
  - Spend, Impressions, Clicks, CTR, CPM, CPC, Leads, CPL, ROAS
  - Colour coded: green = better, red = worse

**Fourth Row — Top & Bottom Performers:**
- Top 5 campaigns by ROAS (with spend, leads, CPL)
- Bottom 5 campaigns by CPL (highest cost per lead)
- Top 5 ads by CTR
- Bottom 5 ads by CTR

**Fifth Row — AI Insights Panel:**
- Latest Claude analysis summary
- Flagged campaigns requiring attention
- Recommended actions (budget changes, pause/unpause, creative refresh)
- Link to full AI report

### 7.2 Campaign Performance Page

**Filters Bar:**
- Platform: All / Meta / TikTok
- Status: Active / Paused / All
- Date range picker
- Objective filter

**Campaign Table (sortable columns):**
| Column | Source |
|--------|--------|
| Campaign Name | campaigns.name |
| Platform | campaigns.platform |
| Status | campaigns.status |
| Objective | campaigns.objective |
| Budget (Daily) | campaigns.daily_budget |
| Spend | SUM(daily_metrics.spend) |
| Impressions | SUM(daily_metrics.impressions) |
| Clicks | SUM(daily_metrics.clicks) |
| Link Clicks | SUM(daily_metrics.link_clicks) |
| CTR | AVG(daily_metrics.ctr) |
| CPM | Calculated: (spend / impressions) * 1000 |
| CPC | Calculated: spend / clicks |
| Leads | SUM(daily_metrics.leads) |
| CPL | Calculated: spend / leads |
| Conversions | SUM(daily_metrics.conversions) |
| ROAS | Calculated: conversion_value / spend |
| Frequency | AVG(daily_metrics.frequency) |
| Quality Rank | daily_metrics.quality_ranking |

**Click into a campaign → Campaign Detail View:**
- Performance chart (spend, CPL, ROAS over time)
- Ad set breakdown table
- Individual ad performance table
- Audience demographics (age, gender, location breakdowns)
- Device & placement breakdown
- AI recommendations specific to this campaign

### 7.3 Creative Performance Page

**Purpose:** See which ad copy, images, and videos perform best so Claude can identify patterns.

**Creative Grid View:**
- Thumbnail of each creative
- Below each: spend, CTR, CPL, ROAS
- Colour border: green (top performer), yellow (average), red (underperformer)
- Sort by: CPL (lowest first), CTR (highest first), Spend, ROAS

**Creative Comparison Table:**
| Column | Description |
|--------|-------------|
| Preview | Image/video thumbnail |
| Headline | Creative headline text |
| Body Text | Ad body copy |
| CTA | Call to action type |
| Platform | Meta / TikTok |
| Impressions | Total impressions |
| CTR | Click-through rate |
| CPL | Cost per lead |
| ROAS | Return on ad spend |
| Video Completion | % who watched to end (video only) |
| Quality Rank | Meta quality ranking |

**AI Creative Analysis Panel:**
- Which headlines work best
- Which image/video styles convert
- Recommended new creative angles based on top performers
- A/B test suggestions

### 7.4 Lead Analytics Page

**Purpose:** Connect ad spend to actual client outcomes in your CRM.

**KPI Cards:**
- Total leads (this period)
- Cost per lead (average)
- Lead → Client conversion rate
- Revenue per lead
- Best performing campaign for leads

**Lead Funnel Visualisation:**
```
Ad Impressions → Clicks → Form Submissions → Contacted → Qualified → Client Signed
    100,000       2,500        150               120          80           45
```

**Lead Source Table:**
| Campaign | Platform | Leads | CPL | Contacted % | Qualified % | Converted % | Revenue | ROI |
|----------|----------|-------|-----|-------------|-------------|-------------|---------|-----|

**Lead Quality by Campaign:**
- Chart showing which campaigns produce leads that actually convert to clients
- This is critical for your practice — a low CPL means nothing if those leads don't sign

### 7.5 Spend & Budget Page

**Purpose:** Financial oversight and budget management.

**Budget Status Cards:**
- Total budget allocated vs spent (this month)
- Daily run rate vs target
- Projected end-of-month spend
- Budget remaining

**Daily Spend Chart:**
- Stacked bar chart: Meta + TikTok daily spend
- Budget line overlay showing daily target
- Anomaly markers (days with unusual spend)

**Budget Table:**
| Campaign | Daily Budget | Yesterday Spend | 7d Avg Spend | Budget Utilisation % | Pacing |
|----------|-------------|----------------|-------------|---------------------|--------|

**Alerts Config:**
- Set thresholds: "Alert me if CPL exceeds £X"
- Set thresholds: "Alert me if daily spend exceeds £X"
- Set thresholds: "Alert me if ROAS drops below X"

### 7.6 AI Command Centre

**Purpose:** Your interface with Claude for ad optimisation.

**Latest Daily Report:**
- Full Claude analysis from the morning job
- Sections: Summary, Wins, Concerns, Recommendations, Action Items

**Ask Claude Panel:**
- Text input: "Which campaign should I increase budget on?"
- Claude responds using your actual performance data from the database
- Suggested prompts:
  - "What's my best performing audience segment this week?"
  - "Why has CPL increased on [campaign name]?"
  - "Draft 5 new ad headlines based on my top performers"
  - "Recommend budget allocation for next week based on ROAS"
  - "Compare my Meta vs TikTok performance and suggest where to shift spend"

**Historical AI Reports:**
- List of past daily analyses
- Trend tracking: has Claude's advice been followed up on?

### 7.7 Audience Manager Page

**Purpose:** Manage custom and lookalike audiences across platforms.

**Audience Table:**
| Audience | Platform | Type | Size | Last Synced | Status |
|----------|----------|------|------|-------------|--------|

**Actions:**
- Create new audience from CRM segments
- Sync existing audience to platform
- Create lookalike from best-performing audience
- View which campaigns use each audience

---

## 8. Claude API Integration — Prompts for Windmill Jobs

### 8.1 Daily Performance Review Prompt

```
You are an expert paid media analyst reviewing ad performance for a UK law firm 
specialising in irresponsible lending claims. Analyse the following data and provide:

1. EXECUTIVE SUMMARY (3-4 sentences)
2. TOP PERFORMERS — campaigns/ads with best CPL and ROAS
3. UNDERPERFORMERS — campaigns/ads wasting budget
4. ANOMALIES — unusual spikes or drops in any metric
5. RECOMMENDATIONS — specific actions to take today
6. BUDGET SUGGESTIONS — where to increase/decrease spend

Data:
{JSON dump of yesterday's daily_metrics joined with campaigns and ads tables}

Target CPL: £[X]
Target ROAS: [X]
Monthly budget: £[X]

Be specific. Reference campaign names and exact numbers.
Give actionable recommendations, not generic advice.
```

### 8.2 Creative Analysis Prompt

```
You are a creative strategist analysing ad performance for a UK law firm.
Review the following creative performance data and identify:

1. Which headlines/body text combinations produce the lowest CPL
2. Which visual styles (image vs video, length, format) perform best
3. Patterns in top-performing creatives (tone, length, CTA type)
4. Specific new creative concepts to test based on what's working
5. Which creatives should be retired (high spend, poor results)

Data:
{JSON dump of creatives joined with daily_metrics}

Generate 5 new ad copy variations based on the patterns you identify.
For each, explain why you think it will work based on the data.
```

### 8.3 Budget Optimisation Prompt

```
You are a media buyer optimising budget allocation across Meta and TikTok 
campaigns for a UK law firm.

Current allocation and performance:
{JSON dump of campaign-level spend, CPL, ROAS, leads for last 7 days}

Total weekly budget: £[X]
Goal: Maximise lead volume while keeping CPL below £[X]

Provide:
1. Recommended budget for each campaign (specific £ amounts)
2. Which campaigns to pause entirely
3. Which campaigns to scale up and by how much
4. Reasoning for each recommendation
5. Expected impact on lead volume and CPL
```

---

## 9. API Authentication Setup

### 9.1 Meta (Facebook + Instagram)

1. Create a Meta App at developers.facebook.com
2. Add "Marketing API" product to the app
3. Request permissions: `ads_management`, `ads_read`, `leads_retrieval`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`
4. Generate a long-lived access token (60 days) — set up Windmill job to refresh before expiry
5. Get your Ad Account ID from Business Manager (format: `act_XXXXXXXXX`)

### 9.2 TikTok

1. Create a developer app at business-api.tiktok.com
2. Request Marketing API access
3. Get advertiser_id from TikTok Ads Manager
4. Generate access token via OAuth 2.0 flow
5. Requested scopes: campaign management, reporting, audience management

### 9.3 Token Refresh (Windmill Job)

Set up a Windmill job that runs daily to check token expiry dates and refresh tokens before they expire. Store tokens encrypted in the `platform_accounts` table.

---

## 10. Windmill Job Specifications

### 10.1 Meta Data Sync Job

```
Name: meta_data_sync
Schedule: Every 15 minutes
Language: TypeScript

Steps:
1. Read Meta access token from platform_accounts
2. GET /act_{id}/insights with yesterday + today date range
3. Parse response, map fields to daily_metrics schema
4. UPSERT into daily_metrics (update if exists for backfill)
5. GET /act_{id}/campaigns for status changes
6. Update campaigns table
7. Log sync result and any errors
8. If rate limited, wait and retry with exponential backoff
```

### 10.2 TikTok Data Sync Job

```
Name: tiktok_data_sync
Schedule: Every 15 minutes
Language: TypeScript

Steps:
1. Read TikTok access token from platform_accounts
2. POST /report/integrated/get/ with date range and all metrics
3. Parse response, map fields to daily_metrics schema
4. UPSERT into daily_metrics
5. GET /campaign/get/ for status changes
6. Update campaigns table
7. Log sync result and any errors
```

### 10.3 AI Analysis Job

```
Name: daily_ai_analysis
Schedule: 07:00 UTC daily
Language: TypeScript

Steps:
1. Query daily_metrics for yesterday, joined with campaigns, ads, creatives
2. Build structured JSON payload
3. POST to Claude API with daily review prompt
4. Parse Claude's response
5. INSERT into ai_reports table
6. If any flagged campaigns, trigger alert job
```

### 10.4 Lead Sync Job

```
Name: lead_sync
Schedule: Every 5 minutes
Language: TypeScript

Steps:
1. Meta: GET /{form_id}/leads since last sync timestamp
2. TikTok: GET /pages/leads/get/ since last sync timestamp
3. For each new lead:
   a. INSERT into ad_leads
   b. Match to CRM client by email/phone if exists
   c. Calculate cost (campaign spend / leads for that day)
4. Update last sync timestamp
```

### 10.5 Alert Monitor Job

```
Name: alert_monitor
Schedule: Every hour
Language: TypeScript

Steps:
1. Query hourly_metrics for last hour
2. Compare against thresholds (stored in config):
   - CPL > threshold
   - Daily spend > budget * 1.2
   - CPM spike > 50% above 7-day average
   - ROAS drop > 30% below 7-day average
3. If any threshold breached:
   - Send WhatsApp notification
   - Insert alert into ai_reports with type 'anomaly_alert'
```

---

## 11. Implementation Priority

### Phase 1 — Foundation (Week 1-2)
- [ ] Set up database tables
- [ ] Configure Meta and TikTok API apps and tokens
- [ ] Install and configure Windmill
- [ ] Build Meta data sync job
- [ ] Build TikTok data sync job
- [ ] Build basic overview dashboard page

### Phase 2 — Dashboard (Week 3-4)
- [ ] Campaign performance page with sortable table
- [ ] Campaign detail view with charts
- [ ] Spend & budget monitoring page
- [ ] Lead analytics page with CRM integration

### Phase 3 — AI Integration (Week 5-6)
- [ ] Daily AI analysis Windmill job
- [ ] AI command centre page with Claude chat
- [ ] Creative performance page
- [ ] Alert monitoring system

### Phase 4 — Ad Management (Week 7-8)
- [ ] Campaign builder UI (create campaigns from CRM)
- [ ] Creative upload and management
- [ ] Audience manager with CRM segment sync
- [ ] Ad creation workflow

### Phase 5 — Optimisation (Ongoing)
- [ ] Refine Claude prompts based on results
- [ ] Add automated budget adjustment (Claude recommends → you approve → Windmill executes)
- [ ] Build creative testing framework
- [ ] Add more granular breakdowns and custom reports
