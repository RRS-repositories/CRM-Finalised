/**
 * TikTok Marketing API Service
 * Wraps the TikTok Marketing API v1.3 for campaign management and reporting.
 * Used by Windmill sync jobs and route handlers.
 */

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

class TikTokAdsService {
  constructor(accessToken, advertiserId) {
    this.accessToken = accessToken;
    this.advertiserId = advertiserId;
  }

  async _request(endpoint, params = {}, method = 'GET', body = null) {
    const url = new URL(`${TIKTOK_API_BASE}${endpoint}`);
    const headers = {
      'Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };

    let options = { method, headers };

    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    } else {
      options.body = JSON.stringify(body || params);
    }

    const res = await fetch(url.toString(), options);
    const data = await res.json();

    if (data.code !== 0) {
      const err = new Error(`TikTok API Error: ${data.message}`);
      err.code = data.code;
      throw err;
    }
    return data.data;
  }

  // --- Campaigns ---

  async getCampaigns(fields = ['campaign_id', 'campaign_name', 'objective_type', 'status', 'budget', 'budget_mode']) {
    return this._request('/campaign/get/', {
      advertiser_id: this.advertiserId,
      fields: JSON.stringify(fields),
      page_size: 1000,
    });
  }

  // --- Ad Groups ---

  async getAdGroups(campaignId, fields = ['adgroup_id', 'adgroup_name', 'status', 'budget', 'bid_type', 'optimization_goal', 'billing_event']) {
    const params = {
      advertiser_id: this.advertiserId,
      fields: JSON.stringify(fields),
      page_size: 1000,
    };
    if (campaignId) {
      params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
    }
    return this._request('/adgroup/get/', params);
  }

  // --- Ads ---

  async getAds(adGroupId, fields = ['ad_id', 'ad_name', 'status', 'adgroup_id', 'ad_format', 'call_to_action', 'landing_page_url']) {
    const params = {
      advertiser_id: this.advertiserId,
      fields: JSON.stringify(fields),
      page_size: 1000,
    };
    if (adGroupId) {
      params.filtering = JSON.stringify({ adgroup_ids: [adGroupId] });
    }
    return this._request('/ad/get/', params);
  }

  // --- Reporting (POST-based) ---

  async getReport(params = {}) {
    const defaults = {
      advertiser_id: this.advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: ['ad_id', 'stat_time_day'],
      metrics: [
        'spend', 'impressions', 'reach', 'frequency',
        'clicks', 'ctr', 'cpm', 'cpc',
        'conversion', 'cost_per_conversion', 'conversion_rate',
        'real_time_result', 'real_time_cost_per_result',
        'video_play_actions', 'video_watched_2s', 'video_watched_6s',
        'average_video_play_per_user',
        'likes', 'comments', 'shares', 'follows',
        'profile_visits',
      ],
      page_size: 1000,
      ...params,
    };

    return this._request('/report/integrated/get/', {}, 'POST', defaults);
  }

  async getCampaignReport(startDate, endDate) {
    return this.getReport({
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', 'stat_time_day'],
      start_date: startDate,
      end_date: endDate,
    });
  }

  async getAdReport(startDate, endDate) {
    return this.getReport({
      data_level: 'AUCTION_AD',
      dimensions: ['ad_id', 'stat_time_day'],
      start_date: startDate,
      end_date: endDate,
    });
  }

  // Reports with demographic breakdowns
  async getReportByAge(startDate, endDate) {
    return this.getReport({
      dimensions: ['ad_id', 'stat_time_day', 'age'],
      start_date: startDate,
      end_date: endDate,
    });
  }

  async getReportByGender(startDate, endDate) {
    return this.getReport({
      dimensions: ['ad_id', 'stat_time_day', 'gender'],
      start_date: startDate,
      end_date: endDate,
    });
  }

  // --- Lead Forms ---

  async getLeadForms() {
    return this._request('/pages/get/', {
      advertiser_id: this.advertiserId,
      page_size: 100,
    });
  }

  // --- Custom Audiences ---

  async getCustomAudiences() {
    return this._request('/dmp/custom_audience/list/', {
      advertiser_id: this.advertiserId,
      page_size: 100,
    });
  }

  async createCustomAudience(name, fileType = 'FILE_TYPE_PHONE') {
    return this._request('/dmp/custom_audience/create/', {}, 'POST', {
      advertiser_id: this.advertiserId,
      custom_audience_name: name,
      file_type: fileType,
    });
  }

  // --- Token Info ---

  async getAdvertiserInfo() {
    return this._request('/advertiser/info/', {
      advertiser_ids: JSON.stringify([this.advertiserId]),
    });
  }

  // --- Helpers ---

  /**
   * Transform raw TikTok report row into our daily_metrics format.
   */
  static transformReportRow(row) {
    const m = row.metrics || {};
    const d = row.dimensions || {};
    return {
      date: d.stat_time_day,
      spend: parseFloat(m.spend || 0),
      impressions: parseInt(m.impressions || 0),
      reach: parseInt(m.reach || 0),
      frequency: parseFloat(m.frequency || 0),
      clicks: parseInt(m.clicks || 0),
      link_clicks: parseInt(m.clicks || 0), // TikTok doesn't separate link clicks
      ctr: parseFloat(m.ctr || 0),
      link_ctr: parseFloat(m.ctr || 0),
      cpm: parseFloat(m.cpm || 0),
      cpc: parseFloat(m.cpc || 0),
      cost_per_link_click: parseFloat(m.cpc || 0),
      conversions: parseInt(m.conversion || 0),
      conversion_rate: parseFloat(m.conversion_rate || 0),
      cost_per_conversion: parseFloat(m.cost_per_conversion || 0),
      leads: parseInt(m.real_time_result || 0),
      cost_per_lead: parseFloat(m.real_time_cost_per_result || 0),
      video_views: parseInt(m.video_play_actions || 0),
      likes: parseInt(m.likes || 0),
      comments: parseInt(m.comments || 0),
      shares: parseInt(m.shares || 0),
      follows: parseInt(m.follows || 0),
    };
  }
}

export default TikTokAdsService;
