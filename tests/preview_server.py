"""UI fixture server: temporary archive, synthetic data, no official API calls."""
from datetime import datetime, timedelta
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pandas as pd

from fastapi.responses import HTMLResponse, FileResponse
import uvicorn
import main
import history_api
from history_store import HistoryStore
from crawler import SF6BattleLogCrawler


class PreviewCrawler(SF6BattleLogCrawler):
    """Exercise the real scheduler/stream with deterministic local responses."""
    def __init__(self, cookie=None):
        self.user_id = self.player_name = self.player_sid = None
        self.player_profile, self.collection_status = {}, {}
        self.api_base_url, self.lang, self.build_id = 'https://preview.invalid', 'zh-hans', 'fixture'
        self.session = SimpleNamespace(close=lambda: None, get=self._fixture_response)

    def fetch_build_id(self):
        return 'fixture'

    def _fixture_response(self, url, **kwargs):
        parsed = urlsplit(url)
        params = parse_qs(parsed.query)
        page = int(params.get('page', ['1'])[0])
        time.sleep(.9 if 'character_id' not in params and '/ranking/' in parsed.path else 2)
        players = []
        for rank in range((page - 1) * 20 + 1, page * 20 + 1):
            tools = [('chunli',4,'春丽'),('chunli',4,'春丽'),('ken',10,'肯'),('ryu',1,'隆'),('cammy',9,'嘉米'),('juri',16,'韩蛛俐')]
            tool, char_id, char_name = next((c for c in tools if c[0] == params.get('character_id',[''])[0]), tools[rank % len(tools)])
            banner = {'personal_info': {'fighter_id': f'演示玩家 {rank}（测试数据）',
                        'short_id': 1000000000 + rank, 'platform_name': 'Steam'},
                      'favorite_character_name': char_name, 'favorite_character_tool_name': tool,
                      'favorite_character_league_info': {'master_rating': 1800, 'league_rank': 39}}
            players.append({'master_rating_ranking': rank, 'rating': 2000 - rank,
                'character_name': char_name, 'character_id': char_id, 'character_tool_name': tool, 'fighter_banner_info': banner})
        if '/ranking/' in parsed.path:
            props = {'master_rating_ranking': {'ranking_fighter_list': players,
                'current_page': page, 'total_page': 25, 'total_count': 500}}
        elif '/fighterslist/' in parsed.path:
            props = {'fighter_list': players, 'page': page}
        else:
            raise RuntimeError('预览未提供该接口的模拟响应')
        return SimpleNamespace(status_code=200, json=lambda: {'pageProps': props}, raise_for_status=lambda: None)

    def _prepare(self, player_id):
        archived = history_api._store.records(player_id)
        self._rows = archived['data']
        self._profile = archived['player_profile'] or {}
        self._info = archived['user_info']
        if self._rows and not any(row['replay_id'] == 'DEMO_UPDATED' for row in self._rows):
            self._rows = [{**self._rows[0], 'replay_id': 'DEMO_UPDATED', 'date': '2026-10-15 18:00:00'}, *self._rows]
        self._profile = {**self._profile, 'rank_matches': len(self._rows)}

    def query_player(self, user_id, **kwargs):
        self._prepare(user_id)
        return super().query_player(user_id, **kwargs)

    def crawl(self, **kwargs):
        self._prepare(self.user_id)
        return super().crawl(**kwargs)

    def fetch_page(self, page, battle_type='all'):
        time.sleep(.2 if page <= 5 else .6)
        return {'pageProps': {'replay_list': self._rows[(page - 1) * 20:page * 20]}}

    def parse_all_battles(self, data):
        self.player_name = self._info['player_name']
        return data['pageProps']['replay_list']

    def transform_to_dataframe(self, rows):
        return pd.DataFrame(rows)

    def _fetch_profile_with_retry(self):
        if not hasattr(self, '_profile'):
            time.sleep(.3)
            detail = {'drive_parry':1.5, 'drive_impact':.3, 'received_drive_impact':.2,
                'received_throw_count':1.8, 'received_throw_drive_parry':.1, 'received_punish_counter':.1,
                'received_stun':0, 'just_parry':.6, 'throw_count':2.5, 'throw_tech':.4, 'drive_reversal':.2,
                'gauge_rate_drive_rush_from_cancel':.45, 'gauge_rate_drive_rush_from_parry':.07,
                'gauge_rate_drive_arts':.18, 'gauge_rate_drive_impact':.02,
                'gauge_rate_sa_lv1':.3,'gauge_rate_sa_lv2':.2,'gauge_rate_sa_lv3':.4,'gauge_rate_ca':.1}
            return {'battle_stats_detail':detail,'battle_stats_available_fields':list(detail)}, {'player_name':f'高手演示样本 {self.user_id}'}
        time.sleep(4)  # Make the earlier first-screen render observable.
        return self._profile, self._info

    def extract_player_profile(self, data):
        self.player_profile = data


