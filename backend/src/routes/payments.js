const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.get('/booking/:booking_id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments WHERE booking_id = $1', [req.params.booking_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pix', authenticate, async (req, res) => {
  try {
    const { booking_id, amount } = req.body;

    const payment = await pool.query(
      'INSERT INTO payments (booking_id, amount, payment_method) VALUES ($1, $2, $3) RETURNING *',
      [booking_id, amount, 'pix']
    );

    // TODO: Generate PIX QR code using external API
    res.status(201).json(payment.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/credit-card', authenticate, async (req, res) => {
  try {
    const { booking_id, amount, card_token } = req.body;

    const payment = await pool.query(
      'INSERT INTO payments (booking_id, amount, payment_method) VALUES ($1, $2, $3) RETURNING *',
      [booking_id, amount, 'credit_card']
    );

    // TODO: Process payment with Stripe/PagSeguro
    res.status(201).json(payment.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/confirm', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['completed', req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
