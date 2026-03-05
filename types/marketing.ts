// =============================================================================
// Marketing Module — TypeScript Interfaces
// =============================================================================

// --- Enums (string unions for flexibility) ---

export type AdPlatform = 'meta' | 'tiktok';

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' | 'IN_REVIEW';

export type CampaignObjective =
  | 'OUTCOME_LEADS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_SALES'
  | 'LEAD_GENERATION'
  | 'CONVERSIONS'
  | 'APP_INSTALL'
  | 'REACH'
  | 'VIDEO_VIEWS';

export type CreativeType = 'image' | 'video' | 'carousel';

export type AdLeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected';

export type AIReportType =
  | 'daily_review'
  | 'creative_analysis'
  | 'budget_recommendation'
  | 'anomaly_alert'
  | 'weekly_summary';

export type QualityRanking = 'BELOW_AVERAGE_10' | 'BELOW_AVERAGE_20' | 'BELOW_AVERAGE_35' | 'AVERAGE' | 'ABOVE_AVERAGE';

// --- Platform Accounts ---

export interface PlatformAccount {
  id: string;
  platform: AdPlatform;
  account_id: string;
  account_name: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string;
  currency: string;
  timezone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Campaigns ---

export interface Campaign {
  id: string;
  platform: AdPlatform;
  platform_campaign_id: string;
  platform_account_id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  daily_budget?: number;
  lifetime_budget?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

// --- Ad Sets ---

export interface AdSet {
  id: string;
  platform: AdPlatform;
  platform_adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  targeting?: Record<string, unknown>;
  bid_amount?: number;
  daily_budget?: number;
  optimization_goal?: string;
  billing_event?: string;
  created_at: string;
}

// --- Ads ---

export interface Ad {
  id: string;
  platform: AdPlatform;
  platform_ad_id: string;
  ad_set_id: string;
  name: string;
  status: string;
  creative_id?: string;
  created_at: string;
}

// --- Creatives ---

export interface Creative {
  id: string;
  platform: AdPlatform;
  platform_creative_id?: string;
  type: CreativeType;
  headline?: string;
  body_text?: string;
  call_to_action?: string;
  landing_url?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  created_at: string;
}

// --- Daily Metrics ---

export interface DailyMetric {
  id: string;
  date: string;
  platform: AdPlatform;
  campaign_id?: string;
  ad_set_id?: string;
  ad_id?: string;
  // Spend
  spend: number;
  // Reach & impressions
  impressions: number;
  reach: number;
  frequency?: number;
  // Clicks
  clicks: number;
  link_clicks: number;
  // Rates
  ctr?: number;
  link_ctr?: number;
  // Costs
  cpm?: number;
  cpc?: number;
  cost_per_link_click?: number;
  // Conversions
  conversions: number;
  conversion_rate?: number;
  cost_per_conversion?: number;
  // Leads
  leads: number;
  cost_per_lead?: number;
  // Revenue
  conversion_value?: number;
  roas?: number;
  // Video
  video_views?: number;
  video_views_25pct?: number;
  video_views_50pct?: number;
  video_views_75pct?: number;
  video_views_100pct?: number;
  avg_video_play_seconds?: number;
  // Engagement
  likes?: number;
  comments?: number;
  shares?: number;
  follows?: number;
  // Quality (Meta only)
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  // Breakdowns
  breakdown_by_age?: Record<string, unknown>;
  breakdown_by_gender?: Record<string, unknown>;
  breakdown_by_placement?: Record<string, unknown>;
  breakdown_by_device?: Record<string, unknown>;
  breakdown_by_country?: Record<string, unknown>;
  synced_at: string;
}

// --- Hourly Metrics ---

export interface HourlyMetric {
  id: string;
  hour: string;
  platform: AdPlatform;
  campaign_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpm?: number;
  cpc?: number;
  cost_per_lead?: number;
  synced_at: string;
}

// --- Ad Leads ---

export interface AdLead {
  id: string;
  platform: AdPlatform;
  platform_lead_id?: string;
  campaign_id?: string;
  ad_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  form_data?: Record<string, unknown>;
  crm_client_id?: string;
  status: AdLeadStatus;
  cost?: number;
  created_at: string;
}

// --- AI Reports ---

export interface AIReport {
  id: string;
  report_date: string;
  report_type: AIReportType;
  platform: AdPlatform | 'all';
  analysis: string;
  recommendations?: Record<string, unknown>;
  flagged_campaigns?: Record<string, unknown>;
  top_performers?: Record<string, unknown>;
  underperformers?: Record<string, unknown>;
  suggested_actions?: Record<string, unknown>;
  created_at: string;
}

// --- Overview Dashboard KPIs ---

export interface MarketingOverviewKPIs {
  total_spend: number;
  total_leads: number;
  avg_cpl: number;
  avg_cpm: number;
  avg_cpc: number;
  overall_roas: number;
  // Deltas (vs previous period)
  spend_delta?: number;
  leads_delta?: number;
  cpl_delta?: number;
  cpm_delta?: number;
  cpc_delta?: number;
  roas_delta?: number;
}

// --- Campaign with Aggregated Metrics (for tables) ---

export interface CampaignWithMetrics extends Campaign {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_link_clicks: number;
  total_leads: number;
  total_conversions: number;
  total_conversion_value: number;
  avg_ctr: number;
  avg_cpm: number;
  avg_cpc: number;
  avg_cpl: number;
  avg_roas: number;
  avg_frequency: number;
  quality_ranking?: string;
}

// --- Marketing Page / Sub-page Navigation ---

export type MarketingPage =
  | 'overview'
  | 'campaigns'
  | 'campaign-detail'
  | 'creatives'
  | 'leads'
  | 'spend-budget'
  | 'ai-centre'
  | 'audiences'
  | 'creative-war-room'
  | 'placement'
  | 'time-of-day'
  | 'emotional-cycle'
  | 'tiktok-command'
  | 'spark-pipeline'
  | 'content-pillars'
  | 'comment-engagement'
  | 'live-streams'
  | 'blended-performance'
  | 'roi-by-source'
  | 'lender-performance'
  | 'credential-health'
  | 'unified-inbox'
  | 'bot-performance'
  | 'followup-performance'
  | 'conversation-intelligence';

export type DateRangePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  from?: string;
  to?: string;
}

export type PlatformFilter = 'all' | 'meta' | 'tiktok';
