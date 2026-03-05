# Ad Platform Spec — TikTok Strategy Addendum

**Purpose:** This addendum covers everything needed to support the TikTok organic + Spark Ads + cross-platform retargeting strategy. Feed this to Claude alongside the main spec and the first strategy addendum.

---

## SUMMARY OF WHAT'S MISSING

The existing specs handle TikTok paid ads but are missing infrastructure for:

1. **Organic TikTok content management** — scheduling 2-3 posts/day across 5 content pillars
2. **Spark Ads pipeline** — the flow from organic post → viral detection → Spark Ad promotion (different API from regular ads)
3. **Cross-platform retargeting** — TikTok organic viewers → Facebook/Instagram retarget audiences
4. **Content pillar system** — tagging, scheduling, and tracking performance by pillar
5. **TikTok organic analytics** — tracking views, engagement, profile visits, bio link clicks on unpaid content
6. **Multi-account management** — business account + personal "expert" account
7. **Blended CPL calculation** — combining free organic leads with paid leads for true cost
8. **Comment engagement on TikTok** — reply strategy tracking, inbound lead identification
9. **Spark Ad specific endpoints** — different from standard TikTok ad creation
10. **Live stream tracking** — scheduling, viewer counts, questions asked, leads generated
11. **Hashtag and trending sound tracking** — what's working, what to use
12. **Viral detection and auto-promotion** — flagging organic posts that break through for Spark Ad conversion
13. **Stitch/Duet tracking** — which borrowed audiences drive the most leads
14. **Bio funnel analytics** — profile visits → link clicks → form submissions

---

## 1. NEW DATABASE TABLES

### 1.1 TikTok Content Management

```sql
-- Content pillars and scheduling
CREATE TABLE content_pillars (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  -- Pillar types matching the strategy
  -- 'did_you_know', 'lender_callout', 'client_wins', 'myth_busting', 'emotional_controversial'
  pillar_type VARCHAR(50) NOT NULL,
  target_posts_per_week INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed with the 5 pillars
-- INSERT INTO content_pillars (name, pillar_type, target_posts_per_week) VALUES
--   ('Did You Know Education', 'did_you_know', 4),
--   ('Lender Call-Outs', 'lender_callout', 3),
--   ('Client Wins', 'client_wins', 3),
--   ('Myth Busting', 'myth_busting', 2),
--   ('Emotional/Controversial', 'emotional_controversial', 2);

-- Content calendar and scheduling
CREATE TABLE tiktok_content (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES tiktok_accounts(id),
  pillar_id UUID REFERENCES content_pillars(id),
  -- Content details
  title VARCHAR(255),
  script TEXT,                              -- full video script
  hook_text TEXT,                           -- first 1-2 seconds / opening line
  body_text TEXT,                           -- on-screen text if applicable
  cta_text VARCHAR(255),                    -- call to action
  -- Format and style
  format ENUM('talking_head', 'green_screen', 'text_overlay', 'stitch', 
              'duet', 'story_time', 'pov', 'live', 'trending_sound'),
  style ENUM('ugc', 'selfie', 'professional', 'screen_record', 'text_only'),
  -- Emotional angle
  emotional_angle ENUM('anger', 'hope', 'urgency', 'empathy', 'education', 'controversy'),
  -- Lender targeting
  lenders_mentioned TEXT[],                 -- array of lender names mentioned
  -- Hashtags
  hashtags TEXT[],                          -- array of hashtags to use
  -- Trending elements
  trending_sound_id VARCHAR(100),
  trending_sound_name VARCHAR(255),
  -- Stitch/Duet source
  stitch_source_url TEXT,                   -- URL of video being stitched/dueted
  stitch_source_views INTEGER,              -- how many views the source video had
  -- Scheduling
  status ENUM('draft', 'scripted', 'filmed', 'edited', 'scheduled', 'published', 'archived'),
  scheduled_date DATE,
  scheduled_time TIME,
  published_at TIMESTAMP,
  platform_post_id VARCHAR(100),            -- TikTok's post ID once published
  -- Production
  video_file_path TEXT,
  thumbnail_path TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tiktok_content_status ON tiktok_content(status, scheduled_date);
CREATE INDEX idx_tiktok_content_pillar ON tiktok_content(pillar_id);
CREATE INDEX idx_tiktok_content_published ON tiktok_content(published_at);
```

### 1.2 TikTok Organic Metrics

```sql
-- Organic post performance (updated by Windmill sync job)
CREATE TABLE tiktok_organic_metrics (
  id UUID PRIMARY KEY,
  content_id UUID REFERENCES tiktok_content(id),
  platform_post_id VARCHAR(100),
  date DATE NOT NULL,
  -- View metrics
  views INTEGER DEFAULT 0,
  views_total INTEGER DEFAULT 0,           -- cumulative all-time
  full_video_watched INTEGER DEFAULT 0,
  average_watch_time_seconds DECIMAL(8,2),
  -- Engagement
  likes INTEGER DEFAULT 0,
  likes_total INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  comments_total INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  shares_total INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  saves_total INTEGER DEFAULT 0,
  -- Profile impact
  profile_visits INTEGER DEFAULT 0,
  follows_from_post INTEGER DEFAULT 0,
  -- Traffic
  link_clicks INTEGER DEFAULT 0,           -- bio link clicks attributed to this post
  -- Calculated
  engagement_rate DECIMAL(6,4),            -- (likes+comments+shares+saves) / views
  -- Viral indicators
  share_rate DECIMAL(6,4),                 -- shares / views (key viral signal)
  save_rate DECIMAL(6,4),                  -- saves / views (key intent signal)
  comment_rate DECIMAL(6,4),
  -- Source breakdown (where views came from)
  views_from_fyp INTEGER DEFAULT 0,        -- For You Page
  views_from_following INTEGER DEFAULT 0,
  views_from_search INTEGER DEFAULT 0,
  views_from_profile INTEGER DEFAULT 0,
  views_from_sound INTEGER DEFAULT 0,
  views_from_hashtag INTEGER DEFAULT 0,
  -- Audience demographics
  audience_top_countries JSONB,
  audience_age_split JSONB,
  audience_gender_split JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(content_id, date)
);

CREATE INDEX idx_tiktok_organic_date ON tiktok_organic_metrics(date);
CREATE INDEX idx_tiktok_organic_views ON tiktok_organic_metrics(views_total DESC);
```

