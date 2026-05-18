const { Readable } = require('stream');
const fs = require('fs');
const db = require('../config/database');
const { streamWatermarkedImage } = require('./imageWatermark');
const { streamWatermarkedVideo } = require('./videoWatermark');

// Considera "dono" do arquivo apenas quem concluiu o pagamento (status = 'completed').
async function checkPhotoOwnership(photoId, userId) {
  const result = await db.query(
    `SELECT id FROM photo_purchases
     WHERE user_id = $1 AND photo_id = $2 AND status = 'completed'`,
    [userId, photoId]
  );
  return result.rows.length > 0;
}

async function checkVideoOwnership(videoId, userId) {
  const result = await db.query(
    `SELECT id FROM video_purchases
     WHERE user_id = $1 AND video_id = $2 AND status = 'completed'`,
    [userId, videoId]
  );
  return result.rows.length > 0;
}

// Entrega o arquivo original (alta resolução, sem marca d'água) aceitando
// tanto URLs remotas quanto caminhos locais, sem expor a URL de origem.
async function streamOriginal(source, res, fallbackContentType) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Não foi possível baixar o arquivo original (HTTP ${response.status})`);
    }
    res.set('Content-Type', response.headers.get('content-type') || fallbackContentType);
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.set('Content-Length', contentLength);
    res.set('Cache-Control', 'private, max-age=300');
    Readable.fromWeb(response.body).pipe(res);
  } else {
    res.set('Content-Type', fallbackContentType);
    fs.createReadStream(source).pipe(res);
  }
}

const PHOTO_WATERMARK = {
  text: 'FotoExpress',
  textSize: 48,
  textColor: 'rgba(255, 255, 255, 0.5)',
  position: 'bottom-right'
};

const VIDEO_WATERMARK = {
  text: 'FotoExpress',
  fontSize: 24,
  textColor: 'white',
  position: 'bottom-right'
};

async function deliverPhoto(photoSource, photoId, userId, res) {
  try {
    const isPurchased = userId ? await checkPhotoOwnership(photoId, userId) : false;

    if (isPurchased) {
      await streamOriginal(photoSource, res, 'image/jpeg');
    } else {
      await streamWatermarkedImage(photoSource, res, PHOTO_WATERMARK);
    }
  } catch (error) {
    console.error('Error delivering photo:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to deliver photo' });
    }
  }
}

async function deliverVideo(videoSource, videoId, userId, res) {
  try {
    const isPurchased = userId ? await checkVideoOwnership(videoId, userId) : false;

    if (isPurchased) {
      await streamOriginal(videoSource, res, 'video/mp4');
    } else {
      await streamWatermarkedVideo(videoSource, res, VIDEO_WATERMARK);
    }
  } catch (error) {
    console.error('Error delivering video:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to deliver video' });
    }
  }
}

module.exports = {
  checkPhotoOwnership,
  checkVideoOwnership,
  deliverPhoto,
  deliverVideo
};
