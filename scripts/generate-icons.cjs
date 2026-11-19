/**
 * Generates multi-resolution Windows ICO and PNG application icons for ProTimer
 * directly from the user's custom icon asset (public/assets/aistudio/icon_83ffa438.png)
 * into build/icon.ico, build/icon.png, public/icon.ico, and public/icon.png.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decodes an 8-bit RGBA PNG buffer into { width, height, pixels: Uint8Array(width * height * 4) }.
 */
function decodeRgbaPng(pngBuffer) {
  let offset = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  const idatChunks = [];

  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.slice(offset + 4, offset + 8).toString('ascii');
    const data = pngBuffer.slice(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  const bpp = 4;
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];
    const outRowOffset = y * stride;
    const prevRowOffset = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rowStart + 1 + x];
      const a = x >= bpp ? pixels[outRowOffset + x - bpp] : 0;
      const b = y > 0 ? pixels[prevRowOffset + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[prevRowOffset + x - bpp] : 0;

      let val = rawByte;
      if (filterType === 1) {
        val = (rawByte + a) & 0xff;
      } else if (filterType === 2) {
        val = (rawByte + b) & 0xff;
      } else if (filterType === 3) {
        val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      } else if (filterType === 4) {
        val = (rawByte + paethPredictor(a, b, c)) & 0xff;
      }
      pixels[outRowOffset + x] = val;
    }
  }

  return { width, height, pixels };
}

/**
 * Downsamples RGBA pixel data to targetSize x targetSize using area-averaging with premultiplied alpha.
 */
function resizeRgba(src, targetSize) {
  const { width: srcW, height: srcH, pixels: srcPixels } = src;
  const dstPixels = new Uint8Array(targetSize * targetSize * 4);
  const scaleX = srcW / targetSize;
  const scaleY = srcH / targetSize;

  for (let y = 0; y < targetSize; y++) {
    const srcY0 = Math.floor(y * scaleY);
    const srcY1 = Math.min(srcH, Math.ceil((y + 1) * scaleY));

    for (let x = 0; x < targetSize; x++) {
      const srcX0 = Math.floor(x * scaleX);
      const srcX1 = Math.min(srcW, Math.ceil((x + 1) * scaleX));

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const a = srcPixels[idx + 3];
          rSum += srcPixels[idx] * a;
          gSum += srcPixels[idx + 1] * a;
          bSum += srcPixels[idx + 2] * a;
          aSum += a;
          count++;
        }
      }

      const dstIdx = (y * targetSize + x) * 4;
      if (count > 0 && aSum > 0) {
        dstPixels[dstIdx] = Math.round(rSum / aSum);
        dstPixels[dstIdx + 1] = Math.round(gSum / aSum);
        dstPixels[dstIdx + 2] = Math.round(bSum / aSum);
        dstPixels[dstIdx + 3] = Math.round(aSum / count);
      }
    }
  }

  return { width: targetSize, height: targetSize, pixels: dstPixels };
}

/**
 * Encodes { width, height, pixels } into a valid RGBA PNG Buffer.
 */
function encodeRgbaPng({ width, height, pixels }) {
  const stride = width * 4;
  const rawData = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0; // filter type 0
    const srcOffset = y * stride;
    for (let i = 0; i < stride; i++) {
      rawData[rowOffset + 1 + i] = pixels[srcOffset + i];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(rawData, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend),
  ]);
}

/**
 * Creates a multi-resolution Windows ICO file containing 256x256, 64x64, 48x48, 32x32, and 16x16 PNGs.
 */
function createMultiResIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirBuffers = [];
  let dataOffset = 6 + count * 16;

  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size >= 256 ? 0 : entry.size;
    dir[1] = entry.size >= 256 ? 0 : entry.size;
    dir[2] = 0; // color palette
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, 8); // byte size
    dir.writeUInt32LE(dataOffset, 12); // byte offset
    dirBuffers.push(dir);
    dataOffset += entry.png.length;
  }

  return Buffer.concat([
    header,
    ...dirBuffers,
    ...entries.map((e) => e.png),
  ]);
}

const primaryIconPath = path.join(__dirname, '../public/assets/aistudio/icon_ec9a41ea.png');
const fallbackIconPath = path.join(__dirname, '../public/assets/aistudio/ProTimer_icon_ec9a41ea.png');
const sourceIconPath = fs.existsSync(primaryIconPath) ? primaryIconPath : fallbackIconPath;

const buildDir = path.join(__dirname, '../build');
const resourcesDir = path.join(__dirname, '../resources');
const publicDir = path.join(__dirname, '../public');

for (const dir of [buildDir, resourcesDir, publicDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const sourcePngBuffer = fs.readFileSync(sourceIconPath);
const decoded = decodeRgbaPng(sourcePngBuffer);

const sizes = [256, 64, 48, 32, 16];
const icoEntries = sizes.map((size) => ({
  size,
  png: encodeRgbaPng(resizeRgba(decoded, size)),
}));

const icoBuffer = createMultiResIco(icoEntries);

// Save original 512x512 PNG and multi-res ICOs into build/, resources/, and public/
for (const dir of [buildDir, resourcesDir]) {
  fs.writeFileSync(path.join(dir, 'icon.png'), sourcePngBuffer);
  fs.writeFileSync(path.join(dir, 'icon_ec9a41ea.png'), sourcePngBuffer);
  fs.writeFileSync(path.join(dir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(dir, 'installerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(dir, 'uninstallerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(dir, 'installerHeaderIcon.ico'), icoBuffer);
}

fs.writeFileSync(path.join(publicDir, 'icon.png'), sourcePngBuffer);
fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuffer);

console.log('Generated ProTimer icons from icon_ec9a41ea.png into build/, resources/, and public/ successfully.');




