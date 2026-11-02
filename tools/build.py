"""Assemble index.html (GitHub Pages) and dist/atlas-fragment.html (the same page without the document skeleton)."""
import json, os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
src = lambda f: open('src/' + f).read()
lib = src('mcnoise.js') + '\n' + src('engine.js') + '\n' + src('biomes.js') + '\nconst BUNDLE = ' + \
      json.dumps(json.load(open('data/tectonic_bundle.json')), separators=(',', ':')) + ';\n'
for name, s in [('lib', lib), ('worker', src('worker.js')), ('main', src('main.js'))]:
    assert '</script' not in s.lower(), name
page = src('page.tpl.html').replace('/*LIB*/', lib).replace('/*WORKER*/', src('worker.js')).replace('/*MAIN*/', src('main.js'))
os.makedirs('dist', exist_ok=True)
open('dist/atlas-fragment.html', 'w').write(page)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<meta name="description" content="Live top-down map of Tectonic terrain, biomes and climate for any Minecraft seed.">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
        'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
open('index.html', 'w').write(head + page + '</body></html>')
print('index.html', len(head + page), 'bytes')
