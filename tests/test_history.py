import json
import sqlite3
from pathlib import Path
import sys
import tempfile
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
import main
from sf6_tracker import history_api
from sf6_tracker.history_store import HistoryStore
from desktop_app import ExportBridge


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sf6-history-test-')
        self.store = HistoryStore(Path(self.temp.name) / 'history.sqlite3')
        self.owner = {'user_id': '100', 'player_name': 'Owner'}
        self.player = {'user_id': '123', 'player_name': 'Player'}

    def tearDown(self):
        self.temp.cleanup()

    def record(self, replay_id='ABC', **extra):
        return {'replay_id': replay_id, 'date': '2026-10-14 12:00:00', 'my_user_id': '123',
                'my_character': '春丽', 'my_result': 'WIN', 'my_lp': 20000, **extra}

    def test_repeat_sync_updates_without_duplicate_or_removing_older_games(self):
        first = self.store.save(self.player, [self.record('A'), self.record('B')])
        second = self.store.save(self.player, [self.record('A', my_lp=21000)])
        self.assertEqual(first['new_records'], 2)
        self.assertEqual(second['new_records'], 0)
        self.assertEqual(second['total_records'], 2)
        self.assertEqual(next(r for r in self.store.records('123')['data'] if r['replay_id'] == 'A')['my_lp'], 21000)

    def test_player_is_the_only_archive_identity(self):
        self.store.save(self.player, [self.record()])
        self.store.save(self.player, [self.record(my_lp=999)])
        self.assertEqual(self.store.records('123')['data'][0]['my_lp'], 999)
        self.assertEqual(self.store.records('123')['total_records'], 1)
        self.assertEqual(self.store.records('999')['total_records'], 0)
        self.assertEqual(len(self.store.players()), 1)

    def test_profile_is_updated_by_player_and_survives_failed_profile_fetch(self):
        profile = {'rank_matches': 100, 'practice_time': '12:30',
                   'battle_stats_detail': {'drive_parry': 2.5},
                   'character_win_rates_by_rival': [{'character_id': 4,
                       'rival_character_win_rates': [{'rival_character_id': 1,
                           'rival_character_name': '隆', 'battle_count': 10, 'win_count': 6}]}]}
        self.store.save(self.player, [self.record()], profile)
        result = HistoryStore(self.store.path).records('123')
        self.assertEqual(result['player_profile'], profile)
        self.assertEqual(result['user_info'], self.player)
        saved_at = result['profile_updated_at']
        self.store.save(self.player, [self.record('NEW')], None)
        self.assertEqual(self.store.records('123')['player_profile'], profile)
        self.assertEqual(self.store.records('123')['profile_updated_at'], saved_at)
        self.store.save(self.player, [], {**profile, 'rank_matches': 101})
        self.assertEqual(self.store.records('123')['player_profile']['rank_matches'], 101)
        self.assertEqual(self.store.records('123')['total_records'], 2)
        self.assertIsNone(self.store.records('999')['player_profile'])

    def test_profile_whitelist_and_atomic_failure(self):
        self.store.save(self.player, [], {'rank_matches': 12, 'cookie': 'SECRET_FIXTURE',
            'battle_stats_detail': {'drive_parry': 1.5, 'cookie': 'SECRET_FIXTURE'},
            'character_win_rates_by_rival': [{'character_id': 4, 'cookie': 'SECRET_FIXTURE',
                'rival_character_win_rates': [{'battle_count': 2, 'cookie': 'SECRET_FIXTURE'}]}]})
        profile = self.store.records('123')['player_profile']
        self.assertNotIn('SECRET_FIXTURE', json.dumps(profile))
        with self.assertRaises(ValueError):
            self.store.save(self.player, [self.record('BAD')], {'rank_matches': float('nan')})
        self.assertEqual(self.store.records('123')['total_records'], 0)
        self.assertEqual(self.store.records('123')['player_profile'], profile)

    def test_profile_api_can_be_read_without_login(self):
        self.store.save(self.player, [self.record()], {'rank_matches': 42})
        with patch.object(history_api, '_store', self.store), TestClient(main.app) as client:
            result = client.get('/api/history/records?player_id=123').json()
        self.assertEqual(result['player_profile']['rank_matches'], 42)
        self.assertTrue(result['profile_updated_at'])

    def test_unknown_fields_and_credentials_are_never_persisted(self):
        self.store.save(self.player, [self.record(cookie='SECRET_FIXTURE', headers={'cookie': 'SECRET_FIXTURE'})])
        record = self.store.records('123')['data'][0]
        self.assertNotIn('cookie', record)
        self.assertNotIn('headers', record)
        self.assertNotIn('SECRET_FIXTURE', json.dumps(record))

    def test_wrong_player_record_is_not_archived(self):
        result = self.store.save(self.player, [self.record(my_user_id='999')])
        self.assertEqual(result['total_records'], 0)

    def test_pagination_and_restart_preserve_records(self):
        self.store.save(self.player, [self.record(str(i), date=f'2026-10-{i+1:02} 12:00:00') for i in range(8)])
        reopened = HistoryStore(self.store.path)
        page1, page2 = reopened.records('123', limit=4), reopened.records('123', offset=4, limit=4)
        self.assertTrue(page1['has_more'])
        self.assertFalse(page2['has_more'])
        self.assertFalse({r['replay_id'] for r in page1['data']} & {r['replay_id'] for r in page2['data']})

    def test_invalid_record_rolls_back_without_partial_account(self):
        with self.assertRaises(ValueError):
            self.store.save(self.player, [self.record(my_lp=float('nan'))])
        self.assertEqual(self.store.players(), [])

    def test_concurrent_sync_is_transactional(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda i: self.store.save(self.player, [self.record(str(i))]), range(20)))
        self.assertEqual(sum(result['new_records'] for result in results), 20)
        self.assertEqual(self.store.records('123')['total_records'], 20)

    def test_local_routes_work_without_official_login(self):
        self.store.save(self.player, [self.record()])
        with patch.object(history_api, '_store', self.store), TestClient(main.app) as client:
            self.assertEqual(client.get('/history').status_code, 200)
            self.assertEqual(client.get('/api/history/players').json()['players'][0]['user_id'], '123')
            self.assertEqual(client.get('/api/history/records?player_id=123').json()['total_records'], 1)
            self.assertEqual(client.get('/api/history/records?player_id=999').json()['total_records'], 0)
            self.assertEqual(client.get('/api/history/records?player_id=../bad').status_code, 422)

    def test_archive_failure_is_nonfatal(self):
        with patch.object(history_api, 'get_store', side_effect=PermissionError('PRIVATE_PATH')):
            result = history_api.archive_result(self.player, [self.record()])
        self.assertFalse(result['saved'])
        self.assertNotIn('PRIVATE_PATH', result['warning'])

    def test_legacy_archive_merges_players_without_losing_records(self):
        path = Path(self.temp.name) / 'legacy.sqlite3'
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript('''CREATE TABLE players(owner_id TEXT,player_id TEXT,name TEXT,updated_at TEXT);
                CREATE TABLE battles(owner_id TEXT,player_id TEXT,replay_id TEXT,played_at TEXT,record TEXT);
                PRAGMA user_version=1;''')
            for owner, updated, replays in [('100', '2026-10-01', ['A', 'B']), ('200', '2026-10-02', ['A', 'C'])]:
                db.execute('INSERT INTO players VALUES(?,?,?,?)', (owner, '123', 'Player', updated))
                for replay in replays:
                    db.execute('INSERT INTO battles VALUES(?,?,?,?,?)',
                               (owner, '123', replay, updated, json.dumps(self.record(replay, my_lp=int(owner)))))
        migrated = HistoryStore(path)
        self.assertEqual(len(migrated.players()), 1)
        self.assertEqual(migrated.records('123')['total_records'], 3)
        self.assertEqual(next(r for r in migrated.records('123')['data'] if r['replay_id'] == 'A')['my_lp'], 200)
        migrated.save(self.player, [self.record('A', my_lp=999)])
        self.assertEqual(next(r for r in HistoryStore(path).records('123')['data'] if r['replay_id'] == 'A')['my_lp'], 999)

    def test_desktop_export_cancel_and_unicode_save(self):
        module = types.SimpleNamespace(FileDialog=types.SimpleNamespace(SAVE=30))
        bridge = ExportBridge()
        bridge._window = Mock()
        bridge._window.create_file_dialog.return_value = None
        with patch.dict(sys.modules, {'webview': module}):
            self.assertTrue(bridge.save_export('sf6-123.csv', 'fixture')['cancelled'])
            target = Path(self.temp.name) / '中文.csv'
            bridge._window.create_file_dialog.return_value = (str(target),)
            self.assertTrue(bridge.save_export('sf6-123.csv', '\ufeff中文,"quoted"\r\n')['saved'])
            self.assertEqual(target.read_bytes(), '\ufeff中文,"quoted"\r\n'.encode('utf-8'))
            with self.assertRaises(ValueError):
                bridge.save_export('../outside.csv', 'fixture')


if __name__ == '__main__':
    unittest.main()
