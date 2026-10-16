"""Public ladder summaries and explicitly requested, bounded elite samples."""
from collections import Counter, OrderedDict
from concurrent.futures import ThreadPoolExecutor
import math
from statistics import mean, median
import threading
import time
from urllib.parse import urlencode

from history_store import clean_profile


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def identity(entry):
    personal = (entry.get('fighter_banner_info') or {}).get('personal_info') or {}
    value = str(personal.get('short_id') or '')
    return value if value.isascii() and value.isdigit() else None


def unique_ranked_entries(entries):
    seen, result = set(), []
    for entry in entries:
        uid, tool = identity(entry), entry.get('character_tool_name') or entry.get('character_id')
        key = (uid, str(tool)) if uid and tool else None
        if key is not None and key in seen:
            continue
        if key is not None:
            seen.add(key)
        result.append(entry)
    return result


def percentile(values, fraction):
    if not values:
        return None
    values = sorted(values)
    index = (len(values) - 1) * fraction
    lower, upper = math.floor(index), math.ceil(index)
    return round(values[lower] + (values[upper] - values[lower]) * (index - lower), 1)


def ladder_analysis(players, requested_top_n):
    ratings = [p['rating'] for p in players if number(p.get('rating')) is not None and p['rating'] > 0]
    groups, regions = {}, Counter()
    for entry in players:
        tool = str(entry.get('character_tool_name') or entry.get('character_id') or 'unknown')
        groups.setdefault(tool, []).append(entry)
        regions[(entry.get('fighter_banner_info') or {}).get('home_name') or '地区未提供'] += 1
    count = len(players)
    head = [p for p in players if number(p.get('master_rating_ranking')) is not None
            and 0 < p['master_rating_ranking'] <= 100]
    details = []
    for tool, entries in groups.items():
        valid = [p['rating'] for p in entries if number(p.get('rating')) is not None and p['rating'] > 0]
        top100 = sum(1 for p in head if str(p.get('character_tool_name') or p.get('character_id') or 'unknown') == tool)
        reps = []
        for p in entries[:3]:
            personal = (p.get('fighter_banner_info') or {}).get('personal_info') or {}
            reps.append({'user_id': identity(p), 'player_name': personal.get('fighter_id') or '未提供名称',
                         'rating': number(p.get('rating')), 'rank': number(p.get('master_rating_ranking'))})
        share = len(entries) * 100 / count if count else 0
        details.append({'tool': tool, 'name': entries[0].get('character_name') or tool,
            'count': len(entries), 'percent': round(share, 1), 'mr_samples': len(valid),
            'median_mr': median(valid) if valid else None, 'max_mr': max(valid) if valid else None,
            'top100_count': top100, 'top100_percent': round(top100 * 100 / len(head), 1) if head else None,
            'head_share_difference': round(top100 * 100 / len(head) - share, 1) if head else None,
            'representatives': reps})
    details.sort(key=lambda row: (-row['count'], row['tool']))
    thresholds = []
    for rank in (1, 10, 50, 100, requested_top_n):
        if any(item['rank'] == rank for item in thresholds):
            continue
        entry = next((p for p in players if p.get('master_rating_ranking') == rank), None)
        if entry is not None and number(entry.get('rating')) is not None and entry['rating'] > 0:
            thresholds.append({'rank': rank, 'rating': entry['rating']})
    identities = {identity(p) for p in players if identity(p)}
    return {'summary': {'entries': count, 'requested_entries': requested_top_n,
        'unique_players': len(identities) if identities else None, 'character_count': len(groups),
        'mr_samples': len(ratings), 'median_mr': median(ratings) if ratings else None,
        'mean_mr': round(mean(ratings), 1) if ratings else None,
        'q1_mr': percentile(ratings, .25), 'q3_mr': percentile(ratings, .75),
        'min_mr': min(ratings) if ratings else None, 'max_mr': max(ratings) if ratings else None,
        'top3_character_share': round(sum(row['count'] for row in details[:3]) * 100 / count, 1) if count else 0,
        'head_entries': len(head), 'thresholds': thresholds},
        'character_details': details,
        'region_distribution': [{'name': name, 'count': size, 'percent': round(size * 100 / count, 1)}
            for name, size in regions.most_common()] if count else []}


