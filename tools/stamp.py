"""Stamps every JS module and the stylesheet with a short content hash.

Run from the repo root before each deploy: python3 tools/stamp.py

GitHub Pages caches files for 10 minutes. Without this, someone who loads the
site right after a deploy can get a mix of old and new modules. The import map
points every module path at "<path>?v=<hash>", so a new index.html always pulls
a matching set, and unchanged files keep their cached copies.
"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def h(path):
    return hashlib.sha256(open(os.path.join(ROOT, path), 'rb').read()).hexdigest()[:10]

mods = sorted(
    os.path.relpath(os.path.join(d, f), ROOT)
    for d, _, files in os.walk(os.path.join(ROOT, 'js')) for f in files if f.endswith('.js')
)
imports = {f'./{m}': f'./{m}?v={h(m)}' for m in mods}
block = ('<script type="importmap">\n' + json.dumps({'imports': imports}, indent=2) + '\n  </script>')

p = os.path.join(ROOT, 'index.html')
s = open(p).read()
s, n = re.subn(r'<!-- importmap -->.*?<!-- /importmap -->', '<!-- importmap -->\n  ' + block + '\n  <!-- /importmap -->', s, flags=re.S)
assert n == 1, 'importmap markers missing'
s, n = re.subn(r'href="css/style\.css(\?v=[0-9a-f]+)?"', f'href="css/style.css?v={h("css/style.css")}"', s)
assert n == 1
s, n = re.subn(r'src="js/app\.js(\?v=[0-9a-f]+)?"', f'src="js/app.js?v={h("js/app.js")}"', s)
assert n == 1
s = re.sub(r'<link rel="modulepreload" href="js/app\.js(\?v=[0-9a-f]+)?">', f'<link rel="modulepreload" href="js/app.js?v={h("js/app.js")}">', s)
open(p, 'w').write(s)
print(f'stamped {len(mods)} modules')
