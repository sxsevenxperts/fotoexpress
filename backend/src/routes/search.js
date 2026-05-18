const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { withCache } = require('../middleware/redis');

// GET unified search across photographers, galleries, and photos
router.get('/', withCache(120), async (req, res) => {
  try {
    const { q, category_id, type } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query deve ter pelo menos 2 caracteres' });
    }

    const searchTerm = `%${q}%`;
    const results = {
      photographers: [],
      galleries: [],
      photos: []
    };

    // Search photographers
    if (!type || type === 'photographers') {
      const photographers = await db.query(
        `SELECT p.id, u.first_name, u.last_name, u.avatar_url, p.rating, p.total_reviews,
                'photographer' as result_type
         FROM photographers p
         JOIN users u ON p.user_id = u.id
         WHERE p.verified_status = 'verified' AND
               (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR p.company_name ILIKE $1)
         ORDER BY p.rating DESC LIMIT 10`,
        [searchTerm]
      );
      results.photographers = photographers.rows;
    }

    // Search galleries
    if (!type || type === 'galleries') {
      let galleryQuery = `
        SELECT g.id, g.title, g.event_date, g.event_location, g.photo_count,
               g.cover_photo_url, g.photographer_id,
               u.first_name, u.last_name, u.avatar_url,
               ec.name as category_name,
               'gallery' as result_type
        FROM galleries g
        JOIN photographers p ON g.photographer_id = p.id
        JOIN users u ON p.user_id = u.id
        JOIN event_categories ec ON g.event_category_id = ec.id
        WHERE g.is_published = true AND
              (g.title ILIKE $1 OR g.event_location ILIKE $1)
      `;
      const params = [searchTerm];

      if (category_id) {
        galleryQuery += ` AND g.event_category_id = $2`;
        params.push(category_id);
      }

      galleryQuery += ` ORDER BY g.event_date DESC LIMIT 10`;

      const galleries = await db.query(galleryQuery, params);
      results.galleries = galleries.rows;
    }

    // Search photos
    if (!type || type === 'photos') {
      let photoQuery = `
        SELECT p.id, p.file_url, p.thumbnail_url, p.width, p.height,
               g.id as gallery_id, g.title, g.event_date,
               ph.id as photographer_id, u.first_name, u.last_name, u.avatar_url,
               ph.rating, ec.name as category_name,
               'photo' as result_type
        FROM photos p
        JOIN galleries g ON p.gallery_id = g.id
        JOIN photographers ph ON g.photographer_id = ph.id
        JOIN users u ON ph.user_id = u.id
        JOIN event_categories ec ON g.event_category_id = ec.id
        WHERE g.is_published = true AND
              (g.title ILIKE $1 OR g.event_location ILIKE $1 OR p.tags ILIKE $1)
      `;
      const params = [searchTerm];

      if (category_id) {
        photoQuery += ` AND g.event_category_id = $2`;
        params.push(category_id);
      }

      photoQuery += ` ORDER BY p.uploaded_at DESC LIMIT 10`;

      const photos = await db.query(photoQuery, params);
      results.photos = photos.rows;
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET search suggestions (autocomplete)
router.get('/suggestions', withCache(180), async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;

    const suggestions = await db.query(
      `(SELECT g.title as text, 'gallery' as type FROM galleries g
        WHERE g.is_published = true AND g.title ILIKE $1 LIMIT 5)
       UNION
       (SELECT ec.name as text, 'category' as type FROM event_categories ec
        WHERE ec.is_active = true AND ec.name ILIKE $1 LIMIT 5)
       UNION
       (SELECT CONCAT(u.first_name, ' ', u.last_name) as text, 'photographer' as type
        FROM photographers p
        JOIN users u ON p.user_id = u.id
        WHERE p.verified_status = 'verified' AND
              (u.first_name ILIKE $1 OR u.last_name ILIKE $1) LIMIT 5)
       ORDER BY text ASC LIMIT 15`,
      [searchTerm]
    );

    res.json(suggestions.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET advanced search with multiple filters
router.get('/advanced', withCache(120), async (req, res) => {
  try {
    const {
      q,
      category_id,
      minRating,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
      SELECT DISTINCT p.id, p.file_url, p.thumbnail_url,
             g.id as gallery_id, g.title, g.event_date, g.event_location,
             ph.id as photographer_id, u.first_name, u.last_name, u.avatar_url,
             ph.rating, ec.name as category_name,
             COUNT(*) OVER() as total
      FROM photos p
      JOIN galleries g ON p.gallery_id = g.id
      JOIN photographers ph ON g.photographer_id = ph.id
      JOIN users u ON ph.user_id = u.id
      JOIN event_categories ec ON g.event_category_id = ec.id
      JOIN photographer_specialties ps ON ph.id = ps.photographer_id
      WHERE g.is_published = true
    `;

    const params = [];
    let paramCount = 0;

    if (q) {
      paramCount++;
      query += ` AND (g.title ILIKE $${paramCount} OR g.event_location ILIKE $${paramCount})`;
      params.push(`%${q}%`);
    }

    if (category_id) {
      paramCount++;
      query += ` AND g.event_category_id = $${paramCount}`;
      params.push(category_id);
    }

    if (minRating) {
      paramCount++;
      query += ` AND ph.rating >= $${paramCount}`;
      params.push(minRating);
    }

    if (minPrice) {
      paramCount++;
      query += ` AND ps.standard_price >= $${paramCount}`;
      params.push(minPrice);
    }

    if (maxPrice) {
      paramCount++;
      query += ` AND ps.standard_price <= $${paramCount}`;
      params.push(maxPrice);
    }

    if (startDate && endDate) {
      paramCount++;
      query += ` AND g.event_date BETWEEN $${paramCount}`;
      paramCount++;
      query += ` AND $${paramCount}`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY g.event_date DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const photos = await db.query(query, params);
    const total = photos.rows.length > 0 ? parseInt(photos.rows[0].total) : 0;

    res.json({
      results: photos.rows.map(({ total, ...p }) => p),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;