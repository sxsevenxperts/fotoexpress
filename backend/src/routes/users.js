const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');
const bcrypt = require('bcryptjs');

router.get('/profile', authenticate, withCache(120), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, phone, avatar_url, bio, location, role, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, phone, bio, location, avatar_url } = req.body;

    const result = await db.query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           bio = COALESCE($4, bio),
           location = COALESCE($5, location),
           avatar_url = COALESCE($6, avatar_url),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, first_name, last_name, phone, avatar_url, bio, location, role`,
      [first_name, last_name, phone, bio, location, avatar_url, req.user.userId]
    );

    cachePattern(`GET:/api/users/profile*`);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova são obrigatórias' });
    }

    const user = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.userId]
    );

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.query(
      `SELECT id, first_name, last_name, avatar_url, bio, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authenticate, withCache(300), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { page = 1, limit = 20, role, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, email, first_name, last_name, role, created_at,
             COUNT(*) OVER() as total
      FROM users WHERE 1=1
    `;
    const params = [];

    if (role) {
      query += ` AND role = $${params.length + 1}`;
      params.push(role);
    }

    if (search) {
      query += ` AND (first_name ILIKE $${params.length + 1} OR last_name ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const users = await db.query(query, params);
    const total = users.rows.length > 0 ? parseInt(users.rows[0].total) : 0;

    res.json({
      users: users.rows.map(({ total, ...u }) => u),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
