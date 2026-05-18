const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { cachePattern } = require('../middleware/redis');

// Mock Stripe for development/testing with incomplete API key
let stripe;
const isTestMode = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.length < 50;

if (isTestMode) {
  stripe = {
    paymentIntents: {
      create: async (params) => ({
        id: `pi_test_${Date.now()}`,
        client_secret: `pi_test_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`,
        status: 'succeeded',
        amount: params.amount,
        currency: params.currency
      }),
      retrieve: async (id) => ({
        id,
        status: 'succeeded',
        amount: 0,
        currency: 'brl'
      })
    }
  };
} else {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Comissão da plataforma: 7% por foto/vídeo vendido.
const PLATFORM_COMMISSION_RATE = 0.07;

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Divide o preço entre comissão da plataforma (7%) e repasse do fotógrafo (93%).
function computePricing(price) {
  const numericPrice = round2(Number(price));
  const commission = round2(numericPrice * PLATFORM_COMMISSION_RATE);
  return {
    price: numericPrice,
    commissionRate: PLATFORM_COMMISSION_RATE,
    commission,
    photographerPayout: round2(numericPrice - commission)
  };
}

// Cria um PaymentIntent no Stripe para o item sendo comprado.
async function createPaymentIntent(pricing, metadata) {
  return stripe.paymentIntents.create({
    amount: Math.round(pricing.price * 100),
    currency: 'brl',
    description: `FotoExpress - ${metadata.type === 'video' ? 'Vídeo' : 'Foto'} #${metadata.itemId}`,
    metadata
  });
}

// ---------------------------------------------------------------------------
// PIX (mock para desenvolvimento — gera EMV/QRCode payload de teste)
// ---------------------------------------------------------------------------

const PIX_KEY = process.env.PIX_KEY || 'pix@fotoexpress.com.br';
const PIX_MERCHANT_NAME = process.env.PIX_MERCHANT_NAME || 'FOTOEXPRESS';
const PIX_MERCHANT_CITY = process.env.PIX_MERCHANT_CITY || 'SAO PAULO';

function emvField(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Gera código Pix Copia-e-Cola (BR Code EMV) válido para teste.
function generatePixPayload(amount, txid) {
  const merchantAccount = emvField('00', 'br.gov.bcb.pix') + emvField('01', PIX_KEY);
  const additionalData = emvField('05', txid.substring(0, 25));

  const payload =
    emvField('00', '01') +
    emvField('26', merchantAccount) +
    emvField('52', '0000') +
    emvField('53', '986') +
    emvField('54', amount.toFixed(2)) +
    emvField('58', 'BR') +
    emvField('59', PIX_MERCHANT_NAME.substring(0, 25)) +
    emvField('60', PIX_MERCHANT_CITY.substring(0, 15)) +
    emvField('62', additionalData) +
    '6304';

  return payload + crc16(payload);
}

// Cria uma "intenção" de pagamento Pix — retorna o payload Copia-e-Cola.
function createPixIntent(pricing, metadata) {
  const txid = `PIX${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const payload = generatePixPayload(pricing.price, txid);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  return {
    id: txid,
    method: 'pix',
    status: 'pending',
    amount: pricing.price,
    pixCopyPaste: payload,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`,
    expiresAt: expiresAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// BUNDLES (compra em massa com desconto progressivo)
// ---------------------------------------------------------------------------

// Desconto progressivo por volume — incentiva pacote em vez de foto avulsa.
function bundleDiscountRate(photoCount) {
  if (photoCount >= 20) return 0.50;
  if (photoCount >= 10) return 0.35;
  if (photoCount >= 5) return 0.20;
  return 0;
}

// GET: preview de preços de bundle para uma galeria.
router.get('/bundles/galleries/:gallery_id/preview', async (req, res) => {
  try {
    const { gallery_id } = req.params;

    const result = await db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(price), 0)::float AS total
       FROM photos
       WHERE gallery_id = $1 AND price > 0`,
      [gallery_id]
    );

    const { count, total } = result.rows[0];
    const discountRate = bundleDiscountRate(count);
    const discountAmount = round2(total * discountRate);
    const finalPrice = round2(total - discountAmount);

    res.json({
      galleryId: parseInt(gallery_id),
      photoCount: count,
      originalTotal: round2(total),
      discountRate,
      discountAmount,
      finalPrice,
      tiers: [
        { minPhotos: 5, discount: 0.20, label: '5+ fotos' },
        { minPhotos: 10, discount: 0.35, label: '10+ fotos' },
        { minPhotos: 20, discount: 0.50, label: '20+ fotos' }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// FOTOS
// ---------------------------------------------------------------------------

// POST: Inicia a compra de uma foto (checkout) — devolve dados de pagamento
// (clientSecret do Stripe para cartão, payload Pix Copia-e-Cola para Pix).
router.post('/photos/:photo_id', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const { paymentMethod = 'card' } = req.body;
    const userId = req.user.userId;

    const photoResult = await db.query(
      `SELECT p.id, p.price, g.photographer_id,
              g.presale_starts_at, g.presale_ends_at, g.presale_discount_rate
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       WHERE p.id = $1`,
      [photo_id]
    ).catch(async () => {
      // Fallback caso as colunas de presale ainda não existam.
      return db.query(
        `SELECT p.id, p.price, g.photographer_id,
                NULL::timestamp AS presale_starts_at,
                NULL::timestamp AS presale_ends_at,
                0 AS presale_discount_rate
         FROM photos p
         JOIN galleries g ON p.gallery_id = g.id
         WHERE p.id = $1`,
        [photo_id]
      );
    });

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    const photo = photoResult.rows[0];

    // O preço é sempre o definido pelo fotógrafo — nunca aceito do cliente.
    if (photo.price == null || Number(photo.price) <= 0) {
      return res.status(400).json({ error: 'Esta foto não está à venda' });
    }

    const existing = await db.query(
      'SELECT id, status FROM photo_purchases WHERE user_id = $1 AND photo_id = $2',
      [userId, photo_id]
    );

    if (existing.rows.length > 0 && existing.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Esta foto já foi comprada' });
    }

    // Aplica desconto de pré-venda se a janela está ativa.
    const now = new Date();
    const presaleActive = photo.presale_starts_at && photo.presale_ends_at &&
      now >= new Date(photo.presale_starts_at) && now <= new Date(photo.presale_ends_at);
    const presaleRate = presaleActive ? Math.max(0, Math.min(0.9, parseFloat(photo.presale_discount_rate) || 0)) : 0;
    const effectivePrice = round2(Number(photo.price) * (1 - presaleRate));

    const pricing = computePricing(effectivePrice);
    pricing.presaleDiscountRate = presaleRate;
    pricing.originalPrice = round2(Number(photo.price));

    let paymentData;
    if (paymentMethod === 'pix') {
      paymentData = createPixIntent(pricing, {
        type: 'photo',
        itemId: String(photo_id),
        userId: String(userId)
      });
    } else {
      const paymentIntent = await createPaymentIntent(pricing, {
        type: 'photo',
        itemId: String(photo_id),
        userId: String(userId)
      });
      paymentData = {
        id: paymentIntent.id,
        method: 'card',
        clientSecret: paymentIntent.client_secret
      };
    }

    const purchase = await db.query(
      `INSERT INTO photo_purchases
         (user_id, photo_id, status, price, commission_rate, commission_amount, photographer_payout, transaction_id, purchase_date)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, photo_id) DO UPDATE SET
         status = 'pending',
         price = EXCLUDED.price,
         commission_rate = EXCLUDED.commission_rate,
         commission_amount = EXCLUDED.commission_amount,
         photographer_payout = EXCLUDED.photographer_payout,
         transaction_id = EXCLUDED.transaction_id,
         purchase_date = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, photo_id, pricing.price, pricing.commissionRate, pricing.commission, pricing.photographerPayout, paymentData.id]
    );

    res.status(201).json({
      purchaseId: purchase.rows[0].id,
      paymentMethod,
      payment: paymentData,
      pricing
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Confirma a compra de uma foto após o pagamento (Stripe ou Pix).
router.post('/photos/:photo_id/confirm', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const { paymentMethod = 'card' } = req.body;
    const userId = req.user.userId;

    const purchaseResult = await db.query(
      `SELECT pp.*, g.photographer_id
       FROM photo_purchases pp
       JOIN photos p ON pp.photo_id = p.id
       JOIN galleries g ON p.gallery_id = g.id
       WHERE pp.user_id = $1 AND pp.photo_id = $2`,
      [userId, photo_id]
    );

    if (purchaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Compra não encontrada. Inicie o checkout primeiro.' });
    }

    const purchase = purchaseResult.rows[0];

    if (purchase.status === 'completed') {
      return res.json({ status: 'completed', purchase });
    }

    // Pix: em produção, validar via webhook do PSP. Em dev, aceita confirmação manual.
    if (paymentMethod !== 'pix') {
      const paymentIntent = await stripe.paymentIntents.retrieve(purchase.transaction_id);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(402).json({
          error: 'Pagamento ainda não foi concluído',
          paymentStatus: paymentIntent.status
        });
      }
    }

    const completed = await db.query(
      `UPDATE photo_purchases
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [purchase.id]
    );

    // Repasse: o fotógrafo recebe 93%; a plataforma retém os 7% de comissão.
    await db.query(
      `UPDATE photographers
       SET total_sales = total_sales + 1,
           total_earnings = total_earnings + $2,
           updated_at = NOW()
       WHERE id = $1`,
      [purchase.photographer_id, purchase.photographer_payout]
    );

    // Rastrear comissão de afiliado se o cliente foi referido
    try {
      const referralResult = await db.query(
        `SELECT rc.id as referral_code_id, rc.commission_rate, ar.photographer_id as affiliate_photographer_id
         FROM affiliate_referrals ar
         JOIN referral_codes rc ON ar.referral_code_id = rc.id
         WHERE ar.customer_id = $1
         LIMIT 1`,
        [userId]
      );

      if (referralResult.rows.length > 0) {
        const referral = referralResult.rows[0];
        const commissionAmount = Math.round(purchase.price * referral.commission_rate * 100) / 100;

        await db.query(
          `INSERT INTO affiliate_commissions 
           (photographer_id, referral_code_id, photo_purchase_id, commission_amount, commission_rate, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [referral.affiliate_photographer_id, referral.referral_code_id, purchase.id, commissionAmount, referral.commission_rate]
        );
      }
    } catch (affiliateError) {
      console.error('Erro ao registrar comissão de afiliado:', affiliateError);
    }

    cachePattern(`GET:*/api/photos/${photo_id}*`);
    res.json({ status: 'completed', purchase: completed.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// VÍDEOS
// ---------------------------------------------------------------------------

// POST: Inicia a compra de um vídeo (checkout).
router.post('/videos/:video_id', authenticate, async (req, res) => {
  try {
    const { video_id } = req.params;
    const userId = req.user.userId;

    const videoResult = await db.query(
      `SELECT v.id, v.price, g.photographer_id
       FROM videos v
       JOIN galleries g ON v.gallery_id = g.id
       WHERE v.id = $1`,
      [video_id]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    const video = videoResult.rows[0];

    if (video.price == null || Number(video.price) <= 0) {
      return res.status(400).json({ error: 'Este vídeo não está à venda' });
    }

    const existing = await db.query(
      'SELECT id, status FROM video_purchases WHERE user_id = $1 AND video_id = $2',
      [userId, video_id]
    );

    if (existing.rows.length > 0 && existing.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Este vídeo já foi comprado' });
    }

    const pricing = computePricing(video.price);

    const paymentIntent = await createPaymentIntent(pricing, {
      type: 'video',
      itemId: String(video_id),
      userId: String(userId)
    });

    const purchase = await db.query(
      `INSERT INTO video_purchases
         (user_id, video_id, status, price, commission_rate, commission_amount, photographer_payout, transaction_id, purchase_date)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, video_id) DO UPDATE SET
         status = 'pending',
         price = EXCLUDED.price,
         commission_rate = EXCLUDED.commission_rate,
         commission_amount = EXCLUDED.commission_amount,
         photographer_payout = EXCLUDED.photographer_payout,
         transaction_id = EXCLUDED.transaction_id,
         purchase_date = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, video_id, pricing.price, pricing.commissionRate, pricing.commission, pricing.photographerPayout, paymentIntent.id]
    );

    res.status(201).json({
      purchaseId: purchase.rows[0].id,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      pricing
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Confirma a compra de um vídeo após o pagamento ser aprovado.
router.post('/videos/:video_id/confirm', authenticate, async (req, res) => {
  try {
    const { video_id } = req.params;
    const userId = req.user.userId;

    const purchaseResult = await db.query(
      `SELECT vp.*, g.photographer_id
       FROM video_purchases vp
       JOIN videos v ON vp.video_id = v.id
       JOIN galleries g ON v.gallery_id = g.id
       WHERE vp.user_id = $1 AND vp.video_id = $2`,
      [userId, video_id]
    );

    if (purchaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Compra não encontrada. Inicie o checkout primeiro.' });
    }

    const purchase = purchaseResult.rows[0];

    if (purchase.status === 'completed') {
      return res.json({ status: 'completed', purchase });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(purchase.transaction_id);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(402).json({
        error: 'Pagamento ainda não foi concluído',
        paymentStatus: paymentIntent.status
      });
    }

    const completed = await db.query(
      `UPDATE video_purchases
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [purchase.id]
    );

    await db.query(
      `UPDATE photographers
       SET total_sales = total_sales + 1,
           total_earnings = total_earnings + $2,
           updated_at = NOW()
       WHERE id = $1`,
      [purchase.photographer_id, purchase.photographer_payout]
    );

    // Rastrear comissão de afiliado se o cliente foi referido
    try {
      const referralResult = await db.query(
        `SELECT rc.id as referral_code_id, rc.commission_rate, ar.photographer_id as affiliate_photographer_id
         FROM affiliate_referrals ar
         JOIN referral_codes rc ON ar.referral_code_id = rc.id
         WHERE ar.customer_id = $1
         LIMIT 1`,
        [userId]
      );

      if (referralResult.rows.length > 0) {
        const referral = referralResult.rows[0];
        const commissionAmount = Math.round(purchase.price * referral.commission_rate * 100) / 100;

        await db.query(
          `INSERT INTO affiliate_commissions 
           (photographer_id, referral_code_id, video_purchase_id, commission_amount, commission_rate, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [referral.affiliate_photographer_id, referral.referral_code_id, purchase.id, commissionAmount, referral.commission_rate]
        );
      }
    } catch (affiliateError) {
      console.error('Erro ao registrar comissão de afiliado:', affiliateError);
    }

    cachePattern(`GET:*/api/videos/${video_id}*`);
    res.json({ status: 'completed', purchase: completed.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// CONSULTAS
// ---------------------------------------------------------------------------

// GET: Verifica se o usuário já comprou (e concluiu o pagamento de) uma foto.
router.get('/photos/:photo_id/status', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, status, purchase_date, completed_at, price
       FROM photo_purchases
       WHERE user_id = $1 AND photo_id = $2`,
      [userId, photo_id]
    );

    const purchase = result.rows[0] || null;
    res.json({
      purchased: !!purchase && purchase.status === 'completed',
      status: purchase ? purchase.status : null,
      purchase
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Verifica se o usuário já comprou (e concluiu o pagamento de) um vídeo.
router.get('/videos/:video_id/status', authenticate, async (req, res) => {
  try {
    const { video_id } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT id, status, purchase_date, completed_at, price
       FROM video_purchases
       WHERE user_id = $1 AND video_id = $2`,
      [userId, video_id]
    );

    const purchase = result.rows[0] || null;
    res.json({
      purchased: !!purchase && purchase.status === 'completed',
      status: purchase ? purchase.status : null,
      purchase
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Lista as fotos compradas pelo usuário.
router.get('/photos', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT pp.id, pp.photo_id, pp.purchase_date, pp.completed_at, pp.price,
              pp.commission_amount, pp.photographer_payout,
              p.thumbnail_url, p.width, p.height,
              g.id as gallery_id, g.title as gallery_title,
              COUNT(*) OVER() as total
       FROM photo_purchases pp
       JOIN photos p ON pp.photo_id = p.id
       JOIN galleries g ON p.gallery_id = g.id
       WHERE pp.user_id = $1 AND pp.status = 'completed'
       ORDER BY pp.completed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total) : 0;

    res.json({
      photos: result.rows.map(({ total, ...p }) => p),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Lista os vídeos comprados pelo usuário.
router.get('/videos', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT vp.id, vp.video_id, vp.purchase_date, vp.completed_at, vp.price,
              vp.commission_amount, vp.photographer_payout,
              v.thumbnail_url, v.width, v.height, v.duration,
              g.id as gallery_id, g.title as gallery_title,
              COUNT(*) OVER() as total
       FROM video_purchases vp
       JOIN videos v ON vp.video_id = v.id
       JOIN galleries g ON v.gallery_id = g.id
       WHERE vp.user_id = $1 AND vp.status = 'completed'
       ORDER BY vp.completed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
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

module.exports = router;
