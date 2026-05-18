const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/', authenticate, async (req, res) => {
  try {
    const { booking_id, payment_method, amount } = req.body;
    const userId = req.user.userId;

    const booking = await db.query(
      `SELECT b.* FROM bookings b WHERE b.id = $1`,
      [booking_id]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const booked = booking.rows[0];
    if (booked.customer_id !== userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (booked.status !== 'pending') {
      return res.status(400).json({ error: 'Agendamento não pode ser pago' });
    }

    const result = await db.query(
      `INSERT INTO payments (booking_id, customer_id, amount, payment_method, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [booking_id, userId, amount, payment_method]
    );

    cachePattern('GET:/api/payments*');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/card', authenticate, async (req, res) => {
  try {
    const { payment_id, token, amount } = req.body;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.* FROM payments p WHERE p.id = $1 AND p.customer_id = $2`,
      [payment_id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const paymentRecord = payment.rows[0];

    try {
      const chargeResult = await stripe.charges.create({
        amount: Math.round(amount * 100),
        currency: 'brl',
        source: token,
        description: `FotoExpress Booking #${paymentRecord.booking_id}`,
        metadata: {
          booking_id: paymentRecord.booking_id,
          payment_id: payment_id
        }
      });

      await db.query(
        `UPDATE payments SET status = 'completed', transaction_id = $2, processed_at = NOW()
         WHERE id = $1`,
        [payment_id, chargeResult.id]
      );

      await db.query(
        `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW()
         WHERE id = $1`,
        [paymentRecord.booking_id]
      );

      cachePattern('GET:/api/payments*');
      cachePattern('GET:/api/bookings*');
      res.json({
        payment_id,
        status: 'completed',
        transaction_id: chargeResult.id,
        amount
      });
    } catch (stripeError) {
      await db.query(
        `UPDATE payments SET status = 'failed', error_message = $2
         WHERE id = $1`,
        [payment_id, stripeError.message]
      );

      return res.status(400).json({ error: 'Erro ao processar pagamento', details: stripeError.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pix', authenticate, async (req, res) => {
  try {
    const { payment_id, amount, booking_id } = req.body;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.* FROM payments p WHERE p.id = $1 AND p.customer_id = $2`,
      [payment_id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const pixKey = `${booking_id}-${Date.now()}`;
    const qrCode = `00020126580014br.gov.bcb.pix0136${pixKey}520400005303986540${amount}5802BR5913FotoExpress6009SaoPaulo62410503***63041234`;

    await db.query(
      `UPDATE payments SET status = 'waiting_pix', pix_key = $2, pix_qr_code = $3
       WHERE id = $1`,
      [payment_id, pixKey, qrCode]
    );

    cachePattern('GET:/api/payments*');
    res.json({
      payment_id,
      status: 'waiting_pix',
      pix_key: pixKey,
      qr_code: qrCode,
      amount,
      expires_in: 900
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/confirm', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.* FROM payments p WHERE p.id = $1 AND p.customer_id = $2`,
      [id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const paymentRecord = payment.rows[0];

    if (paymentRecord.status !== 'waiting_pix') {
      return res.status(400).json({ error: 'Pagamento não está aguardando confirmação' });
    }

    await db.query(
      `UPDATE payments SET status = 'completed', processed_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await db.query(
      `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1`,
      [paymentRecord.booking_id]
    );

    cachePattern('GET:/api/payments*');
    cachePattern('GET:/api/bookings*');
    res.json({
      payment_id: id,
      status: 'completed',
      booking_id: paymentRecord.booking_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, withCache(600), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.*, b.event_date, b.price
       FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = $1 AND (p.customer_id = $2 OR b.photographer_id IN (
         SELECT id FROM photographers WHERE user_id = $2
       ))`,
      [id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    res.json(payment.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/booking/:booking_id', authenticate, withCache(600), async (req, res) => {
  try {
    const { booking_id } = req.params;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.* FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.booking_id = $1 AND (p.customer_id = $2 OR b.photographer_id IN (
         SELECT id FROM photographers WHERE user_id = $2
       ))`,
      [booking_id, userId]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    res.json(payment.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/refund', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    const payment = await db.query(
      `SELECT p.*, b.photographer_id FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = $1`,
      [id]
    );

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const paymentRecord = payment.rows[0];
    const photographer = await db.query(
      'SELECT user_id FROM photographers WHERE id = $1',
      [paymentRecord.photographer_id]
    );

    if (photographer.rows[0].user_id !== userId && paymentRecord.customer_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (paymentRecord.status !== 'completed') {
      return res.status(400).json({ error: 'Apenas pagamentos completos podem ser reembolsados' });
    }

    try {
      if (paymentRecord.payment_method === 'card' && paymentRecord.transaction_id) {
        await stripe.refunds.create({
          charge: paymentRecord.transaction_id,
          reason: 'customer_request',
          metadata: {
            booking_id: paymentRecord.booking_id,
            refund_reason: reason
          }
        });
      }

      await db.query(
        `UPDATE payments SET status = 'refunded', refund_reason = $2, refunded_at = NOW()
         WHERE id = $1`,
        [id, reason]
      );

      await db.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2
         WHERE id = $1`,
        [paymentRecord.booking_id, reason]
      );

      cachePattern('GET:/api/payments*');
      cachePattern('GET:/api/bookings*');
      res.json({
        payment_id: id,
        status: 'refunded',
        amount: paymentRecord.amount,
        reason
      });
    } catch (stripeError) {
      return res.status(400).json({ error: 'Erro ao processar reembolso', details: stripeError.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
