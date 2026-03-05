import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// ==================== TikTok Accounts ====================

// GET /api/marketing/tiktok/accounts
router.get('/accounts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tiktok_accounts ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /accounts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/tiktok/accounts
router.post('/accounts', async (req, res) => {
  try {
    const { account_name, tiktok_username, tiktok_user_id, access_token, refresh_token, token_expires_at } = req.body;
    if (!account_name) return res.status(400).json({ error: 'account_name is required' });

    const { rows } = await pool.query(
      `INSERT INTO tiktok_accounts (account_name, tiktok_username, tiktok_user_id, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [account_name, tiktok_username || null, tiktok_user_id || null, access_token || null, refresh_token || null, token_expires_at || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] POST /accounts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/tiktok/accounts/:id
router.put('/accounts/:id', async (req, res) => {
  try {
    const { account_name, tiktok_username, follower_count, following_count, video_count, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE tiktok_accounts
       SET account_name = COALESCE($1, account_name),
           tiktok_username = COALESCE($2, tiktok_username),
           follower_count = COALESCE($3, follower_count),
           following_count = COALESCE($4, following_count),
           video_count = COALESCE($5, video_count),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [account_name, tiktok_username, follower_count, following_count, video_count, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] PUT /accounts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Content Pillars ====================

// GET /api/marketing/tiktok/pillars
router.get('/pillars', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        COUNT(tc.id) AS total_content,
        COUNT(tc.id) FILTER (WHERE tc.status = 'published') AS published_count,
        COALESCE(SUM(om.views), 0) AS total_views,
        COALESCE(SUM(om.likes), 0) AS total_likes
      FROM content_pillars p
      LEFT JOIN tiktok_content tc ON tc.pillar_id = p.id
      LEFT JOIN tiktok_organic_metrics om ON om.content_id = tc.id
      GROUP BY p.id
      ORDER BY p.sort_order ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /pillars error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/tiktok/pillars
router.post('/pillars', async (req, res) => {
  try {
    const { name, description, color, target_pct, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows } = await pool.query(
      `INSERT INTO content_pillars (name, description, color, target_pct, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description || null, color || '#3b82f6', target_pct || 20, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] POST /pillars error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/tiktok/pillars/:id
router.put('/pillars/:id', async (req, res) => {
  try {
    const { name, description, color, target_pct, is_active, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE content_pillars
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           color = COALESCE($3, color),
           target_pct = COALESCE($4, target_pct),
           is_active = COALESCE($5, is_active),
           sort_order = COALESCE($6, sort_order)
       WHERE id = $7 RETURNING *`,
      [name, description, color, target_pct, is_active, sort_order, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pillar not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] PUT /pillars/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Content ====================

// GET /api/marketing/tiktok/content — list content with filters
router.get('/content', async (req, res) => {
  try {
    const { account_id, pillar_id, status, format, limit = 100, offset = 0 } = req.query;
    let sql = `SELECT tc.*, p.name AS pillar_name, p.color AS pillar_color,
                      ta.account_name, ta.tiktok_username
               FROM tiktok_content tc
               LEFT JOIN content_pillars p ON tc.pillar_id = p.id
               LEFT JOIN tiktok_accounts ta ON tc.tiktok_account_id = ta.id`;
    const conditions = [];
    const params = [];

    if (account_id) {
      params.push(account_id);
      conditions.push(`tc.tiktok_account_id = $${params.length}`);
    }
    if (pillar_id) {
      params.push(pillar_id);
      conditions.push(`tc.pillar_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`tc.status = $${params.length}`);
    }
    if (format) {
      params.push(format);
      conditions.push(`tc.format = $${params.length}`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY tc.scheduled_date DESC NULLS LAST, tc.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /content error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/tiktok/content/pipeline — content grouped by status for kanban
router.get('/content/pipeline', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tc.*, p.name AS pillar_name, p.color AS pillar_color,
             ta.account_name, ta.tiktok_username
      FROM tiktok_content tc
      LEFT JOIN content_pillars p ON tc.pillar_id = p.id
      LEFT JOIN tiktok_accounts ta ON tc.tiktok_account_id = ta.id
      WHERE tc.status != 'archived'
      ORDER BY tc.scheduled_date ASC NULLS LAST, tc.created_at DESC
    `);

    const pipeline = {
      draft: [],
      scripted: [],
      filmed: [],
      editing: [],
      scheduled: [],
      published: [],
    };

    rows.forEach(row => {
      if (pipeline[row.status]) {
        pipeline[row.status].push(row);
      }
    });

    res.json(pipeline);
  } catch (err) {
    console.error('[TikTok Content] GET /content/pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/tiktok/content
router.post('/content', async (req, res) => {
  try {
    const { tiktok_account_id, pillar_id, title, description, script, hook, call_to_action,
            hashtags, sounds, status, scheduled_date, scheduled_time, format, created_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await pool.query(
      `INSERT INTO tiktok_content (tiktok_account_id, pillar_id, title, description, script, hook,
       call_to_action, hashtags, sounds, status, scheduled_date, scheduled_time, format, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [tiktok_account_id || null, pillar_id || null, title, description || null, script || null,
       hook || null, call_to_action || null, hashtags || null, sounds || null, status || 'draft',
       scheduled_date || null, scheduled_time || null, format || 'short', created_by || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] POST /content error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/tiktok/content/:id
router.put('/content/:id', async (req, res) => {
  try {
    const { pillar_id, title, description, script, hook, call_to_action,
            hashtags, sounds, status, scheduled_date, scheduled_time, format } = req.body;

    const { rows } = await pool.query(
      `UPDATE tiktok_content
       SET pillar_id = COALESCE($1, pillar_id),
           title = COALESCE($2, title),
           description = COALESCE($3, description),
           script = COALESCE($4, script),
           hook = COALESCE($5, hook),
           call_to_action = COALESCE($6, call_to_action),
           hashtags = COALESCE($7, hashtags),
           sounds = COALESCE($8, sounds),
           status = COALESCE($9, status),
           scheduled_date = COALESCE($10, scheduled_date),
           scheduled_time = COALESCE($11, scheduled_time),
           format = COALESCE($12, format),
           updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [pillar_id, title, description, script, hook, call_to_action,
       hashtags, sounds, status, scheduled_date, scheduled_time, format, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Content not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Content] PUT /content/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Organic Metrics ====================

// GET /api/marketing/tiktok/organic-metrics — aggregated organic performance
router.get('/organic-metrics', async (req, res) => {
  try {
    const { account_id, days = 30 } = req.query;
    const params = [parseInt(days)];
    let accountCondition = '';

    if (account_id) {
      params.push(account_id);
      accountCondition = ` AND tc.tiktok_account_id = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        om.date,
        SUM(om.views) AS views,
        SUM(om.likes) AS likes,
        SUM(om.comments) AS comments,
        SUM(om.shares) AS shares,
        SUM(om.saves) AS saves,
        SUM(om.followers_gained) AS followers_gained,
        AVG(om.avg_watch_time) AS avg_watch_time,
        AVG(om.completion_rate) AS completion_rate,
        SUM(om.reach) AS reach
      FROM tiktok_organic_metrics om
      JOIN tiktok_content tc ON om.content_id = tc.id
      WHERE om.date >= CURRENT_DATE - ($1 || ' days')::interval${accountCondition}
      GROUP BY om.date
      ORDER BY om.date ASC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /organic-metrics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/tiktok/organic-metrics/by-content — per-content performance
router.get('/organic-metrics/by-content', async (req, res) => {
  try {
    const { pillar_id, account_id, limit = 50 } = req.query;
    const conditions = [];
    const params = [];

    if (pillar_id) {
      params.push(pillar_id);
      conditions.push(`tc.pillar_id = $${params.length}`);
    }
    if (account_id) {
      params.push(account_id);
      conditions.push(`tc.tiktok_account_id = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT
        tc.id, tc.title, tc.hook, tc.status, tc.format, tc.published_at, tc.duration_seconds,
        p.name AS pillar_name, p.color AS pillar_color,
        ta.account_name,
        COALESCE(SUM(om.views), 0) AS total_views,
        COALESCE(SUM(om.likes), 0) AS total_likes,
        COALESCE(SUM(om.comments), 0) AS total_comments,
        COALESCE(SUM(om.shares), 0) AS total_shares,
        COALESCE(SUM(om.saves), 0) AS total_saves,
        COALESCE(SUM(om.followers_gained), 0) AS total_followers_gained,
        AVG(om.avg_watch_time) AS avg_watch_time,
        AVG(om.completion_rate) AS avg_completion_rate,
        CASE WHEN SUM(om.views) > 0 THEN ROUND(SUM(om.likes)::numeric / SUM(om.views) * 100, 4) ELSE 0 END AS engagement_rate
      FROM tiktok_content tc
      LEFT JOIN content_pillars p ON tc.pillar_id = p.id
      LEFT JOIN tiktok_accounts ta ON tc.tiktok_account_id = ta.id
      LEFT JOIN tiktok_organic_metrics om ON om.content_id = tc.id
      ${where}
      GROUP BY tc.id, tc.title, tc.hook, tc.status, tc.format, tc.published_at, tc.duration_seconds,
               p.name, p.color, ta.account_name
      ORDER BY total_views DESC
      LIMIT $${params.push(parseInt(limit))}
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /organic-metrics/by-content error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/tiktok/organic-metrics/by-pillar — pillar performance summary
router.get('/organic-metrics/by-pillar', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id, p.name, p.color, p.target_pct,
        COUNT(DISTINCT tc.id) AS content_count,
        COUNT(DISTINCT tc.id) FILTER (WHERE tc.status = 'published') AS published_count,
        COALESCE(SUM(om.views), 0) AS total_views,
        COALESCE(SUM(om.likes), 0) AS total_likes,
        COALESCE(SUM(om.comments), 0) AS total_comments,
        COALESCE(SUM(om.shares), 0) AS total_shares,
        COALESCE(SUM(om.saves), 0) AS total_saves,
        COALESCE(SUM(om.followers_gained), 0) AS total_followers_gained,
        AVG(om.avg_watch_time) AS avg_watch_time,
        AVG(om.completion_rate) AS avg_completion_rate,
        CASE WHEN SUM(om.views) > 0 THEN ROUND(SUM(om.likes)::numeric / SUM(om.views) * 100, 4) ELSE 0 END AS engagement_rate
      FROM content_pillars p
      LEFT JOIN tiktok_content tc ON tc.pillar_id = p.id
      LEFT JOIN tiktok_organic_metrics om ON om.content_id = tc.id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.color, p.target_pct
      ORDER BY p.sort_order ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error('[TikTok Content] GET /organic-metrics/by-pillar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
