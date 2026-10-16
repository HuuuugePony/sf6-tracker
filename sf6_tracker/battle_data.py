"""Validation of official battle pages, independent of transport and UI."""
from dataclasses import dataclass


class BattlePageError(ValueError):
    pass


class BattleAuthenticationError(BattlePageError):
    pass


def page_props(data):
    if not isinstance(data, dict) or not isinstance(data.get('pageProps'), dict):
        raise BattlePageError('官网响应格式发生变化，请稍后重试')
    props = data['pageProps']
    if (props.get('common') or {}).get('statusCode') in (401, 403):
        raise BattleAuthenticationError('登录已过期，请重新登录')
    return props


def player_identity(data):
    banner = page_props(data).get('fighter_banner_info') or {}
    personal = banner.get('personal_info') or {}
    return {
        'player_name': personal.get('fighter_id') or '',
        'user_id': str(personal.get('short_id') or ''),
        'platform': personal.get('platform_name') or '',
        'favorite_character': banner.get('favorite_character_name') or '',
        'home_name': banner.get('home_name') or '',
        'sid': str(banner.get('sid') or personal.get('sid') or
                   banner.get('user_sid') or personal.get('user_sid') or ''),
    }


@dataclass
class ParsedBattlePage:
    records: list
    identity: dict
    failed_records: int


def parse_battle_page(data, parse_record):
    props = page_props(data)
    replays = props.get('replay_list')
    if not isinstance(replays, list):
        raise BattlePageError('战绩列表格式异常，无法确认该页是否为空')
    records, failed = [], 0
    for replay in replays:
        try:
            if not isinstance(replay, dict) or not replay.get('replay_id'):
                raise ValueError('missing replay')
            for key in ('player1_info', 'player2_info'):
                info = replay.get(key)
                if not isinstance(info, dict) or not isinstance(info.get('player'), dict):
                    raise ValueError('missing player')
                if not info['player'].get('short_id'):
                    raise ValueError('missing player ID')
                if not isinstance(info.get('round_results'), list):
                    raise ValueError('missing round results')
            records.append(parse_record(replay))
        except (ValueError, TypeError, KeyError, AttributeError):
            failed += 1
    return ParsedBattlePage(records, player_identity(data), failed)
