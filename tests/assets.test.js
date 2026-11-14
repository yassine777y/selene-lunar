/**
 * assets.test.js — guards the 3D scene's local assets.
 * The Earth shader needs five maps; a missing file silently renders a black
 * sphere, so we assert they exist, decode, and have the expected shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const assetPath = (p) => resolve(root, 'public', p.replace(/^\//, ''));

/** Minimal dimension probe for PNG / JPEG / WebP without an image library. */
function imageSize(buf) {
  // WebP: RIFF container, then a VP8 / VP8L / VP8X chunk.
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') {
      // lossy: 3-byte frame tag, then the 0x9d012a start code, then 14-bit dims
      return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      return { format: 'webp', width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
  }
  // PNG: signature + IHDR
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk to the SOF marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return { format: 'unknown', width: 0, height: 0 };
}

const TEXTURES = [
  '/assets/textures/earth.webp', // NASA Blue Marble, day
  '/assets/textures/earth-lights.webp', // NASA Black Marble, night lights
  '/assets/textures/earth-specular.webp',
  '/assets/textures/earth-clouds.webp',
  '/assets/textures/moon-color.webp', // NASA SVS CGI Moon Kit (LROC WAC)
  '/assets/textures/moon-normal.webp', // LOLA-derived normal map
];

test('every Earth and Moon texture used by the scene is bundled locally', () => {
  for (const rel of TEXTURES) {
    const abs = assetPath(rel);
    assert.ok(existsSync(abs), `missing asset: ${rel}`);
    const buf = readFileSync(abs);
    assert.ok(buf.length > 20_000, `${rel} is suspiciously small (${buf.length} bytes)`);
    const { format, width, height } = imageSize(buf);
    assert.notEqual(format, 'unknown', `${rel} is not a decodable PNG/JPEG/WebP`);
    assert.ok(width >= 1024 && height >= 512, `${rel} is too low-resolution (${width}×${height})`);
    // equirectangular maps are always 2:1
    assert.ok(Math.abs(width / height - 2) < 0.02, `${rel} must be an equirectangular 2:1 map`);
  }
});

test('every texture the scene names resolves, and the HD pack is optional but honest', () => {
  // The engine declares its texture sets once, as { base, hd } pairs. The base
  // file is always shipped; the HD master is a packaging decision, so it may be
  // absent — what must never happen is a name that resolves to nothing, or an
  // "HD" file that is not actually higher resolution than the base.
  const src = readFileSync(resolve(root, 'src/components/scene/engine.js'), 'utf8');
  const block = src.slice(src.indexOf('const TEXTURES = {'), src.indexOf('};', src.indexOf('const TEXTURES = {')));
  const sets = [...block.matchAll(/(\w+):\s*\{\s*base:\s*(null|'([\w.-]+)'),\s*hd:\s*'([\w.-]+)'/g)].map((m) => ({
    key: m[1],
    base: m[2] === 'null' ? null : m[3],
    hd: m[4],
  }));
  assert.ok(sets.length >= 6, `expected the full texture set, parsed ${sets.length}`);

  const dim = (name) => {
    const abs = assetPath(`/assets/textures/${name}`);
    if (!existsSync(abs)) return null;
    return { size: readFileSync(abs).length, ...imageSize(readFileSync(abs)) };
  };

  let hdPresent = 0;
  for (const set of sets) {
    if (set.base) {
      const b = dim(set.base);
      assert.ok(b, `${set.key}: base texture ${set.base} is missing`);
      assert.ok(b.width >= 1024 && b.height >= 512, `${set.key}: base ${set.base} is only ${b.width}×${b.height}`);
      assert.ok(Math.abs(b.width / b.height - 2) < 0.02, `${set.key}: ${set.base} is not a 2:1 equirectangular map`);
    }
    const hd = dim(set.hd);
    if (!hd) continue; // base-only build: the fallback is the whole point
    hdPresent++;
    assert.ok(Math.abs(hd.width / hd.height - 2) < 0.02, `${set.key}: ${set.hd} is not a 2:1 equirectangular map`);
    if (set.base) {
      const b = dim(set.base);
      assert.ok(hd.width >= b.width * 2, `${set.key}: ${set.hd} (${hd.width}) is not wider than its base (${b.width})`);
    }
  }
  // Both states must be valid, but the repo we test in must be one of them.
  assert.ok(hdPresent === 0 || hdPresent === sets.length, `partial HD pack: ${hdPresent}/${sets.length} sets present`);
});

test('the HD pack, when shipped, is what makes the 3D view sharp', () => {
  // Documents the numbers the packing script guarantees: 4K Moon, 2K Earth.
  const expect = {
    'moon-color-4k.webp': 4096,
    'moon-normal-4k.webp': 4096,
    'earth-2k.webp': 2048,
    'earth-clouds-2k.webp': 2048,
  };
  for (const [name, width] of Object.entries(expect)) {
    const abs = assetPath(`/assets/textures/${name}`);
    if (!existsSync(abs)) continue;
    const { width: w, height: h } = imageSize(readFileSync(abs));
    assert.equal(w, width, `${name} should be ${width}px wide, is ${w}`);
    assert.equal(h, width / 2, `${name} should be ${width / 2}px tall, is ${h}`);
  }
});

test('the bright-star catalogue and the terrain data the scene fetches exist', () => {
  const stars = assetPath('/data/stars.bin');
  assert.ok(existsSync(stars), 'missing stars.bin');
  const buf = readFileSync(stars);
  assert.equal(buf.length % 16, 0, 'stars.bin must be 4 × float32 per star');
  const count = buf.length / 16;
  assert.ok(count > 3000 && count < 12000, `implausible star count: ${count}`);
  for (const f of ['/data/stars.json', '/data/lola/sp-800m.binz', '/data/lola/horizons.json']) {
    assert.ok(existsSync(assetPath(f)), `missing ${f}`);
  }
});

test('bundled fonts referenced by the stylesheet exist', () => {
  const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 0, 'expected local font URLs in the stylesheet');
  for (const url of urls) {
    if (!url.startsWith('/')) continue;
    assert.ok(existsSync(assetPath(url)), `stylesheet references a missing file: ${url}`);
  }
});
