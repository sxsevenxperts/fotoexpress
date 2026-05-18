const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { withCache } = require('../middleware/redis');
const { optionalAuth } = require('../middleware/auth');
const { deliverPhoto } = require('../services/mediaDelivery');
const { streamWatermarkedImage } = require('../services/imageWatermark');

const PREVIEW_WATERMARK = {
  text: 'FotoExpress',
  textSize: 48,
  textColor: 'rgba(255, 255, 255, 0.5)',
  position: 'bottom-right'
};

// NOTA: file_url (original em alta resolução) nunca é retornado por endpoints
// públicos. As listagens expõem apenas thumbnail_url; o original só é entregue
// pela rota /:id/download — com marca d'água para quem não comprou.

// GET trending photos
router.get('/trending', withCache(300), async (req, res) => {
  try {
    const photos = await db.query(
      `SELECT p.id, p.thumbnail_url, p.price,
              g.id as gallery_id, g.title, g.event_date,
              ph.id as photographer_id, u.first_name, u.last_name, u.avatar_url,
              ph.rating, ec.name as category_name
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       JOIN photographers ph ON g.photographer_id = ph.id
       JOIN users u ON ph.user_id = u.id
       JOIN event_categories ec ON g.event_category_id = ec.id
       WHERE g.is_published = true
       ORDER BY p.uploaded_at DESC LIMIT 30`
    );

    res.json(photos.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET recent photos
router.get('/recent', withCache(60), async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const photos = await db.query(
      `SELECT p.id, p.thumbnail_url, p.price,
              g.id as gallery_id, g.title, g.event_date,
              ph.id as photographer_id, u.first_name, u.last_name, u.avatar_url,
              ph.rating, ec.name as category_name
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       JOIN photographers ph ON g.photographer_id = ph.id
       JOIN users u ON ph.user_id = u.id
       JOIN event_categories ec ON g.event_category_id = ec.id
       WHERE g.is_published = true
       ORDER BY p.uploaded_at DESC LIMIT $1`,
      [limit]
    );

    res.json(photos.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET search photos across all galleries with filters
router.get('/search/query', withCache(300), async (req, res) => {
  try {
    const { q, category_id, page = 1, limit = 24, rating } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.id, p.thumbnail_url, p.width, p.height, p.price,
             g.id as gallery_id, g.title, g.event_date, g.event_location,
             ph.id as photographer_id, u.first_name, u.last_name, u.avatar_url,
             ph.rating, ec.name as category_name,
             COUNT(*) OVER() as total
      FROM photos p
      JOIN galleries g ON p.gallery_id = g.id
      JOIN photographers ph ON g.photographer_id = ph.id
      JOIN users u ON ph.user_id = u.id
      JOIN event_categories ec ON g.event_category_id = ec.id
      WHERE g.is_published = true
    `;
    const params = [];

    if (q) {
      query += ` AND (g.title ILIKE $${params.length + 1} OR g.event_location ILIKE $${params.length + 1})`;
      params.push(`%${q}%`);
    }

    if (category_id) {
      query += ` AND g.event_category_id = $${params.length + 1}`;
      params.push(category_id);
    }

    if (rating) {
      query += ` AND ph.rating >= $${params.length + 1}`;
      params.push(rating);
    }

    query += ` ORDER BY g.event_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const photos = await db.query(query, params);
    const total = photos.rows.length > 0 ? parseInt(photos.rows[0].total) : 0;

    res.json({
      photos: photos.rows.map(({ total, ...p }) => p),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: busca fotos por número do peito (BIB) em uma galeria.
// Em produção, BIBs viriam de OCR no upload; por enquanto buscamos no campo tags.
router.get('/search/bib', async (req, res) => {
  try {
    const { gallery_id, number } = req.query;

    if (!gallery_id || !number) {
      return res.status(400).json({ error: 'gallery_id e number são obrigatórios' });
    }

    const cleanNumber = String(number).replace(/\D/g, '');
    if (!cleanNumber) {
      return res.status(400).json({ error: 'Número inválido' });
    }

    const result = await db.query(
      `SELECT p.id, p.thumbnail_url, p.price, p.width, p.height, p.tags
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       WHERE g.id = $1 AND g.is_published = true
         AND (
           p.tags @> ARRAY[$2]::text[]
           OR EXISTS (SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE $3)
         )
       ORDER BY p.uploaded_at DESC`,
      [gallery_id, cleanNumber, `%bib:${cleanNumber}%`]
    );

    res.json({
      galleryId: parseInt(gallery_id),
      bibNumber: cleanNumber,
      totalMatches: result.rows.length,
      photos: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photo by ID with gallery and photographer details
router.get('/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const photo = await db.query(
      `SELECT p.id, p.gallery_id, p.thumbnail_url, p.width, p.height, p.price,
              p.tags, p.order_index, p.uploaded_at,
              g.title as gallery_title, g.event_date,
              g.event_location, g.event_category_id,
              ph.id as photographer_id, ph.rating, u.first_name, u.last_name, u.avatar_url,
              ec.name as category_name
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       JOIN photographers ph ON g.photographer_id = ph.id
       JOIN users u ON ph.user_id = u.id
       JOIN event_categories ec ON g.event_category_id = ec.id
       WHERE p.id = $1 AND g.is_published = true`,
      [id]
    );

    if (photo.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    res.json(photo.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET preview com marca d'água — sempre retorna thumbnail com watermark
// para exibição no álbum/galeria (antes da compra).
router.get('/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;

    const photo = await db.query(
      `SELECT p.thumbnail_url FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       WHERE p.id = $1 AND g.is_published = true`,
      [id]
    );

    if (photo.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    await streamWatermarkedImage(photo.rows[0].thumbnail_url, res, PREVIEW_WATERMARK);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photo file — com marca d'água por padrão; original em alta resolução
// apenas para quem já concluiu a compra desta foto.
router.get('/:id/download', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || null;

    const photo = await db.query(
      `SELECT p.file_url FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       WHERE p.id = $1 AND g.is_published = true`,
      [id]
    );

    if (photo.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    await deliverPhoto(photo.rows[0].file_url, id, userId, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
