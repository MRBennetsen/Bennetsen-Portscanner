import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, '..', 'build');
mkdirSync(buildDir, { recursive: true });

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function blendPixel(buf, width, height, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
  const idx = (y * width + x) * 4;
  const alpha = Math.min(1, a);
  const inv = 1 - alpha;
  buf[idx] = Math.round(r * alpha + buf[idx] * inv);
  buf[idx + 1] = Math.round(g * alpha + buf[idx + 1] * inv);
  buf[idx + 2] = Math.round(b * alpha + buf[idx + 2] * inv);
  buf[idx + 3] = Math.min(255, Math.round((alpha + (buf[idx + 3] / 255) * inv) * 255));
}

function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.2;
  const pad = size * 0.04;
  const innerSize = size - pad * 2;
  const half = innerSize / 2;

  // Rounded dark square (#1e1e1e) with subtle VS Code border (#3e3e42)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(0, Math.abs(x - cx) - (half - radius));
      const dy = Math.max(0, Math.abs(y - cy) - (half - radius));
      const dist = Math.hypot(dx, dy) - radius;

      if (dist <= 0.75) {
        const edgeAlpha = dist <= -0.5 ? 1 : Math.max(0, 0.75 - dist);
        if (dist > -size * 0.028) {
          blendPixel(buf, size, size, x, y, 62, 62, 66, edgeAlpha);
        } else {
          blendPixel(buf, size, size, x, y, 30, 30, 30, edgeAlpha);
        }
      }
    }
  }

  // Concentric radar rings (#007acc and #3794ff)
  const rings = [
    { r: size * 0.34, thick: Math.max(1.2, size * 0.022), col: [0, 122, 204], alpha: 0.75 },
    { r: size * 0.22, thick: Math.max(1.2, size * 0.020), col: [55, 148, 255], alpha: 0.9 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);

      for (const ring of rings) {
        const delta = Math.abs(d - ring.r);
        if (delta <= ring.thick) {
          const cov = Math.max(0, 1 - delta / ring.thick) * ring.alpha;
          blendPixel(buf, size, size, x, y, ring.col[0], ring.col[1], ring.col[2], cov);
        }
      }

      // Crosshair lines (clipped inside outer ring)
      if (d <= size * 0.34 && d >= size * 0.08) {
        const lineW = Math.max(0.9, size * 0.014);
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax < lineW) {
          blendPixel(buf, size, size, x, y, 79, 193, 255, (1 - ax / lineW) * 0.45);
        }
        if (ay < lineW) {
          blendPixel(buf, size, size, x, y, 79, 193, 255, (1 - ay / lineW) * 0.45);
        }
      }

      // Sweep beam at 45 deg
      if (d <= size * 0.34 && d >= size * 0.04) {
        const angle = Math.atan2(dy, dx);
        const targetAngle = -Math.PI / 4;
        const diff = Math.abs(angle - targetAngle);
        if (diff < 0.06) {
          const cov = (1 - diff / 0.06) * 0.95;
          blendPixel(buf, size, size, x, y, 79, 193, 255, cov);
        }
      }

      // Center node (#4fc1ff)
      const centerR = size * 0.075;
      if (d <= centerR + 1) {
        const cov = d <= centerR ? 1 : Math.max(0, 1 - (d - centerR));
        blendPixel(buf, size, size, x, y, 79, 193, 255, cov);
      }

      // Discovered host blips (#4ec9b0 green & #4fc1ff cyan)
      const blips = [
        { bx: cx + size * 0.24, by: cy - size * 0.24, br: size * 0.045, col: [78, 201, 176] },
        { bx: cx - size * 0.22, by: cy + size * 0.04, br: size * 0.038, col: [79, 193, 255] },
        { bx: cx + size * 0.06, by: cy + size * 0.22, br: size * 0.036, col: [55, 148, 255] },
      ];
      for (const b of blips) {
        const bd = Math.hypot(x - b.bx, y - b.by);
        if (bd <= b.br + 1) {
          const cov = bd <= b.br ? 1 : Math.max(0, 1 - (bd - b.br));
          blendPixel(buf, size, size, x, y, b.col[0], b.col[1], b.col[2], cov);
        }
      }
    }
  }

  return encodePNG(size, size, buf);
}

function buildICO(sizes) {
  const pngs = sizes.map((s) => ({ size: s, data: renderIcon(s) }));
  const headerSize = 6;
  const dirEntrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = headerSize + dirEntrySize * pngs.length;
  const entries = [];
  for (const item of pngs) {
    const entry = Buffer.alloc(dirEntrySize);
    entry[0] = item.size >= 256 ? 0 : item.size;
    entry[1] = item.size >= 256 ? 0 : item.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += item.data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const png512 = renderIcon(512);
writeFileSync(join(buildDir, 'icon.png'), png512);

const ico = buildICO([16, 32, 48, 256]);
writeFileSync(join(buildDir, 'icon.ico'), ico);

console.log('Generated build/icon.png and build/icon.ico');
