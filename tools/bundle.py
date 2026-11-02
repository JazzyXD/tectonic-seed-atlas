"""Build data/tectonic_bundle.json from a Tectonic mod jar and a Minecraft client/server jar.

Usage: python3 tools/bundle.py path/to/tectonic-x.y.z-fabric-26.1.jar path/to/minecraft.jar [overlay ...]
Default overlays: overlay.26_1 (the ones Tectonic applies on Minecraft 26.1).
Only the overworld noise router and everything it references is kept."""
import io, json, sys, zipfile

tect = zipfile.ZipFile(sys.argv[1])
mc = zipfile.ZipFile(sys.argv[2])
overlays = sys.argv[3:] or ['overlay.26_1']
pack_root = next(n.split('pack.mcmeta')[0] for n in tect.namelist() if n.startswith('resourcepacks/tectonic') and n.endswith('pack.mcmeta') and n.count('/') == 2)
layers = [(mc, 'data/')] + [(tect, pack_root + 'data/')] + [(tect, pack_root + o + '/data/') for o in overlays]
names = {id(z): set(z.namelist()) for z in (tect, mc)}

def load(kind, ref):
    ns, p = ref.split(':', 1) if ':' in ref else ('minecraft', ref)
    found = None
    for z, base in layers:
        path = f'{base}{ns}/worldgen/{kind}/{p}.json'
        if path in names[id(z)]:
            found = json.loads(z.read(path))
    return found

full = lambda r: r if ':' in r else 'minecraft:' + r
dfs, noises, missing = {}, {}, set()

def walk(node):
    if isinstance(node, str):
        r = full(node)
        if r in dfs: return
        d = load('density_function', r)
        if d is None: missing.add(r); return
        dfs[r] = d; walk(d); return
    if isinstance(node, list):
        for x in node: walk(x)
        return
    if not isinstance(node, dict): return
    t = node.get('type')
    for k, v in node.items():
        if (k == 'noise' or (k == 'argument' and t in ('minecraft:shift_a', 'minecraft:shift_b', 'minecraft:shift'))) and isinstance(v, str):
            r = full(v)
            if r not in noises:
                noises[r] = load('noise', r)
                if noises[r] is None: missing.add('noise ' + r)
        elif k in ('type', 'key', 'rarity_value_mapper'):
            continue
        else:
            walk(v)

ns = load('noise_settings', 'minecraft:overworld')
walk(ns['noise_router'])
if missing: print('missing:', sorted(missing))
json.dump({'router': ns['noise_router'], 'dfs': dfs, 'noises': noises, 'noise': ns['noise'], 'sea_level': ns.get('sea_level')},
          open('data/tectonic_bundle.json', 'w'))
print(f'{len(dfs)} density functions, {len(noises)} noises -> data/tectonic_bundle.json')
