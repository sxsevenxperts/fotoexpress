const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

let tableReady = false;
async function ensureTables() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      photographer_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  tableReady = true;
}

// POST: criar ou obter conversation
router.post('/conversations', authenticate, express.json(), async (req, res) => {
  try {
    await ensureTables();
    const { photographerId } = req.body;

    if (!photographerId) {
      return res.status(400).json({ error: 'photographerId é obrigatório' });
    }

    // Verifica se conversation já existe
    const existing = await db.query(
      `SELECT id FROM conversations
       WHERE (user_id = $1 AND photographer_id = $2)
       OR (user_id = $2 AND photographer_id = $1)`,
      [req.user.userId, photographerId]
    );

    if (existing.rows.length > 0) {
      return res.json({ conversation: { id: existing.rows[0].id } });
    }

    // Cria nova conversation
    const result = await db.query(
      `INSERT INTO conversations (user_id, photographer_id)
       VALUES ($1, $2)
       RETURNING id, user_id, photographer_id, created_at`,
      [req.user.userId, photographerId]
    );

    res.status(201).json({ conversation: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: listar conversations do usuário
router.get('/conversations', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const result = await db.query(
      `SELECT c.id, c.user_id, c.photographer_id, c.updated_at,
              COALESCE(u.name, 'Usuário') as other_name,
              COALESCE(p.name, 'Fotógrafo') as photographer_name,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              COUNT(CASE WHEN m.read = FALSE AND m.sender_id != $1 THEN 1 END) as unread_count
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN photographers p ON c.photographer_id = p.id
       WHERE c.user_id = $1 OR c.photographer_id = $1
       GROUP BY c.id, u.name, p.name
       ORDER BY c.updated_at DESC`,
      [req.user.userId]
    );
    res.json({ conversations: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: mensagens de uma conversation
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const { conversationId } = req.params;

    // Verifica acesso à conversation
    const conv = await db.query(
      `SELECT id FROM conversations WHERE id = $1 AND (user_id = $2 OR photographer_id = $2)`,
      [conversationId, req.user.userId]
    );
    if (conv.rows.length === 0) return res.status(403).json({ error: 'Acesso negado' });

    const result = await db.query(
      `SELECT m.id, m.sender_id, m.content, m.read, m.created_at
       FROM messages m
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    // Marca como lidas
    await db.query(
      `UPDATE messages SET read = TRUE
       WHERE conversation_id = $1 AND sender_id != $2 AND read = FALSE`,
      [conversationId, req.user.userId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: enviar mensagem
router.post('/conversations/:conversationId/messages', authenticate, express.json(), async (req, res) => {
  try {
    await ensureTables();
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    // Verifica acesso à conversation
    const conv = await db.query(
      `SELECT id FROM conversations WHERE id = $1 AND (user_id = $2 OR photographer_id = $2)`,
      [conversationId, req.user.userId]
    );
    if (conv.rows.length === 0) return res.status(403).json({ error: 'Acesso negado' });

    // Insere mensagem
    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, content, read, created_at`,
      [conversationId, req.user.userId, content.trim()]
    );

    // Atualiza updated_at da conversation
    await db.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
