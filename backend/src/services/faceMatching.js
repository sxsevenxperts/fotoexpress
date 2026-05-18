const db = require('../config/database');

// Cosine similarity between two embedding vectors
function cosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

// Euclidean distance between two embeddings (0-1 scale, inverted for similarity)
function euclideanSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let sumSquaredDiff = 0;
  for (let i = 0; i < embedding1.length; i++) {
    const diff = embedding1[i] - embedding2[i];
    sumSquaredDiff += diff * diff;
  }

  const distance = Math.sqrt(sumSquaredDiff);
  // Convert distance to 0-1 similarity score (smaller distance = higher similarity)
  // Using sigmoid-like function: 1 / (1 + distance)
  return 1 / (1 + distance);
}

async function findSimilarFaces(photoId, similarityThreshold = 0.85) {
  try {
    // Get source photo face data and embeddings
    const sourceResult = await db.query(
      `SELECT face_embeddings, face_count, confidence_score
       FROM face_detection_metadata
       WHERE photo_id = $1`,
      [photoId]
    );

    if (sourceResult.rows.length === 0) {
      return { matches: [], photoId };
    }

    const sourceData = sourceResult.rows[0];
    const sourceEmbeddings = sourceData.face_embeddings || [];
    const sourceConfidence = sourceData.confidence_score;

    // Only match if source photo has sufficient confidence
    if (sourceConfidence < 0.5) {
      return { matches: [], photoId, reason: 'source_confidence_too_low' };
    }

    // Get all other photos with face data
    const allPhotosResult = await db.query(
      `SELECT p.id, p.gallery_id, f.face_embeddings, f.confidence_score
       FROM face_detection_metadata f
       JOIN photos p ON f.photo_id = p.id
       WHERE f.photo_id != $1 AND f.face_embeddings IS NOT NULL
       AND f.confidence_score >= 0.5
       ORDER BY p.uploaded_at DESC`,
      [photoId]
    );

    const matches = [];

    // Compare each face in source photo with each face in other photos
    for (let sourceIdx = 0; sourceIdx < sourceEmbeddings.length; sourceIdx++) {
      const sourceEmbedding = sourceEmbeddings[sourceIdx];
      if (!sourceEmbedding) continue;

      for (const otherPhoto of allPhotosResult.rows) {
        const otherEmbeddings = otherPhoto.face_embeddings || [];

        for (let matchIdx = 0; matchIdx < otherEmbeddings.length; matchIdx++) {
          const matchEmbedding = otherEmbeddings[matchIdx];
          if (!matchEmbedding) continue;

          // Calculate similarity using cosine similarity
          const similarity = cosineSimilarity(sourceEmbedding, matchEmbedding);

          // Check confidence product (both faces must be confident)
          const confidenceProduct = sourceData.confidence_score * otherPhoto.confidence_score;

          // Final score: weighted combination
          const finalScore = (similarity * 0.7) + (confidenceProduct * 0.3);

          if (finalScore >= similarityThreshold) {
            matches.push({
              matchPhotoId: otherPhoto.id,
              galleryId: otherPhoto.gallery_id,
              similarity: Math.round(similarity * 1000) / 1000,
              confidenceProduct: Math.round(confidenceProduct * 1000) / 1000,
              finalScore: Math.round(finalScore * 1000) / 1000,
              sourceFaceIndex: sourceIdx,
              matchFaceIndex: matchIdx
            });

            // Store match in database
            await db.query(
              `INSERT INTO face_person_matches
               (source_photo_id, match_photo_id, similarity_score, source_face_index, match_face_index)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [photoId, otherPhoto.id, finalScore, sourceIdx, matchIdx]
            );
          }
        }
      }
    }

    // Sort by final score (highest first)
    matches.sort((a, b) => b.finalScore - a.finalScore);

    return {
      photoId,
      sourceConfidence: Math.round(sourceConfidence * 1000) / 1000,
      matchCount: matches.length,
      matches: matches.slice(0, 50) // Return top 50 matches
    };
  } catch (error) {
    console.error('Error finding similar faces:', error);
    throw new Error(`Face matching failed: ${error.message}`);
  }
}

async function getPhotosByPerson(photoId, similarityThreshold = 0.85) {
  try {
    // Get the source photo info (file_url nunca é exposto na resposta da API)
    const photoResult = await db.query(
      `SELECT id, gallery_id, thumbnail_url, price, uploaded_at
       FROM photos WHERE id = $1`,
      [photoId]
    );

    if (photoResult.rows.length === 0) {
      return { error: 'Photo not found' };
    }

    const sourcePhoto = photoResult.rows[0];

    // Find similar faces
    const matchResults = await findSimilarFaces(photoId, similarityThreshold);

    // Get full photo details for matches
    if (matchResults.matches.length === 0) {
      return {
        sourcePhoto,
        totalMatches: 0,
        matches: []
      };
    }

    const matchPhotoIds = matchResults.matches.map(m => m.matchPhotoId);

    const matchPhotosResult = await db.query(
      `SELECT
         p.id, p.gallery_id, p.thumbnail_url,
         p.width, p.height, p.price, p.uploaded_at, g.title as gallery_title,
         fdm.face_count
       FROM photos p
       JOIN galleries g ON p.gallery_id = g.id
       LEFT JOIN face_detection_metadata fdm ON p.id = fdm.photo_id
       WHERE p.id = ANY($1)
       ORDER BY p.uploaded_at DESC`,
      [matchPhotoIds]
    );

    // Enrich with similarity scores from matchResults
    const enrichedMatches = matchPhotosResult.rows.map(photo => {
      const matchInfo = matchResults.matches.find(m => m.matchPhotoId === photo.id);
      return {
        ...photo,
        ...matchInfo
      };
    });

    return {
      sourcePhoto,
      totalMatches: matchResults.matches.length,
      matches: enrichedMatches,
      averageSimilarity: matchResults.matches.length > 0
        ? Math.round((matchResults.matches.reduce((sum, m) => sum + m.finalScore, 0) / matchResults.matches.length) * 1000) / 1000
        : 0
    };
  } catch (error) {
    console.error('Error getting photos by person:', error);
    throw new Error(`Failed to retrieve photos: ${error.message}`);
  }
}

async function getMatchedFaces(photoId) {
  try {
    const result = await db.query(
      `SELECT
         fpm.match_photo_id as photo_id,
         p.gallery_id,
         p.thumbnail_url,
         p.price,
         fpm.similarity_score,
         fpm.source_face_index,
         fpm.match_face_index,
         fpm.matched_at
       FROM face_person_matches fpm
       JOIN photos p ON fpm.match_photo_id = p.id
       WHERE fpm.source_photo_id = $1
       ORDER BY fpm.similarity_score DESC`,
      [photoId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting matched faces:', error);
    throw new Error(`Failed to retrieve matches: ${error.message}`);
  }
}

module.exports = {
  findSimilarFaces,
  getPhotosByPerson,
  getMatchedFaces,
  cosineSimilarity,
  euclideanSimilarity
};
