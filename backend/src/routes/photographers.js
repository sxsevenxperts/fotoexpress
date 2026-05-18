const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cacheDel, cachePattern } = require('../middleware/redis');

// GET: dashboard agregado do fotógrafo autenticado (vendas, ganhos, top fotos).
router.get('/me/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { range = '30d' } = req.query;

    const photographer = await db.query(
      `SELECT id, total_sales, total_earnings, rating, total_reviews,
              total_photos, total_galleries
       FROM photographers WHERE user_id = $1`,
      [userId]
    );

    if (photographer.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil de fotógrafo não encontrado' });
    }

    const p = photographer.rows[0];
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

    const [recentSales, salesByDay, topPhotos, recentGalleries] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS sales_count,
                COALESCE(SUM(pp.photographer_payout), 0)::float AS earnings,
                COALESCE(SUM(pp.price), 0)::float AS gross
         FROM photo_purchases pp
         JOIN photos ph ON pp.photo_id = ph.id
         JOIN galleries g ON ph.gallery_id = g.id
         WHERE g.photographer_id = $1
           AND pp.status = 'completed'
           AND pp.completed_at >= NOW() - INTERVAL '${days} days'`,
        [p.id]
      ),
      db.query(
        `SELECT DATE(pp.completed_at) AS day,
                COUNT(*)::int AS sales,
                COALESCE(SUM(pp.photographer_payout), 0)::float AS earnings
         FROM photo_purchases pp
         JOIN photos ph ON pp.photo_id = ph.id
         JOIN galleries g ON ph.gallery_id = g.id
         WHERE g.photographer_id = $1
           AND pp.status = 'completed'
           AND pp.completed_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(pp.completed_at)
         ORDER BY day ASC`,
        [p.id]
      ),
      db.query(
        `SELECT ph.id, ph.thumbnail_url, ph.price,
                COUNT(pp.id)::int AS sales,
                g.title AS gallery_title
         FROM photos ph
         JOIN galleries g ON ph.gallery_id = g.id
         LEFT JOIN photo_purchases pp ON pp.photo_id = ph.id AND pp.status = 'completed'
         WHERE g.photographer_id = $1
         GROUP BY ph.id, ph.thumbnail_url, ph.price, g.title
         ORDER BY sales DESC NULLS LAST
         LIMIT 6`,
        [p.id]
      ),
      db.query(
        `SELECT g.id, g.title, g.event_date, g.photo_count, g.is_published,
                g.cover_photo_url, g.scheduled_publish_at,
                COUNT(DISTINCT pp.id)::int AS total_sales,
                COALESCE(SUM(pp.photographer_payout), 0)::float AS earnings
         FROM galleries g
         LEFT JOIN photos ph ON ph.gallery_id = g.id
         LEFT JOIN photo_purchases pp ON pp.photo_id = ph.id AND pp.status = 'completed'
         WHERE g.photographer_id = $1
         GROUP BY g.id
         ORDER BY g.created_at DESC
         LIMIT 8`,
        [p.id]
      ).catch(() =>
        db.query(
          `SELECT g.id, g.title, g.event_date, g.photo_count, g.is_published,
                  g.cover_photo_url,
                  COUNT(DISTINCT pp.id)::int AS total_sales,
                  COALESCE(SUM(pp.photographer_payout), 0)::float AS earnings
           FROM galleries g
           LEFT JOIN photos ph ON ph.gallery_id = g.id
           LEFT JOIN photo_purchases pp ON pp.photo_id = ph.id AND pp.status = 'completed'
           WHERE g.photographer_id = $1
           GROUP BY g.id
           ORDER BY g.created_at DESC
           LIMIT 8`,
          [p.id]
        )
      )
    ]);

    res.json({
      photographer: {
        id: p.id,
        rating: parseFloat(p.rating) || 0,
        totalReviews: p.total_reviews || 0,
        totalPhotos: p.total_photos || 0,
        totalGalleries: p.total_galleries || 0,
        lifetimeSales: p.total_sales || 0,
        lifetimeEarnings: parseFloat(p.total_earnings) || 0
      },
      range,
      summary: {
        salesCount: recentSales.rows[0].sales_count,
        earnings: recentSales.rows[0].earnings,
        gross: recentSales.rows[0].gross,
        platformFee: recentSales.rows[0].gross - recentSales.rows[0].earnings
      },
      salesByDay: salesByDay.rows,
      topPhotos: topPhotos.rows,
      recentGalleries: recentGalleries.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all photographers with pagination
router.get('/', withCache(300), async (req, res) => {
  try {
    const { page = 1, limit = 12, search, minRating } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.id, u.first_name, u.last_name, u.avatar_url, u.email,
             p.rating, p.total_reviews, p.total_photos, p.total_galleries,
             p.verified_status,
             COUNT(*) OVER() as total
      FROM photographers p
      JOIN users u ON p.user_id = u.id
      WHERE p.verified_status = 'verified'
    `;
    const params = [];

    if (search) {
      query += ` AND (u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (minRating) {
      query += ` AND p.rating >= $${params.length + 1}`;
      params.push(minRating);
    }

    query += ` ORDER BY p.rating DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const photographers = await db.query(query, params);
    const total = photographers.rows.length > 0 ? parseInt(photographers.rows[0].total) : 0;

    res.json({
      photographers: photographers.rows.map(({ total, ...p }) => p),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photographer profile by ID
router.get('/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const [photogResult, specialtiesResult, galleriesResult, reviewsResult] = await Promise.all([
      db.query(
        `SELECT p.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url, u.bio
         FROM photographers p
         JOIN users u ON p.user_id = u.id
         WHERE p.id = $1`,
        [id]
      ),
      db.query(
        `SELECT ps.*, ec.name, ec.slug
         FROM photographer_specialties ps
         JOIN event_categories ec ON ps.event_category_id = ec.id
         WHERE ps.photographer_id = $1`,
        [id]
      ),
      db.query(
        `SELECT id, title, event_date, photo_count, cover_photo_url
         FROM galleries
         WHERE photographer_id = $1 AND is_published = true
         ORDER BY event_date DESC LIMIT 10`,
        [id]
      ),
      db.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, u.first_name, u.last_name, u.avatar_url
         FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         WHERE r.photographer_id = $1
         ORDER BY r.created_at DESC LIMIT 5`,
        [id]
      )
    ]);

    if (photogResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fotógrafo não encontrado' });
    }

    res.json({
      photographer: photogResult.rows[0],
      specialties: specialtiesResult.rows,
      galleries: galleriesResult.rows,
      reviews: reviewsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create photographer profile
router.post('/', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { companyName, specialties } = req.body;

    const existing = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Perfil de fotógrafo já existe' });
    }

    const result = await db.query(
      `INSERT INTO photographers (user_id, company_name, specialties)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, companyName, JSON.stringify(specialties)]
    );

    cachePattern('GET:/api/photographers*');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update photographer profile
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName } = req.body;

    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [id]
    );

    if (photographer.rows.length === 0) {
      return res.status(404).json({ error: 'Fotógrafo não encontrado' });
    }

    if (photographer.rows[0].user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await db.query(
      `UPDATE photographers
       SET company_name = COALESCE($1, company_name), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [companyName, id]
    );

    cachePattern(`GET:/api/photographers*`);
    cachePattern(`GET:/api/photographers/${id}*`);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photographer galleries
router.get('/:id/galleries', withCache(300), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    const galleries = await db.query(
      `SELECT *,
              COUNT(*) OVER() as total
       FROM galleries
       WHERE photographer_id = $1 AND is_published = true
       ORDER BY event_date DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

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

// GET photographer reviews
router.get('/:id/reviews', withCache(300), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const reviews = await db.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.first_name, u.last_name, u.avatar_url,
              COUNT(*) OVER() as total
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.photographer_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const total = reviews.rows.length > 0 ? parseInt(reviews.rows[0].total) : 0;

    res.json({
      reviews: reviews.rows.map(({ total, ...r }) => r),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photographer availability
router.get('/:id/availability', withCache(300), async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    let query = 'SELECT * FROM photographer_availability WHERE photographer_id = $1';
    const params = [id];

    if (startDate && endDate) {
      query += ` AND event_date BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update photographer availability
router.put('/:id/availability', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { eventDate, isAvailable, capacity, notes } = req.body;

    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [id]
    );

    if (photographer.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await db.query(
      `INSERT INTO photographer_availability (photographer_id, event_date, is_available, capacity, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (photographer_id, event_date)
       DO UPDATE SET is_available = $3, capacity = $4, notes = $5
       RETURNING *`,
      [id, eventDate, isAvailable, capacity, notes]
    );

    cachePattern(`GET:/api/photographers/${id}*`);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
