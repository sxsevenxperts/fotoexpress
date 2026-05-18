const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

console.log('✅ Stories route module loaded');
console.log('✅ authenticate middleware:', typeof authenticate);

// Get user's stories
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      'SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({ stories: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórias' });
  }
});

// Get single story
router.get('/:storyId', authenticate, async (req, res) => {
  try {
    const { storyId } = req.params;
    const result = await db.query(
      'SELECT * FROM stories WHERE id = $1 AND user_id = $2',
      [storyId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'História não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar história' });
  }
});

// Create new story (async generation)
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      photo_ids,
      gallery_id,
      transition_type = 'fade',
      duration_per_photo = 3.0
    } = req.body;

    if (!photo_ids || photo_ids.length === 0) {
      return res.status(400).json({ error: 'Forneça pelo menos uma foto' });
    }

    // Verify user owns/purchased the photos
    const photoCheckResult = await db.query(
      `SELECT DISTINCT photo_id FROM photo_purchases
       WHERE user_id = $1 AND photo_id = ANY($2)`,
      [userId, photo_ids.map(id => parseInt(id))]
    );

    if (photoCheckResult.rows.length !== photo_ids.length) {
      return res.status(403).json({ error: 'Você não possui todas as fotos selecionadas' });
    }

    // Calculate total duration
    const total_duration = photo_ids.length * duration_per_photo;

    // Create story record
    const result = await db.query(
      `INSERT INTO stories (user_id, gallery_id, title, description, photo_ids, transition_type, duration_per_photo, total_duration_seconds, cover_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT url FROM photos WHERE id = $9 LIMIT 1))
       RETURNING *`,
      [
        userId,
        gallery_id || null,
        title || 'Minha História',
        description || '',
        JSON.stringify(photo_ids),
        transition_type,
        duration_per_photo,
        total_duration,
        photo_ids[0]
      ]
    );

    const storyId = result.rows[0].id;

    // Create generation job
    await db.query(
      'INSERT INTO story_generation_jobs (story_id, status) VALUES ($1, $2)',
      [storyId, 'queued']
    );

    // Trigger async generation (in production, would queue to job processor)
    generateStoryAsync(storyId, userId, photo_ids, result.rows[0]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar história' });
  }
});

// Update story
router.put('/:storyId', authenticate, async (req, res) => {
  try {
    const { storyId } = req.params;
    const { title, description } = req.body;

    const result = await db.query(
      'UPDATE stories SET title = COALESCE($1, title), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
      [title, description, storyId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'História não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar história' });
  }
});

// Delete story
router.delete('/:storyId', authenticate, async (req, res) => {
  try {
    const { storyId } = req.params;

    const result = await db.query(
      'DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id',
      [storyId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'História não encontrada' });
    }

    res.json({ message: 'História deletada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar história' });
  }
});

// Async story generation (simplified - in production would use FFmpeg with proper queuing)
async function generateStoryAsync(storyId, userId, photoIds, storyData) {
  try {
    // Update job status
    await db.query(
      'UPDATE story_generation_jobs SET status = $1, started_at = NOW() WHERE story_id = $2',
      ['processing', storyId]
    );

    // TODO: Implement FFmpeg video generation
    // For now, simulating successful generation
    const mockVideoUrl = `/uploads/stories/story-${storyId}-${Date.now()}.mp4`;

    // Update story with video URL
    await db.query(
      'UPDATE stories SET status = $1, video_url = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3',
      ['completed', mockVideoUrl, storyId]
    );

    // Update job status
    await db.query(
      'UPDATE story_generation_jobs SET status = $1, progress = 100, completed_at = NOW() WHERE story_id = $2',
      ['completed', storyId]
    );
  } catch (err) {
    console.error('Error generating story:', err);

    // Update error status
    await db.query(
      'UPDATE stories SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
      ['failed', err.message, storyId]
    );

    await db.query(
      'UPDATE story_generation_jobs SET status = $1, error_message = $2, retry_count = retry_count + 1 WHERE story_id = $3',
      ['failed', err.message, storyId]
    );
  }
}

module.exports = router;
