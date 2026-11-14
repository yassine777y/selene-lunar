/**
 * lola-codec.js — how the LOLA elevation grids are packed into the repo
 * ---------------------------------------------------------------------------
 * The shipped grids are raw Int16 heights, one elevation per pixel. Stored
 * naively they cost 2 bytes per pixel and gzip barely helps: neighbouring
 * heights are strongly correlated but the *value* is large, so deflate spends
 * its budget on the high byte that never changes. A 1520 × 1520 cap grid is
 * 4.6 MB that way — most of the download for data that is almost a plane.
 *
 * So the grids are stored as a 2-D second difference, then gzipped:
 *
 *     E[i][j] = H[i][j] − H[i][j−1] − H[i−1][j] + H[i−1][j−1]
 *
 * On smooth terrain E is tiny and nearly all zeros, which deflate eats. Both
 * transforms are exact: nothing is quantised, rounded or resampled here, and
 * `tests/terrain.test.js` asserts round-trip equality height for height.
 *
 * Measured on the shipped data: shackleton-160m 288 kB → 102 kB, the 800 m
 * regional cap grid 4.6 MB → 670 kB.
 *
 * The transform lives here (pure, no DOM, no Node) so the packer
 * (`scripts/pack-terrain.mjs`, which also has zlib) and the browser decoder
 * share one implementation. Only the deflate layer differs: `node:zlib` when
 * packing, the platform's `DecompressionStream('gzip')` when loading.
 */

/** Heights (Int16Array, row-major) → Int16Array of 2-D second differences. */
export function deltaField(heights, width, height) {
  const out = new Int16Array(width * height);
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const k = i * width + j;
      const h = heights[k];
      const l = j > 0 ? heights[k - 1] : 0;
      const u = i > 0 ? heights[k - width] : 0;
      const ul = i > 0 && j > 0 ? heights[k - width - 1] : 0;
      const d = h - l - u + ul;
      if (d < -32768 || d > 32767) {
        // Should not happen on lunar terrain (max |E| measured: 589 m), but a
        // silent wrap would corrupt the grid, so fail loudly instead.
        throw new RangeError(`terrain delta out of int16 range at ${i},${j}: ${d}`);
      }
      out[k] = d;
    }
  }
  return out;
}

/** Inverse of `deltaField`: second differences → heights. Exact. */
export function undeltaField(deltas, width, height) {
  const out = new Int16Array(width * height);
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const k = i * width + j;
      const l = j > 0 ? out[k - 1] : 0;
      const u = i > 0 ? out[k - width] : 0;
      const ul = i > 0 && j > 0 ? out[k - width - 1] : 0;
      out[k] = deltas[k] + l + u - ul;
    }
  }
  return out;
}

/** Little-endian Int16Array → bytes (so gzip and fetch see a byte stream). */
export function toBytes(int16) {
  return new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
}

/** Bytes → Int16Array, without copying when alignment allows. */
export function toInt16(bytes) {
  const copy = bytes.byteOffset % 2 === 0 ? bytes : Uint8Array.from(bytes);
  return new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength >> 1);
}

/**
 * Inflate a gzip stream with the platform's own decoder.
 * Supported by every browser that can run WebGL2 (and by Node ≥ 18), so it
 * costs no dependency and no bundle weight.
 */
export async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress the terrain grid (no DecompressionStream).');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Full decode of one shipped grid: packed bytes → Int16Array of metres.
 *
 * The container is gzip, but a static server is allowed to see a `.gz` and add
 * `Content-Encoding: gzip` itself (Vite's dev server does exactly that), in
 * which case `fetch` has already inflated the stream and the bytes arriving
 * here are the raw second differences. Rather than depend on server behaviour,
 * sniff the gzip magic — 0x1f 0x8b — and inflate only when it is there.
 */
export async function decodeGrid(packed, width, height) {
  const bytes = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
  const raw = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
  return undeltaField(toInt16(raw), width, height);
}
