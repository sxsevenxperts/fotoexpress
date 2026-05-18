const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');

// GET user's bookings with pagination and filters
router.get('/', authenticate, withCache(60), async (req, res) => {
  try {
    const { page = 1, limit = 12, status, role = 'customer' } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.userId;

    let query = `
      SELECT b.*,
             cu.first_name as customer_name, cu.last_name, cu.email as customer_email,
             ph.id as photographer_id, pu.first_name as photographer_name, pu.last_name as photographer_last, pu.avatar_url,
             ec.name as category_name,
             COUNT(*) OVER() as total
      FROM bookings b
      JOIN users cu ON b.customer_id = cu.id
      JOIN photographers ph ON b.photographer_id = ph.id
      JOIN users pu ON ph.user_id = pu.id
      JOIN event_categories ec ON b.category_id = ec.id
      WHERE 1=1
    `;
    const params = [];

    if (role === 'customer') {
      query += ` AND b.customer_id = $${params.length + 1}`;
      params.push(userId);
    } else if (role === 'photographer') {
      query += ` AND b.photographer_id = (SELECT id FROM photographers WHERE user_id = $${params.length + 1})`;
      params.push(userId);
    }

    if (status) {
      query += ` AND b.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY b.event_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const bookings = await db.query(query, params);
    const total = bookings.rows.length > 0 ? parseInt(bookings.rows[0].total) : 0;

    res.json({
      bookings: bookings.rows.map(({ total, ...b }) => b),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET booking by ID with full details
router.get('/:id', authenticate, withCache(120), async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await db.query(
      `SELECT b.*,
              cu.first_name as customer_name, cu.last_name, cu.email as customer_email, cu.phone as customer_phone,
              ph.id as photographer_id, pu.first_name as photographer_name, pu.last_name as photographer_last,
              pu.avatar_url, pu.email as photographer_email,
              ec.name as category_name
       FROM bookings b
       JOIN users cu ON b.customer_id = cu.id
       JOIN photographers ph ON b.photographer_id = ph.id
       JOIN users pu ON ph.user_id = pu.id
       JOIN event_categories ec ON b.category_id = ec.id
       WHERE b.id = $1`,
      [id]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    res.json(booking.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new booking
router.post('/', authenticate, async (req, res) => {
  try {
    const { photographer_id, category_id, event_date, event_location, event_details, service_package, price } = req.body;
    const customerId = req.user.userId;

    // Check photographer availability
    const availability = await db.query(
      `SELECT is_available, capacity, booked_count FROM photographer_availability
       WHERE photographer_id = $1 AND event_date = $2`,
      [photographer_id, event_date]
    );

    if (availability.rows.length > 0) {
      const av = availability.rows[0];
      if (!av.is_available || (av.booked_count >= av.capacity)) {
        return res.status(400).json({ error: 'Fotógrafo não está disponível nesta data' });
      }
    }

    const result = await db.query(
      `INSERT INTO bookings (customer_id, photographer_id, category_id, event_date, event_location,
                             event_details, service_package, price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
      [customerId, photographer_id, category_id, event_date, event_location, event_details, service_package, price]
    );

    // Update availability booked count
    await db.query(
      `UPDATE photographer_availability SET booked_count = booked_count + 1
       WHERE photographer_id = $1 AND event_date = $2`,
      [photographer_id, event_date]
    );

    cachePattern('GET:/api/bookings*');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update booking status
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    const booking = await db.query(
      `SELECT b.* FROM bookings b
       JOIN photographers p ON b.photographer_id = p.id
       WHERE b.id = $1`,
      [id]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const booked = booking.rows[0];
    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [booked.photographer_id]
    );

    if (photographer.rows[0].user_id !== userId && booked.customer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updates = ['status = $2', 'updated_at = NOW()'];
    const params = [id, status];

    if (status === 'confirmed') {
      updates.push(`confirmed_at = NOW()`);
    } else if (status === 'completed') {
      updates.push(`completed_at = NOW()`);
    }

    const query = `UPDATE bookings SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);

    cachePattern('GET:/api/bookings*');
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE/Cancel booking
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;
    const userId = req.user.userId;

    const booking = await db.query(
      `SELECT b.* FROM bookings b
       WHERE b.id = $1`,
      [id]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const booked = booking.rows[0];
    if (booked.customer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (booked.status === 'completed' || booked.status === 'cancelled') {
      return res.status(400).json({ error: 'Não é possível cancelar este agendamento' });
    }

    await db.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2
       WHERE id = $1`,
      [id, cancellation_reason]
    );

    // Update availability booked count
    await db.query(
      `UPDATE photographer_availability SET booked_count = booked_count - 1
       WHERE photographer_id = $1 AND event_date = $2`,
      [booked.photographer_id, booked.event_date]
    );

    cachePattern('GET:/api/bookings*');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
