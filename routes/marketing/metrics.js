import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// Helper: resolve date range from preset or custom from/to
function resolveDateRange(query) {
  const { preset, from, to } = query;
  const today = new Date().toISOString().slice(0, 10);

  if (from && to) return { from, to };

  const d = new Date();
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(d); y.setDate(d.getDate() - 1);
      const yd = y.toISOString().slice(0, 10);
      return { from: yd, to: yd };
    }
    case 'last_7d': {
      const s = new Date(d); s.setDate(d.getDate() - 7);
      return { from: s.toISOString().slice(0, 10), to: today };
    }
    case 'last_14d': {
      const s = new Date(d); s.setDate(d.getDate() - 14);
      return { from: s.toISOString().slice(0, 10), to: today };
    }
    case 'last_90d': {
      const s = new Date(d); s.setDate(d.getDate() - 90);
      return { from: s.toISOString().slice(0, 10), to: today };
    }
    case 'this_month': {
      const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      return { from: firstOfMonth, to: today };
    }
    case 'last_month': {
      const firstLastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastLastMonth = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
      return { from: firstLastMonth, to: lastLastMonth };
    }
    case 'last_30d':
    default: {
      const s = new Date(d); s.setDate(d.getDate() - 30);
      return { from: s.toISOString().slice(0, 10), to: today };
    }
  }
}

// GET /api/marketing/metrics/overview — KPI summary
router.get('/overview', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND platform = $${params.length}`;
    }

    // Current period KPIs
    const { rows: [current] } = await pool.query(`
      SELECT
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(leads), 0) AS total_leads,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 2) ELSE 0 END AS avg_cpl,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 2) ELSE 0 END AS avg_cpm,
        CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 2) ELSE 0 END AS avg_cpc,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS overall_roas
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2${platformCondition}
    `, params);

    // Previous period for deltas (same duration, immediately prior)
    const daysDiff = Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
    const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(new Date(prevTo).getTime() - (daysDiff - 1) * 86400000).toISOString().slice(0, 10);

    const prevParams = [prevFrom, prevTo];
    let prevPlatformCondition = '';
    if (platform && platform !== 'all') {
      prevParams.push(platform);
      prevPlatformCondition = ` AND platform = $${prevParams.length}`;
    }

    const { rows: [previous] } = await pool.query(`
      SELECT
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(leads), 0) AS total_leads,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 2) ELSE 0 END AS avg_cpl,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 2) ELSE 0 END AS avg_cpm,
        CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 2) ELSE 0 END AS avg_cpc,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS overall_roas
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2${prevPlatformCondition}
    `, prevParams);

    // Calculate deltas as percentage change
    const delta = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : null;

    res.json({
      ...current,
      spend_delta: delta(current.total_spend, previous.total_spend),
      leads_delta: delta(current.total_leads, previous.total_leads),
      cpl_delta: delta(current.avg_cpl, previous.avg_cpl),
      cpm_delta: delta(current.avg_cpm, previous.avg_cpm),
      cpc_delta: delta(current.avg_cpc, previous.avg_cpc),
      roas_delta: delta(current.overall_roas, previous.overall_roas),
      period: { from, to },
      previous_period: { from: prevFrom, to: prevTo },
    });
  } catch (err) {
    console.error('[Marketing Metrics] GET /overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/daily — daily time series
router.get('/daily', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        date,
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(link_clicks) AS link_clicks,
        SUM(leads) AS leads,
        SUM(conversions) AS conversions,
        SUM(conversion_value) AS conversion_value,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS ctr,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 4) ELSE 0 END AS cpm,
        CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 4) ELSE 0 END AS cpc,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS cpl,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS roas
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2${platformCondition}
      GROUP BY date
      ORDER BY date ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /daily error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/hourly — hourly data for today/recent
router.get('/hourly', async (req, res) => {
  try {
    const { platform, campaign_id } = req.query;
    const params = [];
    const conditions = [];

    // Default: last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    params.push(since);
    conditions.push(`hour >= $${params.length}`);

    if (platform && platform !== 'all') {
      params.push(platform);
      conditions.push(`platform = $${params.length}`);
    }
    if (campaign_id) {
      params.push(campaign_id);
      conditions.push(`campaign_id = $${params.length}`);
    }

    const { rows } = await pool.query(`
      SELECT * FROM hourly_metrics
      WHERE ${conditions.join(' AND ')}
      ORDER BY hour ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /hourly error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/by-campaign — per-campaign summary for table view
