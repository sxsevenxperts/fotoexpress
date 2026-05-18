const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

// Cria as colunas necessárias on-the-fly em dev — evita migração separada.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await db.query(`
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE galleries ADD COLUMN IF NOT EXISTS presale_starts_at TIMESTAMP;
        ALTER TABLE galleries ADD COLUMN IF NOT EXISTS presale_ends_at TIMESTAMP;
        ALTER TABLE galleries ADD COLUMN IF NOT EXISTS presale_discount_rate NUMERIC(4,3) DEFAULT 0;
        ALTER TABLE galleries ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMP;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END;
    END $$;
  `);
  columnsReady = true;
}

// GET: status da pré-venda de uma galeria (público).
router.get('/galleries/:gallery_id/status', async (req, res) => {
  try {
    await ensureColumns();
    const result = await db.query(
      `SELECT id, title, event_date,
              presale_starts_at, presale_ends_at, presale_discount_rate,
              scheduled_publish_at, is_published
       FROM galleries WHERE id = $1`,
      [req.params.gallery_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Galeria não encontrada' });

    const g = result.rows[0];
    const now = new Date();
    const startsAt = g.presale_starts_at ? new Date(g.presale_starts_at) : null;
    const endsAt = g.presale_ends_at ? new Date(g.presale_ends_at) : null;
    const isActive = startsAt && endsAt && now >= startsAt && now <= endsAt;
    const isUpcoming = startsAt && now < startsAt;

    res.json({
      galleryId: parseInt(req.params.gallery_id),
      title: g.title,
      eventDate: g.event_date,
      presale: {
        startsAt: g.presale_starts_at,
        endsAt: g.presale_ends_at,
        discountRate: parseFloat(g.presale_discount_rate) || 0,
        isActive,
        isUpcoming,
        timeLeftSeconds: endsAt ? Math.max(0, Math.floor((endsAt - now) / 1000)) : null
      },
      scheduledPublishAt: g.scheduled_publish_at,
      isPublished: g.is_published
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT: fotógrafo configura pré-venda e/ou agendamento de publicação.
router.put('/galleries/:gallery_id', authenticate, express.json(), async (req, res) => {
  try {
    await ensureColumns();
    const { gallery_id } = req.params;
    const {
      presaleStartsAt, presaleEndsAt, presaleDiscountRate,
      scheduledPublishAt
    } = req.body;

    const auth = await db.query(
      `SELECT p.user_id FROM galleries g
       JOIN photographers p ON g.photographer_id = p.id
       WHERE g.id = $1`,
      [gallery_id]
    );

    if (auth.rows.length === 0) return res.status(404).json({ error: 'Galeria não encontrada' });
    if (auth.rows[0].user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const rate = presaleDiscountRate != null ? Math.max(0, Math.min(0.9, parseFloat(presaleDiscountRate))) : null;

    await db.query(
      `UPDATE galleries SET
         presale_starts_at = COALESCE($2, presale_starts_at),
         presale_ends_at = COALESCE($3, presale_ends_at),
         presale_discount_rate = COALESCE($4, presale_discount_rate),
         scheduled_publish_at = COALESCE($5, scheduled_publish_at),
         updated_at = NOW()
       WHERE id = $1`,
      [gallery_id, presaleStartsAt || null, presaleEndsAt || null, rate, scheduledPublishAt || null]
    );

    res.json({ status: 'updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
