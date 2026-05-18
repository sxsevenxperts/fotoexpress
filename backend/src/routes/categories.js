const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { withCache } = require('../middleware/redis');

// GET all categories
router.get('/', withCache(300), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM event_categories WHERE is_active = true ORDER BY display_order ASC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET photographers by category with filters
router.get('/:id/photographers', withCache(120), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 12, minPrice, maxPrice, rating } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.id, p.user_id, u.first_name, u.last_name, u.avatar_url,
             p.rating, p.total_reviews, p.total_photos,
             ps.standard_price, ps.min_price, ps.premium_price,
             COUNT(*) OVER() as total
      FROM photographers p
      JOIN users u ON p.user_id = u.id
      JOIN photographer_specialties ps ON p.id = ps.photographer_id
      WHERE ps.event_category_id = $1 AND p.verified_status = 'verified'
    `;
    const params = [id];
    let paramCount = 1;

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

    if (rating) {
      paramCount++;
      query += ` AND p.rating >= $${paramCount}`;
      params.push(rating);
    }

    query += ` ORDER BY p.rating DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total) : 0;

    res.json({
      photographers: result.rows.map(({ total, ...p }) => p),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET trending photos by category
router.get('/:id/trending', withCache(300), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT p.*, g.title, g.event_date, g.photographer_id, u.first_name, u.last_name
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       JOIN photographers ph ON g.photographer_id = ph.id
       JOIN users u ON ph.user_id = u.id
       WHERE g.event_category_id = $1 AND g.is_published = true
       ORDER BY p.uploaded_at DESC LIMIT 30`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET category by ID with photographers
router.get('/:id', withCache(300), async (req, res) => {
  try {
    const { id } = req.params;

    const [categoryResult, photographersResult] = await Promise.all([
      db.query(
        'SELECT * FROM event_categories WHERE id = $1 AND is_active = true',
        [id]
      ),
      db.query(
        `SELECT p.*, u.first_name, u.last_name, u.avatar_url, ps.standard_price
         FROM photographers p
         JOIN users u ON p.user_id = u.id
         JOIN photographer_specialties ps ON p.id = ps.photographer_id
         WHERE ps.event_category_id = $1 AND p.verified_status = 'verified'
         ORDER BY p.rating DESC LIMIT 20`,
        [id]
      )
    ]);

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json({
      category: categoryResult.rows[0],
      photographers: photographersResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
