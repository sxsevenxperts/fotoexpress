const vision = require('@google-cloud/vision');
const db = require('../config/database');

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_CLOUD_KEY_PATH
});

function extractLandmarkEmbedding(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;

  // Flatten landmarks into array of coordinates: [x1, y1, x2, y2, ...]
  const embedding = [];
  for (const landmark of landmarks) {
    embedding.push(landmark.position.x);
    embedding.push(landmark.position.y);
  }

  // Normalize embedding: z-score normalization
  const mean = embedding.reduce((a, b) => a + b) / embedding.length;
  const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
  const stdDev = Math.sqrt(variance);

  return embedding.map(val => stdDev > 0 ? (val - mean) / stdDev : 0);
}

async function detectFacesInPhoto(photoId, photoUrl) {
  try {
    const request = {
      image: { source: { imageUri: photoUrl } },
      features: [
        { type: 'FACE_DETECTION', maxResults: 100 }
      ]
    };

    const [response] = await client.annotateImage(request);
    const faces = response.faceAnnotations || [];

    const faceData = faces.map(face => ({
      confidence: face.detectionConfidence,
      boundingBox: face.boundingPoly,
      landmarks: face.landmarks,
      rollAngle: face.rollAngle,
      panAngle: face.panAngle,
      tiltAngle: face.tiltAngle,
      joyLikelihood: face.joyLikelihood,
      sorrowLikelihood: face.sorrowLikelihood,
      angerLikelihood: face.angerLikelihood,
      surpriseLikelihood: face.surpriseLikelihood,
      underExposedLikelihood: face.underExposedLikelihood,
      blurredLikelihood: face.blurredLikelihood,
      headwearLikelihood: face.headwearLikelihood
    }));

    // Extract normalized embeddings from landmarks
    const faceEmbeddings = faces.map(face => extractLandmarkEmbedding(face.landmarks));

    const avgConfidence = faces.length > 0
      ? faces.reduce((sum, f) => sum + f.detectionConfidence, 0) / faces.length
      : 0;

    await db.query(
      `INSERT INTO face_detection_metadata (photo_id, face_count, face_data, face_embeddings, confidence_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (photo_id) DO UPDATE SET
         face_count = $2,
         face_data = $3,
         face_embeddings = $4,
         confidence_score = $5,
         detection_timestamp = CURRENT_TIMESTAMP`,
      [photoId, faces.length, JSON.stringify(faceData), JSON.stringify(faceEmbeddings), avgConfidence]
    );

    return {
      faceCount: faces.length,
      faceData,
      faceEmbeddings,
      confidenceScore: avgConfidence
    };
  } catch (error) {
    console.error('Error detecting faces:', error);
    throw new Error(`Face detection failed: ${error.message}`);
  }
}

async function detectFacesInVideo(videoId, videoUrl) {
  try {
    const request = {
      inputUri: videoUrl,
      features: ['FACE_DETECTION'],
      videoContext: {
        faceDetectionConfig: {
          model: 'builtin/stable',
          includeBoundingBoxes: true,
          includeLandmarks: true,
          includeAttributes: true
        }
      }
    };

    const [operation] = await client.annotateVideo(request);
    const [operationResult] = await operation.promise();
    const annotationResult = operationResult.annotationResults[0];

    const faceAnnotations = annotationResult.faceDetectionAnnotations || [];

    const faceData = faceAnnotations.map((annotation, idx) => ({
      frameIndex: idx,
      segments: annotation.segments,
      faces: annotation.frames?.map(frame => ({
        timeOffset: frame.timeOffset,
        faces: frame.faces?.map(face => ({
          confidence: face.detectionConfidence,
          boundingBox: face.boundingPoly,
          landmarks: face.landmarks,
          attributes: face.attributes
        })) || []
      })) || []
    }));

    const totalFaces = faceAnnotations.reduce((sum, annotation) => {
      return sum + (annotation.frames?.reduce((frameSum, frame) =>
        frameSum + (frame.faces?.length || 0), 0) || 0);
    }, 0);

    await db.query(
      `INSERT INTO face_detection_metadata (video_id, face_count, face_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (video_id) DO UPDATE SET
         face_count = $2,
         face_data = $3,
         detection_timestamp = CURRENT_TIMESTAMP`,
      [videoId, totalFaces, JSON.stringify(faceData)]
    );

    return {
      faceCount: totalFaces,
      faceData
    };
  } catch (error) {
    console.error('Error detecting faces in video:', error);
    throw new Error(`Video face detection failed: ${error.message}`);
  }
}

module.exports = {
  detectFacesInPhoto,
  detectFacesInVideo
};
