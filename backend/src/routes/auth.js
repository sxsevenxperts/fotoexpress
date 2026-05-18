const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role, referral_code } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, email, first_name, last_name, role`,
      [email, hashedPassword, first_name, last_name, phone, role || 'customer']
    );

    const user = result.rows[0];

    if (referral_code) {
      try {
        const codeResult = await db.query(
          `SELECT id FROM referral_codes WHERE code = $1 AND is_active = true 
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR uses_count < max_uses)`,
          [referral_code]
        );

        if (codeResult.rows.length > 0) {
          const refCodeId = codeResult.rows[0].id;
          const codePhotographer = await db.query(
            'SELECT photographer_id FROM referral_codes WHERE id = $1',
            [refCodeId]
          );

          if (codePhotographer.rows.length > 0) {
            await db.query(
              `INSERT INTO affiliate_referrals (referral_code_id, photographer_id, customer_id, used_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (referral_code_id, customer_id) DO NOTHING`,
              [refCodeId, codePhotographer.rows[0].photographer_id, user.id]
            );

            await db.query(
              'UPDATE referral_codes SET uses_count = uses_count + 1 WHERE id = $1',
              [refCodeId]
            );
          }
        }
      } catch (affiliateError) {
        console.error('Erro ao registrar referral:', affiliateError);
      }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      user,
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }

    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify', authenticate, async (req, res) => {
  try {
    const user = await db.query(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      user: user.rows[0],
      valid: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