### 1.3 TikTok Account Management

```sql
-- Multiple TikTok accounts (business + personal)
CREATE TABLE tiktok_accounts (
  id UUID PRIMARY KEY,
  account_type ENUM('business', 'personal_expert'),
  account_name VARCHAR(255),
  tiktok_username VARCHAR(100),
  tiktok_user_id VARCHAR(100),
  -- Auth
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  -- Account metrics (synced daily)
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  -- Bio funnel
  bio_link_url TEXT,
  bio_link_clicks_today INTEGER DEFAULT 0,
  bio_link_clicks_total INTEGER DEFAULT 0,
  -- For ads (business account only)
  advertiser_id VARCHAR(100),
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cross-promotion tracking between accounts
CREATE TABLE cross_promotions (
  id UUID PRIMARY KEY,
  source_account_id UUID REFERENCES tiktok_accounts(id),
  target_account_id UUID REFERENCES tiktok_accounts(id),
  source_content_id UUID REFERENCES tiktok_content(id),
  promotion_type ENUM('mention', 'duet', 'stitch', 'comment_reply', 'pin_comment'),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 1.4 Spark Ads Pipeline

```sql
-- Tracks organic posts being evaluated and promoted as Spark Ads
CREATE TABLE spark_ads_pipeline (
  id UUID PRIMARY KEY,
  content_id UUID REFERENCES tiktok_content(id),
  platform_post_id VARCHAR(100) NOT NULL,
  source_account_id UUID REFERENCES tiktok_accounts(id),
  -- Organic performance that triggered consideration
  organic_views INTEGER,
  organic_engagement_rate DECIMAL(6,4),
  organic_ctr DECIMAL(6,4),
  organic_comment_count INTEGER,
  -- Pipeline status
  status ENUM('monitoring', 'qualified', 'approved', 'live', 'paused', 'completed', 'rejected'),
  -- Qualification criteria
  qualified_at TIMESTAMP,                  -- when it hit the viral threshold
  qualification_reason TEXT,               -- e.g. "50k+ views, 4.2% engagement rate"
  -- Spark Ad details (once promoted)
  spark_ad_auth_code VARCHAR(255),         -- TikTok authorization code for Spark Ads
  spark_campaign_id UUID REFERENCES campaigns(id),
  spark_ad_id VARCHAR(100),
  -- Budget
  daily_budget DECIMAL(10,2),
  total_budget DECIMAL(10,2),
  budget_spent DECIMAL(10,2) DEFAULT 0,
  -- Performance comparison: organic vs paid
  paid_impressions INTEGER DEFAULT 0,
  paid_clicks INTEGER DEFAULT 0,
  paid_leads INTEGER DEFAULT 0,
  paid_spend DECIMAL(10,2) DEFAULT 0,
  paid_cpm DECIMAL(10,4),
  paid_cpc DECIMAL(10,4),
  paid_cpl DECIMAL(10,4),
  -- Combined (organic + paid)
  total_views INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  blended_cpl DECIMAL(10,4),              -- paid spend / (organic leads + paid leads)
  -- Dates
  spark_started_at TIMESTAMP,
  spark_ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_spark_pipeline_status ON spark_ads_pipeline(status);
CREATE INDEX idx_spark_pipeline_views ON spark_ads_pipeline(organic_views DESC);
```

### 1.5 TikTok Comment Engagement

```sql
-- TikTok comments (inbound and outbound engagement)
CREATE TABLE tiktok_comments (
  id UUID PRIMARY KEY,
  content_id UUID REFERENCES tiktok_content(id),
  platform_comment_id VARCHAR(100),
  -- Comment details
  commenter_username VARCHAR(100),
  comment_text TEXT,
  comment_likes INTEGER DEFAULT 0,
  is_reply BOOLEAN DEFAULT FALSE,
  parent_comment_id UUID REFERENCES tiktok_comments(id),
  -- AI analysis (via Claude)
  mentions_lender BOOLEAN DEFAULT FALSE,
  lender_mentioned VARCHAR(100),
  indicates_interest BOOLEAN DEFAULT FALSE,
  interest_confidence ENUM('high', 'medium', 'low'),
  sentiment ENUM('angry', 'hopeful', 'curious', 'skeptical', 'grateful', 'neutral'),
  -- Our engagement
  replied_to BOOLEAN DEFAULT FALSE,
  our_reply_text TEXT,
  replied_at TIMESTAMP,
  reply_account_id UUID REFERENCES tiktok_accounts(id),
  -- Lead tracking
  converted_to_lead BOOLEAN DEFAULT FALSE,
  lead_id UUID REFERENCES ad_leads(id),
  -- Whether this is a comment WE made on someone else's content (outbound strategy)
  is_outbound_comment BOOLEAN DEFAULT FALSE,
  outbound_target_url TEXT,               -- URL of the video we commented on
  outbound_target_views INTEGER,          -- how many views that video had
  -- Results of outbound comments
  outbound_reply_count INTEGER DEFAULT 0,
  outbound_profile_visits INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tiktok_comments_interest ON tiktok_comments(indicates_interest) 
  WHERE indicates_interest = TRUE;
CREATE INDEX idx_tiktok_comments_outbound ON tiktok_comments(is_outbound_comment) 
  WHERE is_outbound_comment = TRUE;
CREATE INDEX idx_tiktok_comments_lender ON tiktok_comments(mentions_lender) 
  WHERE mentions_lender = TRUE;
```

### 1.6 Live Stream Tracking

```sql
CREATE TABLE tiktok_lives (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES tiktok_accounts(id),
  -- Scheduling
  scheduled_date DATE,
  scheduled_time TIME,
  topic VARCHAR(255),                      -- e.g. "AMA: Irresponsible Lending Claims"
  -- Performance
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_minutes INTEGER,
  peak_viewers INTEGER DEFAULT 0,
  total_viewers INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  -- Engagement
  comments_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  -- Lead generation
  link_clicks INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  questions_asked INTEGER DEFAULT 0,       -- count of relevant questions
  -- AI summary
  ai_summary TEXT,                         -- Claude summary of key questions and topics
  ai_content_ideas TEXT,                   -- Claude suggestions for content based on live questions
  -- Status
  status ENUM('scheduled', 'live', 'completed', 'cancelled'),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 1.7 Blended CPL Tracking

```sql
-- Weekly/monthly blended cost tracking across all channels
CREATE TABLE blended_performance (
  id UUID PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type ENUM('daily', 'weekly', 'monthly'),
  -- Organic TikTok
  tiktok_organic_leads INTEGER DEFAULT 0,
  tiktok_organic_cost DECIMAL(10,2) DEFAULT 0,  -- £0 but track for completeness
  tiktok_organic_views INTEGER DEFAULT 0,
  -- TikTok Spark Ads
  tiktok_spark_leads INTEGER DEFAULT 0,
  tiktok_spark_spend DECIMAL(10,2) DEFAULT 0,
  tiktok_spark_cpl DECIMAL(10,4),
  -- TikTok Standard Paid
  tiktok_paid_leads INTEGER DEFAULT 0,
  tiktok_paid_spend DECIMAL(10,2) DEFAULT 0,
  tiktok_paid_cpl DECIMAL(10,4),
  -- Meta (Facebook + Instagram) Paid
  meta_paid_leads INTEGER DEFAULT 0,
  meta_paid_spend DECIMAL(10,2) DEFAULT 0,
  meta_paid_cpl DECIMAL(10,4),
  -- Meta Organic (if tracking)
  meta_organic_leads INTEGER DEFAULT 0,
  -- Cross-platform retarget (TikTok viewers retargeted on Meta)
  cross_platform_retarget_leads INTEGER DEFAULT 0,
  cross_platform_retarget_spend DECIMAL(10,2) DEFAULT 0,
  cross_platform_retarget_cpl DECIMAL(10,4),
  -- Totals
  total_leads INTEGER DEFAULT 0,
  total_spend DECIMAL(10,2) DEFAULT 0,
  blended_cpl DECIMAL(10,4),               -- total_spend / total_leads
  -- Quality metrics
  leads_contacted INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  leads_signed INTEGER DEFAULT 0,
  lead_to_signed_rate DECIMAL(6,4),
  cost_per_signed_client DECIMAL(10,4),     -- THE metric that actually matters
  -- Revenue
  total_compensation_recovered DECIMAL(12,2) DEFAULT 0,
  total_fees_earned DECIMAL(12,2) DEFAULT 0,
  roi DECIMAL(8,4),                         -- fees_earned / total_spend
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(period_start, period_end, period_type)
);

CREATE INDEX idx_blended_performance_period ON blended_performance(period_type, period_start);
```

### 1.8 Hashtag and Sound Tracking

```sql
CREATE TABLE hashtag_performance (
  id UUID PRIMARY KEY,
  hashtag VARCHAR(100) NOT NULL,
  hashtag_type ENUM('broad', 'niche', 'lender_specific', 'trending'),
  -- Performance when used
  times_used INTEGER DEFAULT 0,
  avg_views_when_used INTEGER DEFAULT 0,
  avg_engagement_rate DECIMAL(6,4),
  best_performing_content_id UUID REFERENCES tiktok_content(id),
  -- TikTok stats (if available via API)
  total_hashtag_views BIGINT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trending_sounds (
  id UUID PRIMARY KEY,
  sound_id VARCHAR(100),
  sound_name VARCHAR(255),
  artist VARCHAR(255),
  -- Usage
  times_used INTEGER DEFAULT 0,
  avg_views_when_used INTEGER DEFAULT 0,
  -- Trending status
  is_currently_trending BOOLEAN DEFAULT FALSE,
  first_spotted_at TIMESTAMP,
  peak_date DATE,
  -- Content ideas
  content_ideas TEXT,                       -- Claude-generated ideas for using this sound
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. TIKTOK API ENDPOINTS — ORGANIC & SPARK ADS

### 2.1 TikTok Content Posting API

**Base URL:** `https://open.tiktokapis.com/v2`

**Note:** TikTok's Content Posting API allows posting videos programmatically, but has restrictions. You need "Content Posting API" access approved for your app.

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Initiate video upload | POST | `/post/publish/video/init/` | Returns upload URL |
| Publish video | POST | `/post/publish/video/` | After upload complete |
| Check publish status | GET | `/post/publish/status/fetch/` | Poll until published |
| Get user videos | GET | `/video/list/` | List account's videos with metrics |
| Get video details | GET | `/video/query/` | Individual video performance |

**Post publish request body:**
```json
{
  "post_info": {
    "title": "Did you know you can claim back irresponsible lending?",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_duet": false,
    "disable_comment": false,
    "disable_stitch": false,
    "video_cover_timestamp_ms": 1000
  },
  "source_info": {
    "source": "FILE_UPLOAD",
    "video_size": 50000000,
    "chunk_size": 10000000,
    "total_chunk_count": 5
  }
}
```

### 2.2 Spark Ads — THE KEY DIFFERENCE

Spark Ads don't use the standard ad creation flow. The process is:

**Step 1: Generate Authorization Code (from the organic post)**

This is done in TikTok's native interface OR via the API:

```
POST /tt_video/info/

Request:
{
  "advertiser_id": "YOUR_ADVERTISER_ID",
  "identity_type": "AUTH_CODE",
  "identity_id": "AUTH_CODE_FROM_TIKTOK"
}
```

The content creator (you) generates an auth code from the TikTok app:
- Go to the organic post → "..." menu → "Ad settings" → "Authorize"
- This generates a code valid for 30-365 days
- This code allows the ads system to boost that specific organic post

**Step 2: Create the Spark Ad campaign via Marketing API**

```
POST /campaign/create/

{
  "advertiser_id": "YOUR_ID",
  "campaign_name": "Spark - Gambling Question Video - 50k Views",
  "objective_type": "LEAD_GENERATION",
  "budget": 50,
  "budget_mode": "BUDGET_MODE_DAY"
}
```

**Step 3: Create ad group with targeting**

```
POST /adgroup/create/

{
  "advertiser_id": "YOUR_ID",
  "campaign_id": "CAMPAIGN_ID",
  "adgroup_name": "Spark AG - UK 25-45 - Interest Targeting",
  "placement_type": "PLACEMENT_TYPE_NORMAL",
  "placements": ["PLACEMENT_TIKTOK"],
  "location_ids": [2826],
  "age_groups": ["AGE_25_34", "AGE_35_44"],
  "budget": 50,
  "budget_mode": "BUDGET_MODE_DAY",
  "billing_event": "CPC",
  "optimization_goal": "LEAD_GENERATION",
  "bid_type": "BID_TYPE_NO_BID",
  "schedule_type": "SCHEDULE_FROM_NOW"
}
```

**Step 4: Create the Spark Ad (references the organic post)**

```
POST /ad/create/

{
  "advertiser_id": "YOUR_ID",
  "adgroup_id": "ADGROUP_ID",
  "creatives": [{
    "ad_name": "Spark - Gambling Question Video",
    "identity_type": "AUTH_CODE",
    "identity_id": "THE_AUTH_CODE_FROM_STEP_1",
    "tiktok_item_id": "ORIGINAL_POST_ID",
    "ad_format": "SINGLE_VIDEO",
    "call_to_action": "LEARN_MORE",
    "landing_page_url": "https://your-lead-form.com"
  }]
}
```

**Key Spark Ad differences from standard ads:**
- Uses `identity_type: "AUTH_CODE"` instead of uploading creative
- References the original organic post via `tiktok_item_id`
- All organic engagement (likes, comments, shares) stays on the post
- New paid engagement adds to the organic counts
- Auth codes expire — need renewal workflow

### 2.3 TikTok Organic Analytics Endpoints

```
GET /video/list/

Request:
{
  "fields": ["id", "title", "create_time", "share_url", 
             "like_count", "comment_count", "share_count", 
             "view_count", "duration"]
}
```

```
GET /video/query/

Request:
{
  "filters": {
    "video_ids": ["video_id_1", "video_id_2"]
  },
  "fields": ["id", "like_count", "comment_count", "share_count", 
             "view_count", "duration"]
}
```

**Note:** TikTok's organic API has limited metrics compared to the Ads API. For deeper analytics (watch time, traffic sources, audience demographics), you'll need to either scrape from the TikTok analytics dashboard or use the Creator Tools API if approved.

### 2.4 Comment Retrieval

```
GET /video/comment/list/

Request:
{
  "video_id": "VIDEO_ID",
  "fields": ["id", "text", "create_time", "like_count",
             "reply_count", "parent_comment_id"],
  "max_count": 50,
  "cursor": 0
}
```

```
POST /video/comment/reply/

Request:
{
  "video_id": "VIDEO_ID",
  "comment_id": "PARENT_COMMENT_ID",
  "text": "That's exactly what we help with. Check the link in our bio — takes 2 minutes to see if you can claim."
}
```

**Important:** TikTok's comment API access is restricted. You may need to apply specifically for this scope. If not available via API, the comment mining job will need to work through the manual export or a scheduled scrape approach.

---

## 3. CROSS-PLATFORM RETARGETING ARCHITECTURE

This is one of the most powerful parts of the strategy: TikTok viewers retargeted on Facebook/Instagram.

### 3.1 The Flow

```
TikTok Organic Video (free views)
    ↓
Viewer watches 50%+ of video
    ↓
Added to TikTok Custom Audience (video viewers)
    ↓
Same person is on Facebook/Instagram
    ↓
Two retarget paths:

PATH A — Direct (if emails collected):
  TikTok viewer → visits bio link → enters email on form (but doesn't complete)
  → Email captured → uploaded to Meta Custom Audience → retargeted on FB/IG

PATH B — Pixel-based:
  TikTok viewer → visits your website via bio link
  → Meta Pixel fires → added to website visitor audience
  → Retargeted on FB/IG

PATH C — Lookalike bridging:
  TikTok converted leads (signed clients) → uploaded to Meta as seed audience
  → Meta creates lookalike → targets similar people on FB/IG
  → This effectively bridges TikTok's audience intelligence to Meta
```

### 3.2 Database Table for Cross-Platform Tracking

```sql
CREATE TABLE cross_platform_journeys (
  id UUID PRIMARY KEY,
  -- First touch
  first_touch_platform ENUM('tiktok_organic', 'tiktok_paid', 'meta_paid', 'meta_organic', 'direct'),
  first_touch_content_id UUID,             -- tiktok_content.id or ads.id
  first_touch_at TIMESTAMP,
  -- Intermediate touches
  touch_sequence JSONB,                    -- array of {platform, content_id, action, timestamp}
  total_touches INTEGER DEFAULT 1,
  -- Conversion
  lead_id UUID REFERENCES ad_leads(id),
  converted_at TIMESTAMP,
  -- Attribution
  primary_attribution ENUM('tiktok_organic', 'tiktok_spark', 'tiktok_paid', 
                           'meta_paid', 'meta_retarget', 'cross_platform_retarget'),
  -- Cost attribution
  attributed_cost DECIMAL(10,4),           -- how much spend contributed to this conversion
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cross_platform_attribution ON cross_platform_journeys(primary_attribution);
```

### 3.3 Windmill Job: Cross-Platform Audience Sync

```
Name: cross_platform_audience_sync
Schedule: Daily at 04:00
Language: TypeScript

Steps:
1. Query CRM for all leads where source = TikTok
2. Get their emails and phones
3. SHA256 hash all PII
4. Upload to Meta Custom Audience:
   POST /{ad_account_id}/customaudiences
   - Name: "XPLAT - TikTok Lead Converts"
   - Upload hashed data
5. Create/refresh lookalike:
   POST /{ad_account_id}/customaudiences
   - Lookalike from "XPLAT - TikTok Lead Converts"
   - 1% similarity, GB only
6. Upload to separate Meta audience for EXCLUSION:
   - Name: "EXCLUDE - TikTok Already Converted"
   - So you don't retarget people who already signed
7. Log sync results and audience sizes
8. Repeat for TikTok → also sync Meta converts to TikTok audiences
```

---

## 4. NEW WINDMILL JOBS

### 4.1 TikTok Organic Metrics Sync

```
Name: tiktok_organic_sync
Schedule: Every 2 hours
Language: TypeScript

Steps:
1. For each active TikTok account in tiktok_accounts:
   a. GET /video/list/ to get all recent videos
   b. For each video, pull current metrics
   c. UPSERT into tiktok_organic_metrics
   d. Calculate engagement_rate, share_rate, save_rate
   e. Update tiktok_content with latest platform_post_id if new
2. Check for viral breakouts (see 4.2)
3. Update tiktok_accounts with follower count and total likes
4. Log sync results
```

### 4.2 Viral Detection & Spark Ad Pipeline

```
Name: viral_detection
Schedule: Every 30 minutes (more frequent than general sync)
Language: TypeScript

Steps:
1. Query tiktok_organic_metrics for posts published in last 7 days
2. For each post, check against viral thresholds:
   
   TIER 1 — AUTO-QUALIFY (immediate Spark Ad candidate):
   - Views > 50,000 AND engagement_rate > 3%
   - OR views > 100,000 (regardless of engagement)
   
   TIER 2 — MONITOR (growing fast, might qualify):
   - Views > 10,000 AND posted < 24 hours ago
   - AND view velocity > 5,000/hour
   
   TIER 3 — WATCH (showing promise):
   - Views > 5,000 AND engagement_rate > 5%
   - High save_rate (> 3%) indicates intent

3. For TIER 1 posts:
   a. INSERT into spark_ads_pipeline with status = 'qualified'
   b. Send notification: "🔥 Post '{title}' hit {views} views with {engagement}% 
      engagement. Ready for Spark Ad promotion. Approve?"
   c. Include link to approve in CRM dashboard
   
4. For TIER 2 posts:
   a. INSERT/UPDATE spark_ads_pipeline with status = 'monitoring'
   b. Track velocity for next check
   
5. Send to Claude for analysis:
   "This organic TikTok post has hit {views} views in {hours} hours.
    Engagement rate: {rate}%. Share rate: {share_rate}%. Save rate: {save_rate}%.
    Content pillar: {pillar}. Hook: '{hook_text}'.
    
    Based on these signals:
    1. Should we convert this to a Spark Ad?
    2. What daily budget would you recommend?
    3. What targeting should we use? (broad to leverage TikTok's algo, 
       or layered with our custom audiences?)
    4. How long should we run it before evaluating?"
```

### 4.3 Spark Ad Auth Code Manager

```
Name: spark_auth_code_manager
Schedule: Daily at 09:00
Language: TypeScript

Steps:
1. Query spark_ads_pipeline for all active Spark Ads
2. Check auth code expiry dates
3. If any expire within 7 days:
   a. Send notification: "Spark Ad auth code for '{post_title}' expires in {days} days. 
      Renew in TikTok app: Post → ... → Ad Settings → Authorize"
   b. Flag in dashboard
4. If any have expired:
   a. Pause the corresponding Spark Ad campaign
   b. Alert: "Spark Ad paused — auth code expired"
```

### 4.4 TikTok Comment Engagement Job

```
Name: tiktok_comment_engagement
Schedule: Every 30 minutes
Language: TypeScript

Steps:
1. For each recently published TikTok post (last 7 days):
   a. GET /video/comment/list/ for new comments since last check
   b. For each new comment:
      - INSERT into tiktok_comments
      - Send to Claude:
        "Analyse this TikTok comment on a video about irresponsible lending:
         Video topic: '{title}'
         Comment: '{comment_text}'
         
         Return JSON:
         {
           mentions_lender: bool,
           lender_name: string or null,
           indicates_interest: bool (person seems affected by irresponsible lending),
           interest_confidence: high/medium/low,
           sentiment: angry/hopeful/curious/skeptical/grateful/neutral,
           should_reply: bool,
           suggested_reply: string (friendly, helpful, compliant with SRA rules,
                           mentions 'link in bio' naturally if appropriate,
                           NOT pushy or salesy)
         }"
      - Update tiktok_comments with analysis
   c. If indicates_interest = true AND interest_confidence = 'high':
      - Flag for priority reply
      - Add to reply queue in dashboard

2. Track OUTBOUND comment strategy:
   a. Query for videos we commented on (outbound comments)
   b. Check for replies to our comments
   c. Track profile visits and follows from outbound activity
```

### 4.5 Content Calendar Manager

```
Name: content_calendar_manager
Schedule: Daily at 06:00
Language: TypeScript

Steps:
1. Check content pipeline:
   a. How many posts scheduled for today? (target: 2-3)
   b. How many posts in 'filmed' or 'edited' status? (upcoming pipeline)
   c. How many posts in 'draft' or 'scripted' status? (ideas pipeline)

2. Check pillar balance for the week:
   a. Count posts per pillar scheduled this week
   b. Compare to target_posts_per_week
   c. Identify underserved pillars

3. Send to Claude:
   "Content calendar status for this week:
    
    Posts scheduled today: {count}
    Posts in pipeline: {count}
    
    Pillar coverage this week:
    - Did You Know: {count}/{target}
    - Lender Call-Outs: {count}/{target}
    - Client Wins: {count}/{target}
    - Myth Busting: {count}/{target}
    - Emotional/Controversial: {count}/{target}
    
    Top performing content this week: {top 3 by views with hooks}
    Underperforming content: {bottom 3 with hooks}
    
    Current trending sounds on TikTok: {if available}
    
    Please:
    1. Identify which pillars need more content this week
    2. Generate 5 video scripts for the underserved pillars
    3. For each script provide: hook, body, CTA, format suggestion, hashtags
    4. Suggest 2 stitch/duet opportunities based on current trending content
    5. Flag if post volume is dropping below 2/day target"

4. Store scripts in tiktok_content as 'draft' status
5. Alert if today has <2 posts scheduled
```

### 4.6 Blended CPL Calculator

```
Name: blended_cpl_calculator
Schedule: Daily at 23:00
Language: TypeScript

Steps:
1. Query all lead sources for today:
   
   TIKTOK ORGANIC:
   - Count leads where source = tiktok AND no ad campaign attached
   - Cost = £0
   
   TIKTOK SPARK:
   - Count leads from Spark Ad campaigns
   - Cost = spark campaign spend
   
   TIKTOK STANDARD PAID:
   - Count leads from standard TikTok campaigns
   - Cost = campaign spend
   
   META PAID:
   - Count leads from Meta campaigns (excluding retarget)
   - Cost = campaign spend
   
   CROSS-PLATFORM RETARGET:
   - Count leads from Meta retarget campaigns targeting TikTok audiences
   - Cost = retarget campaign spend

2. Calculate:
   - Individual CPL for each channel
   - Blended CPL = total_spend / total_leads
   - Cost per SIGNED client (using CRM conversion data)
   - ROI = fees_earned / total_spend

3. UPSERT into blended_performance table

4. Weekly (on Sundays), send to Claude:
   "Weekly blended performance summary:
    
    {full breakdown by channel with leads, spend, CPL}
    
    Blended CPL: £{X}
    Cost per signed client: £{X}
    ROI: {X}x
    
    Compare to last week: {delta}
    Compare to last month average: {delta}
    
    Questions:
    1. Which channel is delivering the best value leads (highest sign rate)?
    2. Should we shift budget between channels?
    3. Is TikTok organic growing fast enough to offset paid spend?
    4. What's our projected blended CPL for next month if trends continue?
    5. Where is the biggest opportunity to reduce cost further?"
```

### 4.7 Live Stream Scheduler & Analyzer

```
Name: live_stream_manager
Schedule: After each live ends (triggered by webhook or manual)
Language: TypeScript

Steps:
1. Pull live stream metrics from TikTok API
2. INSERT into tiktok_lives table
3. Send to Claude:
   "Analyse this TikTok live stream about irresponsible lending:
    
    Topic: {topic}
    Duration: {minutes} minutes
    Peak viewers: {peak}
    Total unique viewers: {unique}
    Comments: {count}
    Link clicks: {clicks}
    Leads generated: {leads}
    New followers: {new_followers}
    
    Key questions asked by viewers (if available):
    {list of notable comments/questions}
    
    Please:
    1. Rate the live performance (engagement per minute, conversion rate)
    2. Identify the most common questions/concerns raised
    3. Suggest 5 content pieces based on what viewers asked about
    4. Recommend best time/day for next live based on this performance
    5. Suggest improvements for the next live session"
```

---

## 5. NEW DASHBOARD PAGES & WIDGETS

### 5.1 TikTok Command Centre (new top-level page)

**Account Overview Cards (for each TikTok account):**
- Followers (with daily growth)
- Total views this week
- Average views per video
- Bio link clicks today
- Organic leads today

**Content Pipeline Status:**
```
┌─────────┐   ┌──────────┐   ┌────────┐   ┌───────────┐   ┌───────────┐
│  Draft   │ → │ Scripted │ → │ Filmed │ → │ Scheduled │ → │ Published │
│    12    │   │     5    │   │    3   │   │     6     │   │    142    │
└─────────┘   └──────────┘   └────────┘   └───────────┘   └───────────┘
```

**Today's Schedule:**
- List of posts scheduled for today with times, pillars, hooks
- Status indicators: posted / ready / missing content gap

**Viral Watch Panel:**
- Posts currently being monitored (>5k views, still growing)
- Posts qualified for Spark Ads (>50k views)
- One-click "Approve for Spark Ad" button

**Pillar Balance Wheel:**
- Pie chart showing content mix this week by pillar
- Colour coded: green = on target, yellow = below target, red = missing

### 5.2 Spark Ads Pipeline Page

**Pipeline Board (Kanban-style):**
```
MONITORING → QUALIFIED → APPROVED → LIVE → COMPLETED
   (3)         (2)         (1)       (4)      (28)
```

Each card shows:
- Video thumbnail
- Views count
- Engagement rate
- Hook text
- Days since published

**Active Spark Ads Table:**
| Post Title | Organic Views | Spark Budget | Paid Spend | Paid Leads | Organic Leads | Blended CPL | Status |
|------------|--------------|-------------|-----------|-----------|--------------|------------|--------|

**Spark vs Standard Performance Comparison:**
- Chart: Spark Ads CPL vs Standard TikTok Ads CPL vs Standard Meta CPL
- Should clearly show Spark Ads outperforming (3-5x as per strategy)

### 5.3 Content Performance by Pillar

**Pillar Performance Table:**
| Pillar | Posts This Month | Avg Views | Avg Engagement | Avg Shares | Leads Generated | Best Hook |
|--------|-----------------|-----------|----------------|-----------|-----------------|-----------|
| Did You Know | 16 | 12,400 | 4.2% | 180 | 12 | "Did you know if a lender..." |
| Lender Call-Outs | 12 | 28,600 | 5.1% | 340 | 22 | "Lenders paying out RIGHT NOW" |
| Client Wins | 11 | 45,200 | 6.8% | 520 | 35 | "£47,000. That's what one..." |
| Myth Busting | 8 | 8,900 | 3.4% | 95 | 5 | "No, claiming doesn't affect..." |
| Emotional | 7 | 62,000 | 7.2% | 890 | 18 | "Lenders made £4.5 BILLION..." |

**Hook Performance Analysis:**
- Table of all hooks ranked by view count
- Tags: question / statement / statistic / story / command
- Claude analysis of what hook patterns work best

**Format Performance:**
- Chart: average views by format (talking_head, green_screen, text_overlay, stitch, duet, story_time)
- Chart: average CPL by format (for Spark Ad converted posts)

### 5.4 Comment Engagement Dashboard

**Priority Reply Queue:**
- Comments flagged as high-interest, not yet replied to
- Shows: commenter, comment text, lender mentioned, suggested reply
- Action buttons: "Send Suggested Reply", "Edit & Send", "Dismiss"
- Reply counter: {X} replies sent today / target 30+

**Outbound Comment Tracker:**
- List of comments we've posted on other creators' videos
- Performance: replies received, profile visits generated, leads attributed
- Best performing outbound comments (highest profile visit conversion)

**Comment Analytics:**
- Lender mention frequency chart (which lenders people talk about most)
- Sentiment breakdown of inbound comments
- Comment → Lead conversion rate
- Top comment-generating videos

### 5.5 Blended Performance Dashboard

**The Money Dashboard — This is the one that matters most:**

**Top KPI Cards:**
- Blended CPL (all channels combined)
- Cost Per Signed Client
- Monthly ROI (fees earned / ad spend)
- Organic Lead % (what % of leads are free)

**Channel Breakdown Waterfall Chart:**
```
TikTok Organic:     45 leads  ×  £0.00  =  £0.00      (38% of leads)
TikTok Spark:       22 leads  ×  £1.80  =  £39.60     (18% of leads)
TikTok Paid:        12 leads  ×  £4.50  =  £54.00     (10% of leads)
Meta Paid:          28 leads  ×  £8.20  =  £229.60    (24% of leads)
Cross-Platform RT:  12 leads  ×  £3.10  =  £37.20     (10% of leads)
─────────────────────────────────────────────────────
TOTAL:             119 leads     £360.40    Blended CPL: £3.03
```

**Blended CPL Trend Chart:**
- Line chart showing weekly blended CPL over time
- With individual channel lines overlaid
- Target line at £0.25 (the 15-25p goal from the strategy doc)
- As organic grows, the blended line should trend down

**Organic Growth Curve:**
- Chart: Monthly organic leads over time
- Overlay: follower count growth
- This visualises the "snowball effect" from the strategy
- Month 1: ~5 leads, Month 3: ~30 leads, Month 6: ~100+ leads

**Lead Quality by Source:**
| Source | Leads | Contacted % | Qualified % | Signed % | Revenue | True ROI |
|--------|-------|-------------|-------------|----------|---------|----------|
| TikTok Organic | 45 | 92% | 68% | 42% | £12,400 | ∞ |
| TikTok Spark | 22 | 88% | 62% | 38% | £5,800 | 146x |
| Meta Retarget | 12 | 85% | 58% | 35% | £3,200 | 86x |
| Meta Cold | 28 | 72% | 45% | 22% | £4,100 | 18x |

This table proves whether the TikTok-first strategy is delivering higher quality leads (which it should — organic leads have already self-selected).

### 5.6 Live Stream Planning Page

**Upcoming Lives:**
- Calendar view of scheduled live sessions
- Topic, suggested talking points, best performing Q&As from previous lives

**Live Performance History:**
| Date | Topic | Duration | Peak Viewers | Leads | CPL (if promoted) |
|------|-------|----------|-------------|-------|-------------------|

**AI Prep Panel:**
- Before each live: Claude generates suggested topics, opening hooks, and answers to likely questions based on trending comments and recent content performance

---

## 6. UPDATED CLAUDE PROMPTS

### 6.1 TikTok Script Generator

```
You are a TikTok content strategist for a UK law firm (Rowan Rose Solicitors, 
trading as Fast Action Claims) specialising in irresponsible lending compensation.

Content pillar needed: {pillar_type}
Account: {business or personal_expert}

Generate 5 TikTok video scripts. For each:

1. HOOK (first 1-2 seconds — this decides everything):
   - Must stop someone mid-scroll
   - Use one of: question, shocking number, direct command, lender name, controversy
   
2. BODY (15-45 seconds):
   - Conversational, not corporate
   - Like you're telling a mate in the pub
   - Include one specific detail (lender name, amount, stat) for credibility
   
3. CTA:
   - Soft CTA: "Comment if this happened to you" or "Save this for later"
   - NOT "link in bio" on every video (TikTok suppresses this)
   - Every 3rd-4th video can mention the bio link
   
4. FORMAT: talking_head / green_screen / text_overlay / story_time / pov
5. ON-SCREEN TEXT: Key phrases to display
6. HASHTAGS: 5-7 max, mix of broad + niche
7. ESTIMATED FILMING TIME: How long to record
8. TRENDING SOUND: Suggest if a trending sound could work, otherwise "original audio"

Rules:
- Must be SRA compliant (no guaranteed outcomes, no misleading claims)
- Can reference anonymised real outcomes
- UGC/selfie style always — never polished or corporate
- Each script should take <5 minutes to film
- Write for the personal expert account in first person ("I've been helping people...")
  and for the business account in third person ("We helped a client...")

Top performing hooks from last week for reference:
{top 5 hooks by views}
```

### 6.2 Outbound Comment Strategy Prompt

```
I need 10 outbound comments to post on other creators' TikTok videos 
about gambling, debt, or financial struggles.

These comments should:
- Add genuine value (not spammy)
- Subtly indicate that irresponsible lending claims exist
- NOT mention our firm name (too promotional)
- Be conversational and empathetic
- Encourage the viewer to check our profile for more info
- Be under 150 characters each (short comments perform better)

Example good comment:
"If lenders kept giving you credit knowing you couldn't afford it, 
you might be owed thousands back. Most people don't know this."

Example bad comment (too salesy):
"We help people claim back irresponsible lending! Check our profile!"

Generate 10 comments for different contexts:
1-3: For videos about gambling addiction/stories
4-6: For videos about debt/financial stress
7-8: For videos about credit cards/loans
9-10: For videos about financial injustice/banks
```

---

## 7. ADJUSTMENTS TO MAIN SPEC

### 7.1 Lead Source Tracking

Update the `ad_leads` table to include organic sources:

```sql
ALTER TABLE ad_leads ADD COLUMN source_type ENUM(
  'meta_lead_form',
  'meta_website',
  'tiktok_lead_form',
  'tiktok_spark_lead_form',
  'tiktok_organic_bio_link',
  'tiktok_organic_comment',
  'tiktok_live',
  'tiktok_dm',
  'cross_platform_retarget',
  'direct',
  'referral'
) DEFAULT 'direct';

ALTER TABLE ad_leads ADD COLUMN tiktok_content_id UUID REFERENCES tiktok_content(id);
ALTER TABLE ad_leads ADD COLUMN tiktok_comment_id UUID REFERENCES tiktok_comments(id);
```

### 7.2 Overview Dashboard Updates

Add these KPI cards to the main overview dashboard:

- **Organic Lead Count (today)** — free leads from TikTok organic
- **Organic % of Total** — what percentage of leads are free
- **Blended CPL** — total spend / total leads (including free organic)
- **TikTok Followers** — current count with daily growth
- **Spark Ads Live** — count of active Spark Ad campaigns
- **Content Posted Today** — count vs target of 2-3

### 7.3 AI Command Centre Updates

Add these suggested prompts to the AI Command Centre:

- "Write 5 TikTok scripts for this week focusing on {pillar}"
- "Which organic posts are ready to become Spark Ads?"
- "Analyse my comment engagement — which reply style converts best?"
- "What's my blended CPL trend and when will I hit the 15-25p target?"
- "Compare organic lead quality vs paid lead quality"
- "Generate outbound comments for today's engagement session"
- "Prepare talking points for this week's live stream"
- "Which lenders are getting the most mentions in comments?"

---

## 8. UPDATED IMPLEMENTATION PHASES

Replace Phase 5 and add Phase 6-7:

### Phase 5 — TikTok Organic Infrastructure (Week 9-10)
- [ ] TikTok account management (multi-account)
- [ ] Content pillar system and calendar
- [ ] TikTok content posting workflow
- [ ] Organic metrics sync job
- [ ] TikTok Command Centre dashboard
- [ ] Content performance by pillar page

### Phase 6 — Spark Ads & Engagement (Week 11-12)
- [ ] Viral detection job
- [ ] Spark Ads pipeline (monitoring → qualified → live)
- [ ] Spark Ad creation flow via API
- [ ] Auth code management
- [ ] Comment engagement dashboard and job
- [ ] Outbound comment tracking
- [ ] TikTok comment AI analysis

### Phase 7 — Cross-Platform & Blended (Week 13-14)
- [ ] Cross-platform audience sync (TikTok → Meta)
- [ ] Cross-platform journey tracking
- [ ] Blended CPL calculator and dashboard
- [ ] Live stream planning and tracking
- [ ] Content calendar AI generation
- [ ] Full loop: organic → Spark → retarget → lookalike across platforms
