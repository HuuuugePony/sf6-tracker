"""Prepare public, complete-window media from the approved fourth promo revision."""
from pathlib import Path
import json
import shutil
import subprocess
from PIL import Image, ImageOps

repo = Path(__file__).resolve().parents[1]
site = repo / 'site'
assets = site / 'assets'
media = site / 'media'
assets.mkdir(exist_ok=True)
media.mkdir(exist_ok=True)
production = repo / '宣传片/SF6 Tracker宣传片'
native = production / '工程/public/native'
sources = []
for name in ['overview', 'trend', 'ranking-top', 'analysis', 'notes', 'history']:
    src = native / f'{name}.png'
    with Image.open(src) as image:
        assert image.size == (986, 793)
        image.convert('RGB').save(assets / f'{name}.webp', quality=92, method=6)
        sources.append({'asset': f'assets/{name}.webp', 'source': str(src.relative_to(repo)),
                        'size': list(image.size), 'change': 'WebP encoding only, no cropping or stretching'})
with Image.open(production / '宣传片封面.jpg') as image:
    poster = image.convert('RGB')
    poster.thumbnail((1600, 900))
    poster.save(assets / 'film-poster.jpg', quality=89, optimize=True)
    share = ImageOps.pad(poster, (1200, 630), color='#080d17', method=Image.Resampling.LANCZOS, centering=(.5, .5))
    share.save(assets / 'share.jpg', quality=90, optimize=True)
sources.append({'asset': 'media/promo.mp4', 'source': str((production / '宣传片 1080p.mp4').relative_to(repo)),
                'change': 'Web delivery copy, 1600x900/30fps, H264/AAC; original 1080p60 and 4K60 retained'})
ffmpeg = shutil.which('ffmpeg')
assert ffmpeg
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(production / '宣传片 1080p.mp4'),
                '-vf', 'fps=30,scale=1600:900:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium',
                '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
                str(media / 'promo.mp4')], check=True)
assert (media / 'promo.mp4').stat().st_size < 25 * 1024 * 1024, 'Video exceeds Cloudflare static asset limit.'
(repo / 'site-tools/media-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'media_bytes': (media / 'promo.mp4').stat().st_size, 'complete_window_images': 6}, ensure_ascii=False))
