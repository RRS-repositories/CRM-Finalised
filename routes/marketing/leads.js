import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/leads — list ad leads with filters
router.get('/', async (req, res) => {
  try {
    const { platform, status, campaign_id, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT al.*, c.name AS campaign_name
               FROM ad_leads al
               LEFT JOIN campaigns c ON al.campaign_id = c.id`;
    const conditions = [];
    const params = [];

    if (platform) {
      params.push(platform);
      conditions.push(`al.platform = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`al.status = $${params.length}`);
    }
    if (campaign_id) {
      params.push(campaign_id);
      conditions.push(`al.campaign_id = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY al.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) FROM ad_leads al';
    const countParams = [];
    const countConditions = [];
    if (platform) {
      countParams.push(platform);
      countConditions.push(`al.platform = $${countParams.length}`);
    }
    if (status) {
      countParams.push(status);
      countConditions.push(`al.status = $${countParams.length}`);
    }
    if (campaign_id) {
      countParams.push(campaign_id);
      countConditions.push(`al.campaign_id = $${countParams.length}`);
    }
    if (countConditions.length) countSql += ' WHERE ' + countConditions.join(' AND ');

    const { rows: [{ count }] } = await pool.query(countSql, countParams);

    res.json({ leads: rows, total: parseInt(count), limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('[Marketing Leads] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/leads/stats — lead funnel stats
router.get('/stats', async (req, res) => {
  try {
    const { platform, from, to } = req.query;
    const params = [];
    const conditions = [];

    if (platform && platform !== 'all') {
      params.push(platform);
      conditions.push(`platform = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}::date + interval '1 day'`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT
        status,
        COUNT(*) AS count,
        COALESCE(AVG(cost), 0) AS avg_cost
      FROM ad_leads
      ${whereClause}
      GROUP BY status
      ORDER BY CASE status
        WHEN 'new' THEN 1
        WHEN 'contacted' THEN 2
        WHEN 'qualified' THEN 3
        WHEN 'converted' THEN 4
        WHEN 'rejected' THEN 5
      END
    `, params);

    const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    res.json({ statuses: rows, total });
  } catch (err) {
    console.error('[Marketing Leads] GET /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/leads/:id — single lead
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT al.*, c.name AS campaign_name, a.name AS ad_name
       FROM ad_leads al
       LEFT JOIN campaigns c ON al.campaign_id = c.id
       LEFT JOIN ads a ON al.ad_id = a.id
       WHERE al.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Leads] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/leads — create a lead (from webhook or manual)
router.post('/', async (req, res) => {
  try {
    const { platform, platform_lead_id, campaign_id, ad_id, name, email, phone, form_data, crm_client_id, status, cost } = req.body;
    if (!platform) {
      return res.status(400).json({ error: 'platform is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO ad_leads (platform, platform_lead_id, campaign_id, ad_id, name, email, phone, form_data, crm_client_id, status, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [platform, platform_lead_id || null, campaign_id || null, ad_id || null, name || null, email || null, phone || null,
       form_data ? JSON.stringify(form_data) : null, crm_client_id || null, status || 'new', cost || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Leads] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/marketing/leads/:id — update lead status or link to CRM
router.patch('/:id', async (req, res) => {
  try {
    const { status, crm_client_id } = req.body;
    const updates = [];
    const params = [];

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }
    if (crm_client_id) {
      params.push(crm_client_id);
      updates.push(`crm_client_id = $${params.length}`);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE ad_leads SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Leads] PATCH /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/leads/bulk — bulk create leads (from ad platform sync)
router.post('/bulk', async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || !leads.length) {
      return res.status(400).json({ error: 'leads array is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const lead of leads) {
        const { rows } = await client.query(
          `INSERT INTO ad_leads (platform, platform_lead_id, campaign_id, ad_id, name, email, phone, form_data, cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [lead.platform, lead.platform_lead_id || null, lead.campaign_id || null, lead.ad_id || null,
           lead.name || null, lead.email || null, lead.phone || null,
           lead.form_data ? JSON.stringify(lead.form_data) : null, lead.cost || null]
        );
        if (rows.length) results.push(rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ created: results.length, leads: results });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Marketing Leads] POST /bulk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
