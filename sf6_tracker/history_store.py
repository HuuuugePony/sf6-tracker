"""Local player archive. Querying accounts and credentials are never stored."""
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager


RECORD_FIELDS = {
    'date', 'replay_id', 'player_name', 'player_sid', 'my_side', 'my_result',
    'my_character', 'my_character_id', 'my_character_image', 'my_lp', 'my_master_rating',
    'my_league_rank', 'my_platform', 'my_short_id', 'my_user_id', 'my_input_type',
    'my_round_results', 'my_round_results_raw', 'opponent_name', 'opponent_short_id',
    'opponent_user_id', 'opponent_platform', 'opponent_character', 'opponent_character_id',
    'opponent_character_image', 'opponent_lp', 'opponent_master_rating',
    'opponent_league_rank', 'opponent_input_type', 'opponent_round_results',
    'opponent_round_results_raw', 'battle_type', 'views',
}

PROFILE_FIELDS = {
    'player_name', 'fighting_points', 'rank_matches', 'casual_matches',
    'custom_matches', 'hub_matches', 'challenges_completed', 'practice_time',
    'rank_time', 'my_custom_time', 'online_status_name', 'battle_stats_detail',
    'character_win_rates_by_rival',
    'battle_stats_available_fields',
}


def clean_profile(profile):
    """Persist parsed player data, not the upstream response or authentication."""
    if not isinstance(profile, dict) or not profile:
        return None
    payload = {key: value for key, value in profile.items() if key in PROFILE_FIELDS}
    # Nested official stats contain only numeric values and public character labels.
    detail = payload.get('battle_stats_detail')
    if isinstance(detail, dict):
        payload['battle_stats_detail'] = {key: value for key, value in detail.items()
            if isinstance(value, (int, float)) and not isinstance(value, bool)}
    else:
        payload.pop('battle_stats_detail', None)
    available = payload.get('battle_stats_available_fields')
    if isinstance(available, list):
        payload['battle_stats_available_fields'] = [key for key in available
            if isinstance(key, str) and key in payload.get('battle_stats_detail', {})]
    else:
        payload.pop('battle_stats_available_fields', None)
    rivals = payload.get('character_win_rates_by_rival')
    if isinstance(rivals, list):
        payload['character_win_rates_by_rival'] = [
            {'character_id': char['character_id'], 'rival_character_win_rates': [
                {key: row[key] for key in ('rival_character_id', 'rival_character_name', 'battle_count', 'win_count')
                 if key in row}
                for row in char.get('rival_character_win_rates', []) if isinstance(row, dict)]}
            for char in rivals if isinstance(char, dict) and 'character_id' in char]
    else:
        payload.pop('character_win_rates_by_rival', None)
    return payload or None


def data_directory():
    override = os.environ.get('SF6_TRACKER_DATA_DIR')
    if override:
        return Path(override)
    return Path(os.environ.get('LOCALAPPDATA') or Path.home() / '.local' / 'share') / 'SF6Tracker'


def valid_id(value):
    value = str(value or '')
    if not re.fullmatch(r'[0-9]{1,20}', value):
        raise ValueError('无效的玩家 ID')
    return value


class HistoryStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS archived_players (
                    player_id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS archived_battles (
                    player_id TEXT NOT NULL, replay_id TEXT NOT NULL,
                    played_at TEXT NOT NULL, record TEXT NOT NULL,
                    PRIMARY KEY(player_id, replay_id)
                );
                CREATE INDEX IF NOT EXISTS archived_battle_date ON archived_battles(player_id, played_at DESC, replay_id);
                CREATE TABLE IF NOT EXISTS player_profiles (
                    player_id TEXT PRIMARY KEY, profile TEXT NOT NULL, updated_at TEXT NOT NULL
                );
            ''')
            # Merge the previous account-scoped archive once. Keep old tables intact
            # as a recovery copy; latest player sync wins for duplicate replays.
            db.execute('BEGIN IMMEDIATE')
            if db.execute('PRAGMA user_version').fetchone()[0] < 2:
                legacy = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('players','battles')").fetchall()
                if len(legacy) == 2:
                    db.execute('''INSERT OR REPLACE INTO archived_players
                        SELECT player_id,name,updated_at FROM players ORDER BY updated_at,owner_id''')
                    db.execute('''INSERT OR REPLACE INTO archived_battles
                        SELECT b.player_id,b.replay_id,b.played_at,b.record FROM battles b
                        JOIN players p ON p.player_id=b.player_id AND p.owner_id=b.owner_id
                        ORDER BY p.updated_at,b.owner_id''')
                db.execute('PRAGMA user_version=2')
            if db.execute('PRAGMA user_version').fetchone()[0] < 3:
                db.execute('PRAGMA user_version=3')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def save(self, player, records, profile=None):
        player_id = valid_id(player.get('user_id'))
        updated_at = datetime.now(timezone.utc).isoformat()
        profile = clean_profile(profile)
        serialized_profile = json.dumps(profile, ensure_ascii=False, allow_nan=False) if profile else None
        cleaned = []
        for record in records:
            replay_id = str(record.get('replay_id') or '')
            if not replay_id or len(replay_id) > 100:
                continue
            if str(record.get('my_user_id') or record.get('my_short_id') or '') != player_id:
                continue
            payload = {key: value for key, value in record.items() if key in RECORD_FIELDS}
            # Fail the transaction instead of persisting non-standard NaN values.
            serialized = json.dumps(payload, ensure_ascii=False, allow_nan=False)
            cleaned.append((player_id, replay_id, str(payload.get('date') or ''), serialized))
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            before = db.execute('SELECT COUNT(*) FROM archived_battles WHERE player_id=?', (player_id,)).fetchone()[0]
            db.execute('INSERT INTO archived_players VALUES(?,?,?) ON CONFLICT(player_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at',
                       (player_id, player.get('player_name') or player_id, updated_at))
            db.executemany('''INSERT INTO archived_battles VALUES(?,?,?,?)
                ON CONFLICT(player_id,replay_id) DO UPDATE
                SET played_at=excluded.played_at,record=excluded.record''', cleaned)
            if serialized_profile is not None:
                db.execute('''INSERT INTO player_profiles VALUES(?,?,?)
                    ON CONFLICT(player_id) DO UPDATE SET profile=excluded.profile,updated_at=excluded.updated_at''',
                    (player_id, serialized_profile, updated_at))
            total = db.execute('SELECT COUNT(*) FROM archived_battles WHERE player_id=?', (player_id,)).fetchone()[0]
        return {'saved': True, 'total_records': total, 'new_records': total - before, 'updated_at': updated_at}

    def players(self):
        with self.connect() as db:
            rows = db.execute('''SELECT p.player_id,p.name,p.updated_at,COUNT(b.replay_id),MIN(b.played_at),MAX(b.played_at)
                FROM archived_players p LEFT JOIN archived_battles b ON p.player_id=b.player_id
                GROUP BY p.player_id ORDER BY p.updated_at DESC''')
            return [dict(zip(('user_id', 'player_name', 'updated_at', 'total_records', 'first_date', 'last_date'), row)) for row in rows]

    def records(self, player_id, offset=0, limit=2000):
        player_id = valid_id(player_id)
        if offset < 0 or not 1 <= limit <= 5000:
            raise ValueError('无效的历史分页参数')
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) FROM archived_battles WHERE player_id=?', (player_id,)).fetchone()[0]
            rows = db.execute('''SELECT record FROM archived_battles WHERE player_id=?
                ORDER BY played_at DESC,replay_id DESC LIMIT ? OFFSET ?''', (player_id, limit, offset))
            data = [json.loads(row[0]) for row in rows]
            profile_row = db.execute('SELECT profile,updated_at FROM player_profiles WHERE player_id=?', (player_id,)).fetchone()
            player_row = db.execute('SELECT name FROM archived_players WHERE player_id=?', (player_id,)).fetchone()
        return {'data': data, 'total_records': total, 'offset': offset, 'has_more': offset + len(data) < total,
                'user_info': {'user_id': player_id, 'player_name': player_row[0] if player_row else player_id},
                'player_profile': json.loads(profile_row[0]) if profile_row else None,
                'profile_updated_at': profile_row[1] if profile_row else None}
