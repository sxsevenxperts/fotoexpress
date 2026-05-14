const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// Get all photographers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name, u.email, u.avatar_url
      FROM photographers p
      JOIN users u ON p.user_id = u.id
      WHERE p.verified = TRUE
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get photographer by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name, u.email, u.avatar_url, u.phone, u.location
      FROM photographers p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photographer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create photographer profile
router.post('/', authenticate, async (req, res) => {
  try {
    const { experience_years, bio, hourly_rate } = req.body;

    const result = await pool.query(
      'INSERT INTO photographers (user_id, experience_years, bio, hourly_rate) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, experience_years, bio, hourly_rate]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update photographer profile
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { bio, experience_years, hourly_rate, availability_status } = req.body;

    const result = await pool.query(
      `UPDATE photographers
       SET bio = $1, experience_years = $2, hourly_rate = $3, availability_status = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [bio, experience_years, hourly_rate, availability_status, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photographer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
