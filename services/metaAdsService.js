/**
 * Meta Marketing API Service
 * Wraps the Facebook/Meta Graph API v21.0 for campaign management and reporting.
 * Used by Windmill sync jobs and route handlers.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0';

class MetaAdsService {
  constructor(accessToken, accountId) {
    this.accessToken = accessToken;
    this.accountId = accountId;
  }

  async _request(endpoint, params = {}, method = 'GET', body = null) {
    const url = new URL(`${META_API_BASE}${endpoint}`);
    url.searchParams.set('access_token', this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

    const res = await fetch(url.toString(), options);
    const data = await res.json();

    if (data.error) {
      const err = new Error(`Meta API Error: ${data.error.message}`);
      err.code = data.error.code;
      err.subcode = data.error.error_subcode;
      throw err;
    }
    return data;
  }

  // --- Campaigns ---

  async getCampaigns(fields = 'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time') {
    return this._request(`/act_${this.accountId}/campaigns`, {
      fields,
      limit: 500,
    });
  }

  async getCampaign(campaignId, fields = 'id,name,objective,status,daily_budget,lifetime_budget') {
    return this._request(`/${campaignId}`, { fields });
  }

  // --- Ad Sets ---

  async getAdSets(campaignId, fields = 'id,name,status,targeting,bid_amount,daily_budget,optimization_goal,billing_event') {
    const endpoint = campaignId
      ? `/${campaignId}/adsets`
      : `/act_${this.accountId}/adsets`;
    return this._request(endpoint, { fields, limit: 500 });
  }

  // --- Ads ---

  async getAds(adSetId, fields = 'id,name,status,creative{id,name,title,body,call_to_action_type,image_url,video_id,thumbnail_url,effective_object_story_id}') {
    const endpoint = adSetId
      ? `/${adSetId}/ads`
      : `/act_${this.accountId}/ads`;
    return this._request(endpoint, { fields, limit: 500 });
  }

  // --- Insights (Metrics) ---

  async getInsights(objectId, params = {}) {
    const defaults = {
      fields: [
        'spend', 'impressions', 'reach', 'frequency',
        'clicks', 'inline_link_clicks',
        'ctr', 'inline_link_click_ctr',
        'cpm', 'cpc', 'cost_per_inline_link_click',
        'actions', 'cost_per_action_type',
        'action_values',
        'video_p25_watched_actions', 'video_p50_watched_actions',
        'video_p75_watched_actions', 'video_p100_watched_actions',
        'video_avg_time_watched_actions',
        'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
      ].join(','),
      date_preset: 'last_30d',
      level: 'ad',
      time_increment: 1,
      limit: 5000,
      ...params,
    };

    return this._request(`/${objectId}/insights`, defaults);
  }

  async getAccountInsights(params = {}) {
    return this.getInsights(`act_${this.accountId}`, { level: 'account', ...params });
  }

  async getCampaignInsights(campaignId, params = {}) {
    return this.getInsights(campaignId, { level: 'campaign', ...params });
  }

  async getAdInsights(params = {}) {
    return this.getInsights(`act_${this.accountId}`, { level: 'ad', ...params });
  }

  // Insights with demographic breakdowns
  async getInsightsWithBreakdown(objectId, breakdown, params = {}) {
    return this.getInsights(objectId, { breakdowns: breakdown, ...params });
  }

  // --- Lead Forms ---

  async getLeadForms() {
    return this._request(`/act_${this.accountId}/leadgen_forms`, {
      fields: 'id,name,status,leads_count',
    });
  }

  async getLeadFormLeads(formId, since) {
    const params = { fields: 'id,created_time,field_data' };
    if (since) params.filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(since).getTime() / 1000) }]);
    return this._request(`/${formId}/leads`, params);
  }

  // --- Custom Audiences ---

  async getCustomAudiences(fields = 'id,name,approximate_count,subtype,time_created') {
    return this._request(`/act_${this.accountId}/customaudiences`, { fields });
  }

  async createCustomAudience(name, description, subtype = 'CUSTOM') {
    return this._request(`/act_${this.accountId}/customaudiences`, {}, 'POST', {
      name, description, subtype, customer_file_source: 'USER_PROVIDED_ONLY',
    });
  }

  // --- Token Management ---

  async debugToken() {
    return this._request('/debug_token', { input_token: this.accessToken });
  }

  async refreshLongLivedToken(appId, appSecret) {
    return this._request('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: this.accessToken,
    });
  }

  // --- Helpers ---

  /**
   * Extract lead count from actions array.
   */
  static extractLeads(actions) {
    if (!actions) return 0;
    const leadAction = actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return leadAction ? parseInt(leadAction.value) : 0;
  }

  /**
   * Extract conversion value from action_values array.
   */
  static extractConversionValue(actionValues) {
    if (!actionValues) return 0;
    const val = actionValues.find(a => a.action_type === 'offsite_conversion.fb_pixel_purchase');
    return val ? parseFloat(val.value) : 0;
  }

  /**
   * Extract cost per lead from cost_per_action_type array.
   */
  static extractCostPerLead(costPerAction) {
    if (!costPerAction) return null;
    const cpl = costPerAction.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
    return cpl ? parseFloat(cpl.value) : null;
  }

  /**
   * Transform raw Meta insight row into our daily_metrics format.
   */
  static transformInsight(row) {
    return {
      date: row.date_start,
      spend: parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0),
      reach: parseInt(row.reach || 0),
      frequency: parseFloat(row.frequency || 0),
      clicks: parseInt(row.clicks || 0),
      link_clicks: parseInt(row.inline_link_clicks || 0),
      ctr: parseFloat(row.ctr || 0),
      link_ctr: parseFloat(row.inline_link_click_ctr || 0),
      cpm: parseFloat(row.cpm || 0),
      cpc: parseFloat(row.cpc || 0),
      cost_per_link_click: parseFloat(row.cost_per_inline_link_click || 0),
      leads: MetaAdsService.extractLeads(row.actions),
      cost_per_lead: MetaAdsService.extractCostPerLead(row.cost_per_action_type),
      conversion_value: MetaAdsService.extractConversionValue(row.action_values),
      quality_ranking: row.quality_ranking || null,
      engagement_rate_ranking: row.engagement_rate_ranking || null,
      conversion_rate_ranking: row.conversion_rate_ranking || null,
    };
  }
}

export default MetaAdsService;
