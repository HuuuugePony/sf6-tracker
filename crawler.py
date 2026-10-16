import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
import time
import json
import logging
import threading
import math
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib3.exceptions import MaxRetryError
from battle_data import BattlePageError, BattleAuthenticationError, parse_battle_page, player_identity, page_props

# 配置日志（关闭DEBUG）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

_build_id_cache = {}
_build_id_lock = threading.Lock()
BUILD_ID_CACHE_TTL = 300


class SF6BattleLogCrawler:
    """街霸6对战记录爬虫类"""
    
    def __init__(self, cookie=None):
        """
        初始化爬虫
        :param cookie: Cookie字符串，可选。如果不提供则使用默认cookie
        """
        self.user_id = None
        self.player_name = None
        self.player_sid = None
        self.player_profile = {}  # 存储玩家详细资料
        self.collection_status = {}
        
        # 如果未提供cookie，使用默认cookie
        if cookie is None:
            cookie = ''
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'cookie': cookie
        }
        # Next.js API基础URL（不包含语言路径）
        self.api_base_url = 'https://www.streetfighter.com/6/buckler/_next/data'
        # Next.js build ID（自动获取）
        self.build_id = None
        # 语言路径
        self.lang = 'zh-hans'
        
        # 创建带连接池的session，提升性能
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        
        # 配置重试策略和连接池
        retry_strategy = Retry(
            total=2,  # 最多重试2次（应对偶发502）
            backoff_factor=0.05,  # 重试间隔: 0.05s, 0.1s
            status_forcelist=[429, 500, 502, 503]  # 需要重试的状态码
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=20,  # 增加连接池大小，减少重复SSL握手
            pool_maxsize=40  # 增加最大连接数，支持更高并发
        )
        self.session.mount('https://', adapter)
        self.session.mount('http://', adapter)
        
        # 自动获取build_id
        try:
            with _build_id_lock:
                cached = _build_id_cache.get(self.lang)
                if cached and time.monotonic() - cached[1] < BUILD_ID_CACHE_TTL:
                    self.build_id = cached[0]
                else:
                    self.build_id = self.fetch_build_id()
                    _build_id_cache[self.lang] = (self.build_id, time.monotonic())
        except Exception:
            self.session.close()
            raise
        logger.debug(f'[__init__] build_id已设置: {self.build_id}')

    def fetch_build_id(self):
        """
        从官网首页HTML中自动提取Next.js build_id
        :return: build_id字符串
        """
        try:
            logger.debug('[fetch_build_id] 开始获取build_id')
            # 访问官网首页
            homepage_url = f'https://www.streetfighter.com/6/buckler/{self.lang}'
            response = self.session.get(homepage_url, timeout=5)
            response.raise_for_status()
            
            html_content = response.text
            
            # Next.js 在 HTML 中有多种格式包含 build_id：
            # 1. <script id="__NEXT_DATA__" type="application/json">{"buildId":"xxx",...}</script>
            # 2. /_next/data/xxx/... 的路径中
            import re
            
            # 方法1：从 __NEXT_DATA__ 中提取
            pattern1 = r'<script[^>]*id="__NEXT_DATA__"[^>]*type="application/json"[^>]*>(.*?)</script>'
            match = re.search(pattern1, html_content, re.DOTALL)
            if match:
                json_data = json.loads(match.group(1))
                build_id = json_data.get('buildId')
                if build_id:
                    logger.debug(f'[fetch_build_id] 从__NEXT_DATA__获取到build_id: {build_id}')
                    return build_id
            
            # 方法2：从 _next/data/ 路径中提取
            pattern2 = r'/_next/data/([A-Za-z0-9_-]+)/'
            matches = re.findall(pattern2, html_content)
            if matches:
                # 取第一个匹配的 build_id
                build_id = matches[0]
                logger.debug(f'[fetch_build_id] 从URL路径获取到build_id: {build_id}')
                return build_id
            
            # 如果都失败，抛出异常
            raise Exception('无法从HTML中提取build_id')
            
        except Exception as e:
            logger.error(f'[fetch_build_id] 获取build_id失败: {e}')
            raise
    
    def get_cookies_with_login(self):
        """
        手动登录后获取Cookie（需要在浏览器中手动登录）
        :return: Cookie字符串
        """
        print('\n' + '='*70)
        print('📌 请在浏览器中完成以下步骤：')
        print(f'   1. 访问: https://www.streetfighter.com/6/buckler/{self.lang}')
        print('   2. 点击页面上的"登录"按钮')
        print('   3. 输入您的CAPCOM ID账号和密码')
        print('   4. 完成人机验证（如果有）')
        print('   5. 等待登录成功，页面跳转')
        print('='*70)
        print('\n💡 提示：登录成功后，按 F12 打开开发者工具')
        print('   在 Console 中输入: document.cookie')
        print('   复制输出的 Cookie 字符串\n')
        
        cookie_string = input('✅ 请粘贴 Cookie 字符串: ').strip()
        
        if cookie_string:
            self.headers['cookie'] = cookie_string
            print(f'\n✓ Cookie 已设置！长度: {len(cookie_string)} 字符')
            return cookie_string
        else:
            raise Exception('未提供 Cookie')

    def _get_data_response(self, url, timeout=3):
        """官网发布新版本时刷新 build ID，并仅重试一次。"""
        response = self.session.get(url, timeout=timeout)
        if response.status_code == 404:
            stale_build = url[len(self.api_base_url) + 1:].split('/')[0]
            with _build_id_lock:
                cached = _build_id_cache.get(self.lang)
                if cached and cached[0] != stale_build:
                    self.build_id = cached[0]
                else:
                    self.build_id = self.fetch_build_id()
                    _build_id_cache[self.lang] = (self.build_id, time.monotonic())
            response = self.session.get(url.replace(f'/{stale_build}/', f'/{self.build_id}/', 1), timeout=timeout)
        return response

    def fetch_page(self, page=1, battle_type='all'):
        """
        获取指定页面的JSON数据（通过Next.js API）
        :param page: 页码
        :param battle_type: 对战类型 (all/rank/casual/custom/hub)
        :return: JSON字典
        """
        if not self.user_id:
            raise Exception("用户ID未设置，请先登录获取用户信息")
        
        # 根据对战类型构造API路径
        type_paths = {
            'all': 'battlelog',
            'rank': 'battlelog/rank',
            'casual': 'battlelog/casual',
            'custom': 'battlelog/custom',
            'hub': 'battlelog/hub'
        }
        
        path = type_paths.get(battle_type, 'battlelog')
        # Next.js API URL格式：page在前，sid在后
        url = f'{self.api_base_url}/{self.build_id}/{self.lang}/profile/{self.user_id}/{path}.json?page={page}&sid={self.user_id}'
        logger.debug(f'[fetch_page] 开始请求第{page}页, 类型:{battle_type}')
        start_time = time.time()
        response = self._get_data_response(url)
        request_time = time.time() - start_time
        logger.debug(f'[fetch_page] 第{page}页请求完成, 耗时:{request_time:.3f}s, 状态码:{response.status_code}')
        response.raise_for_status()
        parse_start = time.time()
        data = response.json()
        parse_time = time.time() - parse_start
        logger.debug(f'[fetch_page] 第{page}页JSON解析完成, 耗时:{parse_time:.3f}s')
        return data
    
    def fetch_profile_page(self):
        """
        获取玩家个人资料JSON数据（通过Next.js API）
        :return: JSON字典
        """
        if not self.user_id:
            raise Exception("用户ID未设置，请先登录获取用户信息")
        # 玩家信息API URL格式
        url = f'{self.api_base_url}/{self.build_id}/{self.lang}/profile/{self.user_id}.json?sid={self.user_id}'
        logger.debug(f'[fetch_profile] 开始请求玩家信息, user_id:{self.user_id}')
        start_time = time.time()
        response = self._get_data_response(url)
        request_time = time.time() - start_time
        logger.debug(f'[fetch_profile] 玩家信息请求完成, 耗时:{request_time:.3f}s, 状态码:{response.status_code}')
        response.raise_for_status()
        parse_start = time.time()
        data = response.json()
        parse_time = time.time() - parse_start
        logger.debug(f'[fetch_profile] 玩家信息JSON解析完成, 耗时:{parse_time:.3f}s')
        return data
    
    def extract_player_profile(self, json_data=None):
        """
        提取玩家详细资料（格斗点、各模式对战次数等）从JSON API响应
        :param json_data: JSON字典，如果为None则自动获取
        :return: 玩家资料字典
        """
        logger.debug('[extract_profile] 开始解析玩家资料')
        start_time = time.time()
        if json_data is None:
            json_data = self.fetch_profile_page()
        
        profile_data = {
            'fighting_points': 0,
            'rank_matches': 0,
            'casual_matches': 0,
            'custom_matches': 0,
            'hub_matches': 0,
            'challenges_completed': 0,
            'practice_time': '',
            'rank_time': '',
            'my_custom_time': '',
            # 在线状态
            'online_status_name': '',
            # 战斗统计数据
            'battle_stats_detail': {}
        }
        
        try:
            page_props = json_data.get('pageProps', {})
            play_data = page_props.get('play', {})
            fighter_banner_info = page_props.get('fighter_banner_info', {})
            
            # 从battle_stats中提取对战次数
            battle_stats = play_data.get('battle_stats', {})
            profile_data['rank_matches'] = battle_stats.get('rank_match_play_count', 0)
            profile_data['casual_matches'] = battle_stats.get('casual_match_play_count', 0)
            profile_data['custom_matches'] = battle_stats.get('custom_room_match_play_count', 0)
            profile_data['hub_matches'] = battle_stats.get('battle_hub_match_play_count', 0)
            profile_data['challenges_completed'] = battle_stats.get('target_clear_count', 0)
            
            # 从base_info中提取格斗点和游玩时间
            base_info = play_data.get('base_info', {})
            profile_data['fighting_points'] = base_info.get('enjoy_fight_point', 0)
            
            # 提取各模式游玩时间
            content_play_time_list = base_info.get('content_play_time_list', [])
            for item in content_play_time_list:
                content_type = item.get('content_type', 0)
                play_time = item.get('play_time', 0)
                # 将秒转换为小时:分钟格式
                hours = play_time // 3600
                minutes = (play_time % 3600) // 60
                time_str = f'{hours}:{minutes:02d}' if hours > 0 else f'{minutes}分钟'
                
                # content_type对照表：2=排位赛, 4=自定义房间, 8=练习
                if content_type == 8:  # 练习
                    profile_data['practice_time'] = time_str
                elif content_type == 2:  # 排位赛
                    profile_data['rank_time'] = time_str
                elif content_type == 4:  # 自定义房间
                    profile_data['my_custom_time'] = time_str
            
            self.player_profile = profile_data
            
            # 提取在线状态
            online_status_info = fighter_banner_info.get('online_status_info', {})
            online_status_data = online_status_info.get('online_status_data', {})
            profile_data['online_status_name'] = online_status_data.get('online_status_name', '')
            
            # 提取战斗统计详细数据
            battle_stats_fields = [
                'corner_time', 'cornered_time',
                'drive_impact', 'drive_impact_to_drive_impact',
                'drive_parry', 'drive_reversal', 'just_parry',
                'punish_counter', 'stun', 'throw_count', 'throw_tech',
                'received_drive_impact', 'received_drive_impact_to_drive_impact',
                'received_punish_counter', 'received_stun', 'received_throw_count',
                'received_throw_drive_parry', 'throw_drive_parry',
                'gauge_rate_ca', 'gauge_rate_drive_arts', 'gauge_rate_drive_guard',
                'gauge_rate_drive_impact', 'gauge_rate_drive_other',
                'gauge_rate_drive_reversal', 'gauge_rate_drive_rush_from_cancel',
                'gauge_rate_drive_rush_from_parry',
                'gauge_rate_sa_lv1', 'gauge_rate_sa_lv2', 'gauge_rate_sa_lv3'
            ]
            for field in battle_stats_fields:
                profile_data['battle_stats_detail'][field] = battle_stats.get(field, 0.0)
            profile_data['battle_stats_available_fields'] = [field for field in battle_stats_fields
                if isinstance(battle_stats.get(field), (int, float))
                and not isinstance(battle_stats.get(field), bool) and math.isfinite(battle_stats[field])]
            
            # 提取各角色对阵各对手的胜率数据
            character_win_rates_by_rival = play_data.get('character_win_rates_by_rival_character', [])
            profile_data['character_win_rates_by_rival'] = []
            for char_data in character_win_rates_by_rival:
                char_id = char_data.get('character_id', 0)
                rival_win_rates = char_data.get('rival_character_win_rates', [])
                # 只保留有对战数据的角色
                if rival_win_rates:
                    profile_data['character_win_rates_by_rival'].append({
                        'character_id': char_id,
                        'rival_character_win_rates': rival_win_rates
                    })
            
            elapsed = time.time() - start_time
            logger.debug(f'[extract_profile] 玩家资料解析完成, 耗时:{elapsed:.3f}s')
            return profile_data
            
        except Exception as e:
            elapsed = time.time() - start_time
            logger.debug(f'[extract_profile] 玩家资料解析失败, 耗时:{elapsed:.3f}s, 错误:{e}')
            self.player_profile = {}
            raise BattlePageError('玩家资料解析不完整') from e
    
    def _get_input_type_name(self, input_type_code):
        """
        将操作方式代码转换为中文名称
        :param input_type_code: 操作方式代码 (0=现代, 1=经典, 或字符串)
        :return: 中文名称
        """
        # 如果是数字或数字字符串
        if input_type_code == 0 or input_type_code == '0':
            return '现代'
        elif input_type_code == 1 or input_type_code == '1':
            return '经典'
        
        # 如果包含日文/特殊字符，尝试提取并翻译
        if isinstance(input_type_code, str):
            # 处理类似 "[t]クラシック" 的情况
            if 'クラシック' in input_type_code or 'classic' in input_type_code.lower():
                return '经典'
            elif 'モダン' in input_type_code or 'modern' in input_type_code.lower():
                return '现代'
            # 其他情况直接返回原值（去掉[t]前缀）
            return input_type_code.replace('[t]', '').strip()
        
        return str(input_type_code)
    
    def _format_round_results(self, round_results):
        """
        格式化回合结果
        :param round_results: 回合结果列表，如 [0, 8, 0] 或 [1, 0, 0]
        :return: 格式化后的字符串，如 "✗-✓-✗" (0=负/✗, 非0=胜/✓)
        """
        if not round_results or not isinstance(round_results, list):
            return '-'
        
        # 0表示输，非0表示赢
        result_map = {
            0: '✗',  # 负
        }
        
        results = []
        for r in round_results:
            if r == 0:
                results.append('✗')
            else:
                results.append('✓')
        
        return '-'.join(results)
    
    def _format_league_rank(self, league_rank, lp):
        """
        格式化段位显示
        :param league_rank: 段位等级 (0-37)
        :param lp: LP积分
        :return: 格式化后的段位字符串
        """
        # 根据前端源码分析：
        # rank34_s.png -> 24247积分 (钻石段位，显示总LP)
        # rank35_s.png -> 22964积分 (钻石2段位，显示总LP)
        # rank36_s.png -> M阶1383 (Master段位，显示Master内积分)
        # 
        # 规则：
        # - rank < 36: 显示总LP积分，如 "24247积分"
        # - rank >= 36 (Master): 显示Master段位内的积分
        if not league_rank or league_rank == 0:
            return '-'
        
        # 官方API可能返回 null（如休闲赛/未定级记录），防止渲染出 "None积分"/"M阶None"
        if lp is None:
            return '-'
        
        if league_rank >= 36:
            # Master及以上，显示Master段位内的积分
            return f'M阶{lp}'
        else:
            # Master以下，显示总LP积分
            return f'{lp}积分'
    
    def parse_battle_from_json(self, replay_data):
        """
        从JSON数据中解析单条对战记录（包含完整信息）
        :param replay_data: 单条replay的JSON数据
        :return: 对战记录字典
        """
        battle = {}
        
        # 基本信息（官方API字段可能为 null，统一用 or 兜底，防止 None 泄漏到前端显示为 "None"）
        battle['replay_id'] = replay_data.get('replay_id') or ''
        battle['uploaded_at'] = replay_data.get('uploaded_at') or 0
        battle['views'] = replay_data.get('views') or 0
        battle['battle_type'] = replay_data.get('replay_battle_type_name') or ''
        battle['battle_sub_type'] = replay_data.get('replay_battle_sub_type_name') or ''
        
        # 玩家1信息
        p1_info = replay_data.get('player1_info') or {}
        p1_player = p1_info.get('player') or {}
        p1_character_id = p1_info.get('playing_character_id') or 0
        p1_character_tool = p1_info.get('playing_character_tool_name') or ''
        p1_lp = p1_info.get('league_point') or 0
        p1_master_rating = p1_info.get('master_rating') or 0  # Master段位分
        p1_league_rank = p1_info.get('league_rank') or 0
        p1_input_type = p1_info.get('battle_input_type_name') or ''
        
        battle['player1'] = {
            'name': p1_player.get('fighter_id') or '',
            'short_id': p1_player.get('short_id') or 0,
            'platform': p1_player.get('platform_name') or '',
            'platform_id': p1_player.get('platform_id') or 0,
            'character': p1_info.get('playing_character_name') or '',
            'character_tool_name': p1_character_tool,
            'character_id': p1_character_id,
            'character_image': self._get_character_image_url(p1_character_id, p1_character_tool, 1),
            'lp': p1_lp,
            'master_rating': p1_master_rating,  # Master段位分
            'league_rank': p1_league_rank,
            'league_rank_display': self._format_league_rank(p1_league_rank, p1_master_rating if p1_master_rating else p1_lp),
            'input_type': self._get_input_type_name(p1_input_type),
            'round_results': p1_info.get('round_results') or [],
        }
        
        # 玩家2信息
        p2_info = replay_data.get('player2_info') or {}
        p2_player = p2_info.get('player') or {}
        if self.user_id and str(self.user_id) not in (
                str(p1_player.get('short_id') or ''), str(p2_player.get('short_id') or '')):
            raise ValueError('对战记录不包含查询目标')
        p2_character_id = p2_info.get('playing_character_id') or 0
        p2_character_tool = p2_info.get('playing_character_tool_name') or ''
        p2_lp = p2_info.get('league_point') or 0
        p2_master_rating = p2_info.get('master_rating') or 0  # Master段位分
        p2_league_rank = p2_info.get('league_rank') or 0
        p2_input_type = p2_info.get('battle_input_type_name') or ''
        
        battle['player2'] = {
            'name': p2_player.get('fighter_id') or '',
            'short_id': p2_player.get('short_id') or 0,
            'platform': p2_player.get('platform_name') or '',
            'platform_id': p2_player.get('platform_id') or 0,
            'character': p2_info.get('playing_character_name') or '',
            'character_tool_name': p2_character_tool,
            'character_id': p2_character_id,
            'character_image': self._get_character_image_url(p2_character_id, p2_character_tool, 2),
            'lp': p2_lp,
            'master_rating': p2_master_rating,  # Master段位分
            'league_rank': p2_league_rank,
            'league_rank_display': self._format_league_rank(p2_league_rank, p2_master_rating if p2_master_rating else p2_lp),
            'input_type': self._get_input_type_name(p2_input_type),
            'round_results': p2_info.get('round_results') or [],
        }
        
        # 判断胜负（根据round_results中非0值的个数）
        # round_results中非0表示该局获胜，统计获胜局数
        p1_wins = sum(1 for r in (p1_info.get('round_results') or []) if r != 0)
        p2_wins = sum(1 for r in (p2_info.get('round_results') or []) if r != 0)
        battle['player1']['result'] = 'WIN' if p1_wins > p2_wins else 'LOSE'
        battle['player2']['result'] = 'WIN' if p2_wins > p1_wins else 'LOSE'
        
        return battle
    
    def _get_character_image_url(self, character_id, character_tool_name, player_side):
        """
        构造角色头像图片URL
        :param character_id: 角色ID
        :param character_tool_name: 角色工具名（如ken, ed, aki等）
        :param player_side: 玩家位置 1或2
        :return: 角色头像URL
        """
        if not character_tool_name:
            return ''
        
        # 根据实际网站的图片路径规律构造URL
        # 图片路径不包含语言前缀，直接使用基础域名
        # 格式: https://www.streetfighter.com/6/buckler/assets/images/material/character/character_{tool}_l.png (P1)
        # 格式: https://www.streetfighter.com/6/buckler/assets/images/material/character/character_{tool}_r.png (P2)
        side_suffix = 'l' if player_side == 1 else 'r'
        # 移除 base_url 中的语言路径，使用基础域名
        base_domain = 'https://www.streetfighter.com/6/buckler'
        image_url = f'{base_domain}/assets/images/material/character/character_{character_tool_name}_{side_suffix}.png'
        
        return image_url
    
    def parse_battles_from_json(self, json_data):
        page = parse_battle_page(json_data, self.parse_battle_from_json)
        self._last_record_failures = page.failed_records
        return page.records, page.identity

    def parse_all_battles(self, json_data):
        records, info = self.parse_battles_from_json(json_data)
        if info.get('user_id') and self.user_id and info['user_id'] != str(self.user_id):
            raise BattlePageError('返回的玩家信息与查询目标不符')
        if info.get('player_name'):
            self.player_name = info['player_name']
        if info.get('sid'):
            self.player_sid = info['sid']
        return records
    
    def transform_to_dataframe(self, all_battles):
        """
        将对战记录转换为DataFrame
        :param all_battles: 对战记录列表
        :return: DataFrame对象
        """
        logger.debug(f'[transform] 开始转换DataFrame, 共{len(all_battles)}条记录')
        start_time = time.time()
        rows = []
        for battle in all_battles:
            # 判断目标玩家是 p1 还是 p2：优先用 short_id 与当前查询ID匹配（更可靠），
            # 名字匹配作为兜底（player_name 未设置或同名玩家时避免己方/对方错位）
            target_sid = str(self.user_id) if self.user_id else ''
            p1_sid = str(battle['player1'].get('short_id') or '')
            p2_sid = str(battle['player2'].get('short_id') or '')
            if target_sid and p1_sid == target_sid:
                me = battle['player1']
                opponent = battle['player2']
                my_side = 1
            elif target_sid and p2_sid == target_sid:
                me = battle['player2']
                opponent = battle['player1']
                my_side = 2
            elif self.player_name and battle['player1']['name'] == self.player_name:
                me = battle['player1']
                opponent = battle['player2']
                my_side = 1
            else:
                me = battle['player2']
                opponent = battle['player1']
                my_side = 2
            
            rows.append({
                'date': battle.get('uploaded_at', ''),  # 使用时间戳
                'replay_id': battle.get('replay_id', ''),  # 录像ID
                'player_name': self.player_name,
                'player_sid': self.player_sid,
                'my_side': my_side,  # 1P 还是 2P
                'my_result': me['result'],
                'my_character': me['character'],
                'my_character_id': me.get('character_id', 0),
                'my_character_image': me.get('character_image', ''),  # 角色头像URL
                'my_lp': me.get('lp', 0),
                'my_master_rating': me.get('master_rating', 0),  # Master段位分
                'my_league_rank': me.get('league_rank_display', '-'),  # 使用格式化后的段位显示
                'my_platform': me['platform'],
                'my_short_id': me.get('short_id', 0),
                'my_user_id': str(me.get('short_id') or ''),  # 用于查询的用户ID（short_id）；None 时置空避免前端显示/查询 "None"
                'my_input_type': me.get('input_type', ''),  # 已经是翻译后的中文
                'my_round_results': self._format_round_results(me.get('round_results', [])),  # 格式化回合结果
                'my_round_results_raw': me.get('round_results', []),  # 原始回合结果数组（0=负，1-8=不同胜法，对应官方icon_result{n}图标）
                'opponent_name': opponent['name'],
                'opponent_short_id': opponent.get('short_id', 0),
                'opponent_user_id': str(opponent.get('short_id') or ''),  # 对手用于查询的用户ID（short_id）
                'opponent_platform': opponent['platform'],
                'opponent_character': opponent['character'],
                'opponent_character_id': opponent.get('character_id', 0),
                'opponent_character_image': opponent.get('character_image', ''),  # 对手角色头像URL
                'opponent_lp': opponent.get('lp', 0),
                'opponent_master_rating': opponent.get('master_rating', 0),  # 对手Master段位分
                'opponent_league_rank': opponent.get('league_rank_display', '-'),  # 使用格式化后的段位显示
                'opponent_input_type': opponent.get('input_type', ''),  # 已经是翻译后的中文
                'opponent_round_results': self._format_round_results(opponent.get('round_results', [])),  # 格式化回合结果
                'opponent_round_results_raw': opponent.get('round_results', []),  # 原始回合结果数组
                'battle_type': battle.get('battle_type', ''),
                'views': battle.get('views', 0),
            })
        
        df = pd.DataFrame(rows)
        # 将时间戳转换为日期时间（UTC时间戳转为中国时区 UTC+8）
        if 'date' in df.columns and df['date'].dtype != 'datetime64[ns]':
            df['date'] = pd.to_datetime(df['date'], unit='s', errors='coerce', utc=True).dt.tz_convert('Asia/Shanghai').dt.tz_localize(None)
        
        # 按时间倒序排序（最新的在前面）
        if 'date' in df.columns:
            df = df.sort_values(by='date', ascending=False).reset_index(drop=True)
        
        elapsed = time.time() - start_time
        logger.debug(f'[transform] DataFrame转换完成, 共{len(df)}行, 耗时:{elapsed:.3f}s')
        return df
    
    def _fetch_profile_with_retry(self):
        """
        获取个人资料JSON数据并解析（带真正重试）
        :return: (json_data, user_info) 元组
        """
        logger.debug('[fetch_profile_retry] 开始获取玩家资料(带重试)')
        for attempt in range(2):
            try:
                json_data = self.fetch_profile_page()
                user_info = player_identity(json_data)
                if user_info.get('user_id') and user_info['user_id'] != str(self.user_id):
                    raise BattlePageError('个人资料与查询目标不符')
                play = page_props(json_data).get('play')
                if not isinstance(play, dict) or not all(isinstance(play.get(key), dict) for key in ('battle_stats', 'base_info')):
                    raise BattlePageError('个人资料不完整')
                logger.debug(f'[fetch_profile_retry] 成功获取玩家资料, 尝试次数:{attempt+1}')
                return (json_data, user_info)
            except Exception as e:
                logger.debug(f'[fetch_profile_retry] 第{attempt+1}次尝试失败: {e}')
                if not self._retryable(e):
                    break
                if attempt < 1:
                    time.sleep(0.3)
        logger.debug('[fetch_profile_retry] 获取玩家资料失败')
        return (None, {})
    
    def fetch_page_with_info(self, page, battle_type='all'):
        """
        获取页面JSON数据（用于并行爬取）
        :param page: 页码
        :param battle_type: 对战类型
        :return: (page, json_data, error) 元组
        """
        try:
            logger.debug(f'[fetch_page_info] 开始获取第{page}页')
            json_data = self.fetch_page(page, battle_type)
            logger.debug(f'[fetch_page_info] 第{page}页获取成功')
            return (page, json_data, None)
        except Exception as e:
            logger.debug(f'[fetch_page_info] 第{page}页获取失败: {e}')
            return (page, None, e)
    
    

    def set_user_id(self, user_id):
        """
        设置用户ID
        :param user_id: 用户ID
        """
        self.user_id = str(user_id)

    @staticmethod
    def _retryable(error):
        if isinstance(error, BattleAuthenticationError):
            return False
        # urllib3 has already spent its retry budget for these requests.
        if isinstance(error, requests.exceptions.RetryError) or (
                isinstance(error, requests.exceptions.ConnectionError)
                and any(isinstance(reason, MaxRetryError) for reason in error.args)):
            return False
        status = getattr(getattr(error, 'response', None), 'status_code', None)
        return status not in (400, 401, 403, 404, 405, 422, 429, 500, 502, 503)

    def _collect(self, pages, max_workers, battle_type, fetch_profile):
        if not 1 <= pages <= 50 or not 1 <= max_workers <= 10:
            raise ValueError('采集页数需为 1–50，并发数需为 1–10')
        start = time.monotonic()
        page_records, failures, record_failures, parse_failures = {}, set(), {}, set()
        profile_complete = not fetch_profile
        attempted, empty_pages, errors = set(), set(), {}
        retried_pages = []
        last_nonempty_page = 0
        first_result_ms = None
        progress_callback = getattr(self, 'progress_callback', None)
        cancel_event = getattr(self, 'cancel_event', None)

        def check_cancelled():
            if cancel_event is not None and cancel_event.is_set():
                raise RuntimeError('查询已取消')

        def emit_progress():
            nonlocal first_result_ms
            if not callable(progress_callback):
                return
            # Publish only a contiguous prefix: a fast page 5 must not appear as
            # the latest battle while pages 1–4 are still pending.
            prefix, page = [], 1
            while page in page_records:
                prefix.extend(page_records[page])
                page += 1
            prefix = list({record['replay_id']: record for record in prefix}.values())
            rows = []
            if page > 1:
                rows = self.transform_to_dataframe(prefix).to_dict('records')
                for row in rows:
                    if 'date' in row:
                        row['date'] = str(row['date'])
                if first_result_ms is None:
                    first_result_ms = round((time.monotonic() - start) * 1000)
            progress_callback({'type': 'progress', 'data': rows, 'has_records_page': page > 1,
                'user_info': {'user_id': str(self.user_id), 'player_name': self.player_name},
                'player_profile': self.player_profile if profile_complete else None,
                'collection': {'requested_pages': pages, 'fetched_pages': len(page_records),
                    'profile_complete': profile_complete, 'complete': False,
                    'first_result_ms': first_result_ms}})

        def consume(page, data):
            nonlocal last_nonempty_page
            self._last_record_failures = 0
            page_records[page] = self.parse_all_battles(data)
            record_failures[page] = self._last_record_failures
            failures.discard(page)
            parse_failures.discard(page)
            errors.pop(page, None)
            # Only a validated, genuinely empty upstream list marks the end.
            # A page where every record failed parsing must not truncate history.
            replay_list = data.get('pageProps', {}).get('replay_list') if isinstance(data, dict) else None
            if replay_list == [] and page > last_nonempty_page:
                empty_pages.add(page)
            elif replay_list:
                last_nonempty_page = max(last_nonempty_page, page)
                # Cope with pages changing while a collection is in progress.
                empty_pages.difference_update(p for p in tuple(empty_pages) if p < page)
            emit_progress()

        with ThreadPoolExecutor(max_workers=max_workers + int(fetch_profile)) as executor:
            profile_future = executor.submit(self._fetch_profile_with_retry) if fetch_profile else None
            pending = {}
            if profile_future:
                pending[profile_future] = None
            next_page = 1
            while True:
                check_cancelled()
                stop_page = min(empty_pages, default=pages)
                active_pages = sum(page is not None for page in pending.values())
                while next_page <= stop_page and active_pages < max_workers:
                    pending[executor.submit(self.fetch_page_with_info, next_page, battle_type)] = next_page
                    attempted.add(next_page)
                    next_page += 1
                    active_pages += 1
                if not pending:
                    break
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                for future in done:
                    page = pending.pop(future)
                    if future is profile_future:
                        try:
                            data, info = future.result()
                            if data:
                                self.extract_player_profile(data)
                                if info.get('player_name'):
                                    self.player_name = info['player_name']
                                profile_complete = bool(self.player_profile)
                                emit_progress()
                        except Exception:
                            logger.warning('个人资料未能完整读取')
                        continue
                    try:
                        _, data, error = future.result()
                        if error:
                            failures.add(page)
                            errors[page] = error
                        else:
                            consume(page, data)
                    except Exception as error:
                        failures.add(page)
                        errors[page] = error
                        parse_failures.add(page)

            # The transport already applies backoff. Retry failed pages together
            # instead of adding a fixed pause and waiting for each page in series.
            retried_pages = [page for page in sorted(failures) if self._retryable(errors.get(page))]
            check_cancelled()
            if retried_pages:
                with ThreadPoolExecutor(max_workers=min(max_workers, len(retried_pages))) as retry_pool:
                    retries = {retry_pool.submit(self.fetch_page, page, battle_type): page for page in retried_pages}
                    for future in as_completed(retries):
                        page = retries[future]
                        try:
                            consume(page, future.result())
                        except BattlePageError:
                            parse_failures.add(page)
                        except Exception:
                            pass

        failed = sorted(failures)
        check_cancelled()
        self.collection_status = {
            'requested_pages': pages, 'fetched_pages': len(page_records),
            'skipped_pages': [page for page in range(1, pages + 1) if page not in attempted],
            'retried_pages': retried_pages,
            'failed_pages': failed, 'parse_failed_pages': sorted(parse_failures),
            'failed_records': sum(record_failures.values()),
            'record_error_pages': [page for page, count in sorted(record_failures.items()) if count],
            'profile_complete': profile_complete,
            'first_result_ms': first_result_ms,
            'complete': not failed and not any(record_failures.values()) and profile_complete,
        }
        if not page_records:
            raise RuntimeError('所有战绩页均获取或解析失败，请检查登录状态或稍后重试')
        # Retries replace a page, rather than appending duplicates.
        records, seen = [], set()
        for page in sorted(page_records):
            for record in page_records[page]:
                replay_id = record.get('replay_id')
                if replay_id and replay_id in seen:
                    continue
                if replay_id:
                    seen.add(replay_id)
                records.append(record)
        frame = self.transform_to_dataframe(records)
        self.collection_status['elapsed_ms'] = round((time.monotonic() - start) * 1000)
        logger.info('采集完成：%s 条记录，耗时 %.2f 秒', len(records), time.monotonic() - start)
        return frame

    def query_player(self, user_id, pages=10, max_workers=5, battle_type='all', fetch_profile=True):
        self.set_user_id(user_id)
        self.player_name = None
        self.player_sid = None
        self.player_profile = {}
        return self._collect(pages, max_workers, battle_type, fetch_profile)

    def crawl(self, pages=1, max_workers=5, battle_type='all', fetch_profile=False):
        return self._collect(pages, max_workers, battle_type, fetch_profile)



