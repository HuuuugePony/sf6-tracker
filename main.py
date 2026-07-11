"""
SF6 Tracker - FastAPI Web Service
简单的街霸6对战记录爬虫 API 服务
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import time
import os
import sys

from crawler import SF6BattleLogCrawler

# 获取资源文件路径（支持 PyInstaller 打包）
def get_resource_path():
    """获取资源文件路径"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

RESOURCE_PATH = get_resource_path()

# 创建FastAPI应用
app = FastAPI(
    title="SF6 Battle Log Tracker",
    description="街霸6对战记录API",
    version="1.0.0"
)

# 挂载静态文件目录（使用资源路径）
app.mount("/static", StaticFiles(directory=RESOURCE_PATH), name="static")

# 全局变量存储Cookie和用户信息
stored_cookie = None
session_data = {}  # 存储会话数据
user_info = {'user_id': None, 'player_name': None}  # 存储用户信息
query_crawler = None  # 专门用于查询的爬虫实例

# ==================== 数据模型 ====================爬取失败，请稍后重试

class CrawlRequest(BaseModel):
    """爬取请求"""
    cookie: str = None  # 可选的cookie参数
    pages: int = 10
    max_workers: int = 5
    battle_type: str = 'all'  # 对战类型: all/rank/casual/custom/hub


class QueryPlayerRequest(BaseModel):
    """查询玩家请求"""
    user_id: str  # 玩家ID
    cookie: str = None  # 可选的cookie参数
    pages: int = 10
    max_workers: int = 5
    battle_type: str = 'all'  # 对战类型: all/rank/casual/custom/hub


# ==================== API 接口 ====================

