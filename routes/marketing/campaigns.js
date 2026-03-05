import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/campaigns — list campaigns with optional filters
router.get('/', async (req, res) => {
  try {
    const { platform, status, account_id, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT c.*, pa.account_name
               FROM campaigns c
               LEFT JOIN platform_accounts pa ON c.platform_account_id = pa.id`;
    const conditions = [];
    const params = [];

    if (platform) {
      params.push(platform);
      conditions.push(`c.platform = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (account_id) {
      params.push(account_id);
      conditions.push(`c.platform_account_id = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY c.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Campaigns] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/scheduled — campaigns with emotional scheduling
// NOTE: Must be defined BEFORE /:id to avoid "scheduled" being treated as an id param
router.get('/scheduled', async (req, res) => {
  try {
    const { platform, has_schedule } = req.query;
    const conditions = [];
    const params = [];

    if (platform && platform !== 'all') {
      params.push(platform);
      conditions.push(`c.platform = $${params.length}`);
    }
    if (has_schedule === 'true') {
      conditions.push(`c.scheduled_days IS NOT NULL`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT
        c.id, c.name, c.platform, c.status,
        c.emotional_angle, c.scheduled_days, c.daily_budget,
        COALESCE(SUM(dm.spend), 0) AS total_spend,
        COALESCE(SUM(dm.leads), 0) AS total_leads,
        CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 4) ELSE 0 END AS avg_cpl
      FROM campaigns c
      LEFT JOIN daily_metrics dm ON dm.campaign_id = c.id
      ${where}
      GROUP BY c.id, c.name, c.platform, c.status, c.emotional_angle, c.scheduled_days, c.daily_budget
      ORDER BY total_leads DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Campaigns] GET /scheduled error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id — single campaign with aggregated metrics
router.get('/:id', async (req, res) => {
  try {
    const { rows: campaigns } = await pool.query(
      `SELECT c.*, pa.account_name
       FROM campaigns c
       LEFT JOIN platform_accounts pa ON c.platform_account_id = pa.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!campaigns.length) return res.status(404).json({ error: 'Campaign not found' });

    // Get aggregated metrics for this campaign
    const { rows: metrics } = await pool.query(
      `SELECT
         COALESCE(SUM(spend), 0) AS total_spend,
         COALESCE(SUM(impressions), 0) AS total_impressions,
         COALESCE(SUM(clicks), 0) AS total_clicks,
         COALESCE(SUM(link_clicks), 0) AS total_link_clicks,
         COALESCE(SUM(leads), 0) AS total_leads,
         COALESCE(SUM(conversions), 0) AS total_conversions,
         COALESCE(SUM(conversion_value), 0) AS total_conversion_value,
         CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS avg_ctr,
         CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 4) ELSE 0 END AS avg_cpm,
         CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend)::numeric / SUM(clicks), 4) ELSE 0 END AS avg_cpc,
         CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS avg_cpl,
         CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS avg_roas
       FROM daily_metrics
       WHERE campaign_id = $1`,
      [req.params.id]
    );

    res.json({ ...campaigns[0], metrics: metrics[0] || {} });
  } catch (err) {
    console.error('[Marketing Campaigns] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/ad-sets — ad sets for a campaign
router.get('/:id/ad-sets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ad_sets WHERE campaign_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Campaigns] GET /:id/ad-sets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/ads — ads for a campaign
router.get('/:id/ads', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, ads2.name AS ad_set_name, cr.type AS creative_type, cr.headline AS creative_headline
       FROM ads a
       JOIN ad_sets ads2 ON a.ad_set_id = ads2.id
       LEFT JOIN creatives cr ON a.creative_id = cr.id
       WHERE ads2.campaign_id = $1
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Campaigns] GET /:id/ads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/daily — daily metrics for a campaign
router.get('/:id/daily', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM daily_metrics WHERE campaign_id = $1';
    const params = [req.params.id];

    if (from) {
      params.push(from);
      sql += ` AND date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND date <= $${params.length}`;
    }
    sql += ' ORDER BY date ASC';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Campaigns] GET /:id/daily error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/campaigns — create a campaign
router.post('/', async (req, res) => {
  try {
    const { platform, platform_campaign_id, platform_account_id, name, objective, status, daily_budget, lifetime_budget, start_date, end_date } = req.body;
    if (!platform || !name) {
      return res.status(400).json({ error: 'platform and name are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO campaigns (platform, platform_campaign_id, platform_account_id, name, objective, status, daily_budget, lifetime_budget, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [platform, platform_campaign_id || null, platform_account_id || null, name, objective || null, status || 'ACTIVE', daily_budget || null, lifetime_budget || null, start_date || null, end_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Campaigns] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/campaigns/:id — update campaign
router.put('/:id', async (req, res) => {
  try {
    const { name, objective, status, daily_budget, lifetime_budget, start_date, end_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE campaigns
       SET name = COALESCE($1, name),
           objective = COALESCE($2, objective),
           status = COALESCE($3, status),
           daily_budget = COALESCE($4, daily_budget),
           lifetime_budget = COALESCE($5, lifetime_budget),
           start_date = COALESCE($6, start_date),
           end_date = COALESCE($7, end_date),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, objective, status, daily_budget, lifetime_budget, start_date, end_date, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Campaigns] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
