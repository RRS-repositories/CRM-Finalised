import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// ==================== Ad Sets ====================

// GET /api/marketing/ads/ad-sets — list ad sets with optional campaign filter
router.get('/ad-sets', async (req, res) => {
  try {
    const { campaign_id, platform, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT ads.*, c.name AS campaign_name
               FROM ad_sets ads
               LEFT JOIN campaigns c ON ads.campaign_id = c.id`;
    const conditions = [];
    const params = [];

    if (campaign_id) {
      params.push(campaign_id);
      conditions.push(`ads.campaign_id = $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`ads.platform = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY ads.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Ads] GET /ad-sets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/ads/ad-sets — create ad set
router.post('/ad-sets', async (req, res) => {
  try {
    const { platform, platform_adset_id, campaign_id, name, status, targeting, bid_amount, daily_budget, optimization_goal, billing_event } = req.body;
    if (!platform || !campaign_id || !name) {
      return res.status(400).json({ error: 'platform, campaign_id, and name are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO ad_sets (platform, platform_adset_id, campaign_id, name, status, targeting, bid_amount, daily_budget, optimization_goal, billing_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [platform, platform_adset_id || null, campaign_id, name, status || 'ACTIVE',
       targeting ? JSON.stringify(targeting) : null, bid_amount || null, daily_budget || null,
       optimization_goal || null, billing_event || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Ads] POST /ad-sets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Ads ====================

// GET /api/marketing/ads — list ads with optional filters
router.get('/', async (req, res) => {
  try {
    const { ad_set_id, campaign_id, platform, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT a.*, ads.name AS ad_set_name, c.name AS campaign_name,
                      cr.type AS creative_type, cr.headline AS creative_headline, cr.image_url, cr.thumbnail_url
               FROM ads a
               LEFT JOIN ad_sets ads ON a.ad_set_id = ads.id
               LEFT JOIN campaigns c ON ads.campaign_id = c.id
               LEFT JOIN creatives cr ON a.creative_id = cr.id`;
    const conditions = [];
    const params = [];

    if (ad_set_id) {
      params.push(ad_set_id);
      conditions.push(`a.ad_set_id = $${params.length}`);
    }
    if (campaign_id) {
      params.push(campaign_id);
      conditions.push(`ads.campaign_id = $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`a.platform = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY a.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Ads] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/ads/:id — single ad with metrics
router.get('/:id', async (req, res) => {
  try {
    const { rows: ads } = await pool.query(
      `SELECT a.*, ads.name AS ad_set_name, c.name AS campaign_name,
              cr.type AS creative_type, cr.headline, cr.body_text, cr.call_to_action,
              cr.landing_url, cr.image_url, cr.video_url, cr.thumbnail_url
       FROM ads a
       LEFT JOIN ad_sets ads ON a.ad_set_id = ads.id
       LEFT JOIN campaigns c ON ads.campaign_id = c.id
       LEFT JOIN creatives cr ON a.creative_id = cr.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!ads.length) return res.status(404).json({ error: 'Ad not found' });

    // Aggregate metrics
    const { rows: metrics } = await pool.query(
      `SELECT
         COALESCE(SUM(spend), 0) AS total_spend,
         COALESCE(SUM(impressions), 0) AS total_impressions,
         COALESCE(SUM(clicks), 0) AS total_clicks,
         COALESCE(SUM(leads), 0) AS total_leads,
         CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS avg_ctr,
         CASE WHEN SUM(leads) > 0 THEN ROUND(SUM(spend)::numeric / SUM(leads), 4) ELSE 0 END AS avg_cpl,
         CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(conversion_value)::numeric / SUM(spend), 4) ELSE 0 END AS avg_roas
       FROM daily_metrics WHERE ad_id = $1`,
      [req.params.id]
    );

    res.json({ ...ads[0], metrics: metrics[0] || {} });
  } catch (err) {
    console.error('[Marketing Ads] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/ads — create ad
router.post('/', async (req, res) => {
  try {
    const { platform, platform_ad_id, ad_set_id, name, status, creative_id } = req.body;
    if (!platform || !ad_set_id || !name) {
      return res.status(400).json({ error: 'platform, ad_set_id, and name are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO ads (platform, platform_ad_id, ad_set_id, name, status, creative_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [platform, platform_ad_id || null, ad_set_id, name, status || 'ACTIVE', creative_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Ads] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Creatives ====================

// GET /api/marketing/ads/creatives — list creatives with metrics
router.get('/creatives/list', async (req, res) => {
  try {
    const { platform, type, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT cr.*,
                 COALESCE(agg.total_spend, 0) AS total_spend,
                 COALESCE(agg.total_impressions, 0) AS total_impressions,
                 COALESCE(agg.total_clicks, 0) AS total_clicks,
                 COALESCE(agg.total_leads, 0) AS total_leads,
                 agg.avg_ctr, agg.avg_cpl, agg.avg_roas
               FROM creatives cr
               LEFT JOIN (
                 SELECT a.creative_id,
                   SUM(dm.spend) AS total_spend,
                   SUM(dm.impressions) AS total_impressions,
                   SUM(dm.clicks) AS total_clicks,
                   SUM(dm.leads) AS total_leads,
                   CASE WHEN SUM(dm.impressions) > 0 THEN ROUND(SUM(dm.clicks)::numeric / SUM(dm.impressions) * 100, 4) ELSE 0 END AS avg_ctr,
                   CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 4) ELSE 0 END AS avg_cpl,
                   CASE WHEN SUM(dm.spend) > 0 THEN ROUND(SUM(dm.conversion_value)::numeric / SUM(dm.spend), 4) ELSE 0 END AS avg_roas
                 FROM ads a
                 JOIN daily_metrics dm ON dm.ad_id = a.id
                 GROUP BY a.creative_id
               ) agg ON agg.creative_id = cr.id`;
    const conditions = [];
    const params = [];

    if (platform) {
      params.push(platform);
      conditions.push(`cr.platform = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`cr.type = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY cr.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Ads] GET /creatives/list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/ads/creatives — create creative
router.post('/creatives', async (req, res) => {
  try {
    const { platform, platform_creative_id, type, headline, body_text, call_to_action, landing_url, image_url, video_url, thumbnail_url } = req.body;
    if (!platform || !type) {
      return res.status(400).json({ error: 'platform and type are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO creatives (platform, platform_creative_id, type, headline, body_text, call_to_action, landing_url, image_url, video_url, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [platform, platform_creative_id || null, type, headline || null, body_text || null,
       call_to_action || null, landing_url || null, image_url || null, video_url || null, thumbnail_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Ads] POST /creatives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/ads/creatives/:id — single creative detail
router.get('/creatives/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM creatives WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Creative not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Ads] GET /creatives/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/ads/creatives/lifecycle — creative lifecycle/fatigue data
router.get('/creatives/lifecycle', async (req, res) => {
  try {
    const { platform } = req.query;
    let sql = `SELECT cl.*, cr.headline, cr.type, cr.platform, cr.thumbnail_url, cr.image_url,
                      c.name AS campaign_name
               FROM creative_lifecycle cl
               LEFT JOIN creatives cr ON cl.creative_id = cr.id
               LEFT JOIN campaigns c ON cl.campaign_id = c.id`;
    const conditions = [];
    const params = [];

    if (platform && platform !== 'all') {
      params.push(platform);
      conditions.push(`cr.platform = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY cl.ctr_decline_pct DESC NULLS LAST';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Ads] GET /creatives/lifecycle error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/ads/creatives/tag-performance — tag performance aggregates
router.get('/creatives/tag-performance', async (req, res) => {
  try {
    const { platform } = req.query;
    let platformCondition = '';
    const params = [];

    if (platform && platform !== 'all') {
      params.push(platform);
      platformCondition = ` AND cr.platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        ct.category,
        ct.value,
        COUNT(DISTINCT ct.creative_id) AS count,
        CASE WHEN SUM(dm.impressions) > 0 THEN ROUND(SUM(dm.clicks)::numeric / SUM(dm.impressions) * 100, 4) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(dm.leads) > 0 THEN ROUND(SUM(dm.spend)::numeric / SUM(dm.leads), 4) ELSE 0 END AS avg_cpl,
        COALESCE(SUM(dm.spend), 0) AS avg_spend
      FROM creative_tags ct
      JOIN creatives cr ON ct.creative_id = cr.id
      LEFT JOIN ads a ON a.creative_id = cr.id
      LEFT JOIN daily_metrics dm ON dm.ad_id = a.id
      WHERE 1=1${platformCondition}
      GROUP BY ct.category, ct.value
      HAVING COUNT(DISTINCT ct.creative_id) > 0
      ORDER BY ct.category, avg_cpl ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[Marketing Ads] GET /creatives/tag-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