@app.get("/", response_class=HTMLResponse)
def home_redirect():
    """根路径重定向到/home"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/home")


@app.get("/home", response_class=HTMLResponse)
def home():
    """主页 - 登录和用户信息展示"""
    resp = FileResponse(os.path.join(RESOURCE_PATH, 'index.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@app.get("/search", response_class=HTMLResponse)
def search_page(uid: str = None):
    """查询页面 - 支持uid参数"""
    resp = FileResponse(os.path.join(RESOURCE_PATH, 'index.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@app.post("/api/login/start")
def start_login():
    """开始登录流程 - 打开浏览器"""
    try:
        from selenium import webdriver
        from selenium.webdriver.edge.options import Options
        import uuid
        
        # 生成会话ID
        session_id = str(uuid.uuid4())
        
        # 配置Edge选项
        edge_options = Options()
        edge_options.add_argument('--no-sandbox')
        edge_options.add_argument('--disable-dev-shm-usage')
        # 禁用扩展，加快速度
        edge_options.add_argument('--disable-extensions')
        # 禁用GPU加速
        edge_options.add_argument('--disable-gpu')
        
        driver = webdriver.Edge(options=edge_options)
        
        # 访问SF6网站
        login_url = 'https://www.streetfighter.com/6/buckler/zh-hans'
        driver.get(login_url)
        
        # 保存driver到会话数据
        session_data[session_id] = {
            'driver': driver
        }
        
        print(f'\n会话ID: {session_id}')
        print('请在打开的浏览器中完成登录...')
        print('完成后点击"我已登录，获取Cookie"按钮...\n')
        
        return {
            "success": True,
            "session_id": session_id,
            "message": "浏览器已打开，请完成登录"
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动登录失败: {str(e)}")


@app.post("/api/login/confirm")
def confirm_login(request: dict):
    """确认登录并获取Cookie和用户信息"""
    session_id = request.get('session_id')
    
    if not session_id or session_id not in session_data:
        raise HTTPException(status_code=400, detail="无效的会话ID")
    
    try:
        data = session_data[session_id]
        driver = data['driver']
        
        # 获取Cookie
        cookies = driver.get_cookies()
        cookie_string = '; '.join([f"{c['name']}={c['value']}" for c in cookies])
        
        # 获取页面源码并提取用户信息
        from bs4 import BeautifulSoup
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        
        # 查找个人档案链接元素
        profile_link = soup.select_one('.header_title__ruJj2 a')
        extracted_user_id = None
        extracted_player_name = None
        
        if profile_link:
            extracted_player_name = profile_link.get_text(strip=True)
            href = profile_link.get('href', '')
            parts = href.split('/')
            if len(parts) >= 6:
                extracted_user_id = parts[-1]
        
        # 关闭浏览器
        driver.quit()
        
        # 保存到全局变量
        global stored_cookie, user_info
        stored_cookie = cookie_string
        user_info = {
            'user_id': extracted_user_id,
            'player_name': extracted_player_name
        }
        
        # 清理会话数据
        del session_data[session_id]
        
        return {
            "success": True,
            "cookie": cookie_string,
            "user_id": extracted_user_id,
            "player_name": extracted_player_name,
            "message": "登录成功"
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取信息失败: {str(e)}")


@app.post("/api/get-cookie")
def get_cookie():
    """获取Cookie（打开浏览器让用户登录）"""
    global stored_cookie
    
    try:
        from selenium import webdriver
        from selenium.webdriver.edge.options import Options
        
        # 配置Edge选项
        edge_options = Options()
        edge_options.add_argument('--no-sandbox')
        edge_options.add_argument('--disable-dev-shm-usage')
        edge_options.add_argument('--disable-extensions')
        edge_options.add_argument('--disable-gpu')
        
        driver = webdriver.Edge(options=edge_options)
        
        # 访问SF6网站
        login_url = 'https://www.streetfighter.com/6/buckler/zh-hans'
        driver.get(login_url)
        
        print('\n请在打开的浏览器中完成登录...')
        print('完成后点击页面上的任意位置或等待5秒自动继续...\n')
        
        # 简单等待用户手动登录（最多等待60秒）
        for i in range(60):
            time.sleep(1)
            # 检查页面是否有变化（简单判断）
            try:
                current_url = driver.current_url
                if 'login' not in current_url.lower() or 'cid.capcom' not in current_url.lower():
                    print('检测到页面跳转，可能已登录')
                    break
            except:
                pass
        
        # 获取Cookie
        cookies = driver.get_cookies()
        cookie_string = '; '.join([f"{c['name']}={c['value']}" for c in cookies])
        
        # 关闭浏览器
        driver.quit()
        
        stored_cookie = cookie_string
        
        return {
            "success": True,
            "cookie": cookie_string
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取Cookie失败: {str(e)}")


@app.post("/api/set-user-info")
def set_user_info(request: dict):
    """设置用户信息（用于快速登录）"""
    global user_info
    user_id = request.get('user_id')
    player_name = request.get('player_name')
    
    if not user_id or not player_name:
        raise HTTPException(status_code=400, detail="缺少用户信息")
    
    user_info = {
        'user_id': user_id,
        'player_name': player_name
    }
    
    return {
        "success": True,
        "message": "用户信息设置成功"
    }


@app.post("/api/crawl")
def crawl_battle_log(request: CrawlRequest):
    """爬取对战记录"""
    try:
        # 优先使用请求中的cookie，如果没有则使用全局存储的cookie，最后使用crawler默认cookie
        cookie_to_use = None
        if hasattr(request, 'cookie') and request.cookie:
            cookie_to_use = request.cookie
        elif stored_cookie:
            cookie_to_use = stored_cookie
        # 如果都没有，cookie_to_use保持为None，crawler会使用默认cookie
        
        # 检查是否有用户信息
        if not user_info.get('user_id'):
            raise HTTPException(status_code=400, detail="未找到用户信息，请重新登录")
        
        # 创建爬虫实例（不需要传入user_id）
        crawler = SF6BattleLogCrawler(
            cookie=cookie_to_use
        )
        # 手动设置用户信息
        crawler.user_id = user_info['user_id']
        crawler.player_name = user_info['player_name']
        
        # 执行爬取（并行获取个人资料）
        df = crawler.crawl(pages=request.pages, battle_type=request.battle_type, fetch_profile=True)
        player_profile = crawler.player_profile
        
        # 转换为字典列表
        data = df.to_dict('records')
        
        # 转换日期为字符串
        for record in data:
            if 'date' in record:
                record['date'] = str(record['date'])
        
        return {
            "success": True,
            "total_records": len(data),
            "data": data,
            "user_info": user_info,
            "player_profile": player_profile
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"爬取失败: {str(e)}")


@app.post("/api/query-player")
def query_player(request: QueryPlayerRequest):
    """查询指定玩家的对战记录"""
    global query_crawler
    
    try:
        # 优先使用请求中的cookie，如果没有则使用全局存储的cookie，最后使用crawler默认cookie
        cookie_to_use = None
        if hasattr(request, 'cookie') and request.cookie:
            cookie_to_use = request.cookie
        elif stored_cookie:
            cookie_to_use = stored_cookie
        # 如果都没有，cookie_to_use保持为None，crawler会使用默认cookie
        
        # 如果查询爬虫不存在或cookie变化，创建新的实例
        if query_crawler is None or query_crawler.headers.get('cookie') != cookie_to_use:
            query_crawler = SF6BattleLogCrawler(cookie=cookie_to_use)
            print(f'✓ 创建新的查询爬虫实例')
        
        # 查询玩家数据（使用优化参数：5并发，并行获取个人资料）
        df = query_crawler.query_player(
            user_id=request.user_id,
            pages=request.pages,
            max_workers=request.max_workers if hasattr(request, 'max_workers') else 5,
            battle_type=request.battle_type,
            fetch_profile=True  # 启用个人资料获取（并行执行，不增加总耗时）
        )
        
        # 转换为字典列表
        data = df.to_dict('records')
        
        # 转换日期为字符串
        for record in data:
            if 'date' in record:
                record['date'] = str(record['date'])
        
        return {
            "success": True,
            "total_records": len(data),
            "data": data,
            "user_info": {
                'user_id': query_crawler.user_id,
                'player_name': query_crawler.player_name or f'玩家{query_crawler.user_id}'
            },
            "player_profile": query_crawler.player_profile
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