router.get('/by-campaign', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND dm.platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.platform, c.status, c.objective,
        c.daily_budget, c.lifetime_budget,
        COALESCE(SUM(dm.spend), 0) AS total_spend,
        COALESCE(SUM(dm.impressions), 0) AS total_impressions,
        COALESCE(SUM(dm.clicks), 0) AS total_clicks,
        COALESCE(SUM(dm.link_clicks), 0) AS total_link_clicks,
        COALESCE(SUM(dm.leads), 0) AS total_leads,
        COALESCE(SUM(dm.conversions), 0) AS total_conversions,
        COALESCE(SUM(dm.conversion_value), 0) AS total_conversion_value,
        CASE WHEN SUM(dm.impressions) > 0 THEN ROUND(SUM(dm.clicks)::numeric / SUM(dm.impressions) * 100, 4) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(dm.impressions) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.impressions) * 1000, 4) ELSE 0 END AS avg_cpm,
        CASE WHEN SUM(dm.clicks) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.clicks), 4) ELSE 0 END AS avg_cpc,
        CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 4) ELSE 0 END AS avg_cpl,
        CASE WHEN SUM(dm.spend) > 0 THEN ROUND(SUM(dm.conversion_value)::numeric / SUM(dm.spend), 4) ELSE 0 END AS avg_roas,
        CASE WHEN SUM(dm.reach) > 0 THEN ROUND(SUM(dm.impressions)::numeric / SUM(dm.reach), 2) ELSE 0 END AS avg_frequency
      FROM campaigns c
      LEFT JOIN daily_metrics dm ON dm.campaign_id = c.id AND dm.date >= $1 AND dm.date <= $2${platformCondition}
      GROUP BY c.id, c.name, c.platform, c.status, c.objective, c.daily_budget, c.lifetime_budget
      ORDER BY total_spend DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /by-campaign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/by-platform — platform comparison
router.get('/by-platform', async (req, res) => {
  try {
    const { from, to } = resolveDateRange(req.query);

    const { rows } = await pool.query(`
      SELECT
        platform,
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(impressions), 0) AS total_impressions,
        COALESCE(SUM(clicks), 0) AS total_clicks,
        COALESCE(SUM(leads), 0) AS total_leads,
        COALESCE(SUM(conversions), 0) AS total_conversions,
        COALESCE(SUM(conversion_value), 0) AS total_conversion_value,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 2) ELSE 0 END AS avg_cpl,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 2) ELSE 0 END AS avg_cpm,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS avg_roas
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2
      GROUP BY platform
      ORDER BY total_spend DESC
    `, [from, to]);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /by-platform error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/by-placement — placement breakdown
router.get('/by-placement', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        placement,
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(impressions), 0) AS total_impressions,
        COALESCE(SUM(clicks), 0) AS total_clicks,
        COALESCE(SUM(leads), 0) AS total_leads,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 4) ELSE 0 END AS avg_cpm,
        CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 4) ELSE 0 END AS avg_cpc,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS avg_cpl
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2 AND placement IS NOT NULL${platformCondition}
      GROUP BY placement
      ORDER BY total_spend DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /by-placement error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/placement-trend — placement CPL trend over time
router.get('/placement-trend', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        date,
        placement,
        SUM(spend) AS spend,
        SUM(leads) AS leads,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS cpl
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2 AND placement IS NOT NULL${platformCondition}
      GROUP BY date, placement
      ORDER BY date ASC, placement
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /placement-trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/metrics/hourly-heatmap — hour x day aggregated data
router.get('/hourly-heatmap', async (req, res) => {
  try {
    const { platform } = req.query;
    const { from, to } = resolveDateRange(req.query);

    let platformCondition = '';
    const params = [from, to];
    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        hour_of_day,
        day_of_week,
        COALESCE(SUM(spend), 0) AS total_spend,
        COALESCE(SUM(impressions), 0) AS total_impressions,
        COALESCE(SUM(clicks), 0) AS total_clicks,
        COALESCE(SUM(leads), 0) AS total_leads,
        CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS avg_cpl
      FROM daily_metrics
      WHERE date >= $1 AND date <= $2
        AND hour_of_day IS NOT NULL
        AND day_of_week IS NOT NULL${platformCondition}
      GROUP BY hour_of_day, day_of_week
      ORDER BY day_of_week, hour_of_day
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Metrics] GET /hourly-heatmap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
