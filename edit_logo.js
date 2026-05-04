const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function editLogo() {
  const img = await loadImage('assets/logo.png');
  // I will make the new logo 1024x1024 (square) since app icons should be square
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // If the image is 1024x1536, we can center it in the 1024x1024 square.
  // This means drawing only the middle 1024 pixels of height.
  // source: dx, dy, dw, dh
  // dest:   sx, sy, sw, sh
  const sx = 0;
  const sw = 1024;
  const sh = 1024;
  const sy = (img.height - sh) / 2; // Center vertically

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

  // Add the text
  const text = 'AtomicStep';
  ctx.fillStyle = '#FFD700'; // Gold/Yellow
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const fontSize = 120;
  ctx.font = `bold ${fontSize}px sans-serif`;

  // Draw shadow
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Let's place it under the center. 
  // Center is 512. The atom emoji is likely near the center. 
  // Placing at y = 850 means it's below center.
  ctx.fillText(text, size / 2, 850);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('assets/logo_with_text.png', buffer);
  console.log('Logo updated');
}

editLogo().catch(console.error);
