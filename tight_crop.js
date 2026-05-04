const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function processLogo() {
  // Load original unedited logo
  const img = await loadImage('C:/Users/aayus/Downloads/Logo - HabitApp.png');
  
  // Find bounding box of original image (the atom)
  const tempCanvas = createCanvas(img.width, img.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);
  const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const alpha = data[(y * img.width + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const croppedWidth = maxX - minX;
  const croppedHeight = maxY - minY;

  // We want the final image to be 1024x1024.
  // The layout will be: [ PADDING ][ ATOM ][ SPACING ][ TEXT ][ PADDING ]
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Text configuration
  const text = 'AtomicStep';
  ctx.fillStyle = '#FFD700'; // Gold/Yellow
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const fontSize = 180; // Large text
  ctx.font = `bold ${fontSize}px sans-serif`;

  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Measure text
  const textMetrics = ctx.measureText(text);
  const textHeight = fontSize; // Approx
  
  // We want the total content (atom + spacing + text) to fit tightly in 1024 height
  // Let's reserve 80px top padding, 80px bottom padding.
  const paddingY = 60;
  const spacing = 40; // space between atom and text
  const availableHeightForAtom = size - (paddingY * 2) - textHeight - spacing;

  // Scale atom to fit availableHeightForAtom or width
  const scale = Math.min((size - 120) / croppedWidth, availableHeightForAtom / croppedHeight);
  const finalAtomWidth = croppedWidth * scale;
  const finalAtomHeight = croppedHeight * scale;

  // Draw atom centered horizontally, placed at paddingY
  const atomX = (size - finalAtomWidth) / 2;
  const atomY = paddingY;

  ctx.drawImage(
    img, 
    minX, minY, croppedWidth, croppedHeight, 
    atomX, atomY, finalAtomWidth, finalAtomHeight
  );

  // Draw text
  const textY = atomY + finalAtomHeight + spacing + (textHeight * 0.8);
  ctx.fillText(text, size / 2, textY);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('assets/logo.png', buffer);
  console.log('Logo perfectly cropped and generated');
}

processLogo().catch(console.error);
