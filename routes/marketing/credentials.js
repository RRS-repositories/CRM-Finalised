import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/credentials/health
router.get('/health', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *,
        CASE
          WHEN status = 'expired' THEN 'critical'
          WHEN status = 'error' THEN 'critical'
          WHEN status = 'expiring_soon' THEN 'warning'
          WHEN expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '7 days' THEN 'warning'
          ELSE 'healthy'
        END AS health_level
      FROM api_credentials
      ORDER BY
        CASE status
          WHEN 'expired' THEN 1
          WHEN 'error' THEN 2
          WHEN 'expiring_soon' THEN 3
          WHEN 'refreshing' THEN 4
          WHEN 'active' THEN 5
        END,
        expires_at ASC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching credential health:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/credentials/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'expiring_soon') AS expiring_soon,
        COUNT(*) FILTER (WHERE status = 'expired') AS expired,
        COUNT(*) FILTER (WHERE status = 'error') AS errors,
        COUNT(*) FILTER (WHERE status = 'refreshing') AS refreshing,
        COUNT(*) FILTER (WHERE last_test_result = 'success') AS tests_passing,
        COUNT(*) FILTER (WHERE last_test_result = 'failed') AS tests_failing
      FROM api_credentials
    `);
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error fetching credential summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/credentials/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    // Mark as testing, then update result
    // In production this would actually test the credential
    const result = await pool.query(`
      UPDATE api_credentials
      SET last_tested_at = NOW(), last_test_result = 'success', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Credential not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error testing credential:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/credentials/:id/refresh
router.post('/:id/refresh', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE api_credentials
      SET status = 'refreshing', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Credential not found' });

    // In production: trigger actual token refresh via platform API
    // For now, simulate refresh completion
    await pool.query(`
      UPDATE api_credentials
      SET status = 'active',
          last_refreshed_at = NOW(),
          expires_at = NOW() + INTERVAL '60 days',
          error_message = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    const updated = await pool.query('SELECT * FROM api_credentials WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error refreshing credential:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/credentials  (add new credential record)
router.post('/', async (req, res) => {
  try {
    const { service, credential_type, platform, expires_at, metadata } = req.body;
    const result = await pool.query(`
      INSERT INTO api_credentials (service, credential_type, platform, expires_at, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [service, credential_type, platform, expires_at, JSON.stringify(metadata || {})]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating credential:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Webhook Queue Monitoring ────────────────────────────────────

// GET /api/marketing/credentials/webhook-queue/stats
router.get('/webhook-queue/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter,
        AVG(attempts) FILTER (WHERE status = 'completed') AS avg_attempts_to_complete
      FROM webhook_queue
    `);
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error fetching webhook queue stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/credentials/webhook-queue/dead-letters
router.get('/webhook-queue/dead-letters', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, source, status, attempts, last_error, created_at, updated_at
      FROM webhook_queue
      WHERE status = 'dead_letter'
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching dead letters:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/credentials/webhook-queue/:id/retry
router.post('/webhook-queue/:id/retry', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE webhook_queue
      SET status = 'pending', attempts = 0, last_error = NULL, updated_at = NOW()
      WHERE id = $1 AND status IN ('failed', 'dead_letter')
      RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Queue item not found or not retryable' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error retrying webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
