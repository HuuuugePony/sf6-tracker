"""Browser acceptance for the static landing page; no product runtime or credentials."""
from pathlib import Path
import json
import urllib.request
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parents[1]
out = repo / '.ui-previews/site'
out.mkdir(parents=True, exist_ok=True)
url = 'http://127.0.0.1:18766/'
with urllib.request.urlopen(urllib.request.Request(url+'media/promo.mp4', headers={'Range': 'bytes=0-1023'})) as response:
    assert response.status == 206 and len(response.read()) == 1024

errors = []
failures = []
report = {'viewports': [], 'http_range': 206}
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: failures.append({'status': response.status, 'url': response.url}) if response.status >= 400 else None)
    page.goto(url, wait_until='networkidle')
    page.screenshot(path=str(out/'desktop.png'), full_page=True)
    page.screenshot(path=str(out/'desktop-hero.png'))
    assert page.title() == 'SF6 Tracker — 每场对战，都值得复盘'
    assert page.locator('h1').count() == 1
    assert page.locator('a[href*="/releases/latest"]').count() == 2
    for tab in page.get_by_role('tab').all():
        tab.click()
        assert tab.get_attribute('aria-selected') == 'true'
        panel = page.locator('#'+tab.get_attribute('aria-controls'))
        image = panel.locator('img')
        image.scroll_into_view_if_needed()
        image.evaluate('img=>img.decode()')
        assert image.evaluate('(img)=>img.naturalWidth===986 && img.naturalHeight===793')
        assert image.evaluate('(img)=>Math.abs(img.getBoundingClientRect().width/img.getBoundingClientRect().height-986/793)<.002')
        panel.locator('button').click()
        assert page.locator('dialog').evaluate('dialog=>dialog.open')
        assert page.locator('#dialog-image').evaluate('(img)=>img.naturalWidth===986')
        page.keyboard.press('Escape')
        assert not page.locator('dialog').evaluate('dialog=>dialog.open')
    first = page.get_by_role('tab').first
    first.click()
    first.focus()
    page.keyboard.press('ArrowDown')
    assert page.get_by_role('tab').nth(1).get_attribute('aria-selected') == 'true'
    page.keyboard.press('Home')
    assert first.get_attribute('aria-selected') == 'true'
    for details in page.locator('details').all():
        details.locator('summary').click()
        assert details.evaluate('el=>el.open')
        details.locator('summary').click()
    video = page.locator('video')
    video.scroll_into_view_if_needed()
    video.evaluate('async v=>{v.muted=true; await v.play()}')
    page.wait_for_timeout(1200)
    assert video.evaluate('v=>v.currentTime>0.3 && v.videoWidth===1600 && v.videoHeight===900 && v.duration>45 && v.duration<46')
    video.evaluate('v=>v.pause()')
    video.evaluate('v=>v.currentTime=21.7')
    page.wait_for_function('()=>{const v=document.querySelector("video");return !v.seeking&&v.readyState>=2}')
    page.screenshot(path=str(out/'video-and-page.png'), full_page=True)
    report['video'] = video.evaluate('v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,seek:v.currentTime,paused:v.paused})')
    for width in [1440, 1024, 768, 390, 375, 320]:
        page.set_viewport_size({'width': width, 'height': 900})
        page.evaluate('window.scrollTo(0,0)')
        page.wait_for_timeout(200)
        assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), width
        assert page.locator('.hero-shot img').evaluate('img=>{const r=img.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}'), width
        assert page.locator('.strip-inner>span').evaluate_all('items=>items.filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})'), (width, 'clipped feature strip')
        if width <= 700:
            page.get_by_role('button', name='打开导航').click()
            assert page.locator('#navigation').is_visible()
            page.locator('#navigation').get_by_role('link', name='功能一览').click()
            assert not page.locator('#navigation').is_visible()
            page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(out/f'width-{width}.png'), full_page=True)
        report['viewports'].append({'width': width, 'horizontal_overflow': False, 'full_native_image': True})
    page.emulate_media(reduced_motion='reduce')
    assert page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
    assert not errors and not failures, (errors, failures)
    browser.close()
report.update({'tabs': True, 'keyboard_tabs': True, 'image_dialog': True, 'faq': True,
               'mobile_navigation': True, 'reduced_motion': True, 'page_errors': errors, 'http_errors': failures})
(out/'验收.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
