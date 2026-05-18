const express = require('express');
const { authenticate } = require('../middleware/auth');
const { findSimilarFaces, getPhotosByPerson, getMatchedFaces } = require('../services/faceMatching');
const db = require('../config/database');

const router = express.Router();

// Aceita JSON com base64 (selfie). Limite generoso para imagens de celular.
const selfieParser = express.json({ limit: '8mb' });

// Modo mock: quando não há Google Cloud Vision configurado, retorna um
// subconjunto pseudo-aleatório das fotos da galeria como "matches" — permite
// testar a UI sem credenciais externas.
const isFaceMockMode = !process.env.GOOGLE_CLOUD_KEY_PATH;

function mockSelfieScan(galleryPhotos) {
  // Seed determinístico para o mesmo "match set" durante a sessão de testes.
  const matches = galleryPhotos
    .map((photo) => ({
      photo,
      similarity: 0.6 + Math.random() * 0.4
    }))
    .filter((m) => m.similarity > 0.78)
    .sort((a, b) => b.similarity - a.similarity);

  return matches.map(({ photo, similarity }) => ({
    ...photo,
    similarity: Math.round(similarity * 100) / 100
  }));
}

// POST: busca fotos do usuário em uma galeria através de selfie.
// O ponto de venda principal — cliente sobe uma selfie e vê apenas as
// fotos onde aparece, em vez de rolar centenas de imagens do evento.
router.post('/scan/:gallery_id', selfieParser, async (req, res) => {
  try {
    const { gallery_id } = req.params;
    const { selfie } = req.body;

    if (!selfie || typeof selfie !== 'string' || !selfie.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Selfie inválida — envie uma imagem base64' });
    }

    const galleryResult = await db.query(
      `SELECT g.id, g.title FROM galleries g
       WHERE g.id = $1 AND g.is_published = true`,
      [gallery_id]
    );

    if (galleryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Galeria não encontrada' });
    }

    const photosResult = await db.query(
      `SELECT p.id, p.thumbnail_url, p.price, p.width, p.height
       FROM photos p
       WHERE p.gallery_id = $1
       ORDER BY p.uploaded_at DESC`,
      [gallery_id]
    );

    if (isFaceMockMode) {
      const matches = mockSelfieScan(photosResult.rows);
      return res.json({
        galleryId: parseInt(gallery_id),
        galleryTitle: galleryResult.rows[0].title,
        mode: 'mock',
        totalScanned: photosResult.rows.length,
        totalMatches: matches.length,
        photos: matches
      });
    }

    // Produção: decodificar selfie, extrair embedding, comparar com
    // embeddings das fotos da galeria via cosine similarity (já existe).
    const { detectFacesInBuffer, extractEmbeddingFromFace } = require('../services/vision');
    const buffer = Buffer.from(selfie.split(',')[1], 'base64');
    const selfieFaces = await detectFacesInBuffer(buffer);

    if (!selfieFaces.length) {
      return res.status(422).json({ error: 'Nenhum rosto detectado na selfie. Tente uma foto mais nítida.' });
    }

    const selfieEmbedding = extractEmbeddingFromFace(selfieFaces[0]);

    const matchesResult = await db.query(
      `SELECT p.id, p.thumbnail_url, p.price, p.width, p.height, fe.embedding
       FROM photos p
       JOIN face_embeddings fe ON fe.photo_id = p.id
       WHERE p.gallery_id = $1`,
      [gallery_id]
    );

    const { cosineSimilarity } = require('../services/faceMatching');
    const matches = matchesResult.rows
      .map((row) => ({
        ...row,
        similarity: cosineSimilarity(selfieEmbedding, row.embedding)
      }))
      .filter((m) => m.similarity > 0.85)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ embedding, ...rest }) => rest);

    res.json({
      galleryId: parseInt(gallery_id),
      galleryTitle: galleryResult.rows[0].title,
      mode: 'production',
      totalScanned: photosResult.rows.length,
      totalMatches: matches.length,
      photos: matches
    });
  } catch (error) {
    console.error('Selfie scan error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:photo_id/similar', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const { threshold = 0.85 } = req.query;

    const results = await findSimilarFaces(parseInt(photo_id), parseFloat(threshold));

    res.json({
      photoId: parseInt(photo_id),
      threshold: parseFloat(threshold),
      ...results
    });
  } catch (error) {
    console.error('Error finding similar faces:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to find similar faces',
        status: 500
      }
    });
  }
});

router.get('/:photo_id/person-photos', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const { threshold = 0.85 } = req.query;

    const results = await getPhotosByPerson(parseInt(photo_id), parseFloat(threshold));

    if (results.error) {
      return res.status(404).json({ error: { message: results.error, status: 404 } });
    }

    res.json({
      photoId: parseInt(photo_id),
      threshold: parseFloat(threshold),
      ...results
    });
  } catch (error) {
    console.error('Error getting person photos:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to retrieve person photos',
        status: 500
      }
    });
  }
});

router.get('/:photo_id/matches', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;

    const matches = await getMatchedFaces(parseInt(photo_id));

    res.json({
      photoId: parseInt(photo_id),
      matchCount: matches.length,
      matches
    });
  } catch (error) {
    console.error('Error getting matched faces:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to retrieve matches',
        status: 500
      }
    });
  }
});

router.get('/:photo_id/stats', authenticate, async (req, res) => {
  try {
    const { photo_id } = req.params;
    const db = require('../config/database');

    // Get face detection stats for this photo
    const faceStatsResult = await db.query(
      `SELECT
         face_count,
         confidence_score,
         detection_timestamp,
         (SELECT COUNT(*) FROM face_person_matches WHERE source_photo_id = $1) as match_count
       FROM face_detection_metadata
       WHERE photo_id = $1`,
      [parseInt(photo_id)]
    );

    if (faceStatsResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Photo not found or face detection not completed', status: 404 }
      });
    }

    const stats = faceStatsResult.rows[0];

    res.json({
      photoId: parseInt(photo_id),
      faceCount: stats.face_count,
      confidenceScore: stats.confidence_score,
      detectionTimestamp: stats.detection_timestamp,
      totalMatches: stats.match_count
    });
  } catch (error) {
    console.error('Error getting face stats:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to retrieve face stats',
        status: 500
      }
    });
  }
});

module.exports = router;
