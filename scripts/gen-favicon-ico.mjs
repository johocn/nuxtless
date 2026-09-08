// 从 favicon.svg 几何光栅化生成真彩色 ICO（含 alpha，标准 BMP-in-ICO）。
// 4x4 超采样抗锯齿，无外部依赖。形状：红盾(#E6162D) + 白闪电。
import { writeFileSync } from "node:fs";

const RED = [230, 22, 45];

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 盾顶点（SVG: M16 2.5 L27.5 7 V16.5 C27.5 24 22.8 27.8 16 29.3 C9.2 27.8 4.5 24 4.5 16.5 V7 Z）
function shieldPts() {
  const c = (p0, p1, p2, steps) => {
    const pts = [];
    for (let t = 0; t <= 1; t += 1 / steps) {
      const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
      const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
      pts.push([x, y]);
    }
    return pts;
  };
  return [
    [4.5, 16.5],
    [4.5, 7],
    [16, 2.5],
    [27.5, 7],
    [27.5, 16.5],
    ...c([27.5, 16.5], [22.8, 27.8], [16, 29.3], 12),
    ...c([16, 29.3], [9.2, 27.8], [4.5, 16.5], 12),
  ];
}
const bolt = [
  [18.6, 7.2], [10.5, 17.6], [15.4, 17.6], [14.2, 25], [23.6, 14], [18.5, 14],
];

const shield = shieldPts();
const SIZE = 32;

// 渲染到 WxW 的 RGBA 缓冲（0..255）
function render(W) {
  const px = Buffer.alloc(W * W * 4, 0);
  const SS = 4; // 超采样
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const sx = (x + (dx + 0.5) / SS) * (SIZE / W);
          const sy = (y + (dy + 0.5) / SS) * (SIZE / W);
          const s = inPoly(sx, sy, shield);
          const bt = inPoly(sx, sy, bolt);
          if (s || bt) {
            if (bt) { r += 255; g += 255; b += 255; }
            else { r += RED[0]; g += RED[1]; b += RED[2]; }
            a += 255;
          }
        }
      }
      const i = (y * W + x) * 4;
      const n = SS * SS;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

// BMP-in-ICO 封装（WxW, 32bpp, 自底向上, AND 掩码）
function buildICO(pixels, size) {
  const stride = size * 4;
  const xor = Buffer.alloc(stride * size);
  for (let row = 0; row < size; row++) {
    // ICO 自底向上
    const srcRow = size - 1 - row;
    const srcStart = srcRow * stride;
    const rowBuf = xor.subarray(row * stride, row * stride + stride);
    for (let x = 0; x < size; x++) {
      const si = srcStart + x * 4;
      rowBuf[x * 4 + 0] = pixels[si + 2]; // B
      rowBuf[x * 4 + 1] = pixels[si + 1]; // G
      rowBuf[x * 4 + 2] = pixels[si + 0]; // R
      rowBuf[x * 4 + 3] = pixels[si + 3]; // A
    }
  }
  const andStride = ((size + 31) >> 5) * 4;
  const andMask = Buffer.alloc(andStride * size, 0);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 1);
  header.writeUInt16LE(1, 2);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size & 0xff, 0);
  entry.writeUInt8(size & 0xff, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(xor.length + andMask.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, xor, andMask]);
}

const px = render(SIZE);
const ico = buildICO(px, SIZE);
writeFileSync("public/favicon.ico", ico);
console.log("favicon.ico written:", ico.length, "bytes");

// 顺带输出一份 32x32 的 PPM(P6) 预览，便于人工核验
let ppm = Buffer.from(`P6\n${SIZE} ${SIZE}\n255\n`);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const a = px[i + 3];
    // 叠加到白底便于人眼
    const fr = a / 255, bg = 255;
    ppm = Buffer.concat([ppm, Buffer.from([
      Math.round(px[i] * fr + bg * (1 - fr)),
      Math.round(px[i + 1] * fr + bg * (1 - fr)),
      Math.round(px[i + 2] * fr + bg * (1 - fr)),
    ])]);
  }
}
writeFileSync("scripts/_favicon_preview.ppm", ppm);
console.log("preview ppm written");