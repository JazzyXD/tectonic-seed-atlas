// Map worker: builds a Sampler for the current seed and settings, then fills tiles on request.
let sampler = null, gen = -1;
const KEYS = ["h", "c", "e", "w", "t", "v", "d", "raw", "re", "rs", "isl", "jag"];
onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") {
    gen = m.gen;
    try { sampler = new TEngine.Sampler(BUNDLE, BigInt(m.seed), m.cfg); }
    catch (e) { sampler = null; postMessage({ type: "error", gen: m.gen, msg: String(e && e.message || e) }); }
    return;
  }
  if (m.type === "job") {
    if (!sampler || m.gen !== gen) { postMessage({ type: "skip", key: m.key, gen: m.gen }); return; }
    const W = m.w + 1, H = m.h + 1, n = W * H;   // one extra row and column on the low side, for shading
    const out = {};
    for (const k of KEYS) out[k] = new Float32Array(n);
    const bio = new Uint8Array(n);
    for (let j = 0; j < H; j++) {
      const z = m.z0 + (j - 1) * m.step;
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        sampler.sample(m.x0 + (i - 1) * m.step, z, out, idx);
        bio[idx] = VBiomes.lookup(out.t[idx], out.v[idx], out.c[idx], out.e[idx], out.d[idx], out.w[idx]);
      }
    }
    const transfer = KEYS.map((k) => out[k].buffer); transfer.push(bio.buffer);
    postMessage({ type: "done", key: m.key, gen: m.gen, W, H, out, bio }, transfer);
  }
};
