// Tectonic (mod mode) density-function evaluator for top-down maps.
// Compiles the bundled JSON graph into closures; named functions are memoised per sample point.
"use strict";
const TEngine = (() => {
  const f32 = Math.fround;

  // Tectonic's own config -> values used by tectonic:config_constant / config_noise.
  function configValue(cfg, key) {
    switch (key) {
      case "vertical_scale": return cfg.vertical_scale;
      case "elevation_boost": return cfg.elevation_boost;
      case "min_y": return cfg.min_y;
      case "max_y": return cfg.max_y;
      case "lava_tunnels": return cfg.lava_tunnels ? 1 : 0;
      case "ocean_offset": return cfg.ocean_offset;
      case "alternate_erosion_scale": return cfg.erosion_scale * 4;
      case "underground_rivers": return cfg.underground_rivers ? -1 : 0;
      case "flat_terrain_skew": return cfg.flat_terrain_skew;
      case "rolling_hills": return cfg.rolling_hills ? 1 : 0;
      case "jungle_pillars": return cfg.jungle_pillars ? 1 : 0;
      case "ocean_depth": return cfg.ocean_depth;
      case "deep_ocean_depth": return cfg.deep_ocean_depth;
      case "depth_cutoff_start": return 0.1;
      case "depth_cutoff_size": return 0.1;
      case "cheese_enabled": return 1;
      case "cheese_additive": return 0.27;
      case "noodle_enabled": return 1;
      case "noodle_additive": return -0.075;
      default: return 0;
    }
  }
  function noiseState(cfg, key) {
    switch (key) {
      case "continents": return { scale: cfg.continents_scale, mul: 1, off: 0, smooth: !!cfg.alternate_erosion_scaling };
      case "erosion": return { scale: cfg.erosion_scale, mul: 1, off: 0, smooth: !!cfg.alternate_erosion_scaling };
      case "ridge": return { scale: cfg.ridge_scale, mul: 1, off: 0 };
      case "island": return { scale: cfg.island_scale, mul: cfg.island_multiplier, off: cfg.island_offset };
      case "temperature": return { scale: cfg.temperature_scale, mul: cfg.temperature_multiplier, off: cfg.temperature_offset };
      case "vegetation": return { scale: cfg.vegetation_scale, mul: cfg.vegetation_multiplier, off: cfg.vegetation_offset };
      default: throw new Error("noise state " + key);
    }
  }

  // ---------- experimental continents (not in the game) ----------
  // Cells about EXP_CELL noise units across decide where continents are; distance to the nearest separating cell
  // becomes how far inland a block is; a slow fractal warp bends the cell outlines; Tectonic's own continent
  // noise with its three biggest layers switched off adds the coastline detail. Integer hashing, plain arithmetic
  // and square roots only, so a Java port can give the same bits.
  // EXP_T0 is where Tectonic's coast sits in |continent noise| (at ocean offset -0.8); EXP_GAIN matches the slope of
  // Tectonic's big layers at the coast; inland the rise eases off toward EXP_RISE, about where Tectonic's tops out.
  // EXP_SMIN and EXP_SMAX are where the 5x5 cell window stops being able to see every cell that matters, so the
  // value is held there and never jumps when the window moves on.
  const EXP_CELL = 1100, EXP_JITTER = 0.85, EXP_T0 = 0.43, EXP_GAIN = 3.0, EXP_RISE = 1.8, EXP_SMAX = 0.4, EXP_SMIN = -0.38;
  // Offshore cubic: value EXP_T0 and slope EXP_GAIN at the coast, value 0 and slope 0 at EXP_SMIN.
  const EXP_SEA_MID = 0.17, EXP_SEA_AMP = 0.35;
  const EXP_M = -EXP_SMIN, EXP_C3 = (EXP_GAIN * EXP_M - 2 * EXP_T0) / (EXP_M * EXP_M * EXP_M), EXP_C2 = (EXP_GAIN + 3 * EXP_C3 * EXP_M * EXP_M) / (2 * EXP_M);
  function expContinentsField(positional, cfg) {
    const r = positional.fromHashOf("tsa:continent_cells");
    const S0 = Number(BigInt.asIntN(32, r.nextLong())), S1 = Number(BigInt.asIntN(32, r.nextLong()));
    const C = EXP_CELL;
    const landShare = cfg.exp_land ?? 0.5, joinChance = cfg.exp_join ?? 0.5, warp = (cfg.exp_warp ?? 1.2) * C;
    const gap = (cfg.exp_gap ?? 0.15) * C;
    const wx = MCNoise.makeNoise(positional, "tsa:continent_warp_x", -10, [1, 1, 1]);
    const wz = MCNoise.makeNoise(positional, "tsa:continent_warp_z", -10, [1, 1, 1]);
    // Same seed and octaves as Tectonic's continent noise, biggest three layers off, original value factor kept,
    // so the remaining layers are exactly the ones Tectonic adds today.
    // Open ocean gets its own slow noise so it is not one flat floor: raising ocean offset then floods it in
    // patches, the way Tectonic's ocean does, instead of all at once.
    const sea = MCNoise.makeNoise(positional, "tsa:open_ocean", -10, [1, 1, 1]);
    const det = MCNoise.makeNoise(positional, "minecraft:continentalness", -10, [0, 0, 0, 3, 2, 2, 1, 1, 1]);
    det.valueFactor = 0.16666666666666666 / (0.1 * (1 + 1 / 9));
    const H = (a, b, c) => {
      let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x2c1b3c6d) ^ S0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) ^ S1;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return h ^ (h >>> 16);
    };
    const U = (h) => (h >>> 8) / 16777216;
    const d = new Float64Array(25), isLand = new Uint8Array(25), id = new Int32Array(25);
    return (u, v) => {
      const qx = u + warp * wx.get(u, 0, v), qz = v + warp * wz.get(u, 0, v);
      const i0 = Math.floor(qx / C), j0 = Math.floor(qz / C);
      let dO = 4 * C, m = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++, m++) {
        const i = i0 + di, j = j0 + dj;
        const px = (i + 0.5 + (U(H(i, j, 1)) - 0.5) * EXP_JITTER) * C, pz = (j + 0.5 + (U(H(i, j, 2)) - 0.5) * EXP_JITTER) * C;
        const ex = qx - px, ez = qz - pz, dist = Math.sqrt(ex * ex + ez * ez);
        d[m] = dist;
        isLand[m] = U(H(i, j, 3)) < landShare ? 1 : 0;
        id[m] = H(i, j, 4);
        if (!isLand[m] && dist < dO) dO = dist;
      }
      // How far inside each nearby land cell's continent the point is: half the gap between the distance to the
      // nearest separating point and to the cell's own point. Ocean cells always separate; a neighbouring land
      // cell separates (with an extra sea gap) unless the pair is merged. Taking the largest keeps it continuous.
      let s = -Infinity;
      for (let a = 0; a < 25; a++) {
        if (!isLand[a]) continue;
        let f = (dO - d[a]) / 2;
        for (let b2 = 0; b2 < 25; b2++) {
          if (b2 === a || !isLand[b2]) continue;
          const ha = id[a], hb = id[b2];
          const merged = U(H(ha ^ hb, (ha + hb) | 0, 5)) < joinChance;
          if (!merged) { const g = (d[b2] - d[a]) / 2 - gap; if (g < f) f = g; }
        }
        if (f > s) s = f;
      }
      if (s > EXP_SMAX * C) s = EXP_SMAX * C;
      if (!(s >= EXP_SMIN * C)) s = EXP_SMIN * C;
      const t = s / C;
      // Offshore it starts with the same slope and keeps falling out to open ocean, where it fades into the open
      // ocean noise, so raising ocean offset moves coasts outward steadily and floods open ocean in patches.
      let big;
      if (t >= 0) big = EXP_T0 + EXP_GAIN * t / (1 + EXP_GAIN * t / EXP_RISE);
      else {
        const w = t / EXP_SMIN, open = Math.max(0, EXP_SEA_MID + EXP_SEA_AMP * sea.get(u, 0, v));
        big = EXP_T0 + t * (EXP_GAIN + t * (EXP_C2 + t * EXP_C3)) + w * w * open;
      }
      return big + det.get(u, 0, v);
    };
  }

  class Engine {
    constructor(bundle, seed, cfg) {
      this.b = bundle; this.cfg = cfg; this.seed = seed;
      this.flatEngine = null;   // evaluates flat_cache contents at y = 0 (see compileNode)
      this.isFlat = false;
      this.positional = MCNoise.worldPositional(BigInt(seed));
      this.noiseCache = new Map();
      this.named = new Map();      // id -> {fn, slot}
      this.nSlots = 0;
      this.stamp = 1;        // bumps on every new sample point or height
      this.xzStamp = 1;      // bumps only on a new x/z column; functions that never read y stay cached across heights
      this.vals = new Float64Array(4096);
      this.stamps = new Uint32Array(4096);
      this.x = 0; this.y = 0; this.z = 0;
      this.unsupported = new Set();
      this.islandsOff = !cfg.islands_enabled && cfg.ocean_offset < -0.49;
    }
    noise(id) {
      let n = this.noiseCache.get(id);
      if (!n) {
        const p = this.b.noises[id];
        if (!p) throw new Error("missing noise " + id);
        // Tectonic's NoisesMixin seeds "tectonic:parameter/<name>" noises as "minecraft:<name>".
        const seedId = id.startsWith("tectonic:parameter/") ? "minecraft:" + id.slice("tectonic:parameter/".length) : id;
        n = MCNoise.makeNoise(this.positional, seedId, p.firstOctave, p.amplitudes);
        this.noiseCache.set(id, n);
      }
      return n;
    }
    ref(id) {
      if (!id.includes(":")) id = "minecraft:" + id;
      let e = this.named.get(id);
      if (e) return e.call;
      const slot = this.nSlots++;
      const self = this;
      e = { fn: null, call: null };
      this.named.set(id, e);
      const special = this.islandsOff && id === "tectonic:island_selector";
      const def = special ? 0 : this.b.dfs[id];
      if (def === undefined) throw new Error("missing df " + id);
      const usesY = this.dependsOnY(def);
      e.call = usesY
        ? () => {
          if (self.stamps[slot] === self.stamp) return self.vals[slot];
          const v = e.fn(); self.vals[slot] = v; self.stamps[slot] = self.stamp; return v;
        }
        : () => {
          if (self.stamps[slot] === self.xzStamp) return self.vals[slot];
          const v = e.fn(); self.vals[slot] = v; self.stamps[slot] = self.xzStamp; return v;
        };
      if (special) { e.fn = () => 0; return e.call; }
      e.fn = this.compile(def);
      return e.call;
    }
    // True when a function's value can change with height (y). Anything else gives the same value for the
    // whole column, so it is safe to reuse across the heights one sample looks at.
    dependsOnY(n) {
      if (typeof n === "number") return false;
      if (typeof n === "string") {
        if (!n.includes(":")) n = "minecraft:" + n;
        if (!this.dyMemo) this.dyMemo = new Map();
        if (this.dyMemo.has(n)) return this.dyMemo.get(n);
        this.dyMemo.set(n, true);   // conservative while recursing
        const special = this.islandsOff && n === "tectonic:island_selector";
        const r = special ? false : this.dependsOnY(this.b.dfs[n]);
        this.dyMemo.set(n, r);
        return r;
      }
      if (Array.isArray(n)) return n.some((x) => this.dependsOnY(x));
      if (!n || typeof n !== "object") return false;
      const t = (n.type || "").replace("minecraft:", "");
      if (t === "y_clamped_gradient" || t === "shift" || t === "old_blended_noise") return true;
      if (t === "flat_cache" && !this.isFlat) return false;   // pinned to y = 0, see compileNode
      if (t === "noise" && n.y_scale !== 0) return true;
      if (t === "shifted_noise" && (n.y_scale !== 0 || this.dependsOnY(n.shift_y))) return true;
      if (t === "spline") return this.splineDependsOnY(n.spline);
      for (const [k, v] of Object.entries(n)) {
        if (k === "type" || k === "noise" || k === "key") continue;
        if (typeof v === "string" && (t === "shift_a" || t === "shift_b")) continue;   // a noise id, not a function
        if (this.dependsOnY(v)) return true;
      }
      return false;
    }
    splineDependsOnY(sp) {
      if (typeof sp === "number") return false;
      return this.dependsOnY(sp.coordinate) || sp.points.some((p) => this.splineDependsOnY(p.value));
    }
    compile(n) {
      if (typeof n === "number") return () => n;
      if (typeof n === "string") return this.ref(n);
      const f = this.compileNode(n);
      // A noise or spline written inline inside a height-dependent function would otherwise be recomputed at every
      // height the column solver looks at. If it does not read y itself, keep its value for the whole column.
      const t = n.type.replace("minecraft:", "");
      if ((t === "noise" || t === "shifted_noise" || t === "spline" || t === "tectonic:config_noise") && !this.dependsOnY(n)) {
        const slot = this.nSlots++, self = this;
        return () => {
          if (self.stamps[slot] === self.xzStamp) return self.vals[slot];
          const v = f(); self.vals[slot] = v; self.stamps[slot] = self.xzStamp; return v;
        };
      }
      return f;
    }
    compileNode(n) {
      const self = this;
      const t = n.type.replace("minecraft:", "");
      const C = (k) => this.compile(n[k]);
      switch (t) {
        case "add": { const a = C("argument1"), b = C("argument2"); return () => a() + b(); }
        case "mul": { const a = C("argument1"), b = C("argument2"); return () => { const v = a(); return v === 0 ? 0 : v * b(); }; }
        case "min": { const a = C("argument1"), b = C("argument2"); return () => Math.min(a(), b()); }
        case "max": { const a = C("argument1"), b = C("argument2"); return () => Math.max(a(), b()); }
        case "abs": {
          // Experimental continents replace |continent noise| inside raw_continents; everything downstream is Tectonic's.
          if (this.cfg.exp_continents && n.argument === "tectonic:__constants/noise/continents") return this.expContinents();
          const a = C("argument"); return () => Math.abs(a());
        }
        case "square": { const a = C("argument"); return () => { const v = a(); return v * v; }; }
        case "cube": { const a = C("argument"); return () => { const v = a(); return v * v * v; }; }
        case "half_negative": { const a = C("argument"); return () => { const v = a(); return v > 0 ? v : v * 0.5; }; }
        case "quarter_negative": { const a = C("argument"); return () => { const v = a(); return v > 0 ? v : v * 0.25; }; }
        case "squeeze": { const a = C("argument"); return () => { const c = Math.min(1, Math.max(-1, a())); return c / 2 - c * c * c / 24; }; }
        case "invert": case "tectonic:invert": { const a = C("argument"); return () => 1 / a(); }
        case "clamp": { const a = C("input"), lo = n.min, hi = n.max; return () => Math.min(hi, Math.max(lo, a())); }
        case "tectonic:config_clamp": { const a = C("input"), lo = C("min"), hi = C("max"); return () => Math.min(Math.max(a(), lo()), hi()); }
        case "range_choice": {
          const i = C("input"), a = C("when_in_range"), b = C("when_out_of_range"), lo = n.min_inclusive, hi = n.max_exclusive;
          return () => { const v = i(); return v >= lo && v < hi ? a() : b(); };
        }
        case "y_clamped_gradient": {
          const fy = n.from_y, ty = n.to_y, fv = n.from_value, tv = n.to_value;
          return () => { const y = self.y; if (y <= fy) return fv; if (y >= ty) return tv; return fv + (y - fy) / (ty - fy) * (tv - fv); };
        }
        case "noise": {
          const nz = this.noise(n.noise), xz = n.xz_scale, ys = n.y_scale;
          return () => nz.get(self.x * xz, self.y * ys, self.z * xz);
        }
        case "shifted_noise": {
          const nz = this.noise(n.noise), xz = n.xz_scale, ys = n.y_scale, sx = C("shift_x"), sy = C("shift_y"), sz = C("shift_z");
          return () => nz.get(self.x * xz + sx(), self.y * ys + sy(), self.z * xz + sz());
        }
        case "shift_a": { const nz = this.noise(n.argument); return () => nz.get(self.x * 0.25, 0, self.z * 0.25) * 4; }
        case "shift_b": { const nz = this.noise(n.argument); return () => nz.get(self.z * 0.25, self.x * 0.25, 0) * 4; }
        case "shift": { const nz = this.noise(n.argument); return () => nz.get(self.x * 0.25, self.y * 0.25, self.z * 0.25) * 4; }
        case "tectonic:config_constant": { const v = configValue(this.cfg, n.key); return () => v; }
        case "tectonic:config_noise": {
          const nz = this.noise(n.noise), st = noiseState(this.cfg, n.key), sx = C("shift_x"), sz = C("shift_z");
          // Tectonic applies "alternate_erosion_scaling" to both the continents and erosion noises (ConfigState.getNoiseState).
          if (st.smooth) return () => nz.get((self.x + sx()) * st.scale, 0, (self.z + sz()) * st.scale) * st.mul + st.off;
          return () => nz.get(self.x * st.scale + sx(), 0, self.z * st.scale + sz()) * st.mul + st.off;
        }
        case "old_blended_noise": {
          // base_3d_noise. RandomState reseeds it from the world's positional random with "minecraft:terrain";
          // it reads whole block coordinates.
          const bn = new MCNoise.Blended(this.positional.fromHashOf("minecraft:terrain"), n.xz_scale, n.y_scale, n.xz_factor, n.y_factor, n.smear_scale_multiplier);
          return () => bn.get(Math.floor(self.x), Math.floor(self.y), Math.floor(self.z));
        }
        case "spline": return this.compileSpline(n.spline);
        case "flat_cache": {
          // In world generation flat_cache is filled once per column at y = 0. Only Tectonic's mountain ridges put
          // height-dependent noise inside one, so those are worked out in a separate engine pinned to y = 0 and
          // kept for the column. Everything else gives the same value at any height and passes straight through.
          if (this.isFlat || !this.dependsOnY(n.argument)) return C("argument");
          if (!this.flatEngine) { this.flatEngine = new Engine(this.b, this.seed, this.cfg); this.flatEngine.isFlat = true; }
          const fe = this.flatEngine, inner = fe.compile(n.argument), slot = this.nSlots++;
          return () => {
            if (self.stamps[slot] === self.xzStamp) return self.vals[slot];
            if (fe.x !== self.x || fe.z !== self.z) { fe.x = self.x; fe.z = self.z; fe.xzStamp++; }
            fe.y = 0; fe.stamp++;
            const v = inner(); self.vals[slot] = v; self.stamps[slot] = self.xzStamp; return v;
          };
        }
        case "cache_2d": case "cache_once": case "cache_all_in_cell": case "interpolated": case "blend_density":
          return C("argument");
        case "blend_alpha": return () => 1;
        case "blend_offset": return () => 0;
        default:
          this.unsupported.add(t);
          return () => 0;
      }
    }
    // The replacement for |continent noise|, read at the same coordinates Tectonic's config_noise uses.
    expContinents() {
      const self = this, st = noiseState(this.cfg, "continents"), sx = this.ref("minecraft:shift_x"), sz = this.ref("minecraft:shift_z");
      const field = expContinentsField(this.positional, this.cfg);
      if (st.smooth) return () => field((self.x + sx()) * st.scale, (self.z + sz()) * st.scale);
      return () => field(self.x * st.scale + sx(), self.z * st.scale + sz());
    }
    compileSpline(s) {
      if (typeof s === "number") { const v = f32(s); return () => v; }
      const coord = this.compile(s.coordinate);
      const locs = Float32Array.from(s.points.map((p) => p.location));
      const ders = Float32Array.from(s.points.map((p) => p.derivative || 0));
      const vals = s.points.map((p) => this.compileSpline(p.value));
      const last = locs.length - 1;
      return () => {
        const input = f32(coord());
        let start = -1;
        for (let i = 0; i <= last; i++) { if (input < locs[i]) break; start = i; }
        if (start < 0) { const v = vals[0](); return ders[0] === 0 ? v : f32(v + f32(ders[0] * f32(input - locs[0]))); }
        if (start === last) { const v = vals[last](); return ders[last] === 0 ? v : f32(v + f32(ders[last] * f32(input - locs[last]))); }
        const x1 = locs[start], x2 = locs[start + 1];
        const t = f32(f32(input - x1) / f32(x2 - x1));
        const y1 = vals[start](), y2 = vals[start + 1]();
        const dx = f32(x2 - x1), dy = f32(y2 - y1);
        const a = f32(f32(ders[start] * dx) - dy);
        const b = f32(f32(-ders[start + 1] * dx) + dy);
        const l1 = f32(y1 + f32(t * dy));
        const l2 = f32(a + f32(t * f32(b - a)));
        return f32(l1 + f32(f32(t * f32(1 - t)) * l2));
      };
    }
    // Compile a node located by a path inside a named function (used to pull pieces out of sloped_cheese).
    sub(id, path) {
      let n = this.b.dfs[id];
      for (const k of path) n = n[k];
      return this.compile(n);
    }
  }

  // Everything a map pixel needs, computed from one Engine.
  class Sampler {
    constructor(bundle, seed, cfg) {
      const e = this.e = new Engine(bundle, seed, cfg);
      const SC = "tectonic:sloped_cheese";
      const inner = ["argument", "argument1", "argument2", "argument", "argument1"]; // (depth + additive) + jag
      this.offF = e.ref("tectonic:terrain_spline/offset/final");
      this.addv = e.sub(SC, [...inner, "argument1", "argument2"]);
      this.jag = e.sub(SC, [...inner, "argument2"]);
      this.fac = e.sub(SC, ["argument", "argument1", "argument2", "argument", "argument2"]);
      this.rest = e.sub(SC, ["argument", "argument2"]);
      this.cont = e.ref("minecraft:overworld/noise_router/continents");
      this.ero = e.ref("minecraft:overworld/noise_router/erosion");
      this.ridge = e.ref("minecraft:overworld/noise_router/ridges");
      this.temp = e.ref("minecraft:overworld/noise_router/temperature");
      this.veg = e.ref("minecraft:overworld/noise_router/vegetation");
      this.raw = e.ref("tectonic:noise/raw_continents");
      this.rawEro = e.ref("tectonic:noise/continent/erosion");
      this.region = e.ref("tectonic:noise/region_selector");
      this.offC = e.ref("tectonic:terrain_spline/offset/continents");
      this.isl = e.ref("tectonic:island_selector");
      this.maxY = cfg.max_y; this.minY = cfg.min_y;
      this.nCells = Math.floor((cfg.max_y - cfg.min_y) / 8);
      this.seaTop = bundle.sea_level;
      this.corners = new Map();
      this.seaK = Math.ceil((bundle.sea_level - cfg.min_y) / 8);   // first corner level at or above the sea surface
      // The part of final_density the game interpolates between 8-block cell corners, with caves left out
      // (caves only remove blocks): 0.1 + slope_lower * (-0.1 + (-1 + slope_upper * (1 + base_terrain))).
      this.cellG = e.compile({ type: "add", argument1: 0.1, argument2: { type: "mul", argument1: "tectonic:__constants/slope_lower",
        argument2: { type: "add", argument1: -0.1, argument2: { type: "add", argument1: -1, argument2: { type: "mul",
          argument1: "tectonic:__constants/slope_upper", argument2: { type: "add", argument1: 1, argument2: "tectonic:base_terrain" } } } } } });
    }
    // Value at cell corner level k (y = min_y + 8k) of the current column.
    level(k) { const e = this.e; e.y = this.minY + 8 * k; e.stamp++; return this.cellG(); }
    // Point the engine at a column. Cached values stay valid while it stays on the same column.
    column(x, z) { const e = this.e; if (e.x !== x || e.z !== z) { e.x = x; e.z = z; e.xzStamp++; } e.y = 0; e.stamp++; }

    // The game works terrain out only at cell corners: every 4th block across (x and z multiples of 4) and every
    // 8th block up, then blends linearly in between. A corner column keeps the values it has worked out.
    corner(cx, cz) {
      const key = cx + "," + cz;
      let c = this.corners.get(key);
      if (c) return c;
      if (this.corners.size > 20000) this.corners.clear();
      c = { x: cx, z: cz, g: new Map(), k: -1 };
      this.corners.set(key, c);
      this.column(cx, cz);
      const base = 1 + this.offF() + this.addv() + this.jag();
      const y0 = 128 * base, nC = this.nCells;
      // Start at the main shape's height and climb while the next level up is still solid, or walk down to the
      // first solid level. Below sea level the sea-floor term can leave arches and ledges with water under them,
      // so those columns start at sea level and work down.
      let k = Math.floor((y0 - this.minY) / 8);
      if (y0 < this.seaTop) k = Math.max(k, this.seaK);
      if (!(k >= 0)) k = 0; if (k > nC - 1) k = nC - 1;
      const lv = (kk) => { let v = c.g.get(kk); if (v === undefined) { v = this.level(kk); c.g.set(kk, v); } return v; };
      if (lv(k) > 0) { while (k < nC && lv(k + 1) > 0) k++; }
      else { while (k > 0) { k--; if (lv(k) > 0) break; } if (!(lv(k) > 0)) k = -1; }
      c.k = k;
      return c;
    }
    // Make sure a corner has levels kFrom..kTo worked out (one visit to its column for any that are missing).
    need(c, kFrom, kTo) {
      if (kFrom < 0) kFrom = 0; if (kTo > this.nCells) kTo = this.nCells;
      let visited = false;
      for (let k = kFrom; k <= kTo; k++) {
        if (c.g.has(k)) continue;
        if (!visited) { this.column(c.x, c.z); visited = true; }
        c.g.set(k, this.level(k));
      }
    }
    // Surface height at block (x, z): the top of the blended value, using the game's interpolation order
    // (up first, then x, then z). Returns a height whose block, Math.ceil(h) - 1, is the exact top solid block.
    height(x, z) {
      const x0 = Math.floor(x / 4) * 4, z0 = Math.floor(z / 4) * 4, fx = (x - x0) / 4, fz = (z - z0) / 4;
      const cs = fx === 0 && fz === 0 ? null : [this.corner(x0, z0), this.corner(x0 + 4, z0), this.corner(x0, z0 + 4), this.corner(x0 + 4, z0 + 4)];
      const c00 = cs ? cs[0] : this.corner(x0, z0), nC = this.nCells;
      const lerp = (t, a, b) => a + t * (b - a);
      let V, kLo, kHi;
      if (!cs) { V = (k) => c00.g.get(k); kLo = kHi = c00.k; }
      else {
        const [a, b, c, d] = cs;
        V = (k) => lerp(fz, lerp(fx, a.g.get(k), b.g.get(k)), lerp(fx, c.g.get(k), d.g.get(k)));
        kLo = Math.min(a.k, b.k, c.k, d.k); kHi = Math.max(a.k, b.k, c.k, d.k);
      }
      const want = (lo, hi) => { if (cs) for (const c of cs) this.need(c, lo, hi); else this.need(c00, lo, hi); };
      if (kHi < 0) return this.minY;
      // Between the lowest and highest corner tops, find the highest level whose blended value is solid.
      let k = Math.min(kHi + 1, nC);
      want(Math.max(kLo, 0), k);
      if (V(k) > 0) {
        while (k < nC) { want(k + 1, k + 1); if (V(k + 1) > 0) k++; else break; }
        if (k >= nC) return this.maxY;
      } else {
        for (;;) {
          k--;
          if (k < 0) return this.minY;
          if (k < kLo) want(k, k);
          if (V(k) > 0) break;
        }
      }
      want(k + 1, k + 1);
      const ga = cs ? cs.map((c) => c.g.get(k)) : [c00.g.get(k)], gb = cs ? cs.map((c) => c.g.get(k + 1)) : [c00.g.get(k + 1)];
      // Exact top block inside cell k, evaluated block by block in the game's order.
      let top = 0;
      for (let j = 7; j >= 0; j--) {
        const fy = j / 8;
        const v = cs
          ? lerp(fz, lerp(fx, lerp(fy, ga[0], gb[0]), lerp(fy, ga[1], gb[1])), lerp(fx, lerp(fy, ga[2], gb[2]), lerp(fy, ga[3], gb[3])))
          : lerp(fy, ga[0], gb[0]);
        if (v > 0) { top = j; break; }
      }
      const yb = this.minY + 8 * k + top;
      // Smooth height for shading: the linear crossing, kept inside the exact top block.
      const vk = V(k), vn = V(k + 1);
      let h = this.minY + 8 * k + 8 * vk / (vk - vn);
      // (stored as a 32-bit float, so keep clear of the block's lower edge)
      h = Math.min(yb + 1, Math.max(yb + 0.01, h));
      if (!(h > yb)) h = yb + 0.5;
      return h;
    }
    // out: object of typed arrays, i = index
    sample(x, z, out, i) {
      x = Math.floor(x); z = Math.floor(z);
      const y = this.height(x, z);
      const e = this.e;
      // Readout values are the router's own values at this block, as F3 shows them.
      this.column(x, z);
      const offF = this.offF(), J = this.jag();
      e.y = y; e.stamp++;
      out.h[i] = y;
      out.c[i] = this.cont();
      out.e[i] = this.ero();
      out.w[i] = this.ridge();
      out.t[i] = this.temp();
      out.v[i] = this.veg();
      out.d[i] = 1 - y / 128 + offF;
      out.raw[i] = this.raw();
      out.re[i] = this.rawEro();
      out.rs[i] = this.region();
      out.isl[i] = this.isl();
      out.jag[i] = J;
    }
  }

  return { Engine, Sampler, configValue, expContinentsField };
})();
if (typeof module !== "undefined") module.exports = TEngine;
