"""
SF6 Tracker - 桌面应用
使用 pywebview 创建原生窗口，不打开浏览器
"""
import sys
import os
import threading
import time
import traceback
import socket
import uuid
import json
import html
from sf6_tracker.paths import runtime_directory

# PyInstaller 打包后的资源路径
# frozen 模式下，_MEIPASS 指向临时解压目录
def get_resource_path():
    """获取资源文件路径（支持 PyInstaller 打包）"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后的临时目录
        return sys._MEIPASS
    else:
        return os.path.dirname(os.path.abspath(__file__))

# 应用程序工作目录（用于存放用户数据等）
if getattr(sys, 'frozen', False):
    application_path = os.path.dirname(sys.executable)
else:
    application_path = os.path.dirname(os.path.abspath(__file__))

# 资源文件目录（打包后从 _MEIPASS 读取）
resource_path = get_resource_path()

os.chdir(application_path)

# 日志文件路径（用于在无控制台模式下记录错误）
LOG_FILE = str(runtime_directory() / 'sf6tracker.log')

def log_error(msg):
    """写入错误日志"""
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f'[{time.strftime("%Y-%m-%d %H:%M:%S")}] {msg}\n')
    except Exception:
        pass

# 在无控制台模式下，将 stdout/stderr 重定向到日志文件
if getattr(sys, 'frozen', False):
    class LogWriter:
        def __init__(self, log_file, original):
            self.log_file = log_file
            self.original = original
        def write(self, msg):
            if msg.strip():
                log_error(msg.rstrip())
            if self.original:
                self.original.write(msg)
        def flush(self):
            pass
        def isatty(self):
            return False
    sys.stdout = LogWriter(LOG_FILE, sys.stdout)
    sys.stderr = LogWriter(LOG_FILE, sys.stderr)
    

class ServerHandle:
    def __init__(self):
        self.instance_id = str(uuid.uuid4())
        self.server = None
        self.stopping = threading.Event()
        self.failed = threading.Event()
        self.listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            self.listener.bind(('127.0.0.1', 7648))
            self.listener.listen(128)
        except OSError:
            self.listener.close()
            raise

    def stop(self):
        self.stopping.set()
        if self.server is not None:
            self.server.should_exit = True


def start_server(handle):
    try:
        from main import app
        import uvicorn
        if handle.stopping.is_set():
            return
        app.state.instance_id = handle.instance_id
        handle.server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        if handle.stopping.is_set():
            return
        handle.server.run(sockets=[handle.listener])
    except BaseException:
        handle.failed.set()
        log_error('服务启动失败')
        log_error(traceback.format_exc())
    finally:
        handle.listener.close()


def load_desktop_styles(window):
    """加载桌面端专用样式"""
    css_path = os.path.join(resource_path, 'web', 'desktop_styles.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            css_content = f.read()
        # 注入 CSS
        window.evaluate_js(f'''
            var style = document.createElement('style');
            style.textContent = `{css_content}`;
            document.head.appendChild(style);
        ''')


def on_loaded(window):
    """窗口加载完成后的回调"""
    # 立即加载桌面样式
    load_desktop_styles(window)
    
    # 等待样式应用完成后显示窗口
    time.sleep(0.3)
    
    # 确保窗口可见（防止某些情况下窗口未显示）
    window.evaluate_js('document.body.style.visibility = "visible";')


def wait_for_server(timeout=15, instance_id=None, failed=None):
    """Only accept the service belonging to this launch."""
    import urllib.request
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if failed is not None and failed.is_set():
            return False
        try:
            # Do not send localhost requests through a system HTTP proxy.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open('http://127.0.0.1:7648/api/health', timeout=1) as response:
                status = json.load(response)
                if status.get('app') == 'sf6-tracker' and status.get('ready') is True \
                        and status.get('instance_id') == instance_id:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def show_startup_error(message):
    import webview
    from collections import deque

    class Actions:
        retry_requested = False
        window = None

        def retry(self):
            self.retry_requested = True
            self.window.destroy()

        def read_log(self):
            try:
                with open(LOG_FILE, encoding='utf-8', errors='replace') as stream:
                    return ''.join(deque(stream, maxlen=80))
            except OSError:
                return '暂无日志。'

    actions = Actions()
    content = f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
    <style>body{{background:#141414;color:#eee;font:15px 'Microsoft YaHei',sans-serif;padding:32px}}
    button{{padding:10px 18px;margin:12px 12px 0 0;cursor:pointer}}
    pre{{white-space:pre-wrap;overflow-wrap:anywhere;color:#bbb;font-size:12px}}</style>
    <h2>SF6 Tracker 暂时无法启动</h2><p>{html.escape(message)}</p>
    <button onclick="window.pywebview.api.retry()">重试启动</button>
    <button onclick="window.pywebview.api.read_log().then(t=>document.getElementById('log').textContent=t)">查看日志</button>
    <pre id="log"></pre></html>"""
    actions.window = webview.create_window('SF6 Tracker — 启动失败', html=content,
                                            js_api=actions, width=650, height=430)
    webview.start(private_mode=False)
    return actions.retry_requested


class ExportBridge:
    """Only writes text exports to a location explicitly selected in the save dialog."""
    _window = None

    def save_export(self, filename, content):
        import webview
        import re
        if not isinstance(filename, str) or not re.fullmatch(r'sf6-[A-Za-z0-9-]+\.(csv|json)', filename):
            raise ValueError('无效的导出文件名')
        if not isinstance(content, str) or len(content.encode('utf-8')) > 50 * 1024 * 1024:
            raise ValueError('导出内容过大，请缩小筛选范围')
        dialog = webview.FileDialog.SAVE if hasattr(webview, 'FileDialog') else webview.SAVE_DIALOG
        selected = self._window.create_file_dialog(dialog, save_filename=filename,
            file_types=('CSV (*.csv)',) if filename.endswith('.csv') else ('JSON (*.json)',))
        if not selected:
            return {'cancelled': True}
        target = selected[0] if isinstance(selected, (tuple, list)) else selected
        with open(target, 'w', encoding='utf-8', newline='') as stream:
            stream.write(content)
        return {'saved': True}


def main():
    import webview
    while True:
        try:
            handle = ServerHandle()
        except OSError:
            if show_startup_error('应用可能已在运行，或端口 7648 被其他程序占用。请关闭已有窗口或释放端口后重试。'):
                continue
            return
        server_thread = threading.Thread(target=start_server, args=(handle,), daemon=True)
        server_thread.start()
        if not wait_for_server(timeout=20, instance_id=handle.instance_id, failed=handle.failed):
            handle.stop()
            server_thread.join(timeout=5)
            if server_thread.is_alive():
                show_startup_error('后台服务未能及时退出，请关闭应用后重新启动。')
                return
            if show_startup_error('服务启动失败或超时，请查看日志后重试。'):
                continue
            return
        try:
            bridge = ExportBridge()
            window = webview.create_window(
                title='SF6 Tracker v0.7',
                url=f'http://localhost:7648/home?v={int(time.time())}',
                width=1000, height=800, min_size=(1000, 650),
                resizable=True, fullscreen=False, frameless=False,
                easy_drag=True, shadow=True, background_color='#0a0a0a', js_api=bridge)
            bridge._window = window
            window.events.loaded += lambda: on_loaded(window)
            webview.start(private_mode=False)
        finally:
            handle.stop()
            server_thread.join(timeout=5)
        return


if __name__ == "__main__":
    main()
