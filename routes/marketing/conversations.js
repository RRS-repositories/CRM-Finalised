import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/conversations — list conversations with filters
router.get('/', async (req, res) => {
  try {
    const { status, funnel_stage, channel, assigned_to, search, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT mc.*,
                      (SELECT mm.message_text FROM marketing_messages mm
                       WHERE mm.conversation_id = mc.id ORDER BY mm.created_at DESC LIMIT 1) AS last_message_text,
                      (SELECT mm.sender_type FROM marketing_messages mm
                       WHERE mm.conversation_id = mc.id ORDER BY mm.created_at DESC LIMIT 1) AS last_message_sender
               FROM marketing_conversations mc`;
    const conditions = [];
    const params = [];

    if (status) { params.push(status); conditions.push(`mc.status = $${params.length}`); }
    if (funnel_stage) { params.push(funnel_stage); conditions.push(`mc.funnel_stage = $${params.length}`); }
    if (channel) { params.push(channel); conditions.push(`mc.primary_channel = $${params.length}`); }
    if (assigned_to) { params.push(assigned_to); conditions.push(`mc.assigned_to = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(mc.contact_name ILIKE $${params.length} OR mc.contact_email ILIKE $${params.length} OR mc.contact_phone ILIKE $${params.length})`);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY mc.last_message_at DESC NULLS LAST';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Conversations] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/stats — conversation overview stats
router.get('/stats', async (req, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'new') AS new_count,
        COUNT(*) FILTER (WHERE status IN ('bot_active', 'bot_qualifying', 'bot_educating', 'bot_converting')) AS bot_active,
        COUNT(*) FILTER (WHERE status = 'human_needed') AS human_needed,
        COUNT(*) FILTER (WHERE status = 'human_active') AS human_active,
        COUNT(*) FILTER (WHERE status = 'registered') AS registered,
        COUNT(*) FILTER (WHERE status = 'nurture') AS nurture,
        COUNT(*) FILTER (WHERE status = 'cold') AS cold_count,
        COUNT(*) FILTER (WHERE funnel_stage = 'qualifying') AS qualifying,
        COUNT(*) FILTER (WHERE funnel_stage = 'converting') AS converting,
        COALESCE(AVG(response_time_seconds) FILTER (WHERE response_time_seconds > 0), 0)::int AS avg_response_time,
        COALESCE(AVG(total_messages), 0)::int AS avg_messages
      FROM marketing_conversations
    `);
    res.json(stats);
  } catch (err) {
    console.error('[Conversations] GET /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/:id — single conversation with messages
router.get('/:id', async (req, res) => {
  try {
    const { rows: convRows } = await pool.query(
      'SELECT * FROM marketing_conversations WHERE id = $1', [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Conversation not found' });
    res.json(convRows[0]);
  } catch (err) {
    console.error('[Conversations] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/:id/messages — messages for a conversation
router.get('/:id/messages', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { rows } = await pool.query(
      `SELECT * FROM marketing_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.id, parseInt(limit), parseInt(offset)]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Conversations] GET /:id/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/:id/qualification — qualification answers
router.get('/:id/qualification', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM qualification_answers WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Conversations] GET /:id/qualification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/conversations/:id/send-message — send a human message
router.post('/:id/send-message', async (req, res) => {
  try {
    const { message_text, message_type = 'text' } = req.body;
    if (!message_text) return res.status(400).json({ error: 'message_text is required' });

    // Insert the message
    const { rows } = await pool.query(
      `INSERT INTO marketing_messages (conversation_id, direction, sender_type, message_type, message_text, channel)
       SELECT $1, 'outbound', 'human_agent', $2, $3, mc.primary_channel
       FROM marketing_conversations mc WHERE mc.id = $1
       RETURNING *`,
      [req.params.id, message_type, message_text]
    );

    // Update conversation counters
    await pool.query(
      `UPDATE marketing_conversations
       SET last_message_at = NOW(), last_human_message_at = NOW(),
           human_messages = human_messages + 1, total_messages = total_messages + 1,
           status = CASE WHEN status = 'human_needed' THEN 'human_active' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Conversations] POST /:id/send-message error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/conversations/:id/take-over — human takes over from bot
router.post('/:id/take-over', async (req, res) => {
  try {
    const { assigned_to, reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE marketing_conversations
       SET status = 'human_active', assigned_to = $1, handoff_reason = $2, handoff_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [assigned_to || 'agent', reason || 'Manual takeover', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Conversations] POST /:id/take-over error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/conversations/:id — update conversation
router.put('/:id', async (req, res) => {
  try {
    const { status, funnel_stage, assigned_to, qualification_score } = req.body;
    const { rows } = await pool.query(
      `UPDATE marketing_conversations
       SET status = COALESCE($1, status),
           funnel_stage = COALESCE($2, funnel_stage),
           assigned_to = COALESCE($3, assigned_to),
           qualification_score = COALESCE($4, qualification_score),
           registered_at = CASE WHEN $1 = 'registered' AND registered_at IS NULL THEN NOW() ELSE registered_at END,
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status, funnel_stage, assigned_to, qualification_score, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Conversations] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/channels/list — comm channels
router.get('/channels/list', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comm_channels ORDER BY channel_type');
    res.json(rows);
  } catch (err) {
    console.error('[Conversations] GET /channels/list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/conversations/metrics/daily — conversation metrics
router.get('/metrics/daily', async (req, res) => {
  try {
    const { days = 30, channel } = req.query;
    let sql = `SELECT * FROM conversation_metrics WHERE date >= CURRENT_DATE - $1::int`;
    const params = [parseInt(days)];
    if (channel) { params.push(channel); sql += ` AND channel = $${params.length}`; }
    sql += ' ORDER BY date DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Conversations] GET /metrics/daily error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
