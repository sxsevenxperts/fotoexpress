const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const { photographer_id, event_category_id } = req.query;
    let query = 'SELECT * FROM galleries WHERE 1=1';
    const params = [];

    if (photographer_id) {
      query += ' AND photographer_id = $' + (params.length + 1);
      params.push(photographer_id);
    }

    if (event_category_id) {
      query += ' AND event_category_id = $' + (params.length + 1);
      params.push(event_category_id);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM galleries WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gallery not found' });
    }

    const photos = await pool.query('SELECT * FROM photos WHERE gallery_id = $1', [req.params.id]);
    res.json({ ...result.rows[0], photos: photos.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, event_category_id, thumbnail_url } = req.body;

    const result = await pool.query(
      'INSERT INTO galleries (photographer_id, title, description, event_category_id, thumbnail_url) VALUES ((SELECT id FROM photographers WHERE user_id = $1), $2, $3, $4, $5) RETURNING *',
      [req.user.id, title, description, event_category_id, thumbnail_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
