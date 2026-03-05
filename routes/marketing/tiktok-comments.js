import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/tiktok-comments — list comments with filters
router.get('/', async (req, res) => {
  try {
    const { content_id, account_id, status, sentiment, priority, is_lead_signal, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT tc.*,
                      tkc.title AS content_title, tkc.hook AS content_hook,
                      ta.account_name, ta.tiktok_username
               FROM tiktok_comments tc
               LEFT JOIN tiktok_content tkc ON tc.content_id = tkc.id
               LEFT JOIN tiktok_accounts ta ON tc.tiktok_account_id = ta.id`;
    const conditions = [];
    const params = [];

    if (content_id) { params.push(content_id); conditions.push(`tc.content_id = $${params.length}`); }
    if (account_id) { params.push(account_id); conditions.push(`tc.tiktok_account_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`tc.status = $${params.length}`); }
    if (sentiment) { params.push(sentiment); conditions.push(`tc.sentiment = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`tc.priority = $${params.length}`); }
    if (is_lead_signal === 'true') { conditions.push(`tc.is_lead_signal = TRUE`); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY tc.created_at DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Comments] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/tiktok-comments/priority-queue — prioritized reply queue
router.get('/priority-queue', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tc.*,
             tkc.title AS content_title, tkc.hook AS content_hook,
             ta.account_name, ta.tiktok_username
      FROM tiktok_comments tc
      LEFT JOIN tiktok_content tkc ON tc.content_id = tkc.id
      LEFT JOIN tiktok_accounts ta ON tc.tiktok_account_id = ta.id
      WHERE tc.status = 'pending' AND tc.is_reply = FALSE
      ORDER BY
        CASE tc.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END ASC,
        tc.is_lead_signal DESC,
        tc.created_at ASC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Comments] GET /priority-queue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/tiktok-comments/stats — comment analytics
router.get('/stats', async (req, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) AS total_comments,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'replied') AS replied,
        COUNT(*) FILTER (WHERE status = 'flagged') AS flagged,
        COUNT(*) FILTER (WHERE status = 'converted') AS converted,
        COUNT(*) FILTER (WHERE is_lead_signal = TRUE) AS lead_signals,
        COUNT(*) FILTER (WHERE sentiment = 'positive') AS positive,
        COUNT(*) FILTER (WHERE sentiment = 'negative') AS negative,
        COUNT(*) FILTER (WHERE sentiment = 'question') AS questions,
        COUNT(*) FILTER (WHERE sentiment = 'lead_signal') AS lead_sentiment,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'replied')::numeric / COUNT(*) * 100, 1)
          ELSE 0 END AS reply_rate
      FROM tiktok_comments
    `);
    res.json(stats);
  } catch (err) {
    console.error('[TikTok Comments] GET /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/tiktok-comments/:id/reply — reply to a comment
router.post('/:id/reply', async (req, res) => {
  try {
    const { reply_text, replied_by } = req.body;
    if (!reply_text) return res.status(400).json({ error: 'reply_text is required' });

    const { rows } = await pool.query(
      `UPDATE tiktok_comments
       SET reply_text = $1, replied_by = $2, replied_at = NOW(), status = 'replied'
       WHERE id = $3 RETURNING *`,
      [reply_text, replied_by || 'human', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Comments] POST /:id/reply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/tiktok-comments/:id — update comment (status, priority, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { status, priority, sentiment, is_lead_signal } = req.body;
    const { rows } = await pool.query(
      `UPDATE tiktok_comments
       SET status = COALESCE($1, status),
           priority = COALESCE($2, priority),
           sentiment = COALESCE($3, sentiment),
           is_lead_signal = COALESCE($4, is_lead_signal)
       WHERE id = $5 RETURNING *`,
      [status, priority, sentiment, is_lead_signal, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Comments] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Live Streams ====================

// GET /api/marketing/tiktok-comments/lives — list live streams
router.get('/lives', async (req, res) => {
  try {
    const { account_id, status } = req.query;
    let sql = `SELECT tl.*, ta.account_name, ta.tiktok_username
               FROM tiktok_lives tl
               LEFT JOIN tiktok_accounts ta ON tl.tiktok_account_id = ta.id`;
    const conditions = [];
    const params = [];

    if (account_id) { params.push(account_id); conditions.push(`tl.tiktok_account_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`tl.status = $${params.length}`); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY tl.scheduled_at DESC NULLS LAST, tl.created_at DESC';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[TikTok Comments] GET /lives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/tiktok-comments/lives — create live stream
router.post('/lives', async (req, res) => {
  try {
    const { tiktok_account_id, title, description, scheduled_at, topics } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await pool.query(
      `INSERT INTO tiktok_lives (tiktok_account_id, title, description, scheduled_at, topics)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tiktok_account_id || null, title, description || null, scheduled_at || null, topics || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[TikTok Comments] POST /lives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/tiktok-comments/lives/:id — update live stream
router.put('/lives/:id', async (req, res) => {
  try {
    const { title, description, scheduled_at, status, duration_minutes,
            peak_viewers, total_viewers, new_followers, likes, comments,
            shares, gifts_value, ai_prep_notes, ai_summary } = req.body;
    const { rows } = await pool.query(
      `UPDATE tiktok_lives
       SET title = COALESCE($1, title), description = COALESCE($2, description),
           scheduled_at = COALESCE($3, scheduled_at), status = COALESCE($4, status),
           duration_minutes = COALESCE($5, duration_minutes), peak_viewers = COALESCE($6, peak_viewers),
           total_viewers = COALESCE($7, total_viewers), new_followers = COALESCE($8, new_followers),
           likes = COALESCE($9, likes), comments = COALESCE($10, comments),
           shares = COALESCE($11, shares), gifts_value = COALESCE($12, gifts_value),
           ai_prep_notes = COALESCE($13, ai_prep_notes), ai_summary = COALESCE($14, ai_summary),
           updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [title, description, scheduled_at, status, duration_minutes,
       peak_viewers, total_viewers, new_followers, likes, comments,
       shares, gifts_value, ai_prep_notes, ai_summary, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Live stream not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[TikTok Comments] PUT /lives/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
