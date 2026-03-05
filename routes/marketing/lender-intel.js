import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/lender-intelligence
router.get('/', async (req, res) => {
  try {
    const { sort_by, min_claims } = req.query;

    let orderBy = 'li.total_claims DESC';
    if (sort_by === 'upheld_rate') orderBy = 'li.upheld_rate DESC';
    if (sort_by === 'fos_win_rate') orderBy = 'li.fos_win_rate DESC';
    if (sort_by === 'avg_compensation') orderBy = 'li.avg_compensation DESC';
    if (sort_by === 'total_revenue') orderBy = 'li.total_revenue DESC';
    if (sort_by === 'cost_per_lead') orderBy = 'li.cost_per_lead ASC';
    if (sort_by === 'lead_to_sign_rate') orderBy = 'li.lead_to_sign_rate DESC';

    let where = 'WHERE 1=1';
    const params = [];
    if (min_claims) {
      params.push(Number(min_claims));
      where += ` AND li.total_claims >= $${params.length}`;
    }

    const result = await pool.query(`
      SELECT li.*
      FROM lender_intelligence li
      ${where}
      ORDER BY ${orderBy}
      LIMIT 200
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lender intelligence:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/lender-intelligence/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_lenders,
        COUNT(*) FILTER (WHERE total_claims > 0) AS lenders_with_claims,
        SUM(total_claims) AS total_claims,
        SUM(claims_upheld) AS total_upheld,
        SUM(fos_referrals) AS total_fos_referrals,
        SUM(fos_wins) AS total_fos_wins,
        ROUND(AVG(upheld_rate) FILTER (WHERE total_claims >= 5)::numeric, 1) AS avg_upheld_rate,
        ROUND(AVG(fos_win_rate) FILTER (WHERE fos_referrals >= 3)::numeric, 1) AS avg_fos_win_rate,
        ROUND(AVG(avg_compensation) FILTER (WHERE avg_compensation > 0)::numeric, 2) AS avg_compensation,
        SUM(total_revenue) AS total_revenue
      FROM lender_intelligence
    `);
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error fetching lender summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/lender-intelligence/top-performers
router.get('/top-performers', async (req, res) => {
  try {
    const [byUpheld, byRevenue, byCompensation] = await Promise.all([
      pool.query(`
        SELECT lender_name, upheld_rate, total_claims
        FROM lender_intelligence
        WHERE total_claims >= 5
        ORDER BY upheld_rate DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT lender_name, total_revenue, total_claims
        FROM lender_intelligence
        WHERE total_revenue > 0
        ORDER BY total_revenue DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT lender_name, avg_compensation, total_claims
        FROM lender_intelligence
        WHERE avg_compensation > 0 AND total_claims >= 3
        ORDER BY avg_compensation DESC
        LIMIT 10
      `),
    ]);

    res.json({
      byUpheldRate: byUpheld.rows,
      byRevenue: byRevenue.rows,
      byCompensation: byCompensation.rows,
    });
  } catch (err) {
    console.error('Error fetching top performers:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/lender-intelligence/:name
router.get('/:name', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lender_intelligence WHERE lender_name = $1',
      [req.params.name]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lender not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching lender detail:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
