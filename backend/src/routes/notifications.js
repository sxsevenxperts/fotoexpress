const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Em memória — em produção, persistir em DB com user_id e device_id.
const subscriptions = new Map();

// POST: registra uma Push Subscription (Web Push API).
router.post('/subscribe', authenticate, express.json(), (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'subscription inválida' });
    }
    subscriptions.set(req.user.userId, subscription);
    res.json({ status: 'subscribed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: dispara uma notificação de teste (mock — em prod usaria web-push).
router.post('/test', authenticate, express.json(), (req, res) => {
  const sub = subscriptions.get(req.user.userId);
  if (!sub) {
    return res.status(404).json({ error: 'Nenhuma subscription registrada' });
  }
  // Em prod: webPush.sendNotification(sub, JSON.stringify({ title, body }))
  res.json({
    status: 'queued',
    mock: true,
    endpoint: sub.endpoint.substring(0, 50) + '...'
  });
});

// POST: dispara notificação quando uma galeria é publicada (interno).
router.post('/gallery-ready/:gallery_id', authenticate, express.json(), (req, res) => {
  // Lista usuários a notificar (em prod: quem está inscrito no evento, comprou pré-venda, etc.)
  const recipients = Array.from(subscriptions.keys());
  res.json({
    status: 'queued',
    mock: true,
    recipientCount: recipients.length,
    galleryId: req.params.gallery_id
  });
});

module.exports = router;
