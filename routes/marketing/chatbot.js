import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/chatbot/config — bot configuration
router.get('/config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM comm_channels WHERE bot_enabled = TRUE ORDER BY channel_type"
    );
    // Return config summary
    const config = {
      channels: rows,
      total_enabled: rows.length,
      operating_hours: rows[0]?.bot_operating_hours || null,
      greeting: rows[0]?.bot_greeting || 'Hi! Thanks for reaching out to Rowan Rose Solicitors. How can I help you today?',
    };
    res.json(config);
  } catch (err) {
    console.error('[Chatbot] GET /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/chatbot/config — update bot config for a channel
router.put('/config', async (req, res) => {
  try {
    const { channel_id, bot_enabled, bot_greeting, bot_operating_hours, human_fallback_enabled } = req.body;
    if (!channel_id) return res.status(400).json({ error: 'channel_id is required' });

    const { rows } = await pool.query(
      `UPDATE comm_channels
       SET bot_enabled = COALESCE($1, bot_enabled),
           bot_greeting = COALESCE($2, bot_greeting),
           bot_operating_hours = COALESCE($3, bot_operating_hours),
           human_fallback_enabled = COALESCE($4, human_fallback_enabled),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [bot_enabled, bot_greeting, bot_operating_hours, human_fallback_enabled, channel_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Channel not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Chatbot] PUT /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/chatbot/objections — list objection library
router.get('/objections', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM objection_library ORDER BY times_used DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[Chatbot] GET /objections error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/chatbot/objections — create new objection
router.post('/objections', async (req, res) => {
  try {
    const { objection_type, trigger_phrases, response_text, response_tone, follow_up_question } = req.body;
    if (!objection_type || !response_text) return res.status(400).json({ error: 'objection_type and response_text required' });

    const { rows } = await pool.query(
      `INSERT INTO objection_library (objection_type, trigger_phrases, response_text, response_tone, follow_up_question)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [objection_type, trigger_phrases || [], response_text, response_tone || 'reassuring', follow_up_question || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Chatbot] POST /objections error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/chatbot/objections/:id — update objection
router.put('/objections/:id', async (req, res) => {
  try {
    const { trigger_phrases, response_text, response_tone, follow_up_question, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE objection_library
       SET trigger_phrases = COALESCE($1, trigger_phrases),
           response_text = COALESCE($2, response_text),
           response_tone = COALESCE($3, response_tone),
           follow_up_question = COALESCE($4, follow_up_question),
           is_active = COALESCE($5, is_active)
       WHERE id = $6 RETURNING *`,
      [trigger_phrases, response_text, response_tone, follow_up_question, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Objection not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Chatbot] PUT /objections/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/chatbot/performance — bot performance metrics
router.get('/performance', async (req, res) => {
  try {
    const { rows: [botStats] } = await pool.query(`
      SELECT
        COUNT(*) AS total_conversations,
        COUNT(*) FILTER (WHERE status = 'registered') AS fully_resolved,
        COUNT(*) FILTER (WHERE status IN ('human_needed', 'human_active')) AS handed_off,
        COUNT(*) FILTER (WHERE funnel_stage = 'qualifying') AS in_qualifying,
        COUNT(*) FILTER (WHERE funnel_stage = 'converting') AS in_converting,
        COUNT(*) FILTER (WHERE funnel_stage = 'dropped_off') AS dropped_off,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'registered')::numeric / COUNT(*) * 100, 1)
          ELSE 0 END AS resolution_rate,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE status IN ('human_needed', 'human_active'))::numeric / COUNT(*) * 100, 1)
          ELSE 0 END AS handoff_rate,
        COALESCE(AVG(bot_messages) FILTER (WHERE bot_messages > 0), 0)::numeric(5,1) AS avg_bot_messages,
        COALESCE(AVG(qualification_score) FILTER (WHERE qualification_score > 0), 0)::int AS avg_qualification_score
      FROM marketing_conversations
      WHERE bot_messages > 0
    `);

    // Funnel breakdown
    const { rows: funnel } = await pool.query(`
      SELECT funnel_stage, COUNT(*) AS count
      FROM marketing_conversations
      WHERE bot_messages > 0
      GROUP BY funnel_stage
      ORDER BY CASE funnel_stage
        WHEN 'engaged' THEN 1 WHEN 'qualifying' THEN 2 WHEN 'qualified' THEN 3
        WHEN 'educating' THEN 4 WHEN 'objection_handling' THEN 5 WHEN 'converting' THEN 6
        WHEN 'registered' THEN 7 WHEN 'dropped_off' THEN 8 WHEN 'unqualified' THEN 9
        WHEN 'cold' THEN 10 END
    `);

    // Channel breakdown
    const { rows: channels } = await pool.query(`
      SELECT primary_channel, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'registered') AS registered,
             COUNT(*) FILTER (WHERE status IN ('human_needed', 'human_active')) AS handoffs
      FROM marketing_conversations
      WHERE bot_messages > 0
      GROUP BY primary_channel
      ORDER BY total DESC
    `);

    // Objection stats
    const { rows: objections } = await pool.query(`
      SELECT objection_type, times_used, resolution_rate
      FROM objection_library
      WHERE times_used > 0
      ORDER BY times_used DESC
    `);

    // Daily metrics
    const { rows: dailyMetrics } = await pool.query(`
      SELECT date, new_conversations, bot_handled_fully, bot_to_human_handoffs,
             bot_qualification_completed, leads_registered, avg_first_response_seconds
      FROM conversation_metrics
      WHERE channel = 'all' AND date >= CURRENT_DATE - 30
      ORDER BY date ASC
    `);

    res.json({
      stats: botStats,
      funnel,
      channels,
      objections,
      dailyMetrics,
    });
  } catch (err) {
    console.error('[Chatbot] GET /performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/chatbot/intelligence — conversation intelligence
router.get('/intelligence', async (req, res) => {
  try {
    // Common qualification answers (lender mentions)
    const { rows: lenderMentions } = await pool.query(`
      SELECT answer_value, COUNT(*) AS count
      FROM qualification_answers
      WHERE question_key = 'lender_name' AND answer_value IS NOT NULL
      GROUP BY answer_value
      ORDER BY count DESC
      LIMIT 20
    `);

    // Common questions (from bot intent detection)
    const { rows: commonIntents } = await pool.query(`
      SELECT bot_intent_detected, COUNT(*) AS count
      FROM marketing_messages
      WHERE bot_intent_detected IS NOT NULL AND direction = 'inbound'
      GROUP BY bot_intent_detected
      ORDER BY count DESC
      LIMIT 15
    `);

    // Credit types mentioned
    const { rows: creditTypes } = await pool.query(`
      SELECT answer_value, COUNT(*) AS count
      FROM qualification_answers
      WHERE question_key = 'credit_type' AND answer_value IS NOT NULL
      GROUP BY answer_value
      ORDER BY count DESC
    `);

    // Qualification completion rates by question
    const { rows: qualRates } = await pool.query(`
      SELECT question_key, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE confidence = 'confirmed') AS confirmed,
             COUNT(*) FILTER (WHERE confidence = 'inferred') AS inferred,
             COUNT(*) FILTER (WHERE confidence = 'unclear') AS unclear
      FROM qualification_answers
      GROUP BY question_key
      ORDER BY total DESC
    `);

    // Source platform distribution
    const { rows: sourceDist } = await pool.query(`
      SELECT source_platform, COUNT(*) AS count,
             COUNT(*) FILTER (WHERE status = 'registered') AS registered
      FROM marketing_conversations
      WHERE source_platform IS NOT NULL
      GROUP BY source_platform
      ORDER BY count DESC
    `);

    res.json({
      lenderMentions,
      commonIntents,
      creditTypes,
      qualRates,
      sourceDist,
    });
  } catch (err) {
    console.error('[Chatbot] GET /intelligence error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
