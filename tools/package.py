"""Build and verify a self-contained WeChat source ZIP (no desktop dependencies)."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / 'bead-pattern-generator.zip'
out.parent.mkdir(exist_ok=True)
items = [root / n for n in ['project.config.json', 'README.md', 'package.json', 'package-lock.json', '.gitignore']]
items += list((root / 'miniprogram').rglob('*'))
items += list((root / 'tests').rglob('*')) + list((root / 'tools').rglob('*'))
items += list((root / 'docs').rglob('*'))
items += list((root / '.github').rglob('*'))
items += list((root / 'artifacts' / 'synthetic').rglob('*'))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(set(items)):
        if p.is_file() and '__pycache__' not in p.parts and 'private' not in p.parts:
            z.write(p, p.relative_to(root))
with zipfile.ZipFile(out) as z:
    required = ['project.config.json', 'README.md', 'miniprogram/app.js', 'miniprogram/app.json', 'miniprogram/app.wxss']
    required += ['miniprogram/pages/index/index' + ext for ext in ['.js', '.json', '.wxml', '.wxss']]
    for name in required:
        assert name in z.namelist(), f'Missing {name}'
    assert z.testzip() is None, 'ZIP integrity failure'
    print(f'ZIP verified: {len(z.namelist())} files, {out.stat().st_size} bytes -> {out}')
