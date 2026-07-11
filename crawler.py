import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import json
import logging
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 配置日志（关闭DEBUG）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


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
        self.build_id = self.fetch_build_id()
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
        response = self.session.get(url, timeout=3)
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
        response = self.session.get(url, timeout=3)
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
            return profile_data
    
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
        
        # 基本信息
        battle['replay_id'] = replay_data.get('replay_id', '')
        battle['uploaded_at'] = replay_data.get('uploaded_at', 0)
        battle['views'] = replay_data.get('views', 0)
        battle['battle_type'] = replay_data.get('replay_battle_type_name', '')
        battle['battle_sub_type'] = replay_data.get('replay_battle_sub_type_name', '')
        
        # 玩家1信息
        p1_info = replay_data.get('player1_info', {})
        p1_player = p1_info.get('player', {})
        p1_character_id = p1_info.get('playing_character_id', 0)
        p1_character_tool = p1_info.get('playing_character_tool_name', '')
        p1_lp = p1_info.get('league_point', 0)
        p1_master_rating = p1_info.get('master_rating', 0)  # Master段位分
        p1_league_rank = p1_info.get('league_rank', 0)
        p1_input_type = p1_info.get('battle_input_type_name', '')
        
        battle['player1'] = {
            'name': p1_player.get('fighter_id', ''),
            'short_id': p1_player.get('short_id', 0),
            'platform': p1_player.get('platform_name', ''),
            'platform_id': p1_player.get('platform_id', 0),
            'character': p1_info.get('playing_character_name', ''),
            'character_tool_name': p1_character_tool,
            'character_id': p1_character_id,
            'character_image': self._get_character_image_url(p1_character_id, p1_character_tool, 1),
            'lp': p1_lp,
            'master_rating': p1_master_rating,  # Master段位分
            'league_rank': p1_league_rank,
            'league_rank_display': self._format_league_rank(p1_league_rank, p1_master_rating if p1_master_rating else p1_lp),
            'input_type': self._get_input_type_name(p1_input_type),
            'round_results': p1_info.get('round_results', []),
        }
        
        # 玩家2信息
        p2_info = replay_data.get('player2_info', {})
        p2_player = p2_info.get('player', {})
        p2_character_id = p2_info.get('playing_character_id', 0)
        p2_character_tool = p2_info.get('playing_character_tool_name', '')
        p2_lp = p2_info.get('league_point', 0)
        p2_master_rating = p2_info.get('master_rating', 0)  # Master段位分
        p2_league_rank = p2_info.get('league_rank', 0)
        p2_input_type = p2_info.get('battle_input_type_name', '')
        
        battle['player2'] = {
            'name': p2_player.get('fighter_id', ''),
            'short_id': p2_player.get('short_id', 0),
            'platform': p2_player.get('platform_name', ''),
            'platform_id': p2_player.get('platform_id', 0),
            'character': p2_info.get('playing_character_name', ''),
            'character_tool_name': p2_character_tool,
            'character_id': p2_character_id,
            'character_image': self._get_character_image_url(p2_character_id, p2_character_tool, 2),
            'lp': p2_lp,
            'master_rating': p2_master_rating,  # Master段位分
            'league_rank': p2_league_rank,
            'league_rank_display': self._format_league_rank(p2_league_rank, p2_master_rating if p2_master_rating else p2_lp),
            'input_type': self._get_input_type_name(p2_input_type),
            'round_results': p2_info.get('round_results', []),
        }
        
        # 判断胜负（根据round_results中非0值的个数）
        # round_results中非0表示该局获胜，统计获胜局数
        p1_wins = sum(1 for r in p1_info.get('round_results', []) if r != 0)
        p2_wins = sum(1 for r in p2_info.get('round_results', []) if r != 0)
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
        """
        从JSON数据中解析所有对战记录
        :param json_data: JSON字典（Next.js API响应）
        :return: (对战记录列表, 用户信息字典)
        """
        if not json_data:
            return [], {}
        
        logger.debug('[parse_battles] 开始解析对战记录')
        start_time = time.time()
        try:
            page_props = json_data.get('pageProps', {})
            
            # 提取用户信息
            fighter_info = page_props.get('fighter_banner_info', {})
            personal_info = fighter_info.get('personal_info', {})
            user_info = {
                'player_name': personal_info.get('fighter_id', ''),
                'user_id': str(personal_info.get('short_id', '')),
                'platform': personal_info.get('platform_name', ''),
                'favorite_character': fighter_info.get('favorite_character_name', ''),
                'home_name': fighter_info.get('home_name', ''),
            }
            
            # 提取玩家SID（用户码）
            if not self.player_sid:
                sid = (fighter_info.get('sid') or personal_info.get('sid') or
                       fighter_info.get('user_sid') or personal_info.get('user_sid') or '')
                if sid:
                    self.player_sid = str(sid)
            
            # 提取对战列表
            replay_list = page_props.get('replay_list', [])
            
            # 解析每条对战
            all_battles = []
            for replay_data in replay_list:
                battle = self.parse_battle_from_json(replay_data)
                all_battles.append(battle)
            
            elapsed = time.time() - start_time
            logger.debug(f'[parse_battles] 解析完成, 共{len(all_battles)}条记录, 耗时:{elapsed:.3f}s')
            return all_battles, user_info
            
        except Exception as e:
            elapsed = time.time() - start_time
            logger.debug(f'[parse_battles] 解析失败, 耗时:{elapsed:.3f}s, 错误:{e}')
            return [], {}
    

    
    def parse_all_battles(self, json_data):
        """
        从JSON数据中解析所有对战记录
        :param json_data: JSON字典（Next.js API响应）
        :return: 对战记录列表
        """
        battles_from_json, user_info = self.parse_battles_from_json(json_data)
        
        if battles_from_json:
            # 更新用户信息
            if user_info.get('player_name'):
                self.player_name = user_info['player_name']
            if user_info.get('user_id'):
                self.user_id = user_info['user_id']
            return battles_from_json
        
        # 如果没有找到对战记录，返回空列表而不是抛出异常
        # 这可能是因为该页没有数据或者玩家记录不足
        return []
    
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
            # 判断目标玩家是 p1 还是 p2
            if battle['player1']['name'] == self.player_name:
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
                'my_user_id': str(me.get('short_id', '')),  # 用于查询的用户ID（short_id）
                'my_input_type': me.get('input_type', ''),  # 已经是翻译后的中文
                'my_round_results': self._format_round_results(me.get('round_results', [])),  # 格式化回合结果
                'opponent_name': opponent['name'],
                'opponent_short_id': opponent.get('short_id', 0),
                'opponent_user_id': str(opponent.get('short_id', '')),  # 对手用于查询的用户ID（short_id）
                'opponent_platform': opponent['platform'],
                'opponent_character': opponent['character'],
                'opponent_character_id': opponent.get('character_id', 0),
                'opponent_character_image': opponent.get('character_image', ''),  # 对手角色头像URL
                'opponent_lp': opponent.get('lp', 0),
                'opponent_master_rating': opponent.get('master_rating', 0),  # 对手Master段位分
                'opponent_league_rank': opponent.get('league_rank_display', '-'),  # 使用格式化后的段位显示
                'opponent_input_type': opponent.get('input_type', ''),  # 已经是翻译后的中文
                'opponent_round_results': self._format_round_results(opponent.get('round_results', [])),  # 格式化回合结果
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
                _, user_info = self.parse_battles_from_json(json_data)
                logger.debug(f'[fetch_profile_retry] 成功获取玩家资料, 尝试次数:{attempt+1}')
                return (json_data, user_info)
            except Exception as e:
                logger.debug(f'[fetch_profile_retry] 第{attempt+1}次尝试失败: {e}')
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
            return (page, None, str(e))
    
    

    def set_user_id(self, user_id):
        """
        设置用户ID
        :param user_id: 用户ID
        """
        self.user_id = str(user_id)
    
    def query_player(self, user_id, pages=10, max_workers=10, battle_type='all', fetch_profile=True):
        """
        查询指定玩家的对战记录
        :param user_id: 玩家ID
        :param pages: 爬取页数
        :param max_workers: 最大并发线程数（默认10以提升速度）
        :param battle_type: 对战类型 (all/rank/casual/custom/hub)
        :param fetch_profile: 是否获取个人资料（False可提升速度）
        :return: DataFrame对象
        """
        logger.debug(f'[query_player] 开始查询玩家: {user_id}, 页数:{pages}, 并发:{max_workers}, 类型:{battle_type}')
        # 设置用户ID
        self.set_user_id(user_id)
        
        # 使用异步方式同时获取玩家资料和所有格斗记录页
        all_battles = []
        start_time = time.time()
        
        # 准备所有任务：可选的个人资料页 + 10页格斗记录
        logger.debug(f'[query_player] 创建线程池, max_workers={max_workers + (1 if fetch_profile else 0)}')
        with ThreadPoolExecutor(max_workers=max_workers + (1 if fetch_profile else 0)) as executor:
            # 可选：提交个人资料页任务
            profile_future = None
            if fetch_profile:
                logger.debug('[query_player] 提交玩家资料获取任务')
                profile_future = executor.submit(self._fetch_profile_with_retry)
            
            # 提交所有格斗记录页任务
            logger.debug(f'[query_player] 提交{pages}页战绩获取任务')
            page_futures = {
                executor.submit(self.fetch_page_with_info, page, battle_type): page 
                for page in range(1, pages + 1)
            }
            
            # 统一处理所有future（资料页+战绩页），谁先完成先处理谁
            all_futures = list(page_futures.keys())
            if profile_future:
                all_futures.append(profile_future)
            
            logger.debug(f'[query_player] 开始处理{len(all_futures)}个任务结果')
            completed_count = 0
            failed_pages = []
            for future in as_completed(all_futures):
                completed_count += 1
                if future is profile_future:
                    try:
                        logger.debug('[query_player] 处理玩家资料结果')
                        profile_json_data, user_info = future.result()
                        if profile_json_data:
                            if user_info.get('player_name'):
                                self.player_name = user_info['player_name']
                            self.extract_player_profile(profile_json_data)
                            logger.debug(f'[query_player] 玩家资料处理完成, player_name:{self.player_name}')
                    except Exception as e:
                        logger.debug(f'[query_player] 玩家资料处理失败: {e}')
                        if not self.player_name:
                            self.player_name = f'玩家{user_id}'
                else:
                    page, json_data, error = future.result()
                    if error:
                        logger.debug(f'[query_player] 第{page}页获取失败: {error}')
                        failed_pages.append((page, battle_type))
                        continue
                    if json_data:
                        logger.debug(f'[query_player] 开始解析第{page}页数据')
                        battles = self.parse_all_battles(json_data)
                        all_battles.extend(battles)
                        logger.debug(f'[query_player] 第{page}页解析完成, 获得{len(battles)}条记录, 当前总计:{len(all_battles)}条')
        
        # 延迟重爬失败的页面
        if failed_pages:
            logger.debug(f'[query_player] 有{len(failed_pages)}页失败, 等待1秒后重爬: {[p[0] for p in failed_pages]}')
            time.sleep(1)
            for page, bt in failed_pages:
                try:
                    logger.debug(f'[query_player] 重爬第{page}页')
                    data = self.fetch_page(page, bt)
                    battles = self.parse_all_battles(data)
                    all_battles.extend(battles)
                    logger.debug(f'[query_player] 重爬第{page}页成功, 获得{len(battles)}条记录')
                except Exception as e:
                    logger.debug(f'[query_player] 重爬第{page}页仍失败: {e}')
        
        # 转换为DataFrame
        logger.debug(f'[query_player] 所有任务完成, 开始转换DataFrame, 共{len(all_battles)}条记录')
        df = self.transform_to_dataframe(all_battles)
        
        elapsed_time = time.time() - start_time
        logger.debug(f'[query_player] 查询完成! 共{len(all_battles)}条对战记录, 总耗时:{elapsed_time:.2f}秒')
        print(f'✓ 爬取完成！共 {len(all_battles)} 条对战记录，耗时: {elapsed_time:.2f}秒')
        
        return df
    
    def crawl(self, pages=1, max_workers=10, battle_type='all', fetch_profile=False):
        """
        并行执行爬取任务（使用线程池）
        :param pages: 要爬取的页数
        :param max_workers: 最大并发线程数，默认10
        :param battle_type: 对战类型 (all/rank/casual/custom/hub)
        :param fetch_profile: 是否并行获取个人资料
        :return: DataFrame对象
        """
        logger.debug(f'[crawl] 开始爬取, 页数:{pages}, 并发:{max_workers}, 类型:{battle_type}, 获取资料:{fetch_profile}')
        start_time = time.time()
        
        all_battles = []
        
        # 使用线程池并行爬取
        logger.debug(f'[crawl] 创建线程池, max_workers={max_workers + (1 if fetch_profile else 0)}')
        with ThreadPoolExecutor(max_workers=max_workers + (1 if fetch_profile else 0)) as executor:
            # 可选：提交个人资料页任务
            profile_future = None
            if fetch_profile:
                logger.debug('[crawl] 提交玩家资料获取任务')
                profile_future = executor.submit(self._fetch_profile_with_retry)
            
            # 提交所有格斗记录页任务
            logger.debug(f'[crawl] 提交{pages}页战绩获取任务')
            future_to_page = {
                executor.submit(self.fetch_page_with_info, page, battle_type): page 
                for page in range(1, pages + 1)
            }
            
            # 统一处理所有future（资料页+战绩页），谁先完成先处理谁
            all_futures = list(future_to_page.keys())
            if profile_future:
                all_futures.append(profile_future)
            
            logger.debug(f'[crawl] 开始处理{len(all_futures)}个任务结果')
            completed_count = 0
            failed_pages = []
            for future in as_completed(all_futures):
                completed_count += 1
                if future is profile_future:
                    try:
                        logger.debug('[crawl] 处理玩家资料结果')
                        profile_json_data, user_info = future.result()
                        if profile_json_data:
                            if user_info.get('player_name'):
                                self.player_name = user_info['player_name']
                            self.extract_player_profile(profile_json_data)
                            logger.debug(f'[crawl] 玩家资料处理完成')
                    except Exception as e:
                        logger.debug(f'[crawl] 玩家资料处理失败: {e}')
                        pass
                else:
                    page, json_data, error = future.result()
                    if error:
                        logger.debug(f'[crawl] 第{page}页获取失败: {error}')
                        failed_pages.append((page, battle_type))
                        continue
                    if json_data:
                        logger.debug(f'[crawl] 开始解析第{page}页数据')
                        battles = self.parse_all_battles(json_data)
                        all_battles.extend(battles)
                        logger.debug(f'[crawl] 第{page}页解析完成, 获得{len(battles)}条记录, 当前总计:{len(all_battles)}条')
        
        # 延迟重爬失败的页面
        if failed_pages:
            logger.debug(f'[crawl] 有{len(failed_pages)}页失败, 等待1秒后重爬: {[p[0] for p in failed_pages]}')
            time.sleep(1)
            for page, bt in failed_pages:
                try:
                    logger.debug(f'[crawl] 重爬第{page}页')
                    data = self.fetch_page(page, bt)
                    battles = self.parse_all_battles(data)
                    all_battles.extend(battles)
                    logger.debug(f'[crawl] 重爬第{page}页成功, 获得{len(battles)}条记录')
                except Exception as e:
                    logger.debug(f'[crawl] 重爬第{page}页仍失败: {e}')
        
        # 转换为DataFrame
        logger.debug(f'[crawl] 所有任务完成, 开始转换DataFrame, 共{len(all_battles)}条记录')
        df = self.transform_to_dataframe(all_battles)
        
        elapsed_time = time.time() - start_time
        logger.debug(f'[crawl] 爬取完成! 共{len(all_battles)}条对战记录, 总耗时:{elapsed_time:.2f}秒')
        print(f'✓ 爬取完成！共 {len(all_battles)} 条对战记录，耗时: {elapsed_time:.2f}秒')
        
        return df



if __name__ == '__main__':
    # 使用示例1：设置user_id后爬取
    crawler = SF6BattleLogCrawler()
    crawler.user_id = '4123104110'  # 请替换为你的实际用户ID
    crawler.player_name = 'menmen'   # 请替换为你的实际用户名
    
    df = crawler.crawl(pages=10)
    
    if len(df) > 0:
        # 设置全局显示选项
        pd.set_option('display.max_rows', None)
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', None)
        pd.set_option('display.max_colwidth', 50)
        
        schema = ['date', 'replay_id', 'player_name', 'my_side', 'my_result', 
                  'my_character', 'my_lp', 'opponent_name', 'opponent_character', 'opponent_lp']
        print(df[schema])
        
        # 保存到CSV
        # df.to_csv('battles.csv', index=False, encoding='utf-8-sig')
        # print('\n✓ 数据已保存到 battles.csv')
    else:
        print('\n⚠ 未获取到任何数据，请检查user_id和cookie是否正确')



