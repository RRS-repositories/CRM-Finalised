import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/spark-ads/pipeline — all pipeline items
router.get('/pipeline', async (req, res) => {
  try {
    const { stage, account_id } = req.query;
    let sql = `SELECT sp.*,
                      tc.title AS content_title, tc.hook, tc.thumbnail_url, tc.format,
                      ta.account_name, ta.tiktok_username,
                      c.name AS campaign_name
               FROM spark_ads_pipeline sp
               LEFT JOIN tiktok_content tc ON sp.content_id = tc.id
               LEFT JOIN tiktok_accounts ta ON sp.tiktok_account_id = ta.id
               LEFT JOIN campaigns c ON sp.campaign_id = c.id`;
    const conditions = [];
    const params = [];

    if (stage) {
      params.push(stage);
      conditions.push(`sp.stage = $${params.length}`);
    }
    if (account_id) {
      params.push(account_id);
      conditions.push(`sp.tiktok_account_id = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY sp.updated_at DESC';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Spark Ads] GET /pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/spark-ads/pipeline/grouped — grouped by stage for kanban
router.get('/pipeline/grouped', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sp.*,
             tc.title AS content_title, tc.hook, tc.thumbnail_url, tc.format,
             ta.account_name, ta.tiktok_username,
             c.name AS campaign_name
      FROM spark_ads_pipeline sp
      LEFT JOIN tiktok_content tc ON sp.content_id = tc.id
      LEFT JOIN tiktok_accounts ta ON sp.tiktok_account_id = ta.id
      LEFT JOIN campaigns c ON sp.campaign_id = c.id
      ORDER BY sp.updated_at DESC
    `);

    const grouped = {
      monitoring: [],
      qualified: [],
      approved: [],
      live: [],
      completed: [],
      rejected: [],
    };

    rows.forEach(row => {
      if (grouped[row.stage]) {
        grouped[row.stage].push(row);
      }
    });

    res.json(grouped);
  } catch (err) {
    console.error('[Spark Ads] GET /pipeline/grouped error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/spark-ads/pipeline — add to pipeline
router.post('/pipeline', async (req, res) => {
  try {
    const { content_id, tiktok_account_id, qualification_reason, views_at_qualification, engagement_rate_at_qual } = req.body;
    if (!content_id) return res.status(400).json({ error: 'content_id is required' });

    const { rows } = await pool.query(
      `INSERT INTO spark_ads_pipeline (content_id, tiktok_account_id, qualification_reason, views_at_qualification, engagement_rate_at_qual)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [content_id, tiktok_account_id || null, qualification_reason || null,
       views_at_qualification || null, engagement_rate_at_qual || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Spark Ads] POST /pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/spark-ads/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    const { auth_code, auth_code_expires_at, approved_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE spark_ads_pipeline
       SET stage = 'approved', auth_code = $1, auth_code_expires_at = $2,
           approved_by = $3, approved_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [auth_code || null, auth_code_expires_at || null, approved_by || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pipeline item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Spark Ads] POST /:id/approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/spark-ads/:id/launch
router.post('/:id/launch', async (req, res) => {
  try {
    const { spark_ad_id, campaign_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE spark_ads_pipeline
       SET stage = 'live', spark_ad_id = $1, campaign_id = $2,
           launched_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [spark_ad_id || null, campaign_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pipeline item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Spark Ads] POST /:id/launch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/spark-ads/:id — update pipeline item
router.put('/:id', async (req, res) => {
  try {
    const { stage, notes, spark_spend, spark_impressions, spark_clicks, spark_leads, spark_cpl } = req.body;
    const updates = [];
    const params = [];

    if (stage) { params.push(stage); updates.push(`stage = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); updates.push(`notes = $${params.length}`); }
    if (spark_spend !== undefined) { params.push(spark_spend); updates.push(`spark_spend = $${params.length}`); }
    if (spark_impressions !== undefined) { params.push(spark_impressions); updates.push(`spark_impressions = $${params.length}`); }
    if (spark_clicks !== undefined) { params.push(spark_clicks); updates.push(`spark_clicks = $${params.length}`); }
    if (spark_leads !== undefined) { params.push(spark_leads); updates.push(`spark_leads = $${params.length}`); }
    if (spark_cpl !== undefined) { params.push(spark_cpl); updates.push(`spark_cpl = $${params.length}`); }

    if (stage === 'completed') updates.push(`completed_at = NOW()`);
    updates.push('updated_at = NOW()');

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE spark_ads_pipeline SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Pipeline item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Spark Ads] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/spark-ads/stats — summary stats
router.get('/stats', async (req, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage = 'monitoring') AS monitoring,
        COUNT(*) FILTER (WHERE stage = 'qualified') AS qualified,
        COUNT(*) FILTER (WHERE stage = 'approved') AS approved,
        COUNT(*) FILTER (WHERE stage = 'live') AS live,
        COUNT(*) FILTER (WHERE stage = 'completed') AS completed,
        COALESCE(SUM(spark_spend), 0) AS total_spark_spend,
        COALESCE(SUM(spark_leads), 0) AS total_spark_leads,
        CASE WHEN SUM(spark_leads) > 0 THEN ROUND(SUM(spark_spend)::numeric / SUM(spark_leads), 4) ELSE 0 END AS avg_spark_cpl
      FROM spark_ads_pipeline
    `);
    res.json(stats);
  } catch (err) {
    console.error('[Spark Ads] GET /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
