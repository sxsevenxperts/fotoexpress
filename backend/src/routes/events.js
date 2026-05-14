const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM event_categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM event_categories WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories/:id/photographers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT p.*, u.name, u.avatar_url
      FROM photographers p
      JOIN users u ON p.user_id = u.id
      JOIN photographer_specialties ps ON p.id = ps.photographer_id
      WHERE ps.event_category_id = $1 AND p.verified = TRUE
      ORDER BY p.rating DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
