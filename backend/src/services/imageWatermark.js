const sharp = require('sharp');
const fs = require('fs').promises;

// Carrega a imagem de origem como Buffer, aceitando tanto URLs remotas
// (http/https) quanto caminhos locais. O Sharp não lê URLs diretamente.
async function loadImageBuffer(input) {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Não foi possível baixar a imagem (HTTP ${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.readFile(input);
}

async function addWatermarkToImage(input, outputPath, options = {}) {
  try {
    const {
      logoPath = null,
      text = 'FotoExpress',
      textSize = 48,
      textColor = 'rgba(255, 255, 255, 0.5)',
      position = 'bottom-right',
      padding = 20
    } = options;

    const inputBuffer = await loadImageBuffer(input);
    let image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const overlays = [];

    if (logoPath) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        overlays.push({
          input: logoBuffer,
          gravity: getGravity(position),
          offset: getOffset(position, padding)
        });
      } catch (logoError) {
        console.error('Logo de marca d\'água indisponível:', logoError.message);
      }
    }

    overlays.push({
      input: Buffer.from(createTextSvg(text, textSize, textColor, metadata.width, metadata.height)),
      gravity: getGravity(position)
    });

    await image.composite(overlays).toFile(outputPath);
    return outputPath;
  } catch (error) {
    console.error('Error adding watermark:', error);
    throw new Error(`Watermark generation failed: ${error.message}`);
  }
}

function createTextSvg(text, size, color, imageWidth, imageHeight) {
  const padding = 20;
  const textLength = text.length * (size * 0.6);

  return `
    <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow">
          <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.5"/>
        </filter>
      </defs>
      <text
        x="${imageWidth - textLength - padding}"
        y="${imageHeight - padding}"
        font-family="Arial, sans-serif"
        font-size="${size}"
        fill="${color}"
        filter="url(#shadow)"
      >
        ${text}
      </text>
    </svg>
  `;
}

function getGravity(position) {
  const gravityMap = {
    'top-left': 'northwest',
    'top-center': 'north',
    'top-right': 'northeast',
    'center-left': 'west',
    'center': 'center',
    'center-right': 'east',
    'bottom-left': 'southwest',
    'bottom-center': 'south',
    'bottom-right': 'southeast'
  };
  return gravityMap[position] || 'southeast';
}

function getOffset(position, padding) {
  const offsets = {
    'top-left': { x: padding, y: padding },
    'top-center': { x: 0, y: padding },
    'top-right': { x: -padding, y: padding },
    'center-left': { x: padding, y: 0 },
    'center': { x: 0, y: 0 },
    'center-right': { x: -padding, y: 0 },
    'bottom-left': { x: padding, y: -padding },
    'bottom-center': { x: 0, y: -padding },
    'bottom-right': { x: -padding, y: -padding }
  };
  return offsets[position] || { x: -padding, y: -padding };
}

// Gera e envia a imagem com marca d'água diretamente na resposta HTTP.
async function streamWatermarkedImage(input, res, watermarkOptions = {}) {
  try {
    const inputBuffer = await loadImageBuffer(input);
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const textSvg = createTextSvg(
      watermarkOptions.text || 'FotoExpress',
      watermarkOptions.textSize || 48,
      watermarkOptions.textColor || 'rgba(255, 255, 255, 0.5)',
      metadata.width,
      metadata.height
    );

    const outputBuffer = await image
      .composite([{
        input: Buffer.from(textSvg),
        gravity: getGravity(watermarkOptions.position || 'bottom-right')
      }])
      .jpeg({ quality: 80 })
      .toBuffer();

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(outputBuffer);
  } catch (error) {
    console.error('Error streaming watermarked image:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate watermarked image' });
    }
  }
}

module.exports = {
  addWatermarkToImage,
  streamWatermarkedImage,
  loadImageBuffer
};
