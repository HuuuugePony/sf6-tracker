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


class RankingRequest(BaseModel):
    """排行榜请求"""
    character_id: str = 'chunli'  # 角色工具名
    character_filter: int = 4  # 角色筛选类型
    platform: int = 1  # 平台: 1=Steam
    home_filter: int = 1  # 1=全球, 3=地区
    home_category_id: int = 0  # 地区分类ID
    home_id: int = 0  # 地区ID
    page: int = 1  # 页码
    season_type: int = 1  # 赛季类型
    cookie: str = None  # 可选的cookie参数


class FightersListRequest(BaseModel):
    """格斗圈（朋友/关注）列表请求"""
    list_type: str = 'friend'  # 列表类型: friend=朋友, follow=关注
    page: int = 1  # 页码
    order_type: str = 'gamemode'  # 排序类型: gamemode/league_rank/registered/last_play
    order_order: int = 0  # 排序方向: 0/1
    cookie: str = None  # 可选的cookie参数


class CharactersRequest(BaseModel):
    """角色列表自动更新请求"""
    cookie: str = None  # 可选的cookie参数
    force_refresh: bool = False  # 是否忽略缓存强制刷新


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


@app.post("/api/login/cookie")
def login_with_cookie(request: dict):
    """通过Cookie直接登录 - 用采集验证有效性（能采到名字ID就是有效的）"""
    global stored_cookie, user_info
    cookie_string = request.get('cookie', '').strip()
    
    if not cookie_string:
        raise HTTPException(status_code=400, detail="Cookie不能为空")
    
    try:
        extracted_user_id = None
        extracted_player_name = None
        
        # 用前端传来的user_id或已存储的user_info，直接采集验证
        test_user_id = request.get('user_id') or user_info.get('user_id')
        
        if test_user_id:
            # 已知用户ID：直接采集对战数据验证（能采到就是有效的）
            try:
                test_crawler = SF6BattleLogCrawler(cookie=cookie_string)
                test_crawler.set_user_id(test_user_id)
                page_data = test_crawler.fetch_page(page=1)
                battles, battle_user_info = test_crawler.parse_battles_from_json(page_data)
                extracted_user_id = battle_user_info.get('user_id') or str(test_user_id)
                extracted_player_name = battle_user_info.get('player_name') or user_info.get('player_name', '')
                print(f'✓ 采集验证通过: {extracted_player_name}({extracted_user_id})')
            except Exception as e:
                raise HTTPException(status_code=401, detail=f"Cookie已失效（{e}），请重新获取")
        else:
            # 首次Cookie登录（无用户ID）：请求排行榜接口验证登录态，并从loginUser提取本人信息
            try:
                test_crawler = SF6BattleLogCrawler(cookie=cookie_string)
                ranking_url = (
                    f'{test_crawler.api_base_url}/{test_crawler.build_id}/{test_crawler.lang}/ranking/master.json'
                    f'?character_filter=4&character_id=chunli&platform=1&home_filter=1'
                    f'&home_category_id=0&home_id=0&page=1&season_type=1'
                )
                response = test_crawler.session.get(ranking_url, timeout=10)
                if response.status_code == 403:
                    raise HTTPException(status_code=401, detail="Cookie无效或已过期（未检测到登录状态），请重新获取")
                # 不检查状态码：即使参数异常返回400，响应中仍携带loginUser可用于验证
                common = response.json().get('pageProps', {}).get('common', {})
                login_user = common.get('loginUser') or {}
                if not login_user.get('flg') or not login_user.get('shortId'):
                    raise HTTPException(status_code=401, detail="Cookie无效或已过期（未检测到登录状态），请重新获取")
                extracted_user_id = str(login_user.get('shortId'))
                extracted_player_name = login_user.get('fighterId') or ''
                print(f'✓ 排行榜验证通过: {extracted_player_name}({extracted_user_id})')
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=401, detail=f"Cookie已失效（{e}），请重新获取")
        
        if not extracted_user_id:
            raise HTTPException(status_code=401, detail="Cookie无效或已过期，无法采集数据")
        
        # 保存到全局变量
        stored_cookie = cookie_string
        user_info = {
            'user_id': extracted_user_id,
            'player_name': extracted_player_name
        }
        
        return {
            "success": True,
            "cookie": cookie_string,
            "user_id": extracted_user_id,
            "player_name": extracted_player_name,
            "message": "Cookie登录成功"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cookie登录失败: {str(e)}")


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


@app.post("/api/ranking")
def get_ranking(request: RankingRequest):
    """获取排行榜数据"""
    global query_crawler
    
    try:
        start_time = time.time()
        # 优先使用请求中的cookie
        cookie_to_use = None
        if request.cookie:
            cookie_to_use = request.cookie
        elif stored_cookie:
            cookie_to_use = stored_cookie
        
        # 复用查询爬虫实例获取build_id
        if query_crawler is None or query_crawler.headers.get('cookie') != cookie_to_use:
            query_crawler = SF6BattleLogCrawler(cookie=cookie_to_use)
        
        # 构造排行榜API URL
        url = (
            f'{query_crawler.api_base_url}/{query_crawler.build_id}/{query_crawler.lang}/ranking/master.json'
            f'?character_filter={request.character_filter}'
            f'&character_id={request.character_id}'
            f'&platform={request.platform}'
            f'&home_filter={request.home_filter}'
            f'&home_category_id={request.home_category_id}'
            f'&home_id={request.home_id}'
            f'&page={request.page}'
            f'&season_type={request.season_type}'
        )
        
        response = query_crawler.session.get(url, timeout=10)
        
        # 尝试解析JSON（403时也可能有JSON响应）
        try:
            data = response.json()
        except Exception:
            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="排行榜需要登录后才能查看，请先登录")
            response.raise_for_status()
            return {"success": False}
        
        # 提取pageProps中的排行榜数据
        page_props = data.get('pageProps', {})
        
        # 检查是否为403未登录状态（HTTP 403 或 pageProps内statusCode=403）
        common = page_props.get('common', {})
        if response.status_code == 403 or common.get('statusCode') == 403:
            raise HTTPException(status_code=403, detail="排行榜需要登录后才能查看，请先登录")
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"排行榜API返回异常状态: {response.status_code}")
        
        # 提取排行榜数据：master_rating_ranking.ranking_fighter_list
        # 结构: {master_rating_ranking: {ranking_fighter_list: [...], current_page, total_page, total_count}}
        ranking_data = page_props.get('master_rating_ranking', {})
        ranking_list = []
        pagination = {}
        
        if isinstance(ranking_data, dict):
            ranking_list = ranking_data.get('ranking_fighter_list', [])
            pagination = {
                "current_page": ranking_data.get('current_page', request.page),
                "total_page": ranking_data.get('total_page', 0),
                "total_count": ranking_data.get('total_count', 0)
            }
        
        elapsed = time.time() - start_time
        print(f'[排行榜] 耗时: {elapsed:.2f}s')
        
        return {
            "success": True,
            "data": page_props,
            "ranking_list": ranking_list,
            "pagination": pagination
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取排行榜失败: {str(e)}")


@app.post("/api/fighters-list")
def get_fighters_list(request: FightersListRequest):
    """获取格斗圈列表数据（朋友/关注）"""
    global query_crawler

    try:
        start_time = time.time()

        # 校验列表类型
        if request.list_type not in ('friend', 'follow'):
            raise HTTPException(status_code=400, detail="list_type 仅支持 friend/follow")

        # 校验排序参数
        valid_order_types = ('gamemode', 'league_rank', 'registered', 'last_play')
        if request.order_type not in valid_order_types:
            raise HTTPException(status_code=400, detail=f"order_type 仅支持 {'/'.join(valid_order_types)}")
        if request.order_order not in (0, 1):
            raise HTTPException(status_code=400, detail="order_order 仅支持 0/1")

        # 优先使用请求中的cookie
        cookie_to_use = None
        if request.cookie:
            cookie_to_use = request.cookie
        elif stored_cookie:
            cookie_to_use = stored_cookie

        if not cookie_to_use:
            raise HTTPException(status_code=403, detail="格斗圈列表需要登录后才能查看，请先登录")

        # 复用查询爬虫实例，但每次及时刷新build_id（官网发布新版后build_id会变，过期会导致数据异常）
        if query_crawler is None or query_crawler.headers.get('cookie') != cookie_to_use:
            query_crawler = SF6BattleLogCrawler(cookie=cookie_to_use)
        try:
            fresh_build_id = query_crawler.fetch_build_id()
            if fresh_build_id:
                query_crawler.build_id = fresh_build_id
        except Exception:
            pass  # 刷新失败时继续使用现有build_id

        # 构造格斗圈列表API URL（与官网一致：第1页仅order_type/order_order，翻页才带page）
        # 朋友: {api_base_url}/{build_id}/{lang}/fighterslist/friend.json
        # 关注: {api_base_url}/{build_id}/{lang}/fighterslist/follow.json
        page_param = f'&page={request.page}' if request.page > 1 else ''
        url = (
            f'{query_crawler.api_base_url}/{query_crawler.build_id}/{query_crawler.lang}/fighterslist/{request.list_type}.json'
            f'?order_type={request.order_type}'
            f'&order_order={request.order_order}'
            f'{page_param}'
        )

        response = query_crawler.session.get(url, timeout=10)

        # build_id过期时官网返回404：及时重新获取build_id并重试一次
        if response.status_code == 404:
            print(f'[格斗圈-{request.list_type}] 404，build_id可能过期，重新获取后重试')
            query_crawler.build_id = query_crawler.fetch_build_id()
            url = (
                f'{query_crawler.api_base_url}/{query_crawler.build_id}/{query_crawler.lang}/fighterslist/{request.list_type}.json'
                f'?order_type={request.order_type}'
                f'&order_order={request.order_order}'
                f'{page_param}'
            )
            response = query_crawler.session.get(url, timeout=10)

        # 尝试解析JSON（403时也可能有JSON响应）
        try:
            data = response.json()
        except Exception:
            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="格斗圈列表需要登录后才能查看，请先登录")
            response.raise_for_status()
            return {"success": False}

        # 提取pageProps中的列表数据
        page_props = data.get('pageProps', {})

        # 检查是否为403未登录状态（HTTP 403 或 pageProps内statusCode=403）
        common = page_props.get('common', {})
        if response.status_code == 403 or common.get('statusCode') == 403:
            raise HTTPException(status_code=403, detail="格斗圈列表需要登录后才能查看，请先登录")

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"格斗圈API返回异常状态: {response.status_code}")

        # 提取列表数据（真实字段：朋友=friend_list，关注=followed_fighter_banner_list，均直接位于pageProps顶层）
        fighter_list = []
        pagination = {"current_page": page_props.get('page', request.page)}

        list_keys = (
            'followed_fighter_banner_list',  # 关注列表真实字段
            'friend_list',                   # 朋友列表真实字段
            'fighter_list', 'follow_list', 'list'
        )
        for key in list_keys:
            if isinstance(page_props.get(key), list):
                fighter_list = page_props[key]
                break

        elapsed = time.time() - start_time
        print(f'[格斗圈-{request.list_type}] 耗时: {elapsed:.2f}s, 数量: {len(fighter_list)}')

        return {
            "success": True,
            "list_type": request.list_type,
            "data": page_props,
            "fighter_list": fighter_list,
            "pagination": pagination
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取格斗圈列表失败: {str(e)}")


# ==================== 角色列表自动更新 ====================

# 已知角色 tool名 → 数字ID 映射（新角色通过排行榜接口自动补全）
KNOWN_CHARACTER_IDS = {
    'ryu': 1, 'luke': 2, 'kimberly': 3, 'chunli': 4, 'manon': 5, 'zangief': 6,
    'jp': 7, 'dhalsim': 8, 'cammy': 9, 'ken': 10, 'deejay': 11, 'lily': 12,
    'aki': 13, 'rashid': 14, 'blanka': 15, 'juri': 16, 'marisa': 17, 'guile': 18,
    'ed': 19, 'honda': 20, 'jamie': 21, 'gouki': 22, 'sagat': 25, 'vega': 26,
    'terry': 27, 'mai': 28, 'elena': 29, 'cviper': 30, 'alex': 31, 'ingrid': 32,
}

CHARACTERS_CACHE_TTL = 24 * 3600  # 缓存24小时


def get_writable_path():
    """获取可写目录（打包后为exe所在目录，开发时为项目目录）"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CHARACTERS_CACHE_FILE = os.path.join(get_writable_path(), 'characters_cache.json')


def _load_characters_cache():
    """读取角色列表本地缓存"""
    try:
        import json
        with open(CHARACTERS_CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _save_characters_cache(data):
    """写入角色列表本地缓存"""
    try:
        import json
        with open(CHARACTERS_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        print(f'[角色列表] 缓存写入失败: {e}')


def _fetch_numeric_character_id(crawler, tool):
    """通过特定角色排行榜查询获取新角色的数字ID（取榜内首条玩家的character_id）"""
    try:
        url = (
            f'{crawler.api_base_url}/{crawler.build_id}/{crawler.lang}/ranking/master.json'
            f'?character_filter=4&character_id={tool}&page=1'
        )
        resp = crawler.session.get(url, timeout=10)
        data = resp.json()
        flist = data.get('pageProps', {}).get('master_rating_ranking', {}).get('ranking_fighter_list', [])
        if flist:
            cid = flist[0].get('character_id')
            if isinstance(cid, int):
                return cid
    except Exception as e:
        print(f'[角色列表] 查询角色{tool}数字ID失败: {e}')
    return None


@app.post("/api/characters")
def get_characters(request: CharactersRequest):
    """获取最新官方角色列表（自动发现新角色）
    数据源：排行榜API的 pageProps.character_id 数组（完整角色清单，含中文名/工具名/排序）
    """
    global query_crawler

    try:
        start_time = time.time()

        # 缓存未过期且非强制刷新时直接返回
        cached = _load_characters_cache()
        if cached and not request.force_refresh:
            age = time.time() - cached.get('fetched_at', 0)
            if age < CHARACTERS_CACHE_TTL and cached.get('characters'):
                return {
                    "success": True,
                    "characters": cached['characters'],
                    "updated_at": cached.get('updated_at'),
                    "from_cache": True
                }

        # 优先使用请求中的cookie
        cookie_to_use = None
        if request.cookie:
            cookie_to_use = request.cookie
        elif stored_cookie:
            cookie_to_use = stored_cookie

        if not cookie_to_use:
            # 未登录时若有缓存则降级返回缓存
            if cached and cached.get('characters'):
                return {
                    "success": True,
                    "characters": cached['characters'],
                    "updated_at": cached.get('updated_at'),
                    "from_cache": True
                }
            raise HTTPException(status_code=403, detail="角色列表需要登录后才能获取，请先登录")

        # 复用查询爬虫实例，并刷新build_id
        if query_crawler is None or query_crawler.headers.get('cookie') != cookie_to_use:
            query_crawler = SF6BattleLogCrawler(cookie=cookie_to_use)
        try:
            fresh_build_id = query_crawler.fetch_build_id()
            if fresh_build_id:
                query_crawler.build_id = fresh_build_id
        except Exception:
            pass

        # 拉取排行榜（全角色筛选）获取完整角色清单
        url = (
            f'{query_crawler.api_base_url}/{query_crawler.build_id}/{query_crawler.lang}/ranking/master.json'
            f'?character_filter=1&page=1'
        )
        response = query_crawler.session.get(url, timeout=10)

        # build_id过期时返回404：重新获取后重试一次
        if response.status_code == 404:
            print('[角色列表] 404，build_id可能过期，重新获取后重试')
            query_crawler.build_id = query_crawler.fetch_build_id()
            response = query_crawler.session.get(url, timeout=10)

        try:
            data = response.json()
        except Exception:
            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="角色列表需要登录后才能获取，请先登录")
            response.raise_for_status()
            return {"success": False}

        page_props = data.get('pageProps', {})
        common = page_props.get('common', {})
        if response.status_code == 403 or common.get('statusCode') == 403:
            raise HTTPException(status_code=403, detail="角色列表需要登录后才能获取，请先登录")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"角色列表API返回异常状态: {response.status_code}")

        char_options = page_props.get('character_id', [])
        if not isinstance(char_options, list) or not char_options:
            # 拉取失败时降级返回缓存
            if cached and cached.get('characters'):
                return {
                    "success": True,
                    "characters": cached['characters'],
                    "updated_at": cached.get('updated_at'),
                    "from_cache": True
                }
            raise HTTPException(status_code=500, detail="未获取到官方角色清单")

        # 组装角色列表（排除"随机"选项 tool_name=random）
        characters = []
        for item in char_options:
            tool = item.get('tool_name') or item.get('value') or ''
            if not tool or tool == 'random':
                continue
            name = item.get('label') or tool
            char_id = KNOWN_CHARACTER_IDS.get(tool)
            if char_id is None:
                # 新角色：通过特定角色排行榜查询数字ID
                char_id = _fetch_numeric_character_id(query_crawler, tool)
                print(f'[角色列表] 发现新角色 {tool}({name})，数字ID={char_id}')
            characters.append({
                "id": char_id,
                "name": name,
                "tool": tool,
                "sort": item.get('sort', 999)
            })

        characters.sort(key=lambda c: c.get('sort', 999))
        for c in characters:
            c.pop('sort', None)

        updated_at = int(time.time())
        _save_characters_cache({
            "fetched_at": time.time(),
            "updated_at": updated_at,
            "characters": characters
        })

        elapsed = time.time() - start_time
        print(f'[角色列表] 耗时: {elapsed:.2f}s, 数量: {len(characters)}')

        return {
            "success": True,
            "characters": characters,
            "updated_at": updated_at,
            "from_cache": False
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取角色列表失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
