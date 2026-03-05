import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// ─── Follow-Up Sequences CRUD ───────────────────────────────────

// GET /api/marketing/followup-sequences
router.get('/sequences', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fs.*,
        (SELECT COUNT(*) FROM followup_queue fq WHERE fq.sequence_id = fs.id AND fq.status = 'active') AS active_count,
        (SELECT COUNT(*) FROM followup_queue fq WHERE fq.sequence_id = fs.id AND fq.status = 'completed') AS completed_count,
        (SELECT COUNT(*) FROM followup_queue fq WHERE fq.sequence_id = fs.id AND fq.status = 'converted') AS converted_count
      FROM followup_sequences fs
      ORDER BY fs.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sequences:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/followup-sequences
router.post('/sequences', async (req, res) => {
  try {
    const { name, trigger_condition, steps, max_steps, is_active } = req.body;
    const result = await pool.query(`
      INSERT INTO followup_sequences (name, trigger_condition, steps, max_steps, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, trigger_condition, JSON.stringify(steps || []), max_steps || 5, is_active !== false]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating sequence:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/followup-sequences/:id
router.put('/sequences/:id', async (req, res) => {
  try {
    const { name, trigger_condition, steps, max_steps, is_active } = req.body;
    const result = await pool.query(`
      UPDATE followup_sequences
      SET name = COALESCE($2, name),
          trigger_condition = COALESCE($3, trigger_condition),
          steps = COALESCE($4, steps),
          max_steps = COALESCE($5, max_steps),
          is_active = COALESCE($6, is_active)
      WHERE id = $1
      RETURNING *
    `, [req.params.id, name, trigger_condition, steps ? JSON.stringify(steps) : null, max_steps, is_active]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sequence not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating sequence:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing/followup-sequences/:id
router.delete('/sequences/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM followup_sequences WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sequence:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Follow-Up Queue ─────────────────────────────────────────────

// GET /api/marketing/followup-queue
router.get('/queue', async (req, res) => {
  try {
    const { status, sequence_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      where += ` AND fq.status = $${params.length}`;
    }
    if (sequence_id) {
      params.push(sequence_id);
      where += ` AND fq.sequence_id = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT fq.*,
        fs.name AS sequence_name,
        fs.trigger_condition,
        fs.max_steps,
        mc.contact_name,
        mc.contact_email,
        mc.primary_channel,
        mc.funnel_stage,
        mc.status AS conversation_status
      FROM followup_queue fq
      JOIN followup_sequences fs ON fs.id = fq.sequence_id
      JOIN marketing_conversations mc ON mc.id = fq.conversation_id
      ${where}
      ORDER BY fq.next_send_at ASC NULLS LAST
      LIMIT 200
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching queue:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/followup-queue/:id/pause
router.post('/queue/:id/pause', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE followup_queue SET status = 'paused', updated_at = NOW()
      WHERE id = $1 AND status = 'active'
      RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Queue item not found or not active' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error pausing queue item:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/followup-queue/:id/resume
router.post('/queue/:id/resume', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE followup_queue SET status = 'active', updated_at = NOW()
      WHERE id = $1 AND status = 'paused'
      RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Queue item not found or not paused' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error resuming queue item:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Follow-Up Performance Analytics ─────────────────────────────

// GET /api/marketing/followup-performance
router.get('/performance', async (req, res) => {
  try {
    // Sequence summary
    const sequences = await pool.query(`
      SELECT
        fs.id, fs.name, fs.trigger_condition, fs.is_active,
        fs.total_enrolled, fs.total_converted, fs.conversion_rate,
        COUNT(fq.id) FILTER (WHERE fq.status = 'active') AS active_now,
        COUNT(fq.id) FILTER (WHERE fq.status = 'completed') AS completed_count,
        COUNT(fq.id) FILTER (WHERE fq.status = 'converted') AS converted_count,
        COUNT(fq.id) FILTER (WHERE fq.status = 'paused') AS paused_count,
        COUNT(fq.id) FILTER (WHERE fq.status = 'unsubscribed') AS unsubscribed_count,
        AVG(fq.messages_sent) FILTER (WHERE fq.status IN ('completed', 'converted')) AS avg_messages_to_complete,
        COUNT(fq.id) FILTER (WHERE fq.lead_responded = true) AS responded_count,
        COUNT(fq.id) AS total_queue_items
      FROM followup_sequences fs
      LEFT JOIN followup_queue fq ON fq.sequence_id = fs.id
      GROUP BY fs.id
      ORDER BY fs.total_enrolled DESC
    `);

    // Step-level analytics (aggregate across all sequences)
    const stepAnalytics = await pool.query(`
      SELECT
        fq.current_step,
        COUNT(*) AS total_at_step,
        COUNT(*) FILTER (WHERE fq.lead_responded = true) AS responded,
        COUNT(*) FILTER (WHERE fq.status = 'converted') AS converted,
        COUNT(*) FILTER (WHERE fq.status = 'unsubscribed') AS unsubscribed
      FROM followup_queue fq
      GROUP BY fq.current_step
      ORDER BY fq.current_step
    `);

    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) AS total_enrolled,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'converted') AS converted,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribed,
        COUNT(*) FILTER (WHERE lead_responded = true) AS total_responded,
        ROUND(AVG(messages_sent)::numeric, 1) AS avg_messages_sent,
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'converted'))::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) AS overall_conversion_rate,
        ROUND(
          (COUNT(*) FILTER (WHERE lead_responded = true))::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) AS overall_response_rate
      FROM followup_queue
    `);

    // Cold lead recovery stats
    const coldRecovery = await pool.query(`
      SELECT
        COUNT(*) AS total_cold_enrolled,
        COUNT(*) FILTER (WHERE fq.status = 'converted') AS cold_converted,
        COUNT(*) FILTER (WHERE fq.lead_responded = true) AS cold_responded
      FROM followup_queue fq
      JOIN followup_sequences fs ON fs.id = fq.sequence_id
      JOIN marketing_conversations mc ON mc.id = fq.conversation_id
      WHERE mc.funnel_stage IN ('dropped_off', 'cold')
        OR fs.trigger_condition IN ('dropped_off_qualifying', 'dropped_off_converting')
    `);

    res.json({
      sequences: sequences.rows,
      stepAnalytics: stepAnalytics.rows,
      stats: overallStats.rows[0] || {},
      coldRecovery: coldRecovery.rows[0] || {},
    });
  } catch (err) {
    console.error('Error fetching followup performance:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Lead Scoring ────────────────────────────────────────────────

// GET /api/marketing/lead-scores
router.get('/lead-scores', async (req, res) => {
  try {
    const { tier, min_score } = req.query;
    let where = 'WHERE al.lead_score > 0';
    const params = [];

    if (tier) {
      params.push(tier);
      where += ` AND al.score_tier = $${params.length}`;
    }
    if (min_score) {
      params.push(Number(min_score));
      where += ` AND al.lead_score >= $${params.length}`;
    }

    const result = await pool.query(`
      SELECT al.id, al.name, al.email, al.phone, al.platform, al.status,
        al.lead_score, al.score_breakdown, al.score_tier, al.scored_at,
        c.campaign_name
      FROM ad_leads al
      LEFT JOIN campaigns c ON c.id = al.campaign_id
      ${where}
      ORDER BY al.lead_score DESC
      LIMIT 200
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lead scores:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/lead-scores/distribution
router.get('/lead-scores/distribution', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        score_tier,
        COUNT(*) AS count,
        ROUND(AVG(lead_score)::numeric, 1) AS avg_score,
        MIN(lead_score) AS min_score,
        MAX(lead_score) AS max_score
      FROM ad_leads
      WHERE lead_score > 0
      GROUP BY score_tier
      ORDER BY
        CASE score_tier
          WHEN 'hot' THEN 1
          WHEN 'warm' THEN 2
          WHEN 'cool' THEN 3
          WHEN 'cold' THEN 4
        END
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching score distribution:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
