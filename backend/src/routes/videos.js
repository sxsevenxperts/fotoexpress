const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');
const { detectFacesInVideo } = require('../services/vision');
const { deliverVideo } = require('../services/mediaDelivery');

// GET video metadata by ID (sem file_url — original nunca exposto publicamente)
router.get('/:id/info', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const video = await db.query(
      `SELECT v.id, v.gallery_id, v.thumbnail_url, v.width, v.height, v.duration,
              v.price, v.tags, v.order_index, v.uploaded_at,
              g.title as gallery_title, g.event_date,
              g.event_location, g.event_category_id,
              ph.id as photographer_id, ph.rating, u.first_name, u.last_name, u.avatar_url,
              ec.name as category_name
       FROM videos v
       JOIN galleries g ON v.gallery_id = g.id
       JOIN photographers ph ON g.photographer_id = ph.id
       JOIN users u ON ph.user_id = u.id
       JOIN event_categories ec ON g.event_category_id = ec.id
       WHERE v.id = $1 AND g.is_published = true`,
      [id]
    );

    if (video.rows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    res.json(video.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET video stream — com marca d'água por padrão; original apenas para quem comprou.
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || null;

    const video = await db.query(
      `SELECT v.file_url FROM videos v
       JOIN galleries g ON v.gallery_id = g.id
       WHERE v.id = $1 AND g.is_published = true`,
      [id]
    );

    if (video.rows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    await deliverVideo(video.rows[0].file_url, id, userId, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET list of gallery videos with pagination
router.get('/gallery/:gallery_id', withCache(300), async (req, res) => {
  try {
    const { gallery_id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT v.id, v.thumbnail_url, v.width, v.height, v.duration, v.price,
              v.order_index, v.tags, v.uploaded_at,
              COUNT(*) OVER() as total
       FROM videos v
       WHERE v.gallery_id = $1
       ORDER BY v.order_index ASC
       LIMIT $2 OFFSET $3`,
      [gallery_id, limit, offset]
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total) : 0;

    res.json({
      videos: result.rows.map(({ total, ...v }) => v),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST add video to gallery
router.post('/gallery/:gallery_id/upload', authenticate, async (req, res) => {
  try {
    const { gallery_id } = req.params;
    const { file_url, thumbnail_url, width, height, duration, tags, price } = req.body;
    const userId = req.user.userId;

    if (!file_url) {
      return res.status(400).json({ error: 'file_url é obrigatório' });
    }

    const gallery = await db.query(
      `SELECT g.photographer_id, g.default_photo_price FROM galleries g
       JOIN photographers p ON g.photographer_id = p.id
       WHERE g.id = $1`,
      [gallery_id]
    );

    if (gallery.rows.length === 0) {
      return res.status(404).json({ error: 'Galeria não encontrada' });
    }

    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );

    if (photographer.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const videoPrice = price != null ? price : gallery.rows[0].default_photo_price;

    const videoCount = await db.query(
      'SELECT COUNT(*) FROM videos WHERE gallery_id = $1',
      [gallery_id]
    );

    const result = await db.query(
      `INSERT INTO videos (gallery_id, file_url, thumbnail_url, width, height, duration, price, order_index, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [gallery_id, file_url, thumbnail_url, width, height, duration, videoPrice, parseInt(videoCount.rows[0].count), tags]
    );

    const videoId = result.rows[0].id;

    detectFacesInVideo(videoId, file_url).catch(err => {
      console.error('Background video face detection failed:', err);
    });

    cachePattern(`GET:/api/galleries/${gallery_id}*`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE video from gallery
router.delete('/:id/gallery/:gallery_id', authenticate, async (req, res) => {
  try {
    const { id: video_id, gallery_id } = req.params;
    const userId = req.user.userId;

    const gallery = await db.query(
      `SELECT g.photographer_id FROM galleries g
       JOIN photographers p ON g.photographer_id = p.id
       WHERE g.id = $1`,
      [gallery_id]
    );

    if (gallery.rows.length === 0) {
      return res.status(404).json({ error: 'Galeria não encontrada' });
    }

    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );

    if (photographer.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const video = await db.query(
      'SELECT id FROM videos WHERE id = $1 AND gallery_id = $2',
      [video_id, gallery_id]
    );

    if (video.rows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    await db.query('DELETE FROM videos WHERE id = $1', [video_id]);
    cachePattern(`GET:/api/galleries/${gallery_id}*`);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
