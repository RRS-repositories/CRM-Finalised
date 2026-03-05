import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/financials/roi-by-source
router.get('/roi-by-source', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(cf.source_platform, 'unknown') AS source,
        COUNT(*) AS total_cases,
        COUNT(*) FILTER (WHERE cf.case_status IN ('upheld', 'settled', 'fos_won')) AS cases_won,
        COALESCE(SUM(cf.compensation_awarded), 0) AS total_compensation,
        COALESCE(SUM(cf.fee_amount), 0) AS total_fees,
        COALESCE(SUM(cf.ad_spend_attributed), 0) AS total_spend,
        COALESCE(SUM(cf.profit), 0) AS total_profit,
        CASE
          WHEN SUM(cf.ad_spend_attributed) > 0
          THEN ROUND((SUM(cf.profit) / SUM(cf.ad_spend_attributed) * 100)::numeric, 1)
          ELSE 0
        END AS roi_percentage,
        ROUND(AVG(cf.fee_amount) FILTER (WHERE cf.fee_amount > 0)::numeric, 2) AS avg_fee,
        ROUND(AVG(cf.compensation_awarded) FILTER (WHERE cf.compensation_awarded > 0)::numeric, 2) AS avg_compensation
      FROM case_financials cf
      GROUP BY COALESCE(cf.source_platform, 'unknown')
      ORDER BY total_profit DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ROI by source:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/financials/pipeline
router.get('/pipeline', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        case_status,
        COUNT(*) AS count,
        COALESCE(SUM(claim_amount), 0) AS total_claim_value,
        COALESCE(SUM(compensation_awarded), 0) AS total_compensation,
        COALESCE(SUM(fee_amount), 0) AS total_fees
      FROM case_financials
      GROUP BY case_status
      ORDER BY
        CASE case_status
          WHEN 'active' THEN 1
          WHEN 'submitted' THEN 2
          WHEN 'upheld' THEN 3
          WHEN 'fos_referred' THEN 4
          WHEN 'fos_won' THEN 5
          WHEN 'settled' THEN 6
          WHEN 'rejected' THEN 7
          WHEN 'fos_lost' THEN 8
          WHEN 'closed' THEN 9
        END
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching financial pipeline:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/financials/profitability-trend
router.get('/profitability-trend', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', outcome_date), 'YYYY-MM') AS month,
        COUNT(*) AS cases_resolved,
        COALESCE(SUM(compensation_awarded), 0) AS compensation,
        COALESCE(SUM(fee_amount), 0) AS fees,
        COALESCE(SUM(ad_spend_attributed), 0) AS spend,
        COALESCE(SUM(profit), 0) AS profit
      FROM case_financials
      WHERE outcome_date IS NOT NULL
      GROUP BY DATE_TRUNC('month', outcome_date)
      ORDER BY month DESC
      LIMIT 12
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching profitability trend:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/financials/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_cases,
        COUNT(*) FILTER (WHERE case_status IN ('upheld', 'settled', 'fos_won')) AS cases_won,
        COALESCE(SUM(compensation_awarded), 0) AS total_compensation,
        COALESCE(SUM(fee_amount), 0) AS total_fees,
        COALESCE(SUM(ad_spend_attributed), 0) AS total_ad_spend,
        COALESCE(SUM(profit), 0) AS total_profit,
        CASE
          WHEN SUM(ad_spend_attributed) > 0
          THEN ROUND((SUM(profit) / SUM(ad_spend_attributed) * 100)::numeric, 1)
          ELSE 0
        END AS overall_roi,
        ROUND(AVG(fee_amount) FILTER (WHERE fee_amount > 0)::numeric, 2) AS avg_fee
      FROM case_financials
    `);
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error fetching financial summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/financials/duplicates
router.get('/duplicates', async (req, res) => {
  try {
    const { resolution } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (resolution) {
      params.push(resolution);
      where += ` AND lm.resolution = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT lm.*,
        al1.name AS lead_name, al1.email AS lead_email, al1.phone AS lead_phone,
        al2.name AS matched_name, al2.email AS matched_email, al2.phone AS matched_phone
      FROM lead_matches lm
      JOIN ad_leads al1 ON al1.id = lm.lead_id
      LEFT JOIN ad_leads al2 ON al2.id = lm.matched_lead_id
      ${where}
      ORDER BY lm.confidence DESC, lm.created_at DESC
      LIMIT 100
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching duplicates:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/financials/duplicates/:id/resolve
router.post('/duplicates/:id/resolve', async (req, res) => {
  try {
    const { resolution, resolved_by } = req.body;
    const result = await pool.query(`
      UPDATE lead_matches
      SET resolution = $2, resolved_by = $3, resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id, resolution, resolved_by]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Match not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error resolving duplicate:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
