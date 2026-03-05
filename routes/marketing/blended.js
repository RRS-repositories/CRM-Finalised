import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/blended/summary — current blended CPL summary
router.get('/summary', async (req, res) => {
  try {
    const { period_type = 'weekly' } = req.query;
    const { rows } = await pool.query(`
      SELECT *,
             CASE WHEN total_leads > 0
               THEN ROUND(total_spend::numeric / total_leads, 2)
               ELSE 0 END AS blended_cpl,
             CASE WHEN leads_signed > 0
               THEN ROUND(total_spend::numeric / leads_signed, 2)
               ELSE 0 END AS cost_per_signed,
             CASE WHEN total_spend > 0 AND total_fees > 0
               THEN ROUND((total_fees - total_spend)::numeric / total_spend * 100, 1)
               ELSE 0 END AS roi_pct
      FROM blended_performance
      WHERE period_type = $1
      ORDER BY period_start DESC
      LIMIT 1
    `, [period_type]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[Blended] GET /summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/trend — blended CPL over time
router.get('/trend', async (req, res) => {
  try {
    const { period_type = 'weekly', limit = 12 } = req.query;
    const { rows } = await pool.query(`
      SELECT period_start, period_end,
             total_leads, total_spend,
             tiktok_organic_leads, tiktok_spark_leads, tiktok_paid_leads,
             meta_paid_leads, meta_organic_leads, cross_platform_retarget_leads,
             tiktok_organic_spend, tiktok_spark_spend, tiktok_paid_spend,
             meta_paid_spend, meta_organic_spend, cross_platform_retarget_spend,
             leads_signed, leads_won, total_fees,
             CASE WHEN total_leads > 0
               THEN ROUND(total_spend::numeric / total_leads, 2)
               ELSE 0 END AS blended_cpl,
             CASE WHEN leads_signed > 0
               THEN ROUND(total_spend::numeric / leads_signed, 2)
               ELSE 0 END AS cost_per_signed
      FROM blended_performance
      WHERE period_type = $1
      ORDER BY period_start DESC
      LIMIT $2
    `, [period_type, parseInt(limit)]);
    res.json(rows.reverse());
  } catch (err) {
    console.error('[Blended] GET /trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/by-source — channel breakdown with ROI
router.get('/by-source', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        period_start, period_end,
        tiktok_organic_leads, tiktok_organic_spend,
        tiktok_spark_leads, tiktok_spark_spend,
        tiktok_paid_leads, tiktok_paid_spend,
        meta_paid_leads, meta_paid_spend,
        meta_organic_leads, meta_organic_spend,
        cross_platform_retarget_leads, cross_platform_retarget_spend,
        total_leads, total_spend, leads_signed, leads_won,
        total_compensation, total_fees
      FROM blended_performance
      WHERE period_type = 'weekly'
      ORDER BY period_start DESC
      LIMIT 1
    `);
    if (!rows.length) return res.json({ sources: [], totals: null });

    const r = rows[0];
    const sources = [
      { source: 'TikTok Organic', leads: r.tiktok_organic_leads, spend: Number(r.tiktok_organic_spend), cpl: r.tiktok_organic_leads > 0 ? Number(r.tiktok_organic_spend) / r.tiktok_organic_leads : 0 },
      { source: 'TikTok Spark Ads', leads: r.tiktok_spark_leads, spend: Number(r.tiktok_spark_spend), cpl: r.tiktok_spark_leads > 0 ? Number(r.tiktok_spark_spend) / r.tiktok_spark_leads : 0 },
      { source: 'TikTok Paid', leads: r.tiktok_paid_leads, spend: Number(r.tiktok_paid_spend), cpl: r.tiktok_paid_leads > 0 ? Number(r.tiktok_paid_spend) / r.tiktok_paid_leads : 0 },
      { source: 'Meta Paid', leads: r.meta_paid_leads, spend: Number(r.meta_paid_spend), cpl: r.meta_paid_leads > 0 ? Number(r.meta_paid_spend) / r.meta_paid_leads : 0 },
      { source: 'Meta Organic', leads: r.meta_organic_leads, spend: Number(r.meta_organic_spend), cpl: r.meta_organic_leads > 0 ? Number(r.meta_organic_spend) / r.meta_organic_leads : 0 },
      { source: 'Cross-Platform Retarget', leads: r.cross_platform_retarget_leads, spend: Number(r.cross_platform_retarget_spend), cpl: r.cross_platform_retarget_leads > 0 ? Number(r.cross_platform_retarget_spend) / r.cross_platform_retarget_leads : 0 },
    ];

    res.json({
      sources,
      totals: {
        period_start: r.period_start,
        period_end: r.period_end,
        total_leads: r.total_leads,
        total_spend: Number(r.total_spend),
        leads_signed: r.leads_signed,
        leads_won: r.leads_won,
        total_compensation: Number(r.total_compensation),
        total_fees: Number(r.total_fees),
        blended_cpl: r.total_leads > 0 ? Number(r.total_spend) / r.total_leads : 0,
        cost_per_signed: r.leads_signed > 0 ? Number(r.total_spend) / r.leads_signed : 0,
      },
    });
  } catch (err) {
    console.error('[Blended] GET /by-source error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/journeys — cross-platform journey stats
router.get('/journeys', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        primary_attribution,
        COUNT(*) AS total_journeys,
        COUNT(*) FILTER (WHERE converted = TRUE) AS conversions,
        AVG(total_touches)::numeric(5,1) AS avg_touches,
        COALESCE(SUM(attributed_cost), 0) AS total_cost,
        CASE WHEN COUNT(*) FILTER (WHERE converted = TRUE) > 0
          THEN ROUND(SUM(attributed_cost)::numeric / COUNT(*) FILTER (WHERE converted = TRUE), 2)
          ELSE 0 END AS cost_per_conversion
      FROM cross_platform_journeys
      GROUP BY primary_attribution
      ORDER BY conversions DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Blended] GET /journeys error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/roi-by-source — profitability by source
router.get('/roi-by-source', async (req, res) => {
  try {
    // Aggregate from ad_leads joined with blended data
    const { rows } = await pool.query(`
      SELECT
        COALESCE(al.source, 'Unknown') AS source,
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE al.status = 'signed') AS signed,
        COUNT(*) FILTER (WHERE al.status = 'won') AS won,
        COALESCE(SUM(al.compensation_amount), 0) AS total_compensation,
        COALESCE(SUM(al.fee_amount), 0) AS total_fees,
        COALESCE(SUM(al.ad_spend_attributed), 0) AS ad_spend,
        COALESCE(SUM(al.fee_amount) - SUM(al.ad_spend_attributed), 0) AS profit,
        CASE WHEN SUM(al.ad_spend_attributed) > 0
          THEN ROUND((SUM(al.fee_amount) - SUM(al.ad_spend_attributed))::numeric / SUM(al.ad_spend_attributed) * 100, 1)
          ELSE NULL END AS roi_pct
      FROM ad_leads al
      GROUP BY al.source
      ORDER BY total_leads DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Blended] GET /roi-by-source error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/profitability-trend — monthly profitability
router.get('/profitability-trend', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        period_start,
        total_spend,
        total_fees,
        total_compensation,
        COALESCE(total_fees - total_spend, 0) AS profit,
        CASE WHEN total_spend > 0
          THEN ROUND((total_fees - total_spend)::numeric / total_spend * 100, 1)
          ELSE 0 END AS roi_pct
      FROM blended_performance
      WHERE period_type = 'monthly'
      ORDER BY period_start DESC
      LIMIT 12
    `);
    res.json(rows.reverse());
  } catch (err) {
    console.error('[Blended] GET /profitability-trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/hashtags — hashtag performance
router.get('/hashtags', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = `SELECT hp.*, tc.title AS best_content_title
               FROM hashtag_performance hp
               LEFT JOIN tiktok_content tc ON hp.best_performing_content_id = tc.id`;
    const params = [];
    if (type) { params.push(type); sql += ` WHERE hp.hashtag_type = $1`; }
    sql += ' ORDER BY hp.avg_views_when_used DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Blended] GET /hashtags error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/blended/sounds — trending sounds
router.get('/sounds', async (req, res) => {
  try {
    const { trending_only } = req.query;
    let sql = 'SELECT * FROM trending_sounds';
    if (trending_only === 'true') sql += ' WHERE is_currently_trending = TRUE';
    sql += ' ORDER BY avg_views_when_used DESC';
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('[Blended] GET /sounds error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
