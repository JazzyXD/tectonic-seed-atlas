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

  class Engine {
    constructor(bundle, seed, cfg) {
      this.b = bundle; this.cfg = cfg;
      this.positional = MCNoise.worldPositional(BigInt(seed));
      this.noiseCache = new Map();
      this.named = new Map();      // id -> {fn, slot}
      this.nSlots = 0;
      this.stamp = 1;
      this.vals = new Float64Array(512);
      this.stamps = new Uint32Array(512);
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
      e.call = () => {
        if (self.stamps[slot] === self.stamp) return self.vals[slot];
        const v = e.fn();
        self.vals[slot] = v; self.stamps[slot] = self.stamp;
        return v;
      };
      if (id === "minecraft:overworld/base_3d_noise") { e.fn = () => 0; this.unsupported.add(id); return e.call; }
      if (this.islandsOff && id === "tectonic:island_selector") { e.fn = () => 0; return e.call; }
      const def = this.b.dfs[id];
      if (def === undefined) throw new Error("missing df " + id);
      e.fn = this.compile(def);
      return e.call;
    }
    compile(n) {
      if (typeof n === "number") return () => n;
      if (typeof n === "string") return this.ref(n);
      const self = this;
      const t = n.type.replace("minecraft:", "");
      const C = (k) => this.compile(n[k]);
      switch (t) {
        case "add": { const a = C("argument1"), b = C("argument2"); return () => a() + b(); }
        case "mul": { const a = C("argument1"), b = C("argument2"); return () => { const v = a(); return v === 0 ? 0 : v * b(); }; }
        case "min": { const a = C("argument1"), b = C("argument2"); return () => Math.min(a(), b()); }
        case "max": { const a = C("argument1"), b = C("argument2"); return () => Math.max(a(), b()); }
        case "abs": { const a = C("argument"); return () => Math.abs(a()); }
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
        case "spline": return this.compileSpline(n.spline);
        case "flat_cache": case "cache_2d": case "cache_once": case "cache_all_in_cell": case "interpolated": case "blend_density":
          return C("argument");
        case "blend_alpha": return () => 1;
        case "blend_offset": return () => 0;
        default:
          this.unsupported.add(t);
          return () => 0;
      }
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
      this.maxY = cfg.max_y;
    }
    // out: object of typed arrays, i = index
    sample(x, z, out, i) {
      const e = this.e;
      e.x = x; e.z = z; e.y = 0; e.stamp++;
      const offF = this.offF(), A = this.addv(), J = this.jag(), F = this.fac();
      const base = 1 + offF + A + J;
      let y = 128 * base;
      e.y = y; e.stamp++;
      // y-independent pieces stay valid but the memo was reset, so recompute what we read below at this y.
      const B = this.rest();
      if (F > 1e-6) y += B >= 0 ? 128 * B / F : 128 * B / (4 * F);
      if (y > this.maxY) y = this.maxY;
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

  return { Engine, Sampler, configValue };
})();
if (typeof module !== "undefined") module.exports = TEngine;
