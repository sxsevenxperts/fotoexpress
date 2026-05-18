const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Generate unique referral code
function generateReferralCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase().substring(0, 12);
}

// Create new referral code for photographer
router.post('/codes', authenticate, async (req, res) => {
  try {
    const { commission_rate = 0.1, max_uses, expires_at } = req.body;
    const userId = req.user.id;

    // Verify user is photographer
    const photographer = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (!photographer.rows.length) {
      return res.status(403).json({ error: 'Apenas fotógrafos podem criar códigos de afiliado' });
    }

    const code = generateReferralCode();
    const photographerId = photographer.rows[0].id;

    const result = await db.query(
      `INSERT INTO referral_codes 
       (photographer_id, code, commission_rate, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, commission_rate, max_uses, expires_at, created_at`,
      [photographerId, code, commission_rate, max_uses, expires_at]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar código de referência' });
  }
});

// List photographer's referral codes
router.get('/codes', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const photographer = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (!photographer.rows.length) {
      return res.status(403).json({ error: 'Apenas fotógrafos podem acessar códigos de afiliado' });
    }

    const codes = await db.query(
      `SELECT id, code, commission_rate, is_active, uses_count, max_uses, 
              expires_at, created_at
       FROM referral_codes
       WHERE photographer_id = $1
       ORDER BY created_at DESC`,
      [photographer.rows[0].id]
    );

    res.json({ codes: codes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar códigos de referência' });
  }
});

// Deactivate referral code
router.put('/codes/:codeId/deactivate', authenticate, async (req, res) => {
  try {
    const { codeId } = req.params;
    const userId = req.user.id;

    const photographer = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (!photographer.rows.length) {
      return res.status(403).json({ error: 'Apenas fotógrafos podem gerenciar códigos' });
    }

    // Verify code belongs to photographer
    const codeCheck = await db.query(
      'SELECT id FROM referral_codes WHERE id = $1 AND photographer_id = $2',
      [codeId, photographer.rows[0].id]
    );

    if (!codeCheck.rows.length) {
      return res.status(404).json({ error: 'Código não encontrado' });
    }

    await db.query(
      'UPDATE referral_codes SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [codeId]
    );

    res.json({ message: 'Código desativado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao desativar código' });
  }
});

// Get affiliate statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const photographer = await db.query(
      'SELECT id FROM photographers WHERE user_id = $1',
      [userId]
    );

    if (!photographer.rows.length) {
      return res.status(403).json({ error: 'Apenas fotógrafos podem acessar estatísticas' });
    }

    const photographerId = photographer.rows[0].id;

    // Get commission stats
    const stats = await db.query(
      `SELECT 
        COUNT(DISTINCT ac.id) as total_commissions,
        COALESCE(SUM(ac.commission_amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN ac.status = 'pending' THEN ac.commission_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN ac.status = 'paid' THEN ac.commission_amount ELSE 0 END), 0) as paid_amount,
        COUNT(DISTINCT ar.customer_id) as referred_customers
       FROM affiliate_commissions ac
       LEFT JOIN affiliate_referrals ar ON ar.referral_code_id = ac.referral_code_id
       WHERE ac.photographer_id = $1`,
      [photographerId]
    );

    // Get referral code stats
    const codeStats = await db.query(
      `SELECT 
        code,
        uses_count,
        max_uses,
        commission_rate,
        is_active,
        COUNT(DISTINCT ar.customer_id) as unique_customers,
        COALESCE(SUM(ac.commission_amount), 0) as earnings
       FROM referral_codes rc
       LEFT JOIN affiliate_referrals ar ON ar.referral_code_id = rc.id
       LEFT JOIN affiliate_commissions ac ON ac.referral_code_id = rc.id
       WHERE rc.photographer_id = $1
       GROUP BY rc.id
       ORDER BY rc.created_at DESC`,
      [photographerId]
    );

    res.json({
      summary: stats.rows[0],
      codes: codeStats.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas de afiliados' });
  }
});

// Register customer with referral code (called at signup)
router.post('/register', authenticate, async (req, res) => {
  try {
    const { referral_code } = req.body;
    const userId = req.user.id;

    if (!referral_code) {
      return res.json({ registered: false });
    }

    // Find referral code
    const codeResult = await db.query(
      `SELECT id, photographer_id, commission_rate, uses_count, max_uses, expires_at, is_active
       FROM referral_codes
       WHERE code = $1`,
      [referral_code.toUpperCase()]
    );

    if (!codeResult.rows.length) {
      return res.status(404).json({ error: 'Código de referência inválido' });
    }

    const code = codeResult.rows[0];

    // Validate code
    if (!code.is_active) {
      return res.status(400).json({ error: 'Código de referência inativo' });
    }

    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Código de referência expirado' });
    }

    if (code.max_uses && code.uses_count >= code.max_uses) {
      return res.status(400).json({ error: 'Código de referência atingiu limite de usos' });
    }

    // Check if customer already registered with this code
    const existingReferral = await db.query(
      'SELECT id FROM affiliate_referrals WHERE referral_code_id = $1 AND customer_id = $2',
      [code.id, userId]
    );

    if (existingReferral.rows.length) {
      return res.json({ registered: true });
    }

    // Register referral
    await db.query(
      `INSERT INTO affiliate_referrals (referral_code_id, photographer_id, customer_id)
       VALUES ($1, $2, $3)`,
      [code.id, code.photographer_id, userId]
    );

    // Increment uses count
    await db.query(
      'UPDATE referral_codes SET uses_count = uses_count + 1 WHERE id = $1',
      [code.id]
    );

    res.json({ registered: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar código de referência' });
  }
});

module.exports = router;
