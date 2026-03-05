import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// GET /api/marketing/webhooks/facebook — Facebook verification
router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Facebook verification successful');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/marketing/webhooks/facebook — Facebook Messenger + Instagram DM
router.post('/facebook', async (req, res) => {
  // Return 200 immediately (queue-first pattern)
  res.sendStatus(200);

  try {
    const { object, entry } = req.body;
    if (!entry) return;

    for (const e of entry) {
      const messaging = e.messaging || e.changes?.flatMap(c => c.value?.messages || []) || [];
      for (const event of messaging) {
        const senderId = event.sender?.id;
        const messageText = event.message?.text;
        if (!senderId || !messageText) continue;

        const channel = object === 'instagram' ? 'instagram_dm' : 'fb_messenger';

        // Find or create conversation
        let { rows } = await pool.query(
          'SELECT id FROM marketing_conversations WHERE channel_user_id = $1 AND primary_channel = $2',
          [senderId, channel]
        );

        let conversationId;
        if (rows.length) {
          conversationId = rows[0].id;
        } else {
          const { rows: newRows } = await pool.query(
            `INSERT INTO marketing_conversations (channel_user_id, primary_channel, status, first_message_at, last_message_at)
             VALUES ($1, $2, 'new', NOW(), NOW()) RETURNING id`,
            [senderId, channel]
          );
          conversationId = newRows[0].id;
        }

        // Insert message
        await pool.query(
          `INSERT INTO marketing_messages (conversation_id, direction, sender_type, channel, message_text, platform_message_id)
           VALUES ($1, 'inbound', 'lead', $2, $3, $4)`,
          [conversationId, channel, messageText, event.message?.mid]
        );

        // Update conversation
        await pool.query(
          `UPDATE marketing_conversations
           SET last_message_at = NOW(), total_messages = total_messages + 1, updated_at = NOW()
           WHERE id = $1`,
          [conversationId]
        );
      }
    }
  } catch (err) {
    console.error('[Webhook] Facebook processing error:', err.message);
  }
});

// POST /api/marketing/webhooks/whatsapp — WhatsApp Business API
router.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);

  try {
    const { entry } = req.body;
    if (!entry) return;

    for (const e of entry) {
      const changes = e.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const msg of messages) {
          const phone = msg.from;
          const messageText = msg.text?.body || msg.caption || '';
          if (!phone || !messageText) continue;

          let { rows } = await pool.query(
            "SELECT id FROM marketing_conversations WHERE channel_user_id = $1 AND primary_channel = 'whatsapp'",
            [phone]
          );

          let conversationId;
          if (rows.length) {
            conversationId = rows[0].id;
          } else {
            const { rows: newRows } = await pool.query(
              `INSERT INTO marketing_conversations (channel_user_id, primary_channel, contact_phone, status, first_message_at, last_message_at)
               VALUES ($1, 'whatsapp', $1, 'new', NOW(), NOW()) RETURNING id`,
              [phone]
            );
            conversationId = newRows[0].id;
          }

          await pool.query(
            `INSERT INTO marketing_messages (conversation_id, direction, sender_type, channel, message_type, message_text, platform_message_id)
             VALUES ($1, 'inbound', 'lead', 'whatsapp', $2, $3, $4)`,
            [conversationId, msg.type || 'text', messageText, msg.id]
          );

          await pool.query(
            `UPDATE marketing_conversations
             SET last_message_at = NOW(), total_messages = total_messages + 1, updated_at = NOW()
             WHERE id = $1`,
            [conversationId]
          );
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] WhatsApp processing error:', err.message);
  }
});

// POST /api/marketing/webhooks/tiktok — TikTok DM
router.post('/tiktok', async (req, res) => {
  res.sendStatus(200);

  try {
    const { event, user, content } = req.body;
    if (event !== 'receive_message' || !user?.open_id || !content?.text) return;

    let { rows } = await pool.query(
      "SELECT id FROM marketing_conversations WHERE channel_user_id = $1 AND primary_channel = 'tiktok_dm'",
      [user.open_id]
    );

    let conversationId;
    if (rows.length) {
      conversationId = rows[0].id;
    } else {
      const { rows: newRows } = await pool.query(
        `INSERT INTO marketing_conversations (channel_user_id, primary_channel, status, first_message_at, last_message_at)
         VALUES ($1, 'tiktok_dm', 'new', NOW(), NOW()) RETURNING id`,
        [user.open_id]
      );
      conversationId = newRows[0].id;
    }

    await pool.query(
      `INSERT INTO marketing_messages (conversation_id, direction, sender_type, channel, message_text)
       VALUES ($1, 'inbound', 'lead', 'tiktok_dm', $2)`,
      [conversationId, content.text]
    );

    await pool.query(
      `UPDATE marketing_conversations
       SET last_message_at = NOW(), total_messages = total_messages + 1, updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );
  } catch (err) {
    console.error('[Webhook] TikTok processing error:', err.message);
  }
});

export default router;
