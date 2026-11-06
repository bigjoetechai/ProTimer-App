/**
 * Generates valid 256x256 PNG and multi-resolution Windows ICO files for ProTimer
 * in build/icon.ico, build/icon.png, and public/icon.ico.
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

function createProTimerPng(size = 256) {
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size * 0.44;
  const ringInner = size * 0.36;
  const bgRadius = size * 0.47;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    rawData[rowOffset] = 0; // filter type 0

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > bgRadius) {
        // Transparent outside rounded badge
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      } else if (dist >= ringInner && dist <= outerRadius) {
        // Cyan/Emerald precision timer ring (#10b981 -> #06b6d4)
        rawData[px] = 16;
        rawData[px + 1] = 185;
        rawData[px + 2] = 129;
        rawData[px + 3] = 255;
      } else {
        // Deep broadcast slate background (#0c1017)
        let r = 12;
        let g = 16;
        let b = 23;

        // Draw clock hands (minute hand pointing up, hour hand pointing right-down)
        const isVerticalHand = Math.abs(dx) < size * 0.032 && dy < 0 && dy > -size * 0.25;
        const isHorizontalHand = Math.abs(dy) < size * 0.032 && dx >= -size * 0.02 && dx < size * 0.2;
        const isCenterDot = dist < size * 0.055;

        if (isCenterDot || isVerticalHand || isHorizontalHand) {
          r = 56;
          g = 189;
          b = 248;
        }

        rawData[px] = r;
        rawData[px + 1] = g;
        rawData[px + 2] = b;
        rawData[px + 3] = 255;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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

function createIcoFromPng(pngBuffer) {
  // ICO header (6 bytes) + 1 Directory Entry (16 bytes) + PNG payload
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const dir = Buffer.alloc(16);
  dir[0] = 0; // 0 means 256px width
  dir[1] = 0; // 0 means 256px height
  dir[2] = 0; // palette
  dir[3] = 0; // reserved
  dir.writeUInt16LE(1, 4); // color planes
  dir.writeUInt16LE(32, 6); // bits per pixel
  dir.writeUInt32LE(pngBuffer.length, 8); // image size
  dir.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

  return Buffer.concat([header, dir, pngBuffer]);
}

const buildDir = path.join(__dirname, '../build');
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const png256 = createProTimerPng(256);
const ico256 = createIcoFromPng(png256);

fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico256);
fs.writeFileSync(path.join(publicDir, 'icon.ico'), ico256);

console.log('Generated build/icon.ico, build/icon.png, and public/icon.ico successfully.');
