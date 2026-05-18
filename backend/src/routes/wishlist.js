const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

// Garante a tabela na primeira chamada — evita exigir migração separada
// no ambiente de desenvolvimento.
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      user_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, photo_id)
    )
  `);
  tableReady = true;
}

// GET: lista as fotos favoritadas do usuário.
router.get('/', authenticate, async (req, res) => {
  try {
    await ensureTable();
    const result = await db.query(
      `SELECT w.photo_id, w.added_at,
              p.thumbnail_url, p.price, p.gallery_id,
              g.title AS gallery_title, g.share_token
       FROM wishlist_items w
       JOIN photos p ON w.photo_id = p.id
       JOIN galleries g ON p.gallery_id = g.id
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [req.user.userId]
    );
    res.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: verifica em lote se fotos estão na wishlist (para renderizar corações).
router.get('/check', authenticate, async (req, res) => {
  try {
    await ensureTable();
    const ids = String(req.query.ids || '').split(',').filter(Boolean).map(Number);
    if (!ids.length) return res.json({});
    const result = await db.query(
      `SELECT photo_id FROM wishlist_items WHERE user_id = $1 AND photo_id = ANY($2)`,
      [req.user.userId, ids]
    );
    const map = Object.fromEntries(ids.map((id) => [id, false]));
    result.rows.forEach((r) => { map[r.photo_id] = true; });
    res.json(map);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: adiciona uma foto à wishlist.
router.post('/:photo_id', authenticate, async (req, res) => {
  try {
    await ensureTable();
    await db.query(
      `INSERT INTO wishlist_items (user_id, photo_id) VALUES ($1, $2)
       ON CONFLICT (user_id, photo_id) DO NOTHING`,
      [req.user.userId, req.params.photo_id]
    );
    res.json({ status: 'added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: remove da wishlist.
router.delete('/:photo_id', authenticate, async (req, res) => {
  try {
    await ensureTable();
    await db.query(
      `DELETE FROM wishlist_items WHERE user_id = $1 AND photo_id = $2`,
      [req.user.userId, req.params.photo_id]
    );
    res.json({ status: 'removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
