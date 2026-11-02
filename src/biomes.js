// Vanilla overworld biome table (port of 26.1.2 OverworldBiomeBuilder) and the multi-noise nearest lookup.
"use strict";
const VBiomes = (() => {
  const q = (f) => Math.trunc(Math.fround(Math.fround(f) * 10000));
  const span = (a, b) => [q(a), q(b)];
  const join = (a, b) => [a[0], b[1]];
  const pt = (v) => span(v, v);
  const FULL = span(-1, 1);
  const T = [span(-1, -0.45), span(-0.45, -0.15), span(-0.15, 0.2), span(0.2, 0.55), span(0.55, 1)];
  const H = [span(-1, -0.35), span(-0.35, -0.1), span(-0.1, 0.1), span(0.1, 0.3), span(0.3, 1)];
  const E = [span(-1, -0.78), span(-0.78, -0.375), span(-0.375, -0.2225), span(-0.2225, 0.05), span(0.05, 0.45), span(0.45, 0.55), span(0.55, 1)];
  const FROZEN = T[0], UNFROZEN = join(T[1], T[4]);
  const MUSH = span(-1.2, -1.05), DEEP = span(-1.05, -0.455), OCEAN = span(-0.455, -0.19), COAST = span(-0.19, -0.11);
  const INLAND = span(-0.11, 0.55), NEAR = span(-0.11, 0.03), MID = span(0.03, 0.3), FAR = span(0.3, 1);
  const OCEANS = [["deep_frozen_ocean", "deep_cold_ocean", "deep_ocean", "deep_lukewarm_ocean", "warm_ocean"], ["frozen_ocean", "cold_ocean", "ocean", "lukewarm_ocean", "warm_ocean"]];
  const MIDDLE = [["snowy_plains", "snowy_plains", "snowy_plains", "snowy_taiga", "taiga"], ["plains", "plains", "forest", "taiga", "old_growth_spruce_taiga"], ["flower_forest", "plains", "forest", "birch_forest", "dark_forest"], ["savanna", "savanna", "forest", "jungle", "jungle"], ["desert", "desert", "desert", "desert", "desert"]];
  const MIDDLE_V = [["ice_spikes", null, "snowy_taiga", null, null], [null, null, null, null, "old_growth_pine_taiga"], ["sunflower_plains", null, null, "old_growth_birch_forest", null], [null, null, "plains", "sparse_jungle", "bamboo_jungle"], [null, null, null, null, null]];
  const PLATEAU = [["snowy_plains", "snowy_plains", "snowy_plains", "snowy_taiga", "snowy_taiga"], ["meadow", "meadow", "forest", "taiga", "old_growth_spruce_taiga"], ["meadow", "meadow", "meadow", "meadow", "pale_garden"], ["savanna_plateau", "savanna_plateau", "forest", "forest", "jungle"], ["badlands", "badlands", "badlands", "wooded_badlands", "wooded_badlands"]];
  const PLATEAU_V = [["ice_spikes", null, null, null, null], ["cherry_grove", null, "meadow", "meadow", "old_growth_pine_taiga"], ["cherry_grove", "cherry_grove", "forest", "birch_forest", null], [null, null, null, null, null], ["eroded_badlands", "eroded_badlands", null, null, null]];
  const SHATTERED = [["windswept_gravelly_hills", "windswept_gravelly_hills", "windswept_hills", "windswept_forest", "windswept_forest"], ["windswept_gravelly_hills", "windswept_gravelly_hills", "windswept_hills", "windswept_forest", "windswept_forest"], ["windswept_hills", "windswept_hills", "windswept_hills", "windswept_forest", "windswept_forest"], [null, null, null, null, null], [null, null, null, null, null]];

  const list = [];
  const add = (t, h, c, e, d, w, off, b) => list.push([t[0], t[1], h[0], h[1], c[0], c[1], e[0], e[1], d[0], d[1], w[0], w[1], q(off), b]);
  const surf = (t, h, c, e, w, off, b) => { add(t, h, c, e, pt(0), w, off, b); add(t, h, c, e, pt(1), w, off, b); };
  const neg = (w) => w[1] < 0;
  const middle = (ti, hi, w) => neg(w) ? MIDDLE[ti][hi] : (MIDDLE_V[ti][hi] || MIDDLE[ti][hi]);
  const badlands = (hi, w) => hi < 2 ? (neg(w) ? "badlands" : "eroded_badlands") : hi < 3 ? "badlands" : "wooded_badlands";
  const middleOrBad = (ti, hi, w) => ti === 4 ? badlands(hi, w) : middle(ti, hi, w);
  const slope = (ti, hi, w) => ti >= 3 ? plateau(ti, hi, w) : hi <= 1 ? "snowy_slopes" : "grove";
  const middleOrBadOrSlope = (ti, hi, w) => ti === 0 ? slope(ti, hi, w) : middleOrBad(ti, hi, w);
  const windswept = (ti, hi, w, under) => ti > 1 && hi < 4 && w[1] >= 0 ? "windswept_savanna" : under;
  const beach = (ti) => ti === 0 ? "snowy_beach" : ti === 4 ? "desert" : "beach";
  const shatteredCoast = (ti, hi, w) => windswept(ti, hi, w, w[1] >= 0 ? middle(ti, hi, w) : beach(ti));
  function plateau(ti, hi, w) { const v = PLATEAU_V[ti][hi]; return w[1] >= 0 && v ? v : PLATEAU[ti][hi]; }
  const peak = (ti, hi, w) => ti <= 2 ? (neg(w) ? "jagged_peaks" : "frozen_peaks") : ti === 3 ? "stony_peaks" : badlands(hi, w);
  const shattered = (ti, hi, w) => SHATTERED[ti][hi] || middle(ti, hi, w);

  // off coast
  surf(FULL, FULL, MUSH, FULL, FULL, 0, "mushroom_fields");
  for (let ti = 0; ti < 5; ti++) { surf(T[ti], FULL, DEEP, FULL, FULL, 0, OCEANS[0][ti]); surf(T[ti], FULL, OCEAN, FULL, FULL, 0, OCEANS[1][ti]); }

  function peaks(w) {
    for (let ti = 0; ti < 5; ti++) for (let hi = 0; hi < 5; hi++) {
      const t = T[ti], h = H[hi];
      const mb = middle(ti, hi, w), mbb = middleOrBad(ti, hi, w), mbbs = middleOrBadOrSlope(ti, hi, w), pl = plateau(ti, hi, w), sh = shattered(ti, hi, w), shw = windswept(ti, hi, w, sh), pk = peak(ti, hi, w);
      surf(t, h, join(COAST, FAR), E[0], w, 0, pk);
      surf(t, h, join(COAST, NEAR), E[1], w, 0, mbbs);
      surf(t, h, join(MID, FAR), E[1], w, 0, pk);
      surf(t, h, join(COAST, NEAR), join(E[2], E[3]), w, 0, mb);
      surf(t, h, join(MID, FAR), E[2], w, 0, pl);
      surf(t, h, MID, E[3], w, 0, mbb);
      surf(t, h, FAR, E[3], w, 0, pl);
      surf(t, h, join(COAST, FAR), E[4], w, 0, mb);
      surf(t, h, join(COAST, NEAR), E[5], w, 0, shw);
      surf(t, h, join(MID, FAR), E[5], w, 0, sh);
      surf(t, h, join(COAST, FAR), E[6], w, 0, mb);
    }
  }
  function high(w) {
    for (let ti = 0; ti < 5; ti++) for (let hi = 0; hi < 5; hi++) {
      const t = T[ti], h = H[hi];
      const mb = middle(ti, hi, w), mbb = middleOrBad(ti, hi, w), mbbs = middleOrBadOrSlope(ti, hi, w), pl = plateau(ti, hi, w), sh = shattered(ti, hi, w), mbw = windswept(ti, hi, w, mb), sl = slope(ti, hi, w), pk = peak(ti, hi, w);
      surf(t, h, COAST, join(E[0], E[1]), w, 0, mb);
      surf(t, h, NEAR, E[0], w, 0, sl);
      surf(t, h, join(MID, FAR), E[0], w, 0, pk);
      surf(t, h, NEAR, E[1], w, 0, mbbs);
      surf(t, h, join(MID, FAR), E[1], w, 0, sl);
      surf(t, h, join(COAST, NEAR), join(E[2], E[3]), w, 0, mb);
      surf(t, h, join(MID, FAR), E[2], w, 0, pl);
      surf(t, h, MID, E[3], w, 0, mbb);
      surf(t, h, FAR, E[3], w, 0, pl);
      surf(t, h, join(COAST, FAR), E[4], w, 0, mb);
      surf(t, h, join(COAST, NEAR), E[5], w, 0, mbw);
      surf(t, h, join(MID, FAR), E[5], w, 0, sh);
      surf(t, h, join(COAST, FAR), E[6], w, 0, mb);
    }
  }
  function mid(w) {
    surf(FULL, FULL, COAST, join(E[0], E[2]), w, 0, "stony_shore");
    surf(join(T[1], T[2]), FULL, join(NEAR, FAR), E[6], w, 0, "swamp");
    surf(join(T[3], T[4]), FULL, join(NEAR, FAR), E[6], w, 0, "mangrove_swamp");
    for (let ti = 0; ti < 5; ti++) for (let hi = 0; hi < 5; hi++) {
      const t = T[ti], h = H[hi];
      const mb = middle(ti, hi, w), mbb = middleOrBad(ti, hi, w), mbbs = middleOrBadOrSlope(ti, hi, w), sh = shattered(ti, hi, w), pl = plateau(ti, hi, w), be = beach(ti), mbw = windswept(ti, hi, w, mb), sc = shatteredCoast(ti, hi, w), sl = slope(ti, hi, w);
      surf(t, h, join(NEAR, FAR), E[0], w, 0, sl);
      surf(t, h, join(NEAR, MID), E[1], w, 0, mbbs);
      surf(t, h, FAR, E[1], w, 0, ti === 0 ? sl : pl);
      surf(t, h, NEAR, E[2], w, 0, mb);
      surf(t, h, MID, E[2], w, 0, mbb);
      surf(t, h, FAR, E[2], w, 0, pl);
      surf(t, h, join(COAST, NEAR), E[3], w, 0, mb);
      surf(t, h, join(MID, FAR), E[3], w, 0, mbb);
      if (neg(w)) { surf(t, h, COAST, E[4], w, 0, be); surf(t, h, join(NEAR, FAR), E[4], w, 0, mb); }
      else surf(t, h, join(COAST, FAR), E[4], w, 0, mb);
      surf(t, h, COAST, E[5], w, 0, sc);
      surf(t, h, NEAR, E[5], w, 0, mbw);
      surf(t, h, join(MID, FAR), E[5], w, 0, sh);
      surf(t, h, COAST, E[6], w, 0, neg(w) ? be : mb);
      if (ti === 0) surf(t, h, join(NEAR, FAR), E[6], w, 0, mb);
    }
  }
  function low(w) {
    surf(FULL, FULL, COAST, join(E[0], E[2]), w, 0, "stony_shore");
    surf(join(T[1], T[2]), FULL, join(NEAR, FAR), E[6], w, 0, "swamp");
    surf(join(T[3], T[4]), FULL, join(NEAR, FAR), E[6], w, 0, "mangrove_swamp");
    for (let ti = 0; ti < 5; ti++) for (let hi = 0; hi < 5; hi++) {
      const t = T[ti], h = H[hi];
      const mb = middle(ti, hi, w), mbb = middleOrBad(ti, hi, w), mbbs = middleOrBadOrSlope(ti, hi, w), be = beach(ti), mbw = windswept(ti, hi, w, mb), sc = shatteredCoast(ti, hi, w);
      surf(t, h, NEAR, join(E[0], E[1]), w, 0, mbb);
      surf(t, h, join(MID, FAR), join(E[0], E[1]), w, 0, mbbs);
      surf(t, h, NEAR, join(E[2], E[3]), w, 0, mb);
      surf(t, h, join(MID, FAR), join(E[2], E[3]), w, 0, mbb);
      surf(t, h, COAST, join(E[3], E[4]), w, 0, be);
      surf(t, h, join(NEAR, FAR), E[4], w, 0, mb);
      surf(t, h, COAST, E[5], w, 0, sc);
      surf(t, h, NEAR, E[5], w, 0, mbw);
      surf(t, h, join(MID, FAR), E[5], w, 0, mb);
      surf(t, h, COAST, E[6], w, 0, be);
      if (ti === 0) surf(t, h, join(NEAR, FAR), E[6], w, 0, mb);
    }
  }
  function valleys(w) {
    const n = neg(w);
    surf(FROZEN, FULL, COAST, join(E[0], E[1]), w, 0, n ? "stony_shore" : "frozen_river");
    surf(UNFROZEN, FULL, COAST, join(E[0], E[1]), w, 0, n ? "stony_shore" : "river");
    surf(FROZEN, FULL, NEAR, join(E[0], E[1]), w, 0, "frozen_river");
    surf(UNFROZEN, FULL, NEAR, join(E[0], E[1]), w, 0, "river");
    surf(FROZEN, FULL, join(COAST, FAR), join(E[2], E[5]), w, 0, "frozen_river");
    surf(UNFROZEN, FULL, join(COAST, FAR), join(E[2], E[5]), w, 0, "river");
    surf(FROZEN, FULL, COAST, E[6], w, 0, "frozen_river");
    surf(UNFROZEN, FULL, COAST, E[6], w, 0, "river");
    surf(join(T[1], T[2]), FULL, join(INLAND, FAR), E[6], w, 0, "swamp");
    surf(join(T[3], T[4]), FULL, join(INLAND, FAR), E[6], w, 0, "mangrove_swamp");
    surf(FROZEN, FULL, join(INLAND, FAR), E[6], w, 0, "frozen_river");
    for (let ti = 0; ti < 5; ti++) for (let hi = 0; hi < 5; hi++) surf(T[ti], H[hi], join(MID, FAR), join(E[0], E[1]), w, 0, middleOrBad(ti, hi, w));
  }
  const W = (a, b) => span(a, b);
  mid(W(-1, -0.93333334)); high(W(-0.93333334, -0.7666667)); peaks(W(-0.7666667, -0.56666666)); high(W(-0.56666666, -0.4));
  mid(W(-0.4, -0.26666668)); low(W(-0.26666668, -0.05)); valleys(W(-0.05, 0.05)); low(W(0.05, 0.26666668));
  mid(W(0.26666668, 0.4)); high(W(0.4, 0.56666666)); peaks(W(0.56666666, 0.7666667)); high(W(0.7666667, 0.93333334)); mid(W(0.93333334, 1));
  // underground
  add(FULL, FULL, span(0.8, 1), FULL, span(0.2, 0.9), FULL, 0, "dripstone_caves");
  add(FULL, span(0.7, 1), FULL, FULL, span(0.2, 0.9), FULL, 0, "lush_caves");
  add(FULL, FULL, FULL, join(E[0], E[1]), pt(1.1), FULL, 0, "deep_dark");

  const names = [...new Set(list.map((r) => r[13]))];
  const idOf = new Map(names.map((n, i) => [n, i]));
  const P = new Int32Array(list.length * 13), B = new Uint8Array(list.length);
  list.forEach((r, i) => { for (let k = 0; k < 13; k++) P[i * 13 + k] = r[k]; B[i] = idOf.get(r[13]); });
  const N = list.length;

  function dist1(v, lo, hi) { return v < lo ? lo - v : v > hi ? v - hi : 0; }
  // exact nearest entry, first wins on ties
  function brute(t, h, c, e, d, w) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 13;
      let s = dist1(t, P[o], P[o + 1]); s *= s; if (s >= best) continue;
      let k = dist1(h, P[o + 2], P[o + 3]); s += k * k; if (s >= best) continue;
      k = dist1(c, P[o + 4], P[o + 5]); s += k * k; if (s >= best) continue;
      k = dist1(e, P[o + 6], P[o + 7]); s += k * k; if (s >= best) continue;
      k = dist1(d, P[o + 8], P[o + 9]); s += k * k; if (s >= best) continue;
      k = dist1(w, P[o + 10], P[o + 11]); s += k * k; if (s >= best) continue;
      k = P[o + 12]; s += k * k;
      if (s < best) { best = s; bi = i; }
    }
    return B[bi];
  }
  // Buckets aligned with every band edge used above; inside a bucket the containing entry is the nearest one.
  const edges = (arr) => Int32Array.from(arr.map(q));
  const tE = edges([-1, -0.45, -0.15, 0.2, 0.55, 1]);
  const hE = edges([-1, -0.35, -0.1, 0.1, 0.3, 1]);
  const cE = edges([-1.2, -1.05, -0.455, -0.19, -0.11, 0.03, 0.3, 1]);
  const eE = edges([-1, -0.78, -0.375, -0.2225, 0.05, 0.45, 0.55, 1]);
  const wE = edges([-1, -0.93333334, -0.7666667, -0.56666666, -0.4, -0.26666668, -0.05, 0.05, 0.26666668, 0.4, 0.56666666, 0.7666667, 0.93333334, 1]);
  const band = (E_, v) => { if (v < E_[0] || v > E_[E_.length - 1]) return -1; for (let i = 1; i < E_.length; i++) if (v < E_[i]) return i - 1; return E_.length - 2; };
  const dims = [tE.length - 1, hE.length - 1, cE.length - 1, eE.length - 1, wE.length - 1];
  const memo = new Int16Array(dims.reduce((a, b) => a * b, 1)).fill(-1);
  const mid_ = (E_, i) => Math.floor((E_[i] + E_[i + 1]) / 2);
  function lookup(tf, hf, cf, ef, df, wf) {
    const t = q(tf), h = q(hf), c = q(cf), e = q(ef), d = q(df), w = q(wf);
    if (d >= 1000) return brute(t, h, c, e, d, w);
    const a = band(tE, t), b = band(hE, h), cc = band(cE, c), ee = band(eE, e), ww = band(wE, w);
    if (a < 0 || b < 0 || cc < 0 || ee < 0 || ww < 0) return brute(t, h, c, e, d, w);
    const key = (((a * dims[1] + b) * dims[2] + cc) * dims[3] + ee) * dims[4] + ww;
    let r = memo[key];
    if (r < 0) { r = brute(mid_(tE, a), mid_(hE, b), mid_(cE, cc), mid_(eE, ee), 0, mid_(wE, ww)); memo[key] = r; }
    return r;
  }

  const COLORS = {
    ocean: 0x000070, deep_ocean: 0x000030, warm_ocean: 0x0000ac, lukewarm_ocean: 0x000090, deep_lukewarm_ocean: 0x000040,
    cold_ocean: 0x202070, deep_cold_ocean: 0x202038, frozen_ocean: 0x7070d6, deep_frozen_ocean: 0x404090,
    mushroom_fields: 0xff00ff, river: 0x0000ff, frozen_river: 0xa0a0ff, beach: 0xfade55, snowy_beach: 0xfaf0c0, stony_shore: 0xa2a284,
    plains: 0x8db360, sunflower_plains: 0xb5db88, snowy_plains: 0xffffff, ice_spikes: 0xb4dcdc, desert: 0xfa9418,
    swamp: 0x07f9b2, mangrove_swamp: 0x2ccc8e, forest: 0x056621, flower_forest: 0x2d8e49, birch_forest: 0x307444,
    old_growth_birch_forest: 0x589c6c, dark_forest: 0x40511a, pale_garden: 0x696d95, taiga: 0x0b6659, snowy_taiga: 0x31554a,
    old_growth_pine_taiga: 0x596651, old_growth_spruce_taiga: 0x818e79, savanna: 0xbdb25f, savanna_plateau: 0xa79d64,
    windswept_savanna: 0xe5da87, jungle: 0x537b09, sparse_jungle: 0x628b17, bamboo_jungle: 0x768e14, badlands: 0xd94515,
    eroded_badlands: 0xff6d3d, wooded_badlands: 0xb09765, meadow: 0x60a445, cherry_grove: 0xffa7d5, grove: 0x47726c,
    snowy_slopes: 0xc4c4c4, jagged_peaks: 0xdcdcc8, frozen_peaks: 0xb0b3ce, stony_peaks: 0x7b8f74,
    windswept_hills: 0x606060, windswept_gravelly_hills: 0x888888, windswept_forest: 0x5b7352,
    dripstone_caves: 0x4e3012, lush_caves: 0x283c00, deep_dark: 0x031f29,
  };
  return { list, names, lookup, brute, q, COLORS, count: N };
})();
if (typeof module !== "undefined") module.exports = VBiomes;
