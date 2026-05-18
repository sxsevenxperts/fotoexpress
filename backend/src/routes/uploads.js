const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { authenticate } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

async function ensureDir() {
  try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); } catch {}
}

// POST: upload de uma imagem em base64. Gera thumb e devolve URLs públicas.
router.post('/photo', authenticate, express.json({ limit: '20mb' }), async (req, res) => {
  try {
    await ensureDir();
    const { image, filename } = req.body;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Imagem inválida (envie base64)' });
    }

    const mimeMatch = image.match(/^data:image\/(\w+);base64,/);
    const ext = mimeMatch ? mimeMatch[1].replace('jpeg', 'jpg') : 'jpg';
    const base64 = image.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const safeName = (filename || 'photo').replace(/[^a-zA-Z0-9.-]/g, '_');
    const baseName = `${id}-${safeName}`;

    const fullPath = path.join(UPLOAD_DIR, `${baseName}.${ext}`);
    const thumbPath = path.join(UPLOAD_DIR, `${baseName}-thumb.jpg`);

    const metadata = await sharp(buffer).metadata();
    await sharp(buffer).toFile(fullPath);
    await sharp(buffer).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(thumbPath);

    res.status(201).json({
      file_url: `/uploads/${baseName}.${ext}`,
      thumbnail_url: `/uploads/${baseName}-thumb.jpg`,
      width: metadata.width,
      height: metadata.height,
      size_bytes: buffer.length
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