def seed(store):
    owner = {'user_id': '1000000000', 'player_name': '演示玩家（测试数据）'}
    rows = []
    for index in range(130):
        rows.append({'replay_id': f'DEMO{index:06}', 'date': str(datetime(2026, 10, 14, 20) - timedelta(hours=index * 6)),
            'player_name': owner['player_name'], 'my_user_id': owner['user_id'], 'my_short_id': owner['user_id'],
            'my_character': '春丽' if index % 5 else '嘉米', 'my_character_id': 4 if index % 5 else 9,
            'opponent_name': '训练对手（测试数据）', 'opponent_character': '隆' if index % 2 else '肯',
            'my_result': 'WIN' if index % 2 else 'LOSE', 'my_lp': 25000, 'my_master_rating': 1500 + index,
            'opponent_lp': 25000, 'opponent_master_rating': 1600, 'battle_type': '排位赛',
            'my_round_results_raw': [1, 1] if index % 2 else [0, 0],
            'opponent_round_results_raw': [0, 0] if index % 2 else [1, 1], 'my_side': 1,
            'my_input_type': '经典', 'opponent_input_type': '现代'})
    detail = {'drive_parry':3.5, 'drive_impact':2.1, 'received_drive_impact':.8,
        'received_throw_count':3.2, 'received_throw_drive_parry':.6, 'received_punish_counter':.3,
        'received_stun':.1, 'just_parry':.3, 'throw_count':2, 'throw_tech':.2, 'drive_reversal':.1,
        'gauge_rate_drive_rush_from_cancel':.35, 'gauge_rate_drive_rush_from_parry':.08,
        'gauge_rate_drive_arts':.2, 'gauge_rate_drive_impact':.09,
        'gauge_rate_sa_lv1':.4,'gauge_rate_sa_lv2':.1,'gauge_rate_sa_lv3':.4,'gauge_rate_ca':.1}
    store.save(owner, rows, {'player_name': owner['player_name'], 'rank_matches': 130,
        'casual_matches': 24, 'custom_matches': 12, 'hub_matches': 8,
        'practice_time': '10小时', 'rank_time': '12小时', 'my_custom_time': '3小时',
        'challenges_completed': 20, 'battle_stats_detail': detail, 'battle_stats_available_fields': list(detail),
        'character_win_rates_by_rival': [{'character_id': 4, 'rival_character_win_rates': [
            {'rival_character_id': 1, 'rival_character_name': '隆', 'battle_count': 20, 'win_count': 12},
            {'rival_character_id': 2, 'rival_character_name': '肯', 'battle_count': 30, 'win_count': 15}]}]})
    store.save({'user_id': '3000000000', 'player_name': '另一个演示玩家'}, [])


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='sf6-ui-preview-') as directory:
        history_api._store = HistoryStore(Path(directory) / 'history.sqlite3')
        seed(history_api._store)
        main.SF6BattleLogCrawler = PreviewCrawler
        main.user_info = {'user_id': '1000000000', 'player_name': '演示玩家（测试数据）'}
        main._version_cache.update(checked_at=time.time(), latest='0.7')

        @main.app.get('/preview', response_class=HTMLResponse)
        def preview():
            text = (Path(main.RESOURCE_PATH) / 'web' / 'index.html').read_text(encoding='utf-8')
            # Register before app.js so demo auth never reads or writes a saved
            # browser login, and never starts official roster requests.
            setup = '''<script>
            // Keep interactive QA notes/favorites separate from the user's real storage.
            const localStorage = {
                getItem:key=>window.sessionStorage.getItem('sf6-preview:'+key),
                setItem:(key,value)=>window.sessionStorage.setItem('sf6-preview:'+key,value),
                removeItem:key=>window.sessionStorage.removeItem('sf6-preview:'+key)
            };
            if (!localStorage.getItem('sf6_theme')) localStorage.setItem('sf6_theme','sf6');
            document.addEventListener('DOMContentLoaded', () => {
                loadLoginState=()=>false; saveLoginState=()=>{}; loadCharacterRoster=()=>{};
            });</script>'''
            css_version = (Path(main.RESOURCE_PATH) / 'desktop_styles.css').stat().st_mtime_ns
            return text.replace('</head>', f'<link rel="stylesheet" href="/preview/desktop.css?v={css_version}">' + setup + '</head>')

        @main.app.middleware('http')
        async def isolated_notebook_preview(request, call_next):
            if request.url.path in ('/notes', '/notes/'):
                return HTMLResponse(preview())
            return await call_next(request)

        @main.app.get('/preview-online', response_class=HTMLResponse)
        def preview_online():
            # Simulate the online render path without credentials or official requests.
            import json
            rows = history_api._store.records('1000000000')['data']
            script = '''<script>document.addEventListener('DOMContentLoaded', () => {
                isLoggedIn=true; cookie='preview-fixture'; isHistoryMode=false;
                currentUserInfo={user_id:'1000000000',player_name:'演示玩家（测试数据）'};
                playerProfile={player_name:currentUserInfo.player_name,rank_matches:130,
                    casual_matches:24,custom_matches:12,hub_matches:8,practice_time:'10小时',
                    rank_time:'12小时',my_custom_time:'3小时',challenges_completed:20};
                matchData=ROWS;
                homeData={matchData,userInfo:currentUserInfo,profile:playerProfile,loaded:true,
                    collection:{complete:true}};
                renderContent();
            });</script>'''.replace('ROWS', json.dumps(rows, ensure_ascii=False).replace('<', '\\u003c'))
            return preview().replace('</body>', script + '</body>')

        @main.app.get('/preview-history', response_class=HTMLResponse)
        def preview_history():
            script = '''<script>document.addEventListener('DOMContentLoaded', () => {
                isLoggedIn=true; cookie='preview-fixture';
                currentUserInfo={user_id:'1000000000',player_name:'演示玩家（测试数据）'};
                updateLoginStatus();
                window.history.replaceState({}, '', '/history');
                showHistoryPage();
            });</script>'''
            return preview().replace('</body>', script + '</body>')

        @main.app.get('/preview/desktop.css')
        def desktop_css():
            return FileResponse(Path(main.RESOURCE_PATH) / 'desktop_styles.css', headers={'Cache-Control': 'no-store'})

        uvicorn.run(main.app, host='127.0.0.1', port=7650, log_level='error')
