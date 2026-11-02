// Port of Minecraft's (26.1.2) seeded noise: Xoroshiro128++, RandomSupport, positional factory,
// ImprovedNoise, PerlinNoise (new init) and NormalNoise. Seeding uses BigInt, sampling uses plain doubles.
"use strict";
const MCNoise = (() => {
  const M64 = (1n << 64n) - 1n;
  const u64 = (x) => x & M64;
  const rotl = (x, k) => u64((x << BigInt(k)) | (x >> BigInt(64 - k)));
  const toSigned = (x) => (x >= (1n << 63n) ? x - (1n << 64n) : x);

  // ---- MD5 (RFC 1321) over UTF-8 bytes
  function md5(str) {
    const msg = new TextEncoder().encode(str);
    const len = msg.length;
    const nBlocks = ((len + 8) >> 6) + 1;
    const w = new Uint32Array(nBlocks * 16);
    for (let i = 0; i < len; i++) w[i >> 2] |= msg[i] << ((i % 4) * 8);
    w[len >> 2] |= 0x80 << ((len % 4) * 8);
    const bitLen = len * 8;
    w[nBlocks * 16 - 2] = bitLen >>> 0;
    w[nBlocks * 16 - 1] = Math.floor(bitLen / 4294967296);
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let blk = 0; blk < nBlocks; blk++) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + w[blk * 16 + g]) >>> 0;
        A = D; D = C; C = B;
        const s = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, j) => { for (let k = 0; k < 4; k++) out[j * 4 + k] = (v >>> (8 * k)) & 255; });
    return out;
  }
  const bytesToU64 = (b, off) => { let x = 0n; for (let i = 0; i < 8; i++) x = (x << 8n) | BigInt(b[off + i]); return x; };
  function seedFromHashOf(str) { const h = md5(str); return [bytesToU64(h, 0), bytesToU64(h, 8)]; }

  function mixStafford13(z) {
    z = u64((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
    z = u64((z ^ (z >> 27n)) * 0x94D049BB133111EBn);
    return z ^ (z >> 31n);
  }
  function upgradeSeedTo128bit(seed) {
    const lo = u64(BigInt(seed) ^ 0x6A09E667F3BCC909n);
    const hi = u64(lo + 0x9E3779B97F4A7C15n); // + -7046029254386353131
    return [mixStafford13(lo), mixStafford13(hi)];
  }

  const DOUBLE_UNIT = Math.fround(1.110223e-16); // (double)1.110223E-16f, as in Java

  class Xoro {
    constructor(lo, hi) {
      this.lo = u64(lo); this.hi = u64(hi);
      if (this.lo === 0n && this.hi === 0n) { this.lo = 0x9E3779B97F4A7C15n; this.hi = 0x6A09E667F3BCC909n; }
    }
    static fromSeed(seed) { const [lo, hi] = upgradeSeedTo128bit(seed); return new Xoro(lo, hi); }
    nextLong() {
      const s0 = this.lo; let s1 = this.hi;
      const result = u64(rotl(u64(s0 + s1), 17) + s0);
      s1 ^= s0;
      this.lo = rotl(s0, 49) ^ s1 ^ u64(s1 << 21n);
      this.hi = rotl(s1, 28);
      return result;
    }
    nextIntU32() { return Number(this.nextLong() & 0xFFFFFFFFn); }
    nextInt(bound) {
      let m = this.nextIntU32() * bound;
      let frac = m % 4294967296;
      if (frac < bound) {
        const start = (4294967296 - bound) % bound;
        while (frac < start) { m = this.nextIntU32() * bound; frac = m % 4294967296; }
      }
      return Math.floor(m / 4294967296);
    }
    nextDouble() { return Number(this.nextLong() >> 11n) * DOUBLE_UNIT; }
    forkPositional() { return new Positional(this.nextLong(), this.nextLong()); }
  }
  class Positional {
    constructor(lo, hi) { this.lo = lo; this.hi = hi; }
    fromHashOf(name) { const [a, b] = seedFromHashOf(name); return new Xoro(a ^ this.lo, b ^ this.hi); }
  }

  // ---- ImprovedNoise
  const G = [1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1, 1,1,0, 0,-1,1, -1,1,0, 0,-1,-1];
  const g = (h, dx, dy, dz) => { const k = (h & 15) * 3; return G[k] * dx + G[k + 1] * dy + G[k + 2] * dz; };
  const lerp = (t, a, b) => a + t * (b - a);
  class Improved {
    constructor(r) {
      this.xo = r.nextDouble() * 256; this.yo = r.nextDouble() * 256; this.zo = r.nextDouble() * 256;
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 0; i < 256; i++) { const o = r.nextInt(256 - i); const t = p[i]; p[i] = p[i + o]; p[i + o] = t; }
      this.p = p;
    }
    noise(x0, y0, z0) {
      const x = x0 + this.xo, y = y0 + this.yo, z = z0 + this.zo;
      const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
      const xr = x - xf, yr = y - yf, zr = z - zf;
      const p = this.p;
      const X = xf & 255, Y = yf & 255, Z = zf & 255;
      const a0 = p[X], a1 = p[(X + 1) & 255];
      const b00 = p[(a0 + Y) & 255], b01 = p[(a0 + Y + 1) & 255], b10 = p[(a1 + Y) & 255], b11 = p[(a1 + Y + 1) & 255];
      const d000 = g(p[(b00 + Z) & 255], xr, yr, zr);
      const d100 = g(p[(b10 + Z) & 255], xr - 1, yr, zr);
      const d010 = g(p[(b01 + Z) & 255], xr, yr - 1, zr);
      const d110 = g(p[(b11 + Z) & 255], xr - 1, yr - 1, zr);
      const d001 = g(p[(b00 + Z + 1) & 255], xr, yr, zr - 1);
      const d101 = g(p[(b10 + Z + 1) & 255], xr - 1, yr, zr - 1);
      const d011 = g(p[(b01 + Z + 1) & 255], xr, yr - 1, zr - 1);
      const d111 = g(p[(b11 + Z + 1) & 255], xr - 1, yr - 1, zr - 1);
      const sx = xr * xr * xr * (xr * (xr * 6 - 15) + 10);
      const sy = yr * yr * yr * (yr * (yr * 6 - 15) + 10);
      const sz = zr * zr * zr * (zr * (zr * 6 - 15) + 10);
      return lerp(sz, lerp(sy, lerp(sx, d000, d100), lerp(sx, d010, d110)), lerp(sy, lerp(sx, d001, d101), lerp(sx, d011, d111)));
    }
  }

  // ImprovedNoise.noise(x, y, z, yScale, yMax): the old "smeared" form, only used by BlendedNoise. Gradients use
  // the snapped y offset, the fade curve uses the real one.
  const F1E7 = Math.fround(1.0e-7);
  Improved.prototype.noiseSmear = function (x0, y0, z0, yScale, yMax) {
    const x = x0 + this.xo, y = y0 + this.yo, z = z0 + this.zo;
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    const xr = x - xf, yr = y - yf, zr = z - zf;
    let o = 0;
    if (yScale !== 0) { const m = (yMax >= 0 && yMax < yr) ? yMax : yr; o = Math.floor(m / yScale + F1E7) * yScale; }
    const wy = yr - o;
    const p = this.p;
    const X = xf & 255, Y = yf & 255, Z = zf & 255;
    const a0 = p[X], a1 = p[(X + 1) & 255];
    const b00 = p[(a0 + Y) & 255], b01 = p[(a0 + Y + 1) & 255], b10 = p[(a1 + Y) & 255], b11 = p[(a1 + Y + 1) & 255];
    const d000 = g(p[(b00 + Z) & 255], xr, wy, zr);
    const d100 = g(p[(b10 + Z) & 255], xr - 1, wy, zr);
    const d010 = g(p[(b01 + Z) & 255], xr, wy - 1, zr);
    const d110 = g(p[(b11 + Z) & 255], xr - 1, wy - 1, zr);
    const d001 = g(p[(b00 + Z + 1) & 255], xr, wy, zr - 1);
    const d101 = g(p[(b10 + Z + 1) & 255], xr - 1, wy, zr - 1);
    const d011 = g(p[(b01 + Z + 1) & 255], xr, wy - 1, zr - 1);
    const d111 = g(p[(b11 + Z + 1) & 255], xr - 1, wy - 1, zr - 1);
    const sx = xr * xr * xr * (xr * (xr * 6 - 15) + 10);
    const sy = yr * yr * yr * (yr * (yr * 6 - 15) + 10);
    const sz = zr * zr * zr * (zr * (zr * 6 - 15) + 10);
    return lerp(sz, lerp(sy, lerp(sx, d000, d100), lerp(sx, d010, d110)), lerp(sy, lerp(sx, d001, d101), lerp(sx, d011, d111)));
  };

  const WRAP = 33554432;
  const wrap = (x) => x - Math.floor(x / WRAP + 0.5) * WRAP;

  class Perlin {
    constructor(r, firstOctave, amps) {
      const pos = r.forkPositional();
      const inFactor = Math.pow(2, firstOctave);
      const valFactor = Math.pow(2, amps.length - 1) / (Math.pow(2, amps.length) - 1);
      this.noises = []; this.amp = []; this.freq = []; this.vf = [];
      for (let i = 0; i < amps.length; i++) {
        if (amps[i] === 0) continue;
        this.noises.push(new Improved(pos.fromHashOf("octave_" + (firstOctave + i))));
        this.amp.push(amps[i]);
        this.freq.push(inFactor * Math.pow(2, i));   // same values Java reaches by doubling
        this.vf.push(valFactor / Math.pow(2, i));    // same values Java reaches by halving
      }
      this.n = this.noises.length;
    }
    get(x, y, z) {
      let v = 0;
      const ns = this.noises, am = this.amp, fr = this.freq, vf = this.vf;
      for (let k = 0; k < this.n; k++) {
        const f = fr[k];
        v += am[k] * ns[k].noise(wrap(x * f), wrap(y * f), wrap(z * f)) * vf[k];
      }
      return v;
    }
  }

  class Normal {
    constructor(r, firstOctave, amps) {
      this.first = new Perlin(r, firstOctave, amps);
      this.second = new Perlin(r, firstOctave, amps);
      let mn = Infinity, mx = -Infinity;
      amps.forEach((a, i) => { if (a !== 0) { mn = Math.min(mn, i); mx = Math.max(mx, i); } });
      this.valueFactor = 0.16666666666666666 / (0.1 * (1 + 1 / (mx - mn + 1)));
    }
    get(x, y, z) {
      const k = 1.0181268882175227;
      return (this.first.get(x, y, z) + this.second.get(x * k, y * k, z * k)) * this.valueFactor;
    }
  }

  // BlendedNoise (old_blended_noise, used for base_3d_noise). Three legacy-initialised octave sets from one random:
  // min limit and max limit (octaves -15..0) and main (-7..0). levels[k] holds octave k - (n - 1); index n - 1 is
  // created first. getOctaveNoise(i) is levels[n - 1 - i].
  function legacyLevels(r, n) { const lv = new Array(n); for (let k = n - 1; k >= 0; k--) lv[k] = new Improved(r); return lv; }
  class Blended {
    constructor(r, xzScale, yScale, xzFactor, yFactor, smear) {
      this.minL = legacyLevels(r, 16); this.maxL = legacyLevels(r, 16); this.main = legacyLevels(r, 8);
      this.xzMul = 684.412 * xzScale; this.yMul = 684.412 * yScale;
      this.xzFactor = xzFactor; this.yFactor = yFactor; this.smear = smear;
    }
    get(bx, by, bz) {
      const d = bx * this.xzMul, e = by * this.yMul, f = bz * this.xzMul;
      const gg = d / this.xzFactor, h = e / this.yFactor, i = f / this.xzFactor;
      const j = this.yMul * this.smear, k = j / this.yFactor;
      let l = 0, m = 0, n = 0, o = 1;
      for (let q = 0; q < 8; q++) {
        n += this.main[7 - q].noiseSmear(wrap(gg * o), wrap(h * o), wrap(i * o), k * o, h * o) / o;
        o /= 2;
      }
      const t = (n / 10 + 1) / 2, hi = t >= 1, lo = t <= 0;
      o = 1;
      for (let q = 0; q < 16; q++) {
        const s = wrap(d * o), tt = wrap(e * o), u = wrap(f * o), v = j * o;
        if (!hi) l += this.minL[15 - q].noiseSmear(s, tt, u, v, e * o) / o;
        if (!lo) m += this.maxL[15 - q].noiseSmear(s, tt, u, v, e * o) / o;
        o /= 2;
      }
      const a = l / 512, b = m / 512;
      return (t < 0 ? a : t > 1 ? b : a + t * (b - a)) / 128;
    }
  }

  // World-level helper: RandomState's positional random, then one NormalNoise per id.
  function worldPositional(seed) { return Xoro.fromSeed(seed).forkPositional(); }
  function makeNoise(positional, id, firstOctave, amps) { return new Normal(positional.fromHashOf(id), firstOctave, amps); }

  return { md5, seedFromHashOf, upgradeSeedTo128bit, Xoro, Positional, Improved, Perlin, Normal, Blended, worldPositional, makeNoise, toSigned };
})();
if (typeof module !== "undefined") module.exports = MCNoise;
