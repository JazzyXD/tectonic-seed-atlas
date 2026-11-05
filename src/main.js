(() => {
  "use strict";
  // ---------- settings ----------
  const FIXED = { lava_tunnels: true };
  const DEFAULTS = {
    continents_scale: 0.13, ocean_offset: -0.8, erosion_scale: 0.25, ridge_scale: 0.25, flat_terrain_skew: 0.1,
    rolling_hills: true, jungle_pillars: true, vertical_scale: 1.125, elevation_boost: 0,
    ocean_depth: -0.22, deep_ocean_depth: -0.45,
    islands_enabled: true, island_scale: 0.11, island_multiplier: 1, island_offset: 0,
    temperature_scale: 0.25, temperature_multiplier: 1, temperature_offset: 0,
    vegetation_scale: 0.25, vegetation_multiplier: 1, vegetation_offset: 0,
    min_y: -64, max_y: 320, underground_rivers: true, alternate_erosion_scaling: false,
  };
  // Starting preset: Tectonic's defaults with alternate erosion scaling on (it works with C2ME's OpenCL path).
  // DEFAULTS stays Tectonic's real defaults, used for import fallbacks and the "changed" markers.
  const STARTER = Object.assign({}, DEFAULTS, { alternate_erosion_scaling: true });
  const MINE = Object.assign({}, DEFAULTS, {
    alternate_erosion_scaling: true,
    continents_scale: 0.03, ocean_offset: -0.85, erosion_scale: 0.15, ridge_scale: 0.1, flat_terrain_skew: 0.2,
    elevation_boost: 0.5, ocean_depth: -0.27, deep_ocean_depth: -0.48,
    island_scale: 0.06, island_multiplier: 0.5, island_offset: 0.25,
    temperature_scale: 0.08, vegetation_scale: 0.07,
  });
  const GROUPS = [
    { name: "Continents", open: true, fields: [
      { k: "continents_scale", label: "Continents scale", note: "Lower makes continents and oceans larger", min: 0.005, max: 0.5, step: 0.005 },
      { k: "ocean_offset", label: "Ocean offset", note: "Lower means more ocean", min: -1.5, max: 0.5, step: 0.01 },
      { k: "erosion_scale", label: "Erosion scale", note: "Size of mountain zones versus flat zones", min: 0.02, max: 1, step: 0.01 },
      { k: "ridge_scale", label: "Ridge scale", note: "Size of ridges and river channels", min: 0.02, max: 1, step: 0.01 },
      { k: "flat_terrain_skew", label: "Flat terrain skew", note: "Higher gives more hills and wetlands, fewer plateaus and terraces", min: -1, max: 1, step: 0.05 },
      { k: "rolling_hills", label: "Rolling hills", toggle: true },
      { k: "jungle_pillars", label: "Jungle pillars", toggle: true },
      { k: "alternate_erosion_scaling", label: "Alternate erosion scaling (experimental)", toggle: true },
    ] },
    { name: "Height", open: true, fields: [
      { k: "vertical_scale", label: "Vertical scale", note: "Stretches terrain above sea level. Sea floors are not affected", min: 0.5, max: 2, step: 0.025 },
      { k: "elevation_boost", label: "Elevation boost", note: "Extra stretch that grows with height", min: 0, max: 2, step: 0.05 },
    ] },
    { name: "Oceans", fields: [
      { k: "ocean_depth", label: "Ocean depth", min: -1, max: 0, step: 0.01 },
      { k: "deep_ocean_depth", label: "Deep ocean depth", min: -1, max: 0, step: 0.01 },
    ] },
    { name: "Islands", fields: [
      { k: "islands_enabled", label: "Islands enabled", toggle: true },
      { k: "island_scale", label: "Island scale", min: 0.01, max: 0.5, step: 0.005 },
      { k: "island_multiplier", label: "Island multiplier", min: 0, max: 2, step: 0.05 },
      { k: "island_offset", label: "Island offset", min: -1, max: 1, step: 0.05 },
    ] },
    { name: "Biome climate", fields: [
      { k: "temperature_scale", label: "Temperature scale", note: "Lower makes climate zones larger", min: 0.01, max: 1, step: 0.005 },
      { k: "temperature_multiplier", label: "Temperature multiplier", min: 0, max: 3, step: 0.05 },
      { k: "temperature_offset", label: "Temperature offset", min: -1, max: 1, step: 0.05 },
      { k: "vegetation_scale", label: "Vegetation scale", min: 0.01, max: 1, step: 0.005 },
      { k: "vegetation_multiplier", label: "Vegetation multiplier", min: 0, max: 3, step: 0.05 },
      { k: "vegetation_offset", label: "Vegetation offset", min: -1, max: 1, step: 0.05 },
    ] },
  ];
  // Experimental continents: kept apart from the Tectonic settings, so presets, import and export never touch them.
  const EXP_DEFAULTS = { exp_continents: false, exp_land: 0.5, exp_join: 0.5, exp_warp: 1.2, exp_detail: 1, exp_gap: 0.15 };
  GROUPS.push({ name: "Experimental continents", exp: true,
    note: "Not in the game yet. Cells decide where continents go and how they are shaped; Tectonic still makes the terrain, coasts and biomes. Continents scale still sets the size and ocean offset still sets how much is ocean.",
    fields: [
      { k: "exp_continents", label: "Use experimental continents", toggle: true },
      { k: "exp_land", label: "Land share", note: "Share of cells that become land", min: 0.05, max: 0.95, step: 0.01 },
      { k: "exp_join", label: "Merge chance", note: "How often neighbouring continents join into one", min: 0, max: 1, step: 0.05 },
      { k: "exp_warp", label: "Shape wildness", note: "Bends outlines into arms, bays and necks", min: 0, max: 2, step: 0.05 },
      { k: "exp_detail", label: "Coastline detail", note: "Strength of Tectonic's own small-scale coast noise", min: 0, max: 2, step: 0.05 },
      { k: "exp_gap", label: "Ocean gap", note: "Width of the sea between continents that don't merge", min: 0, max: 0.4, step: 0.01 },
    ] });
  const store = {
    get(k) { try { const v = localStorage.getItem("tsa:" + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("tsa:" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  let cfg = Object.assign({}, STARTER, store.get("cfg") || {});
  const exp = Object.assign({}, EXP_DEFAULTS, store.get("exp") || {});
  let seedText = store.get("seed") ?? "1234567890";
  let seedValue = 0n;

  // ---------- seed parsing (WorldOptions.parseSeed) ----------
  const MAXL = (1n << 63n) - 1n, MINL = -(1n << 63n);
  function javaHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return BigInt(h); }
  function randomSeed() {
    const a = new Uint32Array(2);
    try { crypto.getRandomValues(a); } catch (e) { a[0] = Math.random() * 2 ** 32; a[1] = Math.random() * 2 ** 32; }
    return BigInt.asIntN(64, (BigInt(a[0]) << 32n) | BigInt(a[1]));
  }
  function parseSeed(text) {
    const s = text.trim();
    if (!s) return randomSeed();
    if (/^[+-]?\d+$/.test(s)) { const v = BigInt(s); if (v <= MAXL && v >= MINL) return v; }
    return javaHash(s);
  }

  // ---------- map geometry ----------
  const STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  const CELL = 2;     // CSS pixels per sample
  const T = 64;       // samples per tile side
  const SEA_TOP = 62; // highest water block (sea level 63)
  const v0 = store.get("view") || {};
  let cx = Number.isFinite(v0.cx) ? v0.cx : 0, cz = Number.isFinite(v0.cz) ? v0.cz : 0;
  let lvl = Number.isInteger(v0.lvl) && v0.lvl >= 0 && v0.lvl < STEPS.length ? v0.lvl : 4;
  const VIEWS = [
    ["terrain", "Terrain"], ["biomes", "Biomes"], ["inland", "Inland depth"], ["cont", "Continentalness"],
    ["erosion", "Erosion"], ["pv", "Peaks & valleys"], ["temp", "Temperature"], ["humid", "Vegetation"], ["regions", "Regions"],
  ];
  let view = VIEWS.some((v) => v[0] === store.get("layer")) ? store.get("layer") : "terrain";

  // ---------- workers ----------
  const libSrc = document.getElementById("lib").textContent;
  const wSrc = document.getElementById("worker-src").textContent;
  const blobURL = URL.createObjectURL(new Blob([libSrc, "\n", wSrc], { type: "text/javascript" }));
  const NW = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
  const workers = [];
  let gen = 0, lastError = null;
  // Rendered tiles for the last few configs (seed + settings), so going back to one of them redraws instantly.
  // All configs share one memory budget (see evict), newest config last in cacheSets.
  const CACHED_CONFIGS = 5;
  const cacheSets = new Map();
  let tiles = new Map();
  const inflight = new Set();
  let queue = [], frame = 0;

  function fullCfg() { return Object.assign({}, FIXED, cfg, exp.exp_continents ? exp : {}); }
  function initWorkers() {
    gen++; lastError = null;
    inflight.clear(); queue = [];
    const c = fullCfg(), ckey = seedValue.toString() + "|" + JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
    if (cacheSets.has(ckey)) { tiles = cacheSets.get(ckey); cacheSets.delete(ckey); }
    else tiles = new Map();
    cacheSets.set(ckey, tiles);
    while (cacheSets.size > CACHED_CONFIGS) cacheSets.delete(cacheSets.keys().next().value);
    for (const w of workers) w.postMessage({ type: "init", gen, seed: seedValue.toString(), cfg: fullCfg() });
    inlandDirty = true; statsDirty = true;
    schedule(); requestDraw();
    // Refresh the pinned spot for the new settings; it fills in again as tiles arrive if they aren't cached.
    if (pin) { pinState = "none"; showReadout(pin.wx, pin.wz, true); }
  }
  for (let i = 0; i < NW; i++) {
    const w = new Worker(blobURL);
    w.busy = null;
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "error") { if (m.gen === gen) { lastError = m.msg; updateProgress(); } return; }
      w.busy = null; inflight.delete(m.key);
      if (m.type === "done" && m.gen === gen) {
        const [L, tx, tz, res] = m.key.split("|");
        const lv = +L, step = STEPS[lv] * (res === "c" ? 4 : 1);
        tiles.set(m.key, { key: m.key, lvl: lv, tx: +tx, tz: +tz, res, step, W: m.W, H: m.H, d: m.out, bio: m.bio, cv: {}, used: frame });
        evict();
        inlandDirty = true; statsDirty = true;
        if (pin && pinState !== "full") showReadout(pin.wx, pin.wz, true);
        requestDraw();
      }
      pump();
    };
    workers.push(w);
  }
  function pump() {
    for (const w of workers) {
      if (w.busy) continue;
      let job;
      while ((job = queue.shift())) { if (!tiles.has(job.key) && !inflight.has(job.key)) break; }
      if (!job) break;
      w.busy = job.key; inflight.add(job.key);
      w.postMessage(Object.assign({ type: "job", gen }, job));
    }
    updateProgress();
  }
  function evict() {
    let total = 0;
    for (const set of cacheSets.values()) total += set.size;
    if (total <= 1400) return;
    // Drop the least recently drawn tiles across every cached config; the current view is always the newest.
    const all = [];
    for (const set of cacheSets.values()) for (const t of set.values()) all.push([t.used, set, t.key]);
    all.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < all.length - 1100; i++) all[i][1].delete(all[i][2]);
  }

  // ---------- canvas ----------
  const canvas = document.getElementById("map"), ctx = canvas.getContext("2d");
  const wrap = document.getElementById("mapwrap");
  let Wc = 0, Hc = 0, dpr = 1;
  function resize() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    Wc = Math.max(1, Math.round(r.width)); Hc = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(Wc * dpr); canvas.height = Math.round(Hc * dpr);
    inlandDirty = true; statsDirty = true;
    schedule(); requestDraw();
  }
  const bpp = () => STEPS[lvl] / CELL;  // blocks per CSS pixel
  const worldToScreen = (wx, wz) => [(wx - cx) / bpp() + Wc / 2, (wz - cz) / bpp() + Hc / 2];
  const screenToWorld = (sx, sy) => [cx + (sx - Wc / 2) * bpp(), cz + (sy - Hc / 2) * bpp()];

  function visibleTileRange(L, margin) {
    const span = T * STEPS[L];
    const b = STEPS[lvl] / CELL;
    const x0 = cx - Wc / 2 * b, x1 = cx + Wc / 2 * b, z0 = cz - Hc / 2 * b, z1 = cz + Hc / 2 * b;
    return [Math.floor(x0 / span) - margin, Math.floor(x1 / span) + margin, Math.floor(z0 / span) - margin, Math.floor(z1 / span) + margin];
  }
  // ---------- render area (optional square) ----------
  const a0 = store.get("area") || {};
  const area = { on: !!a0.on, x: Number.isFinite(a0.x) ? a0.x : 0, z: Number.isFinite(a0.z) ? a0.z : 0, r: Number.isFinite(a0.r) && a0.r > 0 ? a0.r : 5000 };
  const inArea = (wx, wz) => !area.on || (Math.abs(wx - area.x) <= area.r && Math.abs(wz - area.z) <= area.r);
  const tileInArea = (x0, z0, span) => !area.on || (x0 + span > area.x - area.r && x0 < area.x + area.r && z0 + span > area.z - area.r && z0 < area.z + area.r);
  function fitArea() {
    const need = (2 * area.r) / Math.max(1, Math.min(Wc, Hc) - 8); // blocks per CSS px needed for the square to fit
    let L = 0; while (L < STEPS.length - 1 && STEPS[L] / CELL < need) L++;
    lvl = L; cx = area.x; cz = area.z;
  }
  function schedule() {
    if (!Wc) return;
    const [ax, bx, az, bz] = visibleTileRange(lvl, 1);
    const step = STEPS[lvl], span = T * step;
    const coarse = [], full = [];
    for (let tz = az; tz <= bz; tz++) for (let tx = ax; tx <= bx; tx++) {
      const dx = (tx + 0.5) * span - cx, dz = (tz + 0.5) * span - cz, dist = dx * dx + dz * dz;
      const kc = `${lvl}|${tx}|${tz}|c`, kf = `${lvl}|${tx}|${tz}|f`;
      const base = { x0: tx * span, z0: tz * span };
      if (!tileInArea(base.x0, base.z0, span)) continue;
      if (!tiles.has(kf)) {
        if (!tiles.has(kc) && !inflight.has(kc)) coarse.push(Object.assign({ key: kc, step: step * 4, w: T / 4, h: T / 4, dist }, base));
        if (!inflight.has(kf)) full.push(Object.assign({ key: kf, step, w: T, h: T, dist }, base));
      }
    }
    coarse.sort((a, b) => a.dist - b.dist); full.sort((a, b) => a.dist - b.dist);
    queue = coarse.concat(full);
    pump();
  }

  // ---------- colour ----------
  const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const BIO_RGB = VBiomes.names.map((n) => hex(VBiomes.COLORS[n] ?? 0x808080));
  const IS_OCEAN = VBiomes.names.map((n) => n.includes("ocean"));
  const IS_RIVER = VBiomes.names.map((n) => n.includes("river"));
  const SEA_AREA = 4e6;
  const pretty = (n) => n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const LAND_STOPS = [[62, [104, 146, 86]], [72, [124, 158, 92]], [90, [152, 170, 100]], [115, [182, 172, 112]], [145, [170, 142, 98]], [185, [140, 114, 88]], [225, [148, 138, 128]], [265, [204, 200, 194]], [305, [250, 250, 250]]];
  const WATER_STOPS = [[0, [126, 180, 208]], [8, [78, 142, 190]], [25, [40, 92, 156]], [55, [20, 50, 102]]];
  function ramp(stops, v) {
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (v < stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (v - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
    return stops[stops.length - 1][1];
  }
  const CONT_BANDS = [[-1.05, "#c03fb0", "Mushroom"], [-0.455, "#1f3a5f", "Deep ocean"], [-0.19, "#3a6f9e", "Ocean"], [-0.11, "#e2c35f", "Coast"], [0.03, "#a9c75a", "Near inland"], [0.3, "#5f9a4c", "Mid inland"], [Infinity, "#2f5e3c", "Far inland"]];
  const ERO_BANDS = [[-0.78, "#3b2a1e", "0 rugged"], [-0.375, "#674730", "1"], [-0.2225, "#946c45", "2"], [0.05, "#bf9863", "3"], [0.45, "#d8c08a", "4"], [0.55, "#e6d8b0", "5"], [Infinity, "#f3eedb", "6 flattest"]];
  const PV_BANDS = [[0.05, "#3a7fc4", "Valley"], [0.26666668, "#8dbd86", "Low"], [0.4, "#d6c27a", "Mid"], [0.56666666, "#c27c3c", "High"], [0.7666667, "#7a2e1f", "Peak"], [0.93333334, "#c27c3c", ""], [Infinity, "#d6c27a", ""]];
  const TEMP_BANDS = [[-0.45, "#5b7fc6", "Frozen"], [-0.15, "#93b6da", "Cold"], [0.2, "#a8c887", "Temperate"], [0.55, "#e1b257", "Warm"], [Infinity, "#cf6238", "Hot"]];
  const HUM_BANDS = [[-0.35, "#d6b468", "Arid"], [-0.1, "#c7c379", "Dry"], [0.1, "#9ebe70", "Neutral"], [0.3, "#5e9d59", "Wet"], [Infinity, "#2e6c49", "Humid"]];
  const REGIONS = [["#9a6440", "Club", "plateaus, valleys, badlands ridges"], ["#5f9150", "Heart", "rolling hills, jungle pillars"], ["#c99b48", "Spade", "terraces"], ["#4d8ea8", "Diamond", "wetlands, dunes"]];
  const parsed = (bands) => bands.map((b) => [b[0], hex(parseInt(b[1].slice(1), 16)), b[2]]);
  const P_CONT = parsed(CONT_BANDS), P_ERO = parsed(ERO_BANDS), P_PV = parsed(PV_BANDS), P_TEMP = parsed(TEMP_BANDS), P_HUM = parsed(HUM_BANDS);
  const P_REG = REGIONS.map((r) => hex(parseInt(r[0].slice(1), 16)));
  const bandOf = (P, v) => { for (let i = 0; i < P.length; i++) if (v < P[i][0]) return P[i][1]; return P[P.length - 1][1]; };
  const landTop = (h) => Math.ceil(h) - 1;

  const LX = -1, LY = 1.4, LZ = -1, LN = Math.hypot(LX, LY, LZ), FLAT = LY / LN;
  function shade(h, hl, hu, step) {
    const dx = (h - hl) / step * 1.8, dz = (h - hu) / step * 1.8;
    const s = (-dx * LX + LY - dz * LZ) / (Math.hypot(dx, 1, dz) * LN);
    return Math.max(0.5, Math.min(1.3, 1 + (s - FLAT) * 1.7));
  }

  function colorize(tile, mode) {
    const w = tile.W - 1, h = tile.H - 1, W = tile.W, D = tile.d;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const cctx = c.getContext("2d"), img = cctx.createImageData(w, h), px = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j + 1) * W + (i + 1), kl = k - 1, ku = k - W;
      const hh = D.h[k], top = landTop(hh), water = top < SEA_TOP;
      const wl = landTop(D.h[kl]) < SEA_TOP, wu = landTop(D.h[ku]) < SEA_TOP;
      const sh = shade(Math.max(hh, SEA_TOP + 0.5), Math.max(D.h[kl], SEA_TOP + 0.5), Math.max(D.h[ku], SEA_TOP + 0.5), tile.step);
      let col, mul = 1, veil = false, edge = false;
      switch (mode) {
        case "terrain": col = water ? ramp(WATER_STOPS, SEA_TOP - top) : ramp(LAND_STOPS, top); mul = water ? 1 : sh; break;
        case "inlandBase": col = water ? [86, 140, 186] : [196, 198, 192]; mul = water ? 1 : 0.6 + 0.4 * sh; break;
        case "biomes": col = BIO_RGB[tile.bio[k]]; mul = water ? 1 : 0.55 + 0.45 * sh; break;
        case "cont": col = bandOf(P_CONT, D.c[k]); veil = water; edge = water !== wl || water !== wu; break;
        case "erosion": col = bandOf(P_ERO, D.e[k]); veil = water; edge = water !== wl || water !== wu; break;
        case "pv": col = bandOf(P_PV, Math.abs(D.w[k])); veil = water; edge = water !== wl || water !== wu; break;
        case "temp": col = bandOf(P_TEMP, D.t[k]); veil = water; edge = water !== wl || water !== wu; break;
        case "humid": col = bandOf(P_HUM, D.v[k]); veil = water; edge = water !== wl || water !== wu; break;
        case "regions":
          if (water) col = [150, 170, 186];
          else { col = P_REG[(D.re[k] < 0 ? 0 : 2) + (D.rs[k] < 0 ? 0 : 1)]; mul = 0.7 + 0.3 * sh; }
          break;
      }
      let r = col[0] * mul, g = col[1] * mul, b = col[2] * mul;
      if (veil) { r = r * 0.6 + 16; g = g * 0.6 + 30; b = b * 0.6 + 58; }
      if (edge) { r *= 0.35; g *= 0.35; b *= 0.35; }
      const o = (j * w + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
    cctx.putImageData(img, 0, 0);
    return c;
  }

  // ---------- drawing ----------
  let drawQueued = false;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(draw); } }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888"; }
  function drawTilesAt(L, mode) {
    const [ax, bx, az, bz] = visibleTileRange(L, 0);
    if ((bx - ax + 1) * (bz - az + 1) > 900) return;
    const sizePx = T * STEPS[L] / bpp();
    for (let tz = az; tz <= bz; tz++) for (let tx = ax; tx <= bx; tx++) {
      for (const res of ["c", "f"]) {
        const t = tiles.get(`${L}|${tx}|${tz}|${res}`);
        if (!t) continue;
        t.used = frame;
        const cv = t.cv[mode] || (t.cv[mode] = colorize(t, mode));
        const [sx, sy] = worldToScreen(tx * T * STEPS[L], tz * T * STEPS[L]);
        ctx.drawImage(cv, sx, sy, sizePx + 0.5, sizePx + 0.5);
      }
    }
  }
  function draw() {
    drawQueued = false; frame++;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssVar("--map-bg"); ctx.fillRect(0, 0, Wc, Hc);
    const mode = view === "inland" ? "inlandBase" : view;
    for (let L = Math.min(STEPS.length - 1, lvl + 3); L >= lvl; L--) drawTilesAt(L, mode);
    if (view === "inland") drawInland();
    drawAreaMask();
    drawChunkyPreview();
    drawPlot();
    drawPin();
    updateScaleBar();
    maybeStats();
  }

  function drawAreaMask() {
    if (!area.on) return;
    const [x0, y0] = worldToScreen(area.x - area.r, area.z - area.r), [x1, y1] = worldToScreen(area.x + area.r, area.z + area.r);
    ctx.fillStyle = cssVar("--map-bg");
    ctx.beginPath(); ctx.rect(-2, -2, Wc + 4, Hc + 4); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.fill("evenodd");
    ctx.strokeStyle = cssVar("--fg"); ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  }

  // ---------- sampling the viewport (stats and inland distance) ----------
  function sampleAt(wx, wz) {
    for (let L = lvl; L < Math.min(STEPS.length, lvl + 4); L++) {
      const span = T * STEPS[L], tx = Math.floor(wx / span), tz = Math.floor(wz / span);
      for (const res of ["f", "c"]) {
        const t = tiles.get(`${L}|${tx}|${tz}|${res}`);
        if (!t) continue;
        const i = Math.floor((wx - tx * span) / t.step), j = Math.floor((wz - tz * span) / t.step);
        return { t, k: (j + 1) * t.W + (i + 1) };
      }
    }
    return null;
  }
  function viewportGrid(stride) {
    const gw = Math.ceil(Wc / CELL / stride), gh = Math.ceil(Hc / CELL / stride);
    const b = STEPS[lvl] * stride;
    const ox = cx - Wc / 2 * bpp(), oz = cz - Hc / 2 * bpp();
    const state = new Int8Array(gw * gh);   // -1 unknown, 0 land, 1 water (any), 2 ocean biome water
    const top = new Int16Array(gw * gh), bio = new Uint8Array(gw * gh);
    let lastT = null, lastKey = "";
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const wx = ox + (i + 0.5) * b, wz = oz + (j + 0.5) * b, g = j * gw + i;
      const s = inArea(wx, wz) ? sampleAt(wx, wz) : null;
      if (!s) { state[g] = -1; continue; }
      const tp = landTop(s.t.d.h[s.k]);
      top[g] = tp; bio[g] = s.t.bio[s.k];
      state[g] = tp >= SEA_TOP ? 0 : IS_OCEAN[bio[g]] ? 2 : 1;
    }
    return { gw, gh, b, ox, oz, state, top, bio };
  }

  let statsDirty = true, statsTimer = 0, inlandDirty = true, inland = null, inlandTimer = 0;
  function maybeStats() {
    if (!statsDirty || statsTimer) return;
    statsTimer = setTimeout(() => { statsTimer = 0; statsDirty = false; computeStats(); }, 200);
  }
  function computeStats() {
    const G = viewportGrid(2);
    let land = 0, known = 0, hi = -Infinity;
    const counts = new Map();
    for (let g = 0; g < G.state.length; g++) {
      if (G.state[g] < 0) continue;
      known++;
      if (G.state[g] === 0) { land++; if (G.top[g] > hi) hi = G.top[g]; }
      counts.set(G.bio[g], (counts.get(G.bio[g]) || 0) + 1);
    }
    document.getElementById("st-land-label").textContent = area.on ? "Land in square" : "Land in view";
    document.getElementById("st-land").textContent = known ? (100 * land / known).toFixed(1) + "%" : "–";
    if (view !== "inland") {
      document.getElementById("st-mid-label").textContent = "Highest point";
      document.getElementById("st-mid").textContent = hi > -Infinity ? "Y " + hi : "–";
    }
    lastCounts = { counts, known };
    renderLegend();
  }
  function drawInland() {
    if (inlandDirty && !inlandTimer) inlandTimer = setTimeout(() => { inlandTimer = 0; inlandDirty = false; computeInland(); requestDraw(); }, 120);
    if (!inland) return;
    const s = inland, [sx, sy] = worldToScreen(s.ox, s.oz), scale = s.b / bpp();
    ctx.drawImage(s.canvas, sx, sy, s.gw * scale, s.gh * scale);
    if (s.best) {
      const [px, py] = worldToScreen(s.best.wx, s.best.wz);
      ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#1b2321"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.stroke();
    }
  }
  let inlandMode = store.get("inlandMode") || "ocean";
  const INLAND_STOPS = [[0, [244, 236, 200]], [250, [234, 212, 146]], [500, [220, 172, 96]], [1000, [190, 118, 60]], [2000, [150, 70, 42]], [4000, [102, 34, 40]], [8000, [52, 16, 34]]];
  function computeInland() {
    const G = viewportGrid(1), n = G.gw * G.gh, INF = 1e9;
    const dist = new Float32Array(n);
    const gw = G.gw, gh = G.gh, A = 1, Bd = Math.SQRT2;
    if (inlandMode === "any") {
      for (let g = 0; g < n; g++) dist[g] = G.state[g] >= 1 ? 0 : INF;
    } else {
      // Sea = water outside river channels, in a body that has an ocean biome or covers at least SEA_AREA.
      const comp = new Int32Array(n).fill(-1), stack = new Int32Array(n);
      const isW = (g) => G.state[g] >= 1 && !IS_RIVER[G.bio[g]];
      let label = 0;
      for (let g0 = 0; g0 < n; g0++) {
        if (comp[g0] >= 0 || !isW(g0)) { if (comp[g0] < 0) dist[g0] = INF; continue; }
        let sp = 0, area = 0, ocean = false; stack[sp++] = g0; comp[g0] = label;
        const members = [];
        while (sp) {
          const g = stack[--sp]; members.push(g); area++;
          if (G.state[g] === 2) ocean = true;
          const i = g % gw;
          if (i > 0 && comp[g - 1] < 0 && isW(g - 1)) { comp[g - 1] = label; stack[sp++] = g - 1; }
          if (i < gw - 1 && comp[g + 1] < 0 && isW(g + 1)) { comp[g + 1] = label; stack[sp++] = g + 1; }
          if (g >= gw && comp[g - gw] < 0 && isW(g - gw)) { comp[g - gw] = label; stack[sp++] = g - gw; }
          if (g + gw < n && comp[g + gw] < 0 && isW(g + gw)) { comp[g + gw] = label; stack[sp++] = g + gw; }
        }
        const sea = ocean || area * G.b * G.b >= SEA_AREA;
        for (const g of members) dist[g] = sea ? 0 : INF;
        label++;
      }
    }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const g = j * gw + i; let d = dist[g]; if (d === 0) continue;
      if (i > 0) d = Math.min(d, dist[g - 1] + A);
      if (j > 0) { d = Math.min(d, dist[g - gw] + A); if (i > 0) d = Math.min(d, dist[g - gw - 1] + Bd); if (i < gw - 1) d = Math.min(d, dist[g - gw + 1] + Bd); }
      dist[g] = d;
    }
    for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {
      const g = j * gw + i; let d = dist[g]; if (d === 0) continue;
      if (i < gw - 1) d = Math.min(d, dist[g + 1] + A);
      if (j < gh - 1) { d = Math.min(d, dist[g + gw] + A); if (i < gw - 1) d = Math.min(d, dist[g + gw + 1] + Bd); if (i > 0) d = Math.min(d, dist[g + gw - 1] + Bd); }
      dist[g] = d;
    }
    const c = document.createElement("canvas"); c.width = gw; c.height = gh;
    const cc = c.getContext("2d"), img = cc.createImageData(gw, gh), px = img.data;
    let best = null, bestD = -1;
    for (let g = 0; g < n; g++) {
      const o = g * 4, st = G.state[g];
      if (st !== 0) { px[o + 3] = 0; continue; }
      const blocks = dist[g] >= INF ? Infinity : dist[g] * G.b;
      const gi = g % gw, gj = (g - gi) / gw;
      let edge = Math.min(gi + 0.5, gw - gi - 0.5, gj + 0.5, gh - gj - 0.5);
      if (area.on) {
        const wx = G.ox + (gi + 0.5) * G.b, wz = G.oz + (gj + 0.5) * G.b;
        edge = Math.min(edge, (area.r - Math.abs(wx - area.x)) / G.b, (area.r - Math.abs(wz - area.z)) / G.b);
      }
      const sure = dist[g] <= edge;   // no sea outside the view can be closer
      const col = blocks === Infinity ? [150, 150, 150] : ramp(INLAND_STOPS, blocks);
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = sure ? 240 : 105;
      if (sure && blocks !== Infinity && blocks > bestD) { bestD = blocks; best = g; }
    }
    cc.putImageData(img, 0, 0);
    inland = { canvas: c, gw, gh, b: G.b, ox: G.ox, oz: G.oz, best: null };
    if (best != null) inland.best = { wx: G.ox + (best % gw + 0.5) * G.b, wz: G.oz + (Math.floor(best / gw) + 0.5) * G.b, d: bestD };
    if (view === "inland") {
      document.getElementById("st-mid-label").textContent = inlandMode === "ocean" ? "Farthest from the sea in view" : "Farthest from water in view";
      document.getElementById("st-mid").textContent = inland.best ? Math.round(inland.best.d).toLocaleString() + " blocks" : (inlandMode === "ocean" ? "No sea in view" : "No water in view");
    }
  }

  // ---------- legend ----------
  let lastCounts = null;
  const sw = (rgb) => `rgb(${rgb.map(Math.round).join(",")})`;
  function renderLegend() {
    const el = document.getElementById("legend");
    const items = [];
    const add = (color, text) => items.push(`<span><i style="background:${color}"></i>${text}</span>`);
    switch (view) {
      case "terrain":
        items.push('<span class="t">Ground Y</span>');
        for (const [y, c] of LAND_STOPS.filter((_, i) => i % 2 === 0)) add(sw(c), y);
        add(sw(WATER_STOPS[1][1]), "shallow water"); add(sw(WATER_STOPS[3][1]), "deep water");
        break;
      case "biomes": {
        if (!lastCounts || !lastCounts.known) { items.push('<span class="t">Biomes in view appear here</span>'); break; }
        const top = [...lastCounts.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
        for (const [id, n] of top) add(sw(BIO_RGB[id]), `${pretty(VBiomes.names[id])} <span class="t">${(100 * n / lastCounts.known).toFixed(1)}%</span>`);
        break;
      }
      case "inland":
        items.push(`<span class="t">${inlandMode === "ocean" ? "Blocks to the sea (ocean biomes or water bodies over 4 km\u00b2, rivers ignored)" : "Blocks to any water, rivers and lakes included"}. Faded: sea outside the view could be closer.</span>`);
        for (const [d, c] of INLAND_STOPS) add(sw(c), d.toLocaleString() + (d === INLAND_STOPS[INLAND_STOPS.length - 1][0] ? "+" : ""));
        items.push(`<span><button type="button" id="inland-mode">${inlandMode === "ocean" ? "Count rivers and lakes" : "Ocean only"}</button></span>`);
        break;
      case "cont": for (const b of CONT_BANDS) add(b[1], b[2]); items.push('<span class="t">Dark line = waterline</span>'); break;
      case "erosion": for (const b of ERO_BANDS) add(b[1], b[2]); break;
      case "pv": for (const b of PV_BANDS.slice(0, 5)) add(b[1], b[2]); break;
      case "temp": for (const b of TEMP_BANDS) add(b[1], b[2]); break;
      case "humid": for (const b of HUM_BANDS) add(b[1], b[2]); break;
      case "regions": for (const r of REGIONS) add(r[0], `${r[1]} <span class="t">${r[2]}</span>`); break;
    }
    el.innerHTML = items.join("");
    const btn = document.getElementById("inland-mode");
    if (btn) btn.onclick = () => { inlandMode = inlandMode === "ocean" ? "any" : "ocean"; store.set("inlandMode", inlandMode); inlandDirty = true; renderLegend(); requestDraw(); };
  }

  // ---------- scale bar, progress ----------
  function updateScaleBar() {
    const b = bpp(), nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    let d = nice[0];
    for (const n of nice) { if (n / b <= 150) d = n; }
    document.getElementById("scale-bar").style.width = Math.round(d / b) + "px";
    document.getElementById("scale-text").textContent = d.toLocaleString() + " blocks";
  }
  function updateProgress() {
    const el = document.getElementById("progress");
    if (lastError) { el.textContent = "These settings failed: " + lastError; return; }
    const [ax, bx, az, bz] = visibleTileRange(lvl, 0);
    let need = 0, have = 0;
    const span = T * STEPS[lvl];
    for (let tz = az; tz <= bz; tz++) for (let tx = ax; tx <= bx; tx++) { if (!tileInArea(tx * span, tz * span, span)) continue; need++; if (tiles.has(`${lvl}|${tx}|${tz}|f`)) have++; }
    el.textContent = have >= need ? `Done · ${STEPS[lvl]} blocks per sample · ${NW} workers` : `Rendering ${have}/${need} tiles`;
  }

  // ---------- readout ----------
  const readout = document.getElementById("readout");
  let pin = null, pinState = "none";
  function fmt(v, d = 3) { return (v >= 0 ? " " : "") + v.toFixed(d); }
  function showReadout(wx, wz, pinned) {
    const s = inArea(wx, wz) ? sampleAt(wx, wz) : null;
    if (pinned) pinState = !s ? "none" : (s.t.res === "c" || s.t.lvl !== lvl ? "preview" : "full");
    if (!s) {
      if (!pinned) { readout.hidden = true; return; }
      readout.innerHTML = `<div class="hint">Rendering ${Math.floor(wx).toLocaleString()}, ${Math.floor(wz).toLocaleString()}\u2026</div><button type="button" id="unpin">Unpin</button>`;
      readout.hidden = false;
      document.getElementById("unpin").onclick = () => { pin = null; readout.hidden = true; requestDraw(); };
      return;
    }
    const D = s.t.d, k = s.k, top = landTop(D.h[k]), water = top < SEA_TOP;
    const X = Math.floor(wx), Z = Math.floor(wz);
    const tp = `/tp @s ${X} ${water ? 80 : Math.min(fullCfg().max_y - 1, top + 2)} ${Z}`;
    const reg = water ? "–" : REGIONS[(D.re[k] < 0 ? 0 : 2) + (D.rs[k] < 0 ? 0 : 1)][1];
    // Island = land made by Tectonic's island noise (only inside the deep-ocean island zone); shown on land only.
    const islandZone = D.isl[k] > 0.5;
    const landform = water ? "" : islandZone ? "Island" : "Continent";
    readout.innerHTML =
      `<div class="biome">${pretty(VBiomes.names[s.t.bio[k]])}</div>` +
      `<dl>${landform ? `<dt>Land type</dt><dd>${landform}</dd>` : ""}<dt>X, Z</dt><dd>${X.toLocaleString()}, ${Z.toLocaleString()}</dd>` +
      `<dt>${water ? "Sea floor" : "Ground"}</dt><dd>Y ${top}${water ? " (" + (SEA_TOP - top + 1) + " deep)" : ""}</dd>` +
      `<dt>Continentalness</dt><dd>${fmt(D.c[k])}</dd><dt>Raw continents</dt><dd>${fmt(D.raw[k])}</dd>` +
      `<dt>Erosion</dt><dd>${fmt(D.e[k])}</dd><dt>Weirdness</dt><dd>${fmt(D.w[k])}</dd>` +
      `<dt>Temperature</dt><dd>${fmt(D.t[k])}</dd><dt>Vegetation</dt><dd>${fmt(D.v[k])}</dd>` +
      `<dt>Region</dt><dd>${reg}</dd></dl>` +
      (pinned ? `<div class="tp"><code id="tp-cmd">${tp}</code><button type="button" id="tp-copy">Copy</button></div><button type="button" id="unpin">Unpin</button>`
              : `<div class="hint">Click to pin and get a /tp command</div>`) +
      (s.t.res === "c" || s.t.lvl !== lvl ? `<div class="hint">Preview sample, full detail still rendering</div>` : "");
    readout.hidden = false;
    if (pinned) {
      document.getElementById("tp-copy").onclick = (e) => {
        const b = e.currentTarget;
        const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); };
        const fallback = () => { const r = document.createRange(); r.selectNodeContents(document.getElementById("tp-cmd")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "Selected"; };
        try { navigator.clipboard.writeText(tp).then(done, fallback); } catch (err) { fallback(); }
      };
      document.getElementById("unpin").onclick = () => { pin = null; readout.hidden = true; requestDraw(); };
    }
  }
  function drawPin() {
    if (!pin) return;
    const [px, py] = worldToScreen(pin.wx, pin.wz);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#1b2321"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // ---------- interaction ----------
  const pointers = new Map();
  const cursorEl = document.getElementById("cursor-pos");
  let dragStart = null, moved = false, pinchBase = null;
  function setLevel(nl, sx, sy) {
    nl = Math.max(0, Math.min(STEPS.length - 1, nl));
    if (nl === lvl) return;
    const [wx, wz] = screenToWorld(sx, sy);
    lvl = nl;
    cx = wx - (sx - Wc / 2) * bpp(); cz = wz - (sy - Hc / 2) * bpp();
    viewChanged();
  }
  function viewChanged() {
    inlandDirty = true; statsDirty = true;
    store.set("view", { cx, cz, lvl });
    schedule(); requestDraw();
  }
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;   // right-click opens the menu instead
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) { dragStart = { p: local(e), cx, cz }; moved = false; canvas.classList.add("dragging"); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchBase = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), lvl }; moved = true; }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinchBase) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const steps = Math.round(Math.log2(pinchBase.d / Math.max(1, d)));
      setLevel(pinchBase.lvl + steps, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      return;
    }
    if (dragStart && pointers.size === 1) {
      const dx = p[0] - dragStart.p[0], dy = p[1] - dragStart.p[1];
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) { cx = dragStart.cx - dx * bpp(); cz = dragStart.cz - dy * bpp(); viewChanged(); }
      return;
    }
    { const [wx, wz] = screenToWorld(p[0], p[1]); cursorEl.textContent = `Cursor ${Math.floor(wx).toLocaleString()}, ${Math.floor(wz).toLocaleString()}`; }
    if (!pin && e.pointerType === "mouse") { const [wx, wz] = screenToWorld(p[0], p[1]); showReadout(wx, wz, false); }
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchBase = null;
    if (pointers.size === 0) {
      canvas.classList.remove("dragging");
      if (dragStart && !moved && e.type === "pointerup") {
        const [wx, wz] = screenToWorld(p[0], p[1]);
        pin = { wx, wz }; goX.value = Math.floor(wx); goZ.value = Math.floor(wz); coordBox.classList.remove("bad");
        showReadout(wx, wz, true); requestDraw();
      }
      dragStart = null;
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { if (!pin && !dragStart) readout.hidden = true; });
  let wheelAcc = 0;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(wheelAcc) >= 90) { const p = local(e); setLevel(lvl + Math.sign(wheelAcc), p[0], p[1]); wheelAcc = 0; }
  }, { passive: false });
  document.getElementById("scale-in").onclick = () => setLevel(lvl - 1, Wc / 2, Hc / 2);
  document.getElementById("scale-out").onclick = () => setLevel(lvl + 1, Wc / 2, Hc / 2);
  // Coordinate box (bottom-left of the map). Accepts "X Z", "X Y Z" or a full /tp command pasted into either field.
  const goX = document.getElementById("go-x"), goZ = document.getElementById("go-z"), coordBox = document.getElementById("coordbox");
  const numsIn = (text) => (String(text).replace(/~/g, " ").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  function splitInto(text) {
    const n = numsIn(text);
    if (n.length >= 3) { goX.value = n[n.length - 3]; goZ.value = n[n.length - 1]; return true; }
    if (n.length === 2) { goX.value = n[0]; goZ.value = n[1]; return true; }
    return false;
  }
  for (const el of [goX, goZ]) el.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (numsIn(text).length >= 2) { e.preventDefault(); splitInto(text); goTo(); }
  });
  function goTo() {
    if (numsIn(goX.value).length >= 2) splitInto(goX.value);
    const x = numsIn(goX.value)[0], z = numsIn(goZ.value)[0];
    const ok = Number.isFinite(x) && Number.isFinite(z);
    coordBox.classList.toggle("bad", !ok);
    if (!ok) return;
    cx = x + 0.5; cz = z + 0.5;
    pin = { wx: x + 0.5, wz: z + 0.5 }; pinState = "none";
    viewChanged();
    showReadout(pin.wx, pin.wz, true);
  }
  coordBox.addEventListener("submit", (e) => { e.preventDefault(); goTo(); });

  // ---------- Chunky helper (right-click menu) ----------
  const ctxMenu = document.getElementById("ctxmenu"), ckPop = document.getElementById("chunkpop");
  const ck = Object.assign({ shape: "square", r: 5000, rz: 3000, cps: 30 }, store.get("chunky") || {});
  ck.open = false; ck.x = 0; ck.z = 0;
  const ckEl = (id) => document.getElementById(id);
  let ctxAt = null;
  // Plotted lines: an array of lines, each an array of {x, z}. The last line is the one new points join.
  const plot = (() => {
    try {
      let v = JSON.parse(localStorage.getItem("tsa:plot"));
      if (!Array.isArray(v)) return [];
      if (v.length && !Array.isArray(v[0])) v = [v];               // older saves held a single line
      const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
      return v.map((l) => (Array.isArray(l) ? l.filter(ok) : [])).filter((l) => l.length);
    } catch (e) { return []; }
  })();
  const curLine = () => plot[plot.length - 1] || null;
  const placeIn = (el, sx, sy) => {
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(sx, Wc - w - 8)) + "px";
    el.style.top = Math.max(8, Math.min(sy, Hc - h - 8)) + "px";
  };
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = local(e), [wx, wz] = screenToWorld(p[0], p[1]);
    ctxAt = { sx: p[0], sy: p[1], wx: Math.floor(wx), wz: Math.floor(wz) };
    ckEl("ctx-area-off").hidden = !area.on;
    const cl = curLine();
    ckEl("ctx-plot-undo").hidden = ckEl("ctx-plot-clear").hidden = ckEl("ctx-plot-new").hidden = !cl;
    ckEl("ctx-plot").textContent = cl ? `Plot point ${LINE_NAMES[plot.length - 1]}${cl.length + 1}` : "Plot point";
    ckEl("ctx-area").textContent = area.on ? "Move the square here" : "Render only a square here";
    placeIn(ctxMenu, p[0], p[1]);
    ckEl("ctx-chunky").focus();
  });
  const hideCtx = () => { ctxMenu.hidden = true; };
  document.addEventListener("pointerdown", (e) => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideCtx(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideCtx(); closeChunky(); areaPop.hidden = true; } });
  ckEl("ctx-pin").onclick = () => { hideCtx(); pin = { wx: ctxAt.wx + 0.5, wz: ctxAt.wz + 0.5 }; goX.value = ctxAt.wx; goZ.value = ctxAt.wz; showReadout(pin.wx, pin.wz, true); requestDraw(); };
  ckEl("ctx-chunky").onclick = () => {
    hideCtx();
    ck.x = ctxAt.wx; ck.z = ctxAt.wz; ck.open = true;
    ckEl("ck-x").value = ck.x; ckEl("ck-z").value = ck.z; ckEl("ck-shape").value = ck.shape;
    ckEl("ck-r").value = ck.r; ckEl("ck-rz").value = ck.rz; ckEl("ck-cps").value = ck.cps;
    updateChunky();
    placeIn(ckPop, ctxAt.sx + 12, ctxAt.sy - 40);
    requestDraw();
  };
  function closeChunky() { if (!ck.open) return; ck.open = false; ckPop.hidden = true; requestDraw(); }
  ckEl("ck-close").onclick = closeChunky;
  // Drag a popup by its title bar; it stays inside the map.
  function makeDraggable(pop) {
    const head = pop.querySelector(".chunkhead");
    let drag = null;
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag = { id: e.pointerId, dx: e.clientX - pop.offsetLeft, dy: e.clientY - pop.offsetTop };
      head.setPointerCapture(e.pointerId); head.classList.add("dragging"); e.preventDefault();
    });
    head.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const x = e.clientX - drag.dx, y = e.clientY - drag.dy;
      pop.style.left = Math.max(0, Math.min(x, Wc - pop.offsetWidth)) + "px";
      pop.style.top = Math.max(0, Math.min(y, Hc - pop.offsetHeight)) + "px";
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; head.classList.remove("dragging"); } };
    head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
  }
  makeDraggable(ckPop);
  ckPop.addEventListener("submit", (e) => e.preventDefault());
  // Share of the bounding square each Chunky shape covers (from Chunky's own shape tests where available).
  const SHAPE_FILL = { square: 1, rectangle: 1, circle: Math.PI / 4, ellipse: Math.PI / 4, diamond: 0.5, triangle: 0.5, pentagon: 0.595, hexagon: 0.65, star: 0.28 };
  const TWO_RADII = { rectangle: true, ellipse: true };
  const fmtTime = (sec) => sec < 90 ? Math.round(sec) + " s" : sec < 5400 ? Math.round(sec / 60) + " min" : sec < 172800 ? (sec / 3600).toFixed(1) + " h" : (sec / 86400).toFixed(1) + " days";
  const num = (v) => (Math.round(v * 100) / 100).toString();
  let ckCmds = [];
  function updateChunky() {
    const g = (id) => parseFloat(ckEl(id).value);
    if (Number.isFinite(g("ck-x"))) ck.x = g("ck-x");
    if (Number.isFinite(g("ck-z"))) ck.z = g("ck-z");
    ck.shape = ckEl("ck-shape").value;
    if (g("ck-r") >= 0) ck.r = g("ck-r");
    if (g("ck-rz") >= 0) ck.rz = g("ck-rz");
    if (g("ck-cps") > 0) ck.cps = g("ck-cps");
    const two = !!TWO_RADII[ck.shape];
    ckEl("ck-rz-wrap").hidden = !two;
    ckEl("ck-r-label").firstChild.textContent = two ? "Radius X" : "Radius";
    store.set("chunky", { shape: ck.shape, r: ck.r, rz: ck.rz, cps: ck.cps });
    const rz = two ? ck.rz : ck.r;
    const chunks = Math.round((2 * ck.r / 16) * (2 * rz / 16) * SHAPE_FILL[ck.shape]);
    ckEl("ck-est").textContent = `About ${chunks.toLocaleString()} chunks · ${fmtTime(chunks / ck.cps)} at ${num(ck.cps)} chunks/s`;
    ckCmds = [
      `/chunky start minecraft:overworld ${ck.shape} ${num(ck.x)} ${num(ck.z)} ${num(ck.r)}${two ? " " + num(ck.rz) : ""}`,
    ];
    const box = ckEl("ck-cmds"); box.innerHTML = "";
    ckCmds.forEach((c) => {
      const row = document.createElement("div"); row.className = "ckcmd";
      const code = document.createElement("code"); code.textContent = c;
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Copy";
      b.onclick = () => copyText(c, b, code);
      row.append(code, b); box.appendChild(row);
    });
    requestDraw();
  }
  function copyText(text, btn, selectEl) {
    const label = btn.textContent;
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = label), 1200); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(selectEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); btn.textContent = "Selected"; };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (err) { fallback(); }
  }
  ckEl("ck-fit").onclick = () => {
    const ext = Math.max(ck.r, TWO_RADII[ck.shape] ? ck.rz : ck.r);
    const need = (2 * ext) / Math.max(1, Math.min(Wc, Hc) - 40);
    let L = 0; while (L < STEPS.length - 1 && STEPS[L] / CELL < need) L++;
    lvl = L; cx = ck.x; cz = ck.z; viewChanged();
  };
  for (const id of ["ck-x", "ck-z", "ck-r", "ck-rz", "ck-cps"]) ckEl(id).addEventListener("input", updateChunky);
  ckEl("ck-shape").addEventListener("change", updateChunky);
  // Outline of the selection on the map. Polygon shapes are drawn as regular polygons around the center, point up.
  function drawChunkyPreview() {
    if (!ck.open) return;
    const [sx, sy] = worldToScreen(ck.x, ck.z), b = bpp();
    const rx = ck.r / b, rz = (TWO_RADII[ck.shape] ? ck.rz : ck.r) / b;
    ctx.save();
    ctx.beginPath();
    const poly = (n, rot, inner) => {
      const pts = inner ? n * 2 : n;
      for (let i = 0; i < pts; i++) {
        const a = rot + i * 2 * Math.PI / pts, rr = inner && i % 2 ? inner : 1;
        const px = sx + Math.cos(a) * rx * rr, py = sy + Math.sin(a) * rx * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    switch (ck.shape) {
      case "square": case "rectangle": ctx.rect(sx - rx, sy - rz, 2 * rx, 2 * rz); break;
      case "circle": case "ellipse": ctx.ellipse(sx, sy, rx, rz, 0, 0, Math.PI * 2); break;
      case "diamond": poly(4, 0); break;
      case "triangle": poly(3, -Math.PI / 2); break;
      case "pentagon": poly(5, -Math.PI / 2); break;
      case "hexagon": poly(6, 0); break;
      case "star": poly(5, -Math.PI / 2, 0.382); break;
    }
    ctx.fillStyle = "rgba(255, 196, 64, 0.16)"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#ffc440"; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fillStyle = "#ffc440"; ctx.fill();
    ctx.restore();
  }

  // ---------- views ----------
  const viewsEl = document.getElementById("views");
  for (const [id, label] of VIEWS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.view = id; b.setAttribute("aria-pressed", String(id === view));
    b.onclick = () => {
      view = id; store.set("layer", id);
      for (const x of viewsEl.children) x.setAttribute("aria-pressed", String(x.dataset.view === id));
      inlandDirty = true; statsDirty = true; renderLegend(); requestDraw();
    };
    viewsEl.appendChild(b);
  }

  // ---------- settings UI ----------
  const groupsEl = document.getElementById("groups");
  const inputs = {};
  // World height boxes at the top of the panel. Tectonic needs multiples of 16, min_y at or below 0, max_y at least 256.
  for (const [k, id, lo, hi] of [["min_y", "hy-min", -2032, 0], ["max_y", "hy-max", 256, 2032]]) {
    const el = document.getElementById(id);
    const set = (v) => { el.value = v; };
    set(cfg[k]);
    el.onchange = () => {
      const v = parseFloat(el.value);
      if (!Number.isFinite(v)) { set(cfg[k]); return; }
      cfg[k] = Math.min(hi, Math.max(lo, Math.round(v / 16) * 16));
      set(cfg[k]); settingsChanged();
    };
    inputs[k] = { wrap: el.closest(".hyfield"), set, src: () => cfg, def: DEFAULTS };
  }
  let applyTimer = 0;
  // Typical continent width, measured with this viewer (3 seeds, islands off, land-weighted width of
  // land connected through anything but ocean water). Width scales exactly with 0.13 / continents_scale;
  // the table gives the width at scale 0.13 for each ocean offset. Seeds differ by about 15%.
  // Width = twice the farthest distance from the sea (how wide it is at its widest); length = longest end-to-end span.
  // Calibrated on 6 seeds, 384,000-block areas at 480 blocks per sample (scale 0.13), no edge exclusion.
  // Above ocean offset -0.6 continents start merging into supercontinents, so length is not shown there.
  const CONT_WIDTH_013 = [[-1.1, 3880], [-1.0, 4338], [-0.9, 4652], [-0.85, 4869], [-0.8, 5095], [-0.7, 5663], [-0.6, 6335], [-0.5, 7636]];
  const CONT_LENGTH_013 = [[-1.1, 10797], [-1.0, 13178], [-0.9, 14897], [-0.85, 16406], [-0.8, 18276], [-0.7, 23857], [-0.6, 33092]];
  function updateContSize() {
    const el = document.getElementById("cont-size");
    if (!el) return;
    if (exp.exp_continents) {
      const gapBlocks = cfg.continents_scale > 0 ? 1100 / cfg.continents_scale : 0;
      el.textContent = gapBlocks ? `Experimental: continent cells are about ${(gapBlocks >= 10000 ? Math.round(gapBlocks / 1000) * 1000 : Math.round(gapBlocks / 100) * 100).toLocaleString()} blocks apart` : "";
      return;
    }
    const o = cfg.ocean_offset, T0 = CONT_WIDTH_013;
    if (!(cfg.continents_scale > 0) || o < T0[0][0] || o > T0[T0.length - 1][0]) { el.textContent = "Typical continent size not measured for this ocean offset"; return; }
    const at = (tab) => { for (let i = 1; i < tab.length; i++) if (o <= tab[i][0]) { const [a, wa] = tab[i - 1], [b2, wb] = tab[i]; return wa + (wb - wa) * (o - a) / (b2 - a); } return tab[tab.length - 1][1]; };
    const nice = (v) => { v *= 0.13 / cfg.continents_scale; return (v >= 10000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100).toLocaleString(); };
    el.textContent = o <= -0.6
      ? `Typical continent \u2248 ${nice(at(T0))} blocks wide, ${nice(at(CONT_LENGTH_013))} long (seeds vary about 15% in width, 20 to 30% in length)`
      : `Typical continent \u2248 ${nice(at(T0))} blocks wide; length varies too much by seed here, as continents start merging`;
  }
  function settingsChanged() {
    updateContSize();
    store.set("cfg", cfg);
    store.set("exp", exp);
    for (const [k, el] of Object.entries(inputs)) el.wrap.classList.toggle("changed", el.src()[k] !== el.def[k]);
    const same = (P) => Object.keys(P).every((k) => P[k] === cfg[k]);
    for (const b of document.querySelectorAll("#presets button")) { const P = presetOf(b.dataset.preset); b.setAttribute("aria-pressed", String(!!P && same(P))); }
    clearTimeout(applyTimer);
    applyTimer = setTimeout(initWorkers, 250);
  }
  const decimals = (step) => (String(step).split(".")[1] || "").length;
  for (const grp of GROUPS) {
    const det = document.createElement("details"); det.className = "group"; if (grp.open) det.open = true;
    const sum = document.createElement("summary"); sum.textContent = grp.name; det.appendChild(sum);
    const box = document.createElement("div"); box.className = "fields"; det.appendChild(box);
    if (grp.note) { const p = document.createElement("p"); p.className = "hint"; p.style.cssText = "color:var(--muted);font-size:12px;margin:0 0 8px"; p.textContent = grp.note; box.appendChild(p); }
    for (const f of grp.fields) {
      const id = "f-" + f.k;
      const src = grp.exp ? () => exp : () => cfg, def = grp.exp ? EXP_DEFAULTS : DEFAULTS;
      if (f.toggle) {
        const row = document.createElement("label"); row.className = "toggle";
        row.innerHTML = `<input type="checkbox" id="${id}"> ${f.label}`;
        const cb = row.querySelector("input"); cb.checked = !!src()[f.k];
        cb.onchange = () => { src()[f.k] = cb.checked; settingsChanged(); };
        inputs[f.k] = { wrap: row, set: (v) => (cb.checked = !!v), src, def };
        box.appendChild(row); continue;
      }
      const row = document.createElement("div"); row.className = "field";
      row.innerHTML = `<label for="${id}">${f.label}${f.note ? `<small>${f.note}</small>` : ""}${f.k === "continents_scale" ? `<small class="live" id="cont-size"></small>` : ""}</label>` +
        `<input type="number" id="${id}" step="${f.step}">` +
        `<input type="range" id="${id}-r" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}">`;
      const num = row.querySelector('input[type="number"]'), rng = row.querySelector('input[type="range"]');
      const put = (v) => { num.value = (+v).toFixed(decimals(f.step)); rng.value = v; };
      put(src()[f.k]);
      // Height limits must be multiples of 16 inside their range, the same rule Tectonic enforces.
      const fix = (v) => f.snap ? Math.min(f.max, Math.max(f.min, Math.round(v / f.snap) * f.snap)) : v;
      rng.oninput = () => { src()[f.k] = fix(+(+rng.value).toFixed(6)); num.value = (+src()[f.k]).toFixed(decimals(f.step)); settingsChanged(); };
      num.onchange = () => { const v = parseFloat(num.value); if (!Number.isFinite(v)) { put(src()[f.k]); return; } src()[f.k] = fix(v); put(src()[f.k]); settingsChanged(); };
      inputs[f.k] = { wrap: row, set: put, src, def };
      box.appendChild(row);
    }
    groupsEl.appendChild(det);
  }
  for (const b of document.querySelectorAll("#presets button")) {
    b.onclick = () => {
      const P = presetOf(b.dataset.preset); if (!P) return;
      cfg = Object.assign({}, P);
      for (const [k, el] of Object.entries(inputs)) el.set(el.src()[k]);
      settingsChanged();
    };
  }

  // ---------- config import (config/tectonic.json) ----------
  let imported = store.get("imported");
  function presetOf(name) { return name === "mine" ? MINE : name === "defaults" ? STARTER : name === "imported" ? imported : null; }
  function showImportedPreset() { document.querySelector('#presets [data-preset="imported"]').hidden = !imported; }
  function stripComments(text) {
    let out = "", i = 0, inStr = false;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (inStr) { out += ch; if (ch === "\\") { out += text[i + 1] ?? ""; i += 2; continue; } if (ch === '"') inStr = false; i++; continue; }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }
      if (ch === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i++; continue; }
      if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
      out += ch; i++;
    }
    return out.replace(/,(\s*[}\]])/g, "$1");
  }
  function parseLoose(text) {
    const clean = stripComments(text.replace(/^﻿/, ""));
    try { return JSON.parse(clean); }
    catch (e) { return JSON.parse(clean.replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":')); }
  }
  const unwrap = (v) => (v && typeof v === "object" && !Array.isArray(v) && "value" in v ? v.value : v);
  function pick(obj, path) {
    let o = obj;
    for (const p of path) { o = unwrap(o); if (!o || typeof o !== "object" || !(p in o)) return undefined; o = o[p]; }
    return unwrap(o);
  }
  // Same field names and fallbacks as Tectonic's ConfigState codec: a missing field takes the default.
  const FIELD_MAP = [
    ["vertical_scale", ["global_terrain", "vertical_scale"], "number"],
    ["elevation_boost", ["global_terrain", "elevation_boost"], "number"],
    ["ocean_offset", ["continents", "ocean_offset"], "number"],
    ["continents_scale", ["continents", "continents_scale"], "number"],
    ["erosion_scale", ["continents", "erosion_scale"], "number"],
    ["ridge_scale", ["continents", "ridge_scale"], "number"],
    ["flat_terrain_skew", ["continents", "flat_terrain_skew"], "number"],
    ["underground_rivers", ["continents", "underground_rivers"], "boolean"],
    ["rolling_hills", ["continents", "rolling_hills"], "boolean"],
    ["jungle_pillars", ["continents", "jungle_pillars"], "boolean"],
    ["islands_enabled", ["islands", "enabled"], "boolean"],
    ["ocean_depth", ["oceans", "ocean_depth"], "number"],
    ["deep_ocean_depth", ["oceans", "deep_ocean_depth"], "number"],
    ["alternate_erosion_scaling", ["experimental", "alternate_erosion_scaling"], "boolean"],
  ];
  // These three-part noise settings only count when all three numbers are present, as in the mod.
  const NOISE_GROUPS = [
    ["island", ["islands"], "noise"], ["temperature", ["biomes"], "temperature"], ["vegetation", ["biomes"], "vegetation"],
  ];
  function importConfig(text, source) {
    const msg = document.getElementById("import-msg");
    const fail = (why) => { msg.hidden = false; msg.className = "importmsg bad"; msg.textContent = why; };
    let obj;
    try { obj = parseLoose(text); } catch (e) { return fail("That file isn't readable JSON. Pick config/tectonic.json from your Minecraft instance, or paste its full text."); }
    if (!obj || typeof obj !== "object") return fail("That file doesn't contain a Tectonic config.");
    const next = Object.assign({}, DEFAULTS);
    const used = [], defaulted = [], notes = [];
    let raw = null;   // kept so an export can carry over settings the map doesn't use (caves, monuments, ...)
    if ("continents" in obj || "global_terrain" in obj || "general" in obj) {
      raw = obj;
      for (const [k, path, type] of FIELD_MAP) {
        const v = pick(obj, path);
        if (typeof v === type) { next[k] = v; used.push(k); } else defaulted.push(path.join("."));
      }
      for (const [prefix, base, name] of NOISE_GROUPS) {
        const sc = pick(obj, [...base, name + "_scale"]), mu = pick(obj, [...base, name + "_multiplier"]), of = pick(obj, [...base, name + "_offset"]);
        if ([sc, mu, of].every((x) => typeof x === "number")) {
          next[prefix + "_scale"] = sc; next[prefix + "_multiplier"] = mu; next[prefix + "_offset"] = of; used.push(prefix + " noise");
        } else defaulted.push(base.join(".") + "." + name + "_*");
      }
      const minY = pick(obj, ["global_terrain", "min_y"]), maxY = pick(obj, ["global_terrain", "max_y"]);
      const incr = pick(obj, ["global_terrain", "increased_height"]);
      if (Number.isInteger(minY) && Number.isInteger(maxY)) { next.min_y = minY; next.max_y = maxY; used.push("height limits"); }
      else if (typeof incr === "boolean") { next.max_y = incr ? 640 : 320; used.push("height limits"); }
      const minor = pick(obj, ["minor_version"]);
      if (!(minor >= 1) && pick(obj, ["global_terrain", "ultrasmooth"]) === true) { next.min_y = -64; next.max_y = 640; }
      if (pick(obj, ["global_terrain", "ultrasmooth"]) === true) notes.push("Ultrasmooth is on in this file. The map doesn't model it, so terrain here will look rougher than in game.");
      if (pick(obj, ["general", "mod_enabled"]) === false) notes.push("mod_enabled is false in this file, so Tectonic does nothing in game.");
    } else if ("terrain_scales" in obj || "feature_toggles" in obj || "enabled" in obj || "features" in obj) {
      // Tectonic v2 layout, upgraded the same way the mod does.
      const num = (p, d) => { const v = pick(obj, p); return typeof v === "number" ? (used.push(p.join(".")), v) : d; };
      next.vertical_scale = num(["terrain_scales", "vertical_multiplier"], 1.125);
      next.erosion_scale = num(["terrain_scales", "erosion_scale"], 0.25);
      next.ocean_depth = num(["terrain_scales", "ocean_depth"], -0.15);
      next.deep_ocean_depth = num(["terrain_scales", "deep_ocean_depth"], -0.45);
      const ur = pick(obj, ["feature_toggles", "underground_rivers"]); if (typeof ur === "boolean") next.underground_rivers = ur;
      if (pick(obj, ["feature_toggles", "increased_height"]) === true) next.max_y = 640;
      notes.push("This is the older Tectonic 2 layout. The mod upgrades it and uses defaults for everything it didn't have.");
    } else {
      return fail("No Tectonic settings found. The file should have sections like continents, global_terrain and oceans.");
    }
    if (!used.length) return fail("No Tectonic settings found in that file.");
    imported = next; store.set("imported", imported); store.set("importedRaw", raw); showImportedPreset();
    cfg = Object.assign({}, imported);
    for (const [k, el] of Object.entries(inputs)) el.set(el.src()[k]);
    settingsChanged();
    if (next.max_y !== 320 || next.min_y !== -64) notes.push(`Height limits ${next.min_y} to ${next.max_y} are applied.`);
    msg.hidden = false; msg.className = "importmsg";
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    msg.innerHTML = `Loaded ${used.length} settings from ${esc(source)}.` +
      (defaulted.length ? ` Missing in the file, so using Tectonic defaults: ${esc(defaulted.join(", "))}.` : "") +
      (notes.length ? `<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
      `<ul><li>Cave, ore, snow and monument settings don't change the map, so they aren't shown.</li></ul>`;
  }
  const fileEl = document.getElementById("import-file");
  document.getElementById("import-btn").onclick = () => fileEl.click();
  fileEl.onchange = () => {
    const f = fileEl.files && fileEl.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importConfig(String(r.result), f.name);
    r.onerror = () => importConfig("", f.name);
    r.readAsText(f);
    fileEl.value = "";
  };
  // ---------- config export (same layout Tectonic 3.0.28 writes) ----------
  const CONFIG_TEMPLATE = {
    biomes: { temperature_multiplier: 1.0, temperature_offset: 0.0, temperature_scale: 0.25, vegetation_multiplier: 1.0, vegetation_offset: 0.0, vegetation_scale: 0.25 },
    caves: { carvers_enabled: true, cheese_additive: 0.27, cheese_enabled: true, depth_cutoff_size: 0.1, depth_cutoff_start: 0.1, noodle_additive: -0.075, noodle_enabled: true, ore_fix: false, spaghetti_enabled: true },
    continents: { continents_scale: 0.13, erosion_scale: 0.25, flat_terrain_skew: 0.1, jungle_pillars: true, ocean_offset: -0.8, ridge_scale: 0.25, river_ice: false, river_lanterns: true, rolling_hills: true, underground_rivers: true },
    experimental: { alternate_continents_scaling: false, alternate_erosion_scaling: false, improved_jungle_pillars: false },
    general: { mod_enabled: true, snow_start_offset: 128 },
    global_terrain: { elevation_boost: 0.0, lava_tunnels: true, max_y: 320, min_y: -64, ultrasmooth: false, vertical_scale: 1.125 },
    islands: { enabled: true, noise_multiplier: 1.0, noise_offset: 0.0, noise_scale: 0.11 },
    minor_version: 1,
    oceans: { deep_ocean_depth: -0.45, monument_offset: -30, ocean_depth: -0.22, remove_frozen_ocean_ice: false },
  };
  // Comments Tectonic writes above its fields (copied from the 3.0.28 config file).
  const CONFIG_COMMENTS = {
    "caves.carvers_enabled": "Whether old caves/ravines should generate. Game restart required!",
    "caves.cheese_additive": "Density added to cheese caves. Lower values = bigger cheese caves.",
    "caves.cheese_enabled": "The standard expansive, large cheese-shaped caves.",
    "caves.depth_cutoff_size": "The distance in depth between the start and end of the depth cutoff. 0.1 means caves close over ~12 blocks, 0.0 means caves cut off at the `depth_cutoff_start` value immediately.",
    "caves.depth_cutoff_start": "The depth noise value that caves stop generating. 0.1 cuts off caves ~12 blocks below the surface, 0.5 cuts off caves ~64 blocks below the surface.",
    "caves.noodle_additive": "Density added to noodle caves. Lower values = bigger noodle caves.",
    "caves.noodle_enabled": "The narrow, claustrophobic noodle-shaped caves.",
    "caves.ore_fix": "Alters ore generation to generate at more acceptable levels when min_y is lowered.",
    "caves.spaghetti_enabled": "The tunneling, medium sized spaghetti-shaped caves.",
    "continents.continents_scale": "Horizontally scales continents. Lower values = larger continents and oceans between them.",
    "continents.erosion_scale": "Horizontally scales erosion, primarily impacting mountains. Lower values = thicker mountain ranges and terrain between them.",
    "continents.flat_terrain_skew": "The threshold where plateau terrain becomes flatter terrain. Positive numbers favor flat terrain and negative numbers favor plateau terrain.",
    "continents.jungle_pillars": "Some jungles generate massive pillars that can extend upwards of a hundred blocks tall.",
    "continents.ocean_offset": "Skews terrain towards or away from oceans. Lower values = more oceans. Above -0.45, deep oceans will not spawn! Above -0.2, oceans will not spawn!",
    "continents.ridge_scale": "Horizontally scales the ridge noise, primarily impacting rivers and terrain around them like plateaus. Lower values = wider rivers and terrain between them.",
    "continents.river_ice": "Underground rivers under snowy biomes will generate with ice.",
    "continents.river_lanterns": "Underground rivers will rarely generate with hanging lanterns.",
    "continents.rolling_hills": "Some Plains biomes generate very smooth, hilly terrain.",
    "continents.underground_rivers": "Rivers that reach mountain ranges continue underground, allowing smoother boat exploration.",
    "general.mod_enabled": "When disabled, the mod lays dormant and does nothing. Game restart required!",
    "general.snow_start_offset": "Offsets the y-level snow in cold biomes like Taigas starts at.",
    "global_terrain.elevation_boost": "Increases the effects of Vertical Scale on mountainous terrain. This will increase the scale of mountains and plateaus faster than lowlands.",
    "global_terrain.lava_tunnels": "Rare, deep underground tunnels of lava sometimes generate at the bottom of the world.",
    "global_terrain.ultrasmooth": "Greatly smoothens out the terrain like Tectonic v2, removing staircasing artifacts at the cost of strange/broken generation in deep oceans and windswept biomes.",
    "global_terrain.vertical_scale": "Vertically stretches terrain above sea level. Doubling this value will double the surface's height at a given point from sea level.",
    "oceans.deep_ocean_depth": "0 is at sea level, -0.5 is 64 blocks below sea level.",
    "oceans.monument_offset": "Offsets (vanilla) ocean monuments to adjust for deeper oceans.",
    "oceans.ocean_depth": "0 is at sea level, -0.5 is 64 blocks below sea level.",
    "oceans.remove_frozen_ocean_ice": "Removes the surface ice from Frozen Oceans, making them as navigable as Deep Frozen Oceans.",
  };
  const INT_KEYS = new Set(["minor_version", "snow_start_offset", "monument_offset", "min_y", "max_y"]);
  // Map-page setting -> [section, key] in the file.
  const EXPORT_MAP = {
    vertical_scale: ["global_terrain", "vertical_scale"], elevation_boost: ["global_terrain", "elevation_boost"],
    min_y: ["global_terrain", "min_y"], max_y: ["global_terrain", "max_y"],
    ocean_offset: ["continents", "ocean_offset"], continents_scale: ["continents", "continents_scale"], erosion_scale: ["continents", "erosion_scale"],
    ridge_scale: ["continents", "ridge_scale"], flat_terrain_skew: ["continents", "flat_terrain_skew"], underground_rivers: ["continents", "underground_rivers"],
    rolling_hills: ["continents", "rolling_hills"], jungle_pillars: ["continents", "jungle_pillars"],
    islands_enabled: ["islands", "enabled"], island_scale: ["islands", "noise_scale"], island_multiplier: ["islands", "noise_multiplier"], island_offset: ["islands", "noise_offset"],
    ocean_depth: ["oceans", "ocean_depth"], deep_ocean_depth: ["oceans", "deep_ocean_depth"],
    temperature_scale: ["biomes", "temperature_scale"], temperature_multiplier: ["biomes", "temperature_multiplier"], temperature_offset: ["biomes", "temperature_offset"],
    vegetation_scale: ["biomes", "vegetation_scale"], vegetation_multiplier: ["biomes", "vegetation_multiplier"], vegetation_offset: ["biomes", "vegetation_offset"],
    alternate_erosion_scaling: ["experimental", "alternate_erosion_scaling"],
  };
  const deepUnwrap = (v) => { v = unwrap(v); if (v && typeof v === "object" && !Array.isArray(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = deepUnwrap(v[k]); return o; } return v; };
  function buildConfig() {
    const raw = store.get("importedRaw");
    const base = JSON.parse(JSON.stringify(CONFIG_TEMPLATE));
    let fromFile = false;
    if (raw && typeof raw === "object") {
      fromFile = true;
      const r = deepUnwrap(raw);
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object" && base[k] && typeof base[k] === "object") Object.assign(base[k], v); else base[k] = v;
      }
    }
    if (base.global_terrain) delete base.global_terrain.increased_height;   // replaced by min_y / max_y
    base.minor_version = 1;
    for (const [k, [sec, key]] of Object.entries(EXPORT_MAP)) if (cfg[k] !== undefined) base[sec][key] = cfg[k];
    return { obj: base, fromFile };
  }
  function numText(v, isInt) {
    if (isInt) return String(Math.round(v));
    let t = String(v);
    if (/e/i.test(t)) { const [m, e] = t.split(/e/i); t = (m.includes(".") ? m : m + ".0") + "E" + parseInt(e, 10); }   // Java style, e.g. 1.0E-4
    else if (!t.includes(".")) t += ".0";
    return t;
  }
  function serializeConfig(obj) {
    const out = [];
    const write = (o, path, depth) => {
      const pad = "  ".repeat(depth + 1), keys = Object.keys(o).sort();
      keys.forEach((k, i) => {
        const full = path ? path + "." + k : k, v = o[k], comma = i < keys.length - 1 ? "," : "";
        if (CONFIG_COMMENTS[full]) out.push(`${pad}// ${CONFIG_COMMENTS[full]}`);
        if (v && typeof v === "object" && !Array.isArray(v)) {
          out.push(`${pad}${JSON.stringify(k)}: {`); write(v, full, depth + 1); out.push(`${pad}}${comma}`);
        } else {
          const text = typeof v === "number" ? numText(v, INT_KEYS.has(k)) : JSON.stringify(v);
          out.push(`${pad}${JSON.stringify(k)}: ${text}${comma}`);
        }
      });
    };
    out.push("{"); write(obj, "", 0); out.push("}");
    return out.join("\n");
  }
  let exportText = "";
  function downloadExport() {
    try {
      const url = URL.createObjectURL(new Blob([exportText + "\n"], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "tectonic.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { /* some embedded viewers block downloads; the text box still works */ }
  }
  document.getElementById("export-btn").onclick = () => {
    const { obj, fromFile } = buildConfig();
    exportText = serializeConfig(obj);
    document.getElementById("export-text").value = exportText;
    document.getElementById("export-note").textContent = (fromFile
      ? "Map settings from this page, plus the cave, monument and other settings from the file you imported. "
      : "Map settings from this page. Settings the map doesn't use (caves, monuments, snow) are Tectonic's defaults. ") +
      "Replace config/tectonic.json with this, then restart the game. Only new chunks use it. If no download started, copy the text instead.";
    document.getElementById("export-box").hidden = false;
    downloadExport();
  };
  document.getElementById("export-save").onclick = downloadExport;
  document.getElementById("export-close").onclick = () => { document.getElementById("export-box").hidden = true; };
  document.getElementById("export-copy").onclick = (e) => copyText(exportText, e.currentTarget, document.getElementById("export-text"));
  document.getElementById("import-apply").onclick = () => importConfig(document.getElementById("import-text").value, "pasted text");
  showImportedPreset();

  // ---------- plotted points and distances (right-click menu) ----------
  const LINE_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LINE_COLORS = ["#ffffff", "#ffd24a", "#5fe0ff", "#ff8fd0", "#a6f06a", "#ffa15c"];
  const segLen = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  function updateMeasure() {
    try { localStorage.setItem("tsa:plot", JSON.stringify(plot)); } catch (e) { /* storage unavailable */ }
    ckEl("measure").hidden = plot.length === 0;
    const list = ckEl("m-list"); list.innerHTML = "";
    const row = (a, b, cls) => { const li = document.createElement("li"); if (cls) li.className = cls; li.innerHTML = `<span>${a}</span><span>${b}</span>`; list.appendChild(li); };
    plot.forEach((line, li) => {
      const name = LINE_NAMES[li % 26], color = LINE_COLORS[li % LINE_COLORS.length];
      if (plot.length > 1) row(`<i class="mdot" style="background:${color}"></i>Line ${name}`, "", "mhead");
      if (line.length === 1) row(`${name}1`, `${line[0].x.toLocaleString()}, ${line[0].z.toLocaleString()}`);
      let total = 0;
      for (let i = 1; i < line.length; i++) {
        const d = segLen(line[i - 1], line[i]); total += d;
        row(`${name}${i} → ${name}${i + 1}`, `${Math.round(d).toLocaleString()} blocks`);
      }
      if (line.length > 2) row("Total", `${Math.round(total).toLocaleString()} blocks`, "msum");
    });
    const cl = curLine();
    ckEl("m-total").innerHTML = cl && cl.length === 1 ? "<span>Right-click another spot to measure</span><span></span>" : "";
    ckEl("m-total").hidden = !(cl && cl.length === 1);
    requestDraw();
  }
  function undoPlot() { const cl = curLine(); if (!cl) return; cl.pop(); if (!cl.length) plot.pop(); updateMeasure(); }
  const clearPlot = () => { plot.length = 0; updateMeasure(); };
  ckEl("ctx-plot").onclick = () => { hideCtx(); if (!curLine()) plot.push([]); curLine().push({ x: ctxAt.wx, z: ctxAt.wz }); updateMeasure(); };
  ckEl("ctx-plot-new").onclick = () => { hideCtx(); plot.push([{ x: ctxAt.wx, z: ctxAt.wz }]); updateMeasure(); };
  ckEl("ctx-plot-undo").onclick = () => { hideCtx(); undoPlot(); };
  ckEl("ctx-plot-clear").onclick = () => { hideCtx(); clearPlot(); };
  ckEl("m-undo").onclick = undoPlot;
  ckEl("m-clear").onclick = clearPlot;
  function drawPlot() {
    if (!plot.length) return;
    ctx.save();
    ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    plot.forEach((line, li) => {
      const name = LINE_NAMES[li % 26], color = LINE_COLORS[li % LINE_COLORS.length];
      const pts = line.map((p) => worldToScreen(p.x + 0.5, p.z + 0.5));
      if (pts.length > 1) {
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = "rgba(20, 24, 28, 0.85)"; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
      for (let i = 1; i < pts.length; i++) {
        const d = Math.round(segLen(line[i - 1], line[i])).toLocaleString();
        const mx = (pts[i][0] + pts[i - 1][0]) / 2, my = (pts[i][1] + pts[i - 1][1]) / 2;
        const w = ctx.measureText(d).width + 10;
        ctx.fillStyle = "rgba(20, 24, 28, 0.85)"; ctx.fillRect(mx - w / 2, my - 9, w, 18);
        ctx.fillStyle = color; ctx.fillText(d, mx, my + 0.5);
      }
      ctx.font = '700 10.5px "Barlow Semi Condensed", "Arial Narrow", sans-serif';
      pts.forEach(([x, y], i) => {
        const label = plot.length > 1 ? `${name}${i + 1}` : String(i + 1);
        const r = label.length > 2 ? 10 : 8.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(20, 24, 28, 0.9)"; ctx.stroke();
        ctx.fillStyle = "#14181c"; ctx.fillText(label, x, y + 0.5);
      });
    });
    ctx.restore();
  }
  updateMeasure();

  // ---------- render area popup (right-click menu) ----------
  const areaPop = document.getElementById("areapop"), apX = ckEl("ap-x"), apZ = ckEl("ap-z"), apR = ckEl("ap-r");
  makeDraggable(areaPop);
  const apSize = () => { const r = parseFloat(apR.value); ckEl("ap-size").textContent = r > 0 ? `${(2 * r).toLocaleString()} × ${(2 * r).toLocaleString()} blocks` : "–"; };
  apR.addEventListener("input", apSize);
  ckEl("ctx-area").onclick = () => {
    hideCtx();
    apX.value = ctxAt.wx; apZ.value = ctxAt.wz; apR.value = area.r; apSize();
    placeIn(areaPop, ctxAt.sx + 12, ctxAt.sy - 40);
    apR.focus(); apR.select();
  };
  function areaOff() { area.on = false; store.set("area", area); areaPop.hidden = true; viewChanged(); }
  ckEl("ctx-area-off").onclick = () => { hideCtx(); areaOff(); };
  ckEl("ap-off").onclick = areaOff;
  ckEl("ap-close").onclick = () => { areaPop.hidden = true; };
  areaPop.addEventListener("submit", (e) => {
    e.preventDefault();
    const x = parseFloat(apX.value), z = parseFloat(apZ.value), r = parseFloat(apR.value);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(r >= 16)) { apR.focus(); return; }
    Object.assign(area, { on: true, x, z, r });
    store.set("area", area); areaPop.hidden = true;
    fitArea(); viewChanged();
  });

  // ---------- seed ----------
  const seedEl = document.getElementById("seed");
  seedEl.value = seedText;
  function applySeed() {
    seedText = seedEl.value;
    seedValue = parseSeed(seedText);
    if (!seedText.trim()) seedEl.value = seedText = seedValue.toString();
    const err = document.getElementById("seed-err");
    const numeric = /^[+-]?\d+$/.test(seedText.trim());
    err.hidden = numeric;
    err.textContent = numeric ? "" : `Not a number, so the game turns this text into seed ${seedValue}.`;
    store.set("seed", seedText);
    initWorkers();
  }
  document.getElementById("seed-apply").onclick = applySeed;
  document.getElementById("seed-dice").onclick = (e) => {
    const b = e.currentTarget;
    seedEl.value = randomSeed().toString();
    b.classList.remove("rolled"); void b.offsetWidth; b.classList.add("rolled");
    applySeed();
  };
  seedEl.addEventListener("keydown", (e) => { if (e.key === "Enter") applySeed(); });

  // ---------- start ----------
  settingsChanged(); clearTimeout(applyTimer);
  new ResizeObserver(resize).observe(wrap);
  seedValue = parseSeed(seedText);
  initWorkers();
  renderLegend();
  window.addEventListener("resize", resize);
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", requestDraw);
})();
