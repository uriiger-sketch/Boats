import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pixelShipIcon(size) {
  // Palette matches the in-game player ship (warm amber hull, cream sails,
  // gold trim, crimson flag) over a deep-sea backdrop with a wave crest.
  const skyTop = [7, 18, 32];
  const skyBot = [13, 34, 56];
  const waterDeep = [10, 44, 78];
  const waterMid = [22, 78, 128];
  const waterCrest = [72, 156, 206];
  const foam = [200, 232, 250];
  const outline = [20, 10, 5];
  const hullDark = [74, 40, 20];
  const hullBase = [122, 69, 32];
  const hullHi = [201, 145, 100];
  const deckDark = [58, 30, 14];
  const mastCol = [42, 22, 10];
  const sailShadow = [214, 200, 170];
  const sailBase = [244, 236, 218];
  const sailHi = [255, 250, 236];
  const flagDark = [130, 15, 24];
  const flagBase = [192, 24, 40];
  const gold = [212, 160, 48];

  const px = new Array(size * size);
  const set = (x, y, color) => {
    if (x >= 0 && x < size && y >= 0 && y < size) px[y * size + x] = color;
  };
  const rect = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, color);
  };
  const r = (v) => Math.round(v);

  // Backdrop: sky gradient over the top two-thirds, sea gradient below.
  const waterLine = size * 0.62;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    let color;
    if (y < waterLine) {
      const st = y / waterLine;
      color = [
        r(skyTop[0] + (skyBot[0] - skyTop[0]) * st),
        r(skyTop[1] + (skyBot[1] - skyTop[1]) * st),
        r(skyTop[2] + (skyBot[2] - skyTop[2]) * st),
      ];
    } else {
      const wt = (y - waterLine) / (size - waterLine);
      color = [
        r(waterMid[0] + (waterDeep[0] - waterMid[0]) * wt),
        r(waterMid[1] + (waterDeep[1] - waterMid[1]) * wt),
        r(waterMid[2] + (waterDeep[2] - waterMid[2]) * wt),
      ];
    }
    for (let x = 0; x < size; x++) px[y * size + x] = color;
  }
  // Wave crest band right at the waterline + a couple of foam highlights.
  rect(0, r(waterLine), size, Math.max(1, r(size * 0.035)), waterCrest);
  for (let i = 0; i < 4; i++) {
    rect(r(size * (0.08 + i * 0.24)), r(waterLine - size * 0.01), r(size * 0.09), Math.max(1, r(size * 0.018)), foam);
  }

  const u = size / 16;

  // Hull — dark outline silhouette first, warm amber body + highlight band on top.
  rect(r(1.6 * u), r(9.6 * u), r(12.8 * u), r(3.0 * u), outline);
  rect(r(2 * u), r(10 * u), r(12 * u), r(2.2 * u), hullBase);
  rect(r(2 * u), r(9.7 * u), r(12 * u), r(0.6 * u), hullHi);
  rect(r(2.2 * u), r(9.1 * u), r(11.6 * u), r(0.7 * u), deckDark);
  // Cannon ports along the hull.
  for (const cx of [4.4, 6.9, 9.4, 11.9]) {
    rect(r(cx * u), r(10.9 * u), r(0.8 * u), r(0.8 * u), outline);
  }
  // Bow/stern taper accents.
  rect(r(1.6 * u), r(10.2 * u), r(0.7 * u), r(2.0 * u), hullDark);
  rect(r(13.7 * u), r(10.2 * u), r(0.7 * u), r(2.0 * u), hullDark);

  // Mast.
  rect(r(7.55 * u), r(2.2 * u), r(0.7 * u), r(7.1 * u), mastCol);

  // Sail — cream body with a darker fold shadow and a bright leading edge.
  rect(r(4.1 * u), r(3.0 * u), r(6.6 * u), r(5.6 * u), outline);
  rect(r(4.4 * u), r(3.3 * u), r(6.0 * u), r(5.0 * u), sailBase);
  rect(r(4.4 * u), r(3.3 * u), r(1.1 * u), r(5.0 * u), sailHi);
  rect(r(9.0 * u), r(3.3 * u), r(1.4 * u), r(5.0 * u), sailShadow);

  // Flag — small pennant at the masthead.
  rect(r(7.9 * u), r(1.1 * u), r(3.0 * u), r(1.3 * u), flagDark);
  rect(r(7.9 * u), r(1.1 * u), r(2.3 * u), r(0.7 * u), flagBase);

  // Gold trim accents on the hull's top rail.
  rect(r(2.2 * u), r(9.55 * u), r(11.6 * u), r(0.25 * u), gold);

  const raw = Buffer.alloc(size * (1 + size * 4));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px[y * size + x];
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [32, 192, 512]) {
  const png = pixelShipIcon(size);
  writeFileSync(join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
