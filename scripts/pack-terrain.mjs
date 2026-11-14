#!/usr/bin/env node
/**
 * pack-terrain.mjs — turn the LOLA grids into the files the app ships.
 * ---------------------------------------------------------------------------
 * Input : assets-src/lola/*.bin         (raw Int16 little-endian heights)
 * Output: public/data/lola/*.binz    (2-D second difference + gzip)
 *
 * The transform and its inverse live in `src/lib/lola-codec.js`, the same
 * module the browser uses to decode, so packing and loading cannot drift apart.
 * Nothing is resampled here unless `--regional-grid` asks for it explicitly.
 *
 * Usage:
 *   node scripts/pack-terrain.mjs                 # pack every raw grid
 *   node scripts/pack-terrain.mjs --regional 760  # + block-average the cap grid
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaField, toBytes } from '../src/lib/lola-codec.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'assets-src/lola');
const OUT = resolve(root, 'public/data/lola');

const args = process.argv.slice(2);
const regionalIdx = args.indexOf('--regional');
const regionalSize = regionalIdx >= 0 ? Number(args[regionalIdx + 1]) : 0;

if (!existsSync(SRC)) {
  console.error(`missing ${SRC} — the unpacked LOLA grids live there (not shipped, ~6 MB)`);
  process.exit(1);
}

const readGrid = (name) => {
  const buf = readFileSync(resolve(SRC, name));
  const data = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const side = Math.round(Math.sqrt(data.length));
  if (side * side !== data.length) throw new Error(`${name} is not square`);
  return { data, side };
};

const pack = (name, data, width, height) => {
  const deltas = deltaField(data, width, height);
  const gz = gzipSync(toBytes(deltas), { level: 9 });
  const file = `${name}.binz`;
  writeFileSync(resolve(OUT, file), gz);
  const raw = width * height * 2;
  console.log(
    `${file.padEnd(30)} ${String(width).padStart(4)}²  ${(raw / 1e6).toFixed(2)} MB → ${(gz.length / 1024).toFixed(0)} kB`
  );
};

const files = readdirSync(SRC).filter((f) => f.endsWith('.bin'));
if (!files.length) throw new Error('no raw grids to pack');

for (const f of files) {
  const { data, side } = readGrid(f);
  const name = f.replace(/\.bin$/, '');
  if (regionalSize && name.startsWith('sp-')) {
    // Block-average the whole-cap grid to a smaller side (integer factor only,
    // so no elevation is invented by interpolation).
    const step = side / regionalSize;
    if (!Number.isInteger(step)) throw new Error(`regional size ${regionalSize} does not divide ${side}`);
    const out = new Int16Array(regionalSize * regionalSize);
    for (let i = 0; i < regionalSize; i++) {
      for (let j = 0; j < regionalSize; j++) {
        let sum = 0;
        for (let di = 0; di < step; di++) {
          for (let dj = 0; dj < step; dj++) sum += data[(i * step + di) * side + j * step + dj];
        }
        out[i * regionalSize + j] = Math.round(sum / (step * step));
      }
    }
    pack(`sp-${Math.round(step * 400)}m`, out, regionalSize, regionalSize);
  } else {
    pack(name, data, side, side);
  }
}
