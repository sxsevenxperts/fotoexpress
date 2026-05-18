const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { withCache, cachePattern } = require('../middleware/redis');

router.get('/categories', withCache(300), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM event_categories WHERE is_active = true ORDER BY display_order ASC, name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/categories/:id', withCache(600), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM event_categories WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authenticate, withCache(60), async (req, res) => {
  try {
    const { page = 1, limit = 12, status, photographer_id } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.userId;

    let query = `
      SELECT e.*, u.first_name, u.last_name, u.avatar_url,
             ec.name as category_name,
             COUNT(*) OVER() as total
      FROM events e
      JOIN users u ON e.user_id = u.id
      JOIN event_categories ec ON e.category_id = ec.id
      WHERE 1=1
    `;
    const params = [];

    if (photographer_id) {
      query += ` AND e.photographer_id = $${params.length + 1}`;
      params.push(photographer_id);
    } else {
      query += ` AND e.user_id = $${params.length + 1}`;
      params.push(userId);
    }

    if (status) {
      query += ` AND e.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY e.event_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const events = await db.query(query, params);
    const total = events.rows.length > 0 ? parseInt(events.rows[0].total) : 0;

    res.json({
      events: events.rows.map(({ total, ...e }) => e),
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, withCache(600), async (req, res) => {
  try {
    const { id } = req.params;

    const event = await db.query(
      `SELECT e.*, u.first_name, u.last_name, u.email, u.phone,
              ec.name as category_name, ph.id as photographer_id, pu.first_name as photographer_name
       FROM events e
       JOIN users u ON e.user_id = u.id
       JOIN event_categories ec ON e.category_id = ec.id
       LEFT JOIN photographers ph ON e.photographer_id = ph.id
       LEFT JOIN users pu ON ph.user_id = pu.id
       WHERE e.id = $1`,
      [id]
    );

    if (event.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    res.json(event.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { category_id, event_date, event_location, title, description, budget } = req.body;
    const userId = req.user.userId;

    if (!category_id || !event_date || !event_location || !title) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const result = await db.query(
      `INSERT INTO events (user_id, category_id, event_date, event_location, title, description, budget, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
       RETURNING *`,
      [userId, category_id, event_date, event_location, title, description, budget]
    );

    cachePattern('GET:/api/events*');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { event_date, event_location, title, description, budget } = req.body;
    const userId = req.user.userId;

    const event = await db.query(
      'SELECT user_id FROM events WHERE id = $1',
      [id]
    );

    if (event.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (event.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updates = ['updated_at = NOW()'];
    const params = [id];
    let paramCount = 1;

    if (event_date) {
      paramCount++;
      updates.push(`event_date = $${paramCount}`);
      params.push(event_date);
    }
    if (event_location) {
      paramCount++;
      updates.push(`event_location = $${paramCount}`);
      params.push(event_location);
    }
    if (title) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      params.push(title);
    }
    if (description) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }
    if (budget) {
      paramCount++;
      updates.push(`budget = $${paramCount}`);
      params.push(budget);
    }

    const query = `UPDATE events SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);

    cachePattern('GET:/api/events*');
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const event = await db.query(
      'SELECT user_id, status FROM events WHERE id = $1',
      [id]
    );

    if (event.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    if (event.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (event.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Apenas eventos pendentes podem ser deletados' });
    }

    await db.query('DELETE FROM events WHERE id = $1', [id]);

    cachePattern('GET:/api/events*');
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
