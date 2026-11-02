# Tectonic Seed Atlas

A live top-down map of [Tectonic](https://modrinth.com/mod/tectonic) terrain for any Minecraft seed. Change Tectonic's settings and the map redraws in your browser.

**Open it:** https://jazzyxd.github.io/tectonic-seed-atlas/

Unofficial fan tool. Not made or endorsed by Apollo (Tectonic's author) or Mojang.

## What it does

- Renders terrain, vanilla biomes, continentalness, erosion, peaks and valleys, temperature, vegetation, Tectonic regions, and distance inland from the sea.
- Every Tectonic world setting that shapes the surface is adjustable, and you can import your own `config/tectonic.json`. Imported files stay in your browser.
- Hover or click a spot for its biome, height, climate values, whether it is continent or island, and a `/tp` command.
- Right-click to build a Chunky pregeneration command for an area, or to render only a square (for example the 10k × 10k area you actually play in).

## How accurate it is

Matches the game:
- World seeding and every noise value. Checked against Minecraft's own code, and against in-game F3 NoiseRouter readings (temperature, vegetation, continentalness, erosion, depth and weirdness matched to three decimals at three spots).
- Tectonic's 2D terrain and climate functions, including its noise seeding quirk (`tectonic:parameter/*` noises are seeded as `minecraft:*`).

Approximate:
- Surface height leaves out the 3D roughness noise, caves and aquifer lakes. Land heights can be off by a few blocks, sea floors by more.
- Vanilla biomes only. Biomes added by other mods are not shown.
- Data matches Tectonic **3.0.28** on Minecraft **26.1**. Other versions can differ.

## Building

The page is one self-contained HTML file built from `src/`:

```
python3 tools/bundle.py path/to/tectonic-3.0.28-fabric-26.1.jar path/to/minecraft-26.1.2.jar   # refresh data/tectonic_bundle.json
python3 tools/build.py                                                                          # writes index.html
```

- `src/mcnoise.js` Minecraft's Xoroshiro seeding, MD5 positional randoms, Improved/Perlin/Normal noise.
- `src/engine.js` evaluator for Tectonic's density-function graph.
- `src/biomes.js` vanilla overworld biome table and lookup.
- `src/main.js`, `src/worker.js`, `src/page.tpl.html` the page and its render workers.

## Credits

Terrain data comes from Tectonic by Apollo, released under the MIT license (see `NOTICE.md`). Minecraft is a trademark of Mojang. This project is not affiliated with either.
