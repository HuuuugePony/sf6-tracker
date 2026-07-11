"""
SF6 Tracker - 桌面应用
使用 pywebview 创建原生窗口，不打开浏览器
"""
import sys
import os
import threading
import time

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


def start_server():
    """在后台线程启动 FastAPI 服务"""
    from main import app
    import uvicorn
    
    # 静默模式启动，不输出日志到控制台
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")


def load_desktop_styles(window):
    """加载桌面端专用样式"""
    css_path = os.path.join(resource_path, 'desktop_styles.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            css_content = f.read()
        # 注入 CSS
        window.evaluate_js(f'''
            var style = document.createElement('style');
            style.textContent = `{css_content}`;
            document.head.appendChild(style);
            console.log('Desktop styles loaded');
        ''')


def on_loaded(window):
    """窗口加载完成后的回调"""
    # 立即加载桌面样式
    load_desktop_styles(window)
    
    # 等待样式应用完成后显示窗口
    time.sleep(0.3)
    
    # 确保窗口可见（防止某些情况下窗口未显示）
    window.evaluate_js('document.body.style.visibility = "visible";')


def main():
    """主函数"""
    print("=" * 60)
    print("SF6 Tracker - 街霸6对战记录追踪器")
    print("=" * 60)
    print("\n正在启动服务...")
    
    # 在后台线程启动服务器
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # 等待服务器启动
    time.sleep(2)
    
    print("服务已启动")
    print("关闭窗口即可退出程序\n")
    
    # 导入 webview 并创建窗口
    import webview
    
    # 创建原生窗口
    window = webview.create_window(
        title='SF6 Tracker',
        url='http://localhost:8000',
        width=1024,
        height=768,
        min_size=(800, 600),
        resizable=False,
        fullscreen=False,
        frameless=False,
        easy_drag=True,
        shadow=True,
        background_color='#0a0a0a'
    )
    
    # 注册加载完成事件
    window.events.loaded += lambda: on_loaded(window)
    
    # 启动窗口（阻塞直到窗口关闭）
    # private_mode=False 启用持久化存储（localStorage、cookies等）
    webview.start(private_mode=False)
    
    print("\n程序已退出")


if __name__ == "__main__":
    main()
