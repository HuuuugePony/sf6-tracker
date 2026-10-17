"""Audit and package only the public static website, never the project runtime."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import re
import zipfile

repo = Path(__file__).resolve().parents[1]
site = repo / 'site'
out = repo / '.ui-previews/site'
report = json.loads((out / '验收.json').read_text(encoding='utf-8'))
assert not report['page_errors'] and not report['http_errors']
assert len(report['viewports']) == 6 and report['video']['seek'] > 21
allowed = {'.html', '.css', '.js', '.svg', '.webp', '.jpg', '.mp4', '.txt'}
files = sorted(p for p in site.rglob('*') if p.is_file())
assert (site / 'index.html').is_file()
assert all(p.suffix in allowed or p.name in {'.nojekyll', '_headers'} for p in files)
assert all(p.stat().st_size < 25 * 1024 * 1024 for p in files)
credential_file = repo / 'tests/测试账号.txt'
tokens = []
if credential_file.is_file():
    # Compare in memory only. Do not print, persist, or transmit credentials.
    text = credential_file.read_text(encoding='utf-8-sig')
    cookies = re.findall(r'[A-Za-z0-9_.-]+=[^\r\n]+', text)
    if cookies:
        cookie = max(cookies, key=len).strip().strip('"\'')
        tokens = [cookie.encode()] + [v.strip().encode() for v in re.findall(r'=([^;]+)', cookie) if len(v.strip()) > 30]
for path in files:
    data = path.read_bytes()
    assert not any(token in data for token in tokens), 'Credential audit failed; packaging stopped.'
archive = out / 'SF6-Tracker-官网静态文件.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for path in files:
        package.write(path, path.relative_to(site).as_posix())
record = {'generated_at': datetime.now().astimezone().isoformat(), 'archive': str(archive),
          'files': len(files), 'total_bytes': sum(p.stat().st_size for p in files),
          'video_bytes': (site / 'media/promo.mp4').stat().st_size,
          'all_assets_under_25_mib': True, 'credential_audit': 'pass',
          'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'public_deployment': 'not_performed_by_packager', 'browser_checks': report}
(out / '交付记录.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: record[k] for k in ['archive', 'files', 'total_bytes', 'video_bytes', 'credential_audit', 'public_deployment']}, ensure_ascii=False, indent=2))
