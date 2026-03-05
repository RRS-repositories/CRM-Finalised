import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/audiences — list audiences
router.get('/', async (req, res) => {
  try {
    const { platform, type, is_active } = req.query;
    let sql = 'SELECT * FROM audiences';
    const conditions = [];
    const params = [];

    if (platform) {
      params.push(platform);
      conditions.push(`platform = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Audiences] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/audiences — create audience
router.post('/', async (req, res) => {
  try {
    const { platform, platform_audience_id, name, type, description, size, source_data } = req.body;
    if (!platform || !name) {
      return res.status(400).json({ error: 'platform and name are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO audiences (platform, platform_audience_id, name, type, description, size, source_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [platform, platform_audience_id || null, name, type || 'custom', description || null, size || null,
       source_data ? JSON.stringify(source_data) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Audiences] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/audiences/:id — update audience
router.put('/:id', async (req, res) => {
  try {
    const { name, description, size, is_active, last_synced } = req.body;
    const { rows } = await pool.query(
      `UPDATE audiences
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           size = COALESCE($3, size),
           is_active = COALESCE($4, is_active),
           last_synced = COALESCE($5, last_synced),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, size, is_active, last_synced, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Audience not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Audiences] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/audiences/video-pools — video audience pool sizes
router.get('/video-pools', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT vp.*, a.name AS audience_name
      FROM video_audience_pools vp
      LEFT JOIN audiences a ON vp.audience_id = a.id
      ORDER BY vp.last_updated DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Marketing Audiences] GET /video-pools error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
