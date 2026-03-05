import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/accounts — list all platform accounts
router.get('/', async (req, res) => {
  try {
    const { platform, is_active } = req.query;
    let sql = 'SELECT id, platform, account_id, account_name, currency, timezone, is_active, created_at, updated_at FROM platform_accounts';
    const conditions = [];
    const params = [];

    if (platform) {
      params.push(platform);
      conditions.push(`platform = $${params.length}`);
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
    console.error('[Marketing Accounts] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/accounts/:id — single account
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, platform, account_id, account_name, currency, timezone, is_active, created_at, updated_at FROM platform_accounts WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Accounts] GET /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/accounts — create a platform account
router.post('/', async (req, res) => {
  try {
    const { platform, account_id, account_name, access_token, refresh_token, token_expires_at, currency, timezone } = req.body;
    if (!platform || !account_id) {
      return res.status(400).json({ error: 'platform and account_id are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO platform_accounts (platform, account_id, account_name, access_token, refresh_token, token_expires_at, currency, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, platform, account_id, account_name, currency, timezone, is_active, created_at`,
      [platform, account_id, account_name || null, access_token || null, refresh_token || null, token_expires_at || null, currency || 'GBP', timezone || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Marketing Accounts] POST / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/accounts/:id — update account
router.put('/:id', async (req, res) => {
  try {
    const { account_name, access_token, refresh_token, token_expires_at, currency, timezone, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE platform_accounts
       SET account_name = COALESCE($1, account_name),
           access_token = COALESCE($2, access_token),
           refresh_token = COALESCE($3, refresh_token),
           token_expires_at = COALESCE($4, token_expires_at),
           currency = COALESCE($5, currency),
           timezone = COALESCE($6, timezone),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, platform, account_id, account_name, currency, timezone, is_active, updated_at`,
      [account_name, access_token, refresh_token, token_expires_at, currency, timezone, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Marketing Accounts] PUT /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing/accounts/:id — soft-delete (deactivate)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE platform_accounts SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json({ message: 'Account deactivated', id: rows[0].id });
  } catch (err) {
    console.error('[Marketing Accounts] DELETE /:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
