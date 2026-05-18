const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');
const { detectFacesInPhoto } = require('../services/vision');
const { findSimilarFaces } = require('../services/faceMatching');

// GET all galleries with pagination, filtering, and search
router.get('/', withCache(300), async (req, res) => {
  try {
    const { page = 1, limit = 12, photographer_id, category_id, startDate, endDate, published = 'true', search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT g.id, g.title, g.event_date, g.event_location, g.photo_count,
             g.cover_photo_url, g.default_photo_price, g.is_published, g.photographer_id,
             u.first_name, u.last_name, u.avatar_url,
             ec.name as category_name,
             COUNT(*) OVER() as total
      FROM galleries g
      JOIN photographers p ON g.photographer_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN event_categories ec ON g.event_category_id = ec.id
      WHERE 1=1
    `;
    const params = [];

    // Por padrão, listagem pública mostra apenas álbuns publicados.
    if (published !== 'false') {
      query += ` AND g.is_published = true`;
    }

    if (photographer_id) {
      query += ` AND g.photographer_id = $${params.length + 1}`;
      params.push(photographer_id);
    }

    if (category_id) {
      query += ` AND g.event_category_id = $${params.length + 1}`;
      params.push(category_id);
    }

    if (startDate && endDate) {
      query += ` AND g.event_date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }

    if (search) {
      query += ` AND (g.title ILIKE $${params.length + 1} OR g.event_location ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY g.event_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const galleries = await db.query(query, params);
    const total = galleries.rows.length > 0 ? parseInt(galleries.rows[0].total) : 0;

    res.json({
      galleries: galleries.rows.map(({ total, ...g }) => g),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET gallery by ID with all photos
router.get('/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const [galleryResult, photosResult] = await Promise.all([
      db.query(
        `SELECT g.*, u.first_name, u.last_name, u.avatar_url, u.email,
                ec.name as category_name, p.rating, p.verified_status
         FROM galleries g
         JOIN photographers p ON g.photographer_id = p.id
         JOIN users u ON p.user_id = u.id
         JOIN event_categories ec ON g.event_category_id = ec.id
         WHERE g.id = $1`,
        [id]
      ),
      db.query(
        // file_url (original em alta resolução) nunca é exposto publicamente.
        `SELECT id, thumbnail_url, width, height, price, order_index, tags, uploaded_at
         FROM photos
         WHERE gallery_id = $1
         ORDER BY order_index ASC`,
        [id]
      )
    ]);

    if (galleryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Galeria não encontrada' });
    }

    res.json({
      gallery: galleryResult.rows[0],
      photos: photosResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET gallery by share token (link exclusivo do álbum)
router.get('/share/:token', withCache(300), async (req, res) => {
  try {
    const { token } = req.params;

    const [galleryResult, photosResult] = await Promise.all([
      db.query(
        `SELECT g.*, u.first_name, u.last_name, u.avatar_url,
                ec.name as category_name, p.rating, p.verified_status
         FROM galleries g
         JOIN photographers p ON g.photographer_id = p.id
         JOIN users u ON p.user_id = u.id
         JOIN event_categories ec ON g.event_category_id = ec.id
         WHERE g.share_token = $1`,
        [token]
      ),
      db.query(
        `SELECT ph.id, ph.thumbnail_url, ph.width, ph.height, ph.price,
                ph.order_index, ph.tags, ph.uploaded_at
         FROM photos ph
         JOIN galleries g ON ph.gallery_id = g.id
         WHERE g.share_token = $1
         ORDER BY ph.order_index ASC`,
        [token]
      )
    ]);

    if (galleryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Álbum não encontrado' });
    }

    const galleryData = galleryResult.rows[0];
    res.json({
      gallery: {
        ...galleryData,
        photographerName: `${galleryData.first_name} ${galleryData.last_name}`
      },
      photos: photosResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: polling para o modo "Live Event" — devolve fotos adicionadas após
// um timestamp ISO. Frontend chama a cada N segundos durante o evento.
router.get('/share/:token/since', async (req, res) => {
  try {
    const { token } = req.params;
    const { after } = req.query;
    const afterDate = after ? new Date(after) : new Date(Date.now() - 60_000);

    if (isNaN(afterDate.getTime())) {
      return res.status(400).json({ error: 'Parâmetro after inválido' });
    }

    const result = await db.query(
      `SELECT ph.id, ph.thumbnail_url, ph.width, ph.height, ph.price,
              ph.order_index, ph.tags, ph.uploaded_at,
              g.is_live, g.event_date
       FROM photos ph
       JOIN galleries g ON ph.gallery_id = g.id
       WHERE g.share_token = $1 AND ph.uploaded_at > $2
       ORDER BY ph.uploaded_at ASC`,
      [token, afterDate.toISOString()]
    );

    const liveResult = await db.query(
      `SELECT is_live, event_date FROM galleries WHERE share_token = $1`,
      [token]
    );

    res.json({
      newPhotos: result.rows,
      isLive: liveResult.rows[0]?.is_live === true,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new gallery
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, event_category_id, event_date, event_location, cover_photo_url, default_photo_price } = req.body;
    const userId = req.user.userId;

    const photographer = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (photographer.rows.length === 0) {
      return res.status(403).json({ error: 'Você deve ter um perfil de fotógrafo para criar galerias' });
    }

    // Link exclusivo do álbum: token aleatório usado para compartilhamento.
    const shareToken = crypto.randomBytes(16).toString('hex');

    const result = await db.query(
      `INSERT INTO galleries (photographer_id, title, description, event_category_id, event_date, event_location, cover_photo_url, default_photo_price, share_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [photographer.rows[0].id, title, description, event_category_id, event_date, event_location, cover_photo_url, default_photo_price, shareToken]
    );

    await db.query(
      'UPDATE photographers SET total_galleries = total_galleries + 1, updated_at = NOW() WHERE id = $1',
      [photographer.rows[0].id]
    );

    cachePattern('GET:/api/galleries*');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update gallery
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, event_location, cover_photo_url, is_published } = req.body;
    const userId = req.user.userId;

    const gallery = await db.query(
      `SELECT g.photographer_id FROM galleries g
       JOIN photographers p ON g.photographer_id = p.id
       WHERE g.id = $1`,
      [id]
    );

    if (gallery.rows.length === 0) {
      return res.status(404).json({ error: 'Galeria não encontrada' });
    }

    const photographer = await db.query(
      'SELECT id, user_id FROM photographers WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );

    if (photographer.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updates = [];
    const params = [id];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${++paramCount}`);
      params.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${++paramCount}`);
      params.push(description);
    }
    if (event_location !== undefined) {
      updates.push(`event_location = $${++paramCount}`);
      params.push(event_location);
    }
    if (cover_photo_url !== undefined) {
      updates.push(`cover_photo_url = $${++paramCount}`);
      params.push(cover_photo_url);
    }
    if (is_published !== undefined) {
      updates.push(`is_published = $${++paramCount}`);
      updates.push(`published_at = CASE WHEN $${paramCount} THEN NOW() ELSE published_at END`);
      params.push(is_published);
    }

    updates.push(`updated_at = NOW()`);

    const query = `UPDATE galleries SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);

    cachePattern('GET:/api/galleries*');
    cachePattern(`GET:/api/galleries/${id}*`);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE gallery
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const gallery = await db.query(
      `SELECT g.photographer_id FROM galleries g
       JOIN photographers p ON g.photographer_id = p.id
       WHERE g.id = $1`,
      [id]
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

    await db.query('DELETE FROM galleries WHERE id = $1', [id]);
    await db.query(
      'UPDATE photographers SET total_galleries = GREATEST(total_galleries - 1, 0), updated_at = NOW() WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );
    cachePattern('GET:/api/galleries*');
    cachePattern(`GET:/api/galleries/${id}*`);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST add photo to gallery
router.post('/:id/photos', authenticate, async (req, res) => {
  try {
    const { id: gallery_id } = req.params;
    const { file_url, thumbnail_url, width, height, tags, price } = req.body;
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

    // Preço da foto: usa o informado ou o preço padrão do álbum.
    const photoPrice = price != null ? price : gallery.rows[0].default_photo_price;

    const photoCount = await db.query(
      'SELECT COUNT(*) FROM photos WHERE gallery_id = $1',
      [gallery_id]
    );

    const result = await db.query(
      `INSERT INTO photos (gallery_id, file_url, thumbnail_url, width, height, price, order_index, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [gallery_id, file_url, thumbnail_url, width, height, photoPrice, parseInt(photoCount.rows[0].count), tags]
    );

    const photoId = result.rows[0].id;

    await db.query(
      'UPDATE galleries SET photo_count = photo_count + 1, updated_at = NOW() WHERE id = $1',
      [gallery_id]
    );

    await db.query(
      'UPDATE photographers SET total_photos = total_photos + 1, updated_at = NOW() WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );

    detectFacesInPhoto(photoId, file_url)
      .then(() => {
        findSimilarFaces(photoId, 0.85).catch(err => {
          console.error('Background face matching failed:', err);
        });
      })
      .catch(err => {
        console.error('Background face detection failed:', err);
      });

    cachePattern('GET:/api/galleries*');
    cachePattern(`GET:/api/galleries/${gallery_id}*`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE photo from gallery
router.delete('/:id/photos/:photo_id', authenticate, async (req, res) => {
  try {
    const { id: gallery_id, photo_id } = req.params;
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

    const photo = await db.query(
      'SELECT id FROM photos WHERE id = $1 AND gallery_id = $2',
      [photo_id, gallery_id]
    );

    if (photo.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    await db.query('DELETE FROM photos WHERE id = $1', [photo_id]);
    await db.query(
      'UPDATE galleries SET photo_count = GREATEST(photo_count - 1, 0), updated_at = NOW() WHERE id = $1',
      [gallery_id]
    );
    await db.query(
      'UPDATE photographers SET total_photos = GREATEST(total_photos - 1, 0), updated_at = NOW() WHERE id = $1',
      [gallery.rows[0].photographer_id]
    );

    cachePattern(`GET:/api/galleries/${gallery_id}*`);
    cachePattern('GET:/api/galleries*');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
