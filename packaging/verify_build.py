"""Read-only EXE audit: exact frontend bytes, no private project folders."""
import hashlib
from pathlib import Path, PurePosixPath
import sys

from PyInstaller.archive.readers import CArchiveReader


def audit(executable):
    root = Path(__file__).resolve().parents[1]
    executable = Path(executable)
    archive = CArchiveReader(str(executable))
    names = {name.replace('\\', '/'): name for name in archive.toc}
    forbidden = {'.git', '.venv', 'tests', 'runtime', 'site', 'site-tools', '.ui-previews'}
    for name in names:
        path = PurePosixPath(name)
        # Dependencies legitimately contain paths such as pythonnet/runtime/*.dll.
        assert path.parts[0] not in forbidden, f'Unexpected private/project path: {name}'
        assert path.suffix not in {'.sqlite3', '.log'}, f'Unexpected runtime data: {name}'
    web_files = [p for p in (root / 'web').rglob('*') if p.is_file()]
    for path in web_files:
        name = path.relative_to(root).as_posix()
        assert name in names, f'Missing frontend asset: {name}'
        assert archive.extract(names[name]) == path.read_bytes(), f'Stale frontend asset: {name}'
    assert 'sf6_tracker' in archive.open_embedded_archive('PYZ.pyz').toc
    print(f'PASS: {len(web_files)} frontend assets match; no private project/runtime paths')
    print(f'SHA256 {hashlib.sha256(executable.read_bytes()).hexdigest()}  {executable.name}')


if __name__ == '__main__':
    audit(sys.argv[1])