_benchmark_cache = OrderedDict()
_benchmark_lock = threading.Lock()
BENCHMARK_TTL = 600


def elite_benchmark(character_id, character_tool, exclude_player_id, cookie, crawler_factory):
    key = (character_id, character_tool, exclude_player_id)
    with _benchmark_lock:
        cached = _benchmark_cache.get(key)
        if cached and time.monotonic() - cached[0] < BENCHMARK_TTL:
            _benchmark_cache.move_to_end(key)
            return {**cached[1], 'from_cache': True}
    crawler = crawler_factory(cookie=cookie)
    try:
        query = urlencode({'character_filter': 4, 'character_id': character_tool, 'platform': 1,
            'home_filter': 1, 'home_category_id': 0, 'home_id': 0, 'page': 1, 'season_type': 1})
        response = crawler._get_data_response(
            f'{crawler.api_base_url}/{crawler.build_id}/{crawler.lang}/ranking/master.json?{query}', timeout=10)
        response.raise_for_status()
        data = response.json().get('pageProps', {})
        if (data.get('common') or {}).get('statusCode') in (401, 403):
            raise ValueError('登录状态已失效，请重新登录')
        rows = (data.get('master_rating_ranking') or {}).get('ranking_fighter_list')
        if not isinstance(rows, list):
            raise ValueError('角色榜单暂时不可用，请稍后重试')
        candidates, seen = [], {exclude_player_id}
        for row in rows:
            uid = identity(row)
            if not uid or uid in seen:
                continue
            if row.get('character_tool_name') != character_tool and row.get('character_id') != character_id:
                continue
            if row.get('character_tool_name') and row['character_tool_name'] != character_tool:
                continue
            if row.get('character_id') is not None and row['character_id'] != character_id:
                continue
            seen.add(uid)
            candidates.append(row)
            if len(candidates) == 3:
                break
    finally:
        crawler.session.close()
    if not candidates:
        raise ValueError('该角色暂无可用的其他榜单玩家')

    def fetch_profile(row):
        client = None
        try:
            client = crawler_factory(cookie=cookie)
            client.set_user_id(identity(row))
            data, info = client._fetch_profile_with_retry()
            if not data:
                return None
            client.extract_player_profile(data)
            profile = clean_profile(client.player_profile)
            if not profile or not profile.get('battle_stats_detail'):
                return None
            return {'user_id': identity(row), 'player_name': info.get('player_name') or
                ((row.get('fighter_banner_info') or {}).get('personal_info') or {}).get('fighter_id') or '榜单玩家',
                'rating': number(row.get('rating')), 'rank': number(row.get('master_rating_ranking')),
                'profile': profile}
        except Exception:
            return None
        finally:
            if client is not None:
                client.session.close()

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(fetch_profile, candidates))
    samples = [sample for sample in results if sample]
    if not samples:
        raise ValueError('高手资料暂时不可用，请稍后重试')
    payload = {'success': True, 'character_id': character_id, 'character_tool': character_tool,
        'updated_at': int(time.time()), 'requested_samples': len(candidates), 'samples': samples,
        'leader_id': identity(candidates[0]), 'excluded_player_id': exclude_player_id,
        'scope': 'profile_last_100', 'from_cache': False}
    # Do not pin a transiently incomplete sample in the cache.
    if len(samples) == len(candidates):
        with _benchmark_lock:
            _benchmark_cache[key] = (time.monotonic(), payload)
            while len(_benchmark_cache) > 64:
                _benchmark_cache.popitem(last=False)
    return payload
