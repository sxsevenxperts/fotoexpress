const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');

// POST create review for photographer
router.post('/', authenticate, async (req, res) => {
  try {
    const { photographer_id, booking_id, rating, comment } = req.body;
    const reviewerId = req.user.userId;

    // Verify booking exists and user is the customer
    const booking = await db.query(
      `SELECT b.*, p.user_id as photographer_user_id FROM bookings b
       JOIN photographers p ON b.photographer_id = p.id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [booking_id, reviewerId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    // Verify booking is completed
    if (booking.rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'Apenas agendamentos completos podem ser avaliados' });
    }

    // Check if review already exists for this booking
    const existingReview = await db.query(
      'SELECT id FROM reviews WHERE booking_id = $1',
      [booking_id]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe uma avaliação para este agendamento' });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Avaliação deve ser entre 1 e 5' });
    }

    const result = await db.query(
      `INSERT INTO reviews (photographer_id, reviewer_id, booking_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [photographer_id, reviewerId, booking_id, rating, comment]
    );

    // Update photographer rating
    const ratingStats = await db.query(
      `SELECT COUNT(*) as total_reviews, AVG(rating) as avg_rating FROM reviews WHERE photographer_id = $1`,
      [photographer_id]
    );

    const avgRating = Math.round(parseFloat(ratingStats.rows[0].avg_rating) * 10) / 10;
    const totalReviews = parseInt(ratingStats.rows[0].total_reviews);

    await db.query(
      `UPDATE photographers SET rating = $2, total_reviews = $3, updated_at = NOW()
       WHERE id = $1`,
      [photographer_id, avgRating, totalReviews]
    );

    cachePattern(`GET:/api/reviews*`);
    cachePattern(`GET:/api/photographers/${photographer_id}*`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET reviews for photographer
router.get('/photographer/:photographer_id', withCache(300), async (req, res) => {
  try {
    const { photographer_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const [reviewsResult, statsResult] = await Promise.all([
      db.query(
        `SELECT r.*, u.first_name, u.last_name, u.avatar_url,
                b.event_date, ec.name as category_name,
                COUNT(*) OVER() as total
         FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         JOIN bookings b ON r.booking_id = b.id
         JOIN event_categories ec ON b.category_id = ec.id
         WHERE r.photographer_id = $1
         ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
        [photographer_id, limit, offset]
      ),
      db.query(
        `SELECT
          COUNT(*) as total_reviews,
          AVG(rating) as avg_rating,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
         FROM reviews WHERE photographer_id = $1`,
        [photographer_id]
      )
    ]);

    const reviews = reviewsResult.rows;
    const stats = statsResult.rows[0];
    const total = reviews.length > 0 ? parseInt(reviews[0].total) : 0;

    res.json({
      reviews: reviews.map(({ total, ...r }) => r),
      stats: {
        total: parseInt(stats.total_reviews) || 0,
        average_rating: parseFloat(stats.avg_rating) || 0,
        breakdown: {
          five_star: parseInt(stats.five_star) || 0,
          four_star: parseInt(stats.four_star) || 0,
          three_star: parseInt(stats.three_star) || 0,
          two_star: parseInt(stats.two_star) || 0,
          one_star: parseInt(stats.one_star) || 0
        }
      },
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

// GET single review
router.get('/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const review = await db.query(
      `SELECT r.*, u.first_name, u.last_name, u.avatar_url,
              b.event_date, ec.name as category_name, ph.company_name
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       JOIN bookings b ON r.booking_id = b.id
       JOIN event_categories ec ON b.category_id = ec.id
       JOIN photographers ph ON r.photographer_id = ph.id
       WHERE r.id = $1`,
      [id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada' });
    }

    res.json(review.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update review (only by reviewer)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.userId;

    const review = await db.query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada' });
    }

    if (review.rows[0].reviewer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Avaliação deve ser entre 1 e 5' });
    }

    const updates = [];
    const params = [id];
    let paramCount = 1;

    if (rating !== undefined) {
      paramCount++;
      updates.push(`rating = $${paramCount}`);
      params.push(rating);
    }

    if (comment !== undefined) {
      paramCount++;
      updates.push(`comment = $${paramCount}`);
      params.push(comment);
    }

    updates.push(`updated_at = NOW()`);

    const query = `UPDATE reviews SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);

    // Update photographer rating if rating changed
    if (rating !== undefined) {
      const ratingStats = await db.query(
        `SELECT AVG(rating) as avg_rating FROM reviews WHERE photographer_id = $1`,
        [result.rows[0].photographer_id]
      );

      const avgRating = Math.round(parseFloat(ratingStats.rows[0].avg_rating) * 10) / 10;

      await db.query(
        `UPDATE photographers SET rating = $2, updated_at = NOW()
         WHERE id = $1`,
        [result.rows[0].photographer_id, avgRating]
      );
    }

    cachePattern(`GET:/api/reviews*`);
    cachePattern(`GET:/api/photographers/${result.rows[0].photographer_id}*`);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE review (only by reviewer or admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const review = await db.query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada' });
    }

    if (review.rows[0].reviewer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const photographerId = review.rows[0].photographer_id;

    await db.query('DELETE FROM reviews WHERE id = $1', [id]);

    // Update photographer rating
    const ratingStats = await db.query(
      `SELECT COUNT(*) as total_reviews, AVG(rating) as avg_rating FROM reviews WHERE photographer_id = $1`,
      [photographerId]
    );

    const avgRating = ratingStats.rows[0].total_reviews === 0 ? 0 : Math.round(parseFloat(ratingStats.rows[0].avg_rating) * 10) / 10;
    const totalReviews = parseInt(ratingStats.rows[0].total_reviews);

    await db.query(
      `UPDATE photographers SET rating = $2, total_reviews = $3, updated_at = NOW()
       WHERE id = $1`,
      [photographerId, avgRating, totalReviews]
    );

    cachePattern(`GET:/api/reviews*`);
    cachePattern(`GET:/api/photographers/${photographerId}*`);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET user's review for booking
router.get('/booking/:booking_id', authenticate, withCache(300), async (req, res) => {
  try {
    const { booking_id } = req.params;
    const userId = req.user.userId;

    const review = await db.query(
      `SELECT r.* FROM reviews r
       JOIN bookings b ON r.booking_id = b.id
       WHERE b.id = $1 AND r.reviewer_id = $2`,
      [booking_id, userId]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada' });
    }

    res.json(review.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;