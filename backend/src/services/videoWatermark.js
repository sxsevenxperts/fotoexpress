const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;

async function addWatermarkToVideo(inputPath, outputPath, options = {}) {
  try {
    const {
      logoPath = null,
      text = 'FotoExpress',
      textColor = 'white',
      position = 'bottom-right',
      fontSize = 24,
      boxOpacity = 0.5
    } = options;

    const filterComplex = buildFilterComplex(logoPath, text, position, fontSize, boxOpacity, textColor);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k'
        ]);

      if (filterComplex) {
        command = command.outputOptions([`-filter_complex ${filterComplex}`]);
      }

      command
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  } catch (error) {
    console.error('Error adding watermark to video:', error);
    throw new Error(`Video watermark generation failed: ${error.message}`);
  }
}

function buildFilterComplex(logoPath, text, position, fontSize, boxOpacity, textColor) {
  const filterParts = [];
  const positioning = getVideoPosition(position);

  if (logoPath) {
    filterParts.push(
      `movie=${logoPath}:s=100x100 [logo];`,
      `[0][logo] overlay=${positioning.logoX}:${positioning.logoY}:enable='between(t,0,duration)' [v1]`
    );
  }

  if (text) {
    const textFilter = `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${textColor}:box=1:boxcolor=black@${boxOpacity}:boxborderw=5:x=${positioning.textX}:y=${positioning.textY}`;
    filterParts.push(textFilter);
  }

  return filterParts.join(';');
}

function getVideoPosition(position) {
  const positions = {
    'top-left': { logoX: 10, logoY: 10, textX: 120, textY: 30 },
    'top-right': { logoX: '(w-100-10)', logoY: 10, textX: '(w-200-10)', textY: 30 },
    'bottom-left': { logoX: 10, logoY: '(h-100-10)', textX: 120, textY: '(h-30)' },
    'bottom-right': { logoX: '(w-100-10)', logoY: '(h-100-10)', textX: '(w-200-10)', textY: '(h-30)' },
    'center': { logoX: '(w-100)/2', logoY: '(h-100)/2', textX: '(w-200)/2', textY: '(h-50)/2' }
  };
  return positions[position] || positions['bottom-right'];
}

async function streamWatermarkedVideo(inputPath, res, watermarkOptions) {
  try {
    const positioning = getVideoPosition(watermarkOptions.position || 'bottom-right');

    const filterParts = [];

    if (watermarkOptions.logoPath) {
      filterParts.push(
        `movie=${watermarkOptions.logoPath}:s=100x100 [logo];`,
        `[0][logo] overlay=${positioning.logoX}:${positioning.logoY} [v1]`
      );
    }

    if (watermarkOptions.text) {
      const textFilter = `drawtext=text='${watermarkOptions.text}':fontsize=${watermarkOptions.fontSize || 24}:fontcolor=${watermarkOptions.textColor || 'white'}:box=1:boxcolor=black@${watermarkOptions.boxOpacity || 0.5}:boxborderw=5:x=${positioning.textX}:y=${positioning.textY}`;
      filterParts.push(textFilter);
    }

    const filterComplex = filterParts.join(';');

    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="video_watermarked.mp4"');

    let command = ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k'
      ]);

    if (filterComplex) {
      command = command.outputOptions([`-filter_complex ${filterComplex}`]);
    }

    command
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Failed to generate watermarked video' });
      })
      .pipe(res);
  } catch (error) {
    console.error('Error streaming watermarked video:', error);
    res.status(500).json({ error: 'Failed to generate watermarked video' });
  }
}

module.exports = {
  addWatermarkToVideo,
  streamWatermarkedVideo
};
