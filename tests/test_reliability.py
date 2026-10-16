"""Offline regression checks: python -m unittest discover -s tests -v."""
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import pandas as pd
from fastapi.testclient import TestClient

import main
from sf6_tracker import crawler as crawler_module
from sf6_tracker.crawler import SF6BattleLogCrawler


class ApiReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.archive_patch = patch.object(main, 'archive_result', return_value={'saved': False})
        self.archive_patch.start()
        self.previous_user = main.user_info
        self.previous_cookie = main.stored_cookie
        self.previous_generation = main._auth_generation
        self.previous_sessions = main.login_sessions
        main.login_sessions = main.LoginSessions()
        main.user_info = {'user_id': '100', 'player_name': 'Owner'}
        main.stored_cookie = None
        main.ranking_stats_cache.clear()

    def tearDown(self):
        main.user_info = self.previous_user
        main.stored_cookie = self.previous_cookie
        main._auth_generation = self.previous_generation
        main.login_sessions.close_all()
        main.login_sessions = self.previous_sessions
        main.ranking_stats_cache.clear()
        self.client.close()
        self.archive_patch.stop()

    def test_private_files_are_not_static_assets(self):
        for path in ('main.py', 'player_info.json', 'sf6tracker.log', '.git/config'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get('/static/' + path).status_code, 404)
        self.assertEqual(self.client.get('/web/app.js').status_code, 200)
        self.assertEqual(self.client.get('/home').status_code, 200)

    def test_application_version_is_consistent_across_distribution_entries(self):
        from pathlib import Path
        root = Path(main.RESOURCE_PATH)
        version = 'v' + main.APP_VERSION
        for filename, expected in [('web/state.js', f"const APP_VERSION = '{version}';"),
                                   ('web/index.html', f'>{version}</span>'),
                                   ('desktop_app.py', f"title='SF6 Tracker {version}'"),
                                   ('packaging/sf6tracker.spec', f"name='SF6-Tracker-{version}'")]:
            with self.subTest(filename=filename):
                self.assertIn(expected, (root / filename).read_text(encoding='utf-8'))

    def test_notebook_route_and_reference_assets_work_without_login(self):
        main.user_info = {}
        for path in ('/notes', '/notes/?opponent=10&character=4', '/web/matchup-notes.js'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)

    def test_reorganized_assets_and_private_paths(self):
        from pathlib import Path
        root = Path(main.RESOURCE_PATH)
        for path in ('web/desktop_styles.css', 'assets/chunli.ico', 'assets/screenshots/overview.png'):
            self.assertTrue((root / path).is_file(), path)
        self.assertEqual(self.client.get('/web/desktop_styles.css').status_code, 200)
        for path in ('/static/runtime/player_info.json', '/static/sf6_tracker/crawler.py',
                     '/static/packaging/sf6tracker.spec'):
            self.assertEqual(self.client.get(path).status_code, 404)

    def test_packaging_resolves_paths_from_its_own_directory(self):
        from pathlib import Path
        from types import SimpleNamespace
        import runpy
        root = Path(main.RESOURCE_PATH)
        analysis = Mock(return_value=SimpleNamespace(pure=[], zipped_data=[], scripts=[], binaries=[], zipfiles=[], datas=[]))
        exe = Mock()
        runpy.run_path(str(root / 'packaging/sf6tracker.spec'), init_globals={
            'SPECPATH': str(root / 'packaging'), 'Analysis': analysis, 'PYZ': Mock(), 'EXE': exe})
        self.assertEqual(analysis.call_args.args[0], [str(root / 'desktop_app.py')])
        self.assertEqual(analysis.call_args.kwargs['pathex'], [str(root)])
        self.assertEqual(analysis.call_args.kwargs['datas'], [(str(root / 'web'), 'web')])
        self.assertEqual(exe.call_args.kwargs['icon'], str(root / 'assets/chunli.ico'))

    def test_readme_is_the_single_document_entry_and_local_links_resolve(self):
        from pathlib import Path
        import re
        root = Path(main.RESOURCE_PATH)
        text = (root / 'README.md').read_text(encoding='utf-8')
        for old in ('CONTRIBUTING.md', 'analytics-design.md', 'collection-performance.md',
                    'frontend-architecture.md', 'login-reliability.md', 'matchup-notes.md',
                    'player_info_schema.md', 'tests/README.md'):
            self.assertFalse((root / old).exists(), old)
        for link in re.findall(r'\]\(([^)]+)\)', text):
            if link.startswith(('https://', 'http://', '#')):
                continue
            self.assertTrue((root / link).exists(), link)
        for anchor in ('usage', 'development', 'structure', 'privacy', 'verification', 'contributing',
                       'architecture', 'collection-technical', 'analytics-technical', 'login-technical',
                       'notes-technical', 'test-technical', 'schema-reference'):
            self.assertIn(f'id="{anchor}"', text)

    def test_runtime_path_override_and_frozen_directory_do_not_write_into_source(self):
        import os
        import tempfile
        from pathlib import Path
        from sf6_tracker.paths import runtime_directory
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'custom'
            with patch.dict(os.environ, {'SF6_TRACKER_RUNTIME_DIR': str(target)}):
                self.assertEqual(runtime_directory(), target)
                self.assertTrue(target.is_dir())
            with patch.dict(os.environ), patch('sys.frozen', True, create=True), patch('sys.executable', str(Path(temp) / 'app.exe')):
                os.environ.pop('SF6_TRACKER_RUNTIME_DIR', None)
                self.assertEqual(runtime_directory(), Path(temp) / 'runtime')

    def test_invalid_queries_are_rejected_before_network_access(self):
        for params in ({'pages': 0}, {'pages': 51}, {'max_workers': 100},
                       {'battle_type': 'unknown'}, {'user_id': '../private'}):
            response = self.client.post('/api/query-player', json={'user_id': '123', **params})
            self.assertEqual(response.status_code, 422)

    def test_missing_login_keeps_client_error_status(self):
        main.user_info = {}
        self.assertEqual(self.client.post('/api/crawl', json={}).status_code, 400)

    def test_crawl_forwards_workers_and_reports_completeness(self):
        fake = Mock(player_name='Owner', player_profile={}, collection_status={
            'complete': False, 'requested_pages': 3, 'fetched_pages': 2, 'failed_pages': [2]})
        fake.crawl.return_value = pd.DataFrame([])
        with patch.object(main, 'SF6BattleLogCrawler', return_value=fake):
            result = self.client.post('/api/crawl', json={'pages': 3, 'max_workers': 2})
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()['collection']['complete'])
        self.assertEqual(fake.crawl.call_args.kwargs['max_workers'], 2)
        fake.session.close.assert_called_once()

    def test_simultaneous_players_have_independent_clients(self):
        barrier = threading.Barrier(2)
        instances = []

        class FakeCrawler:
            def __init__(self, cookie=None):
                self.session = Mock()
                self.player_profile = {}
                self.collection_status = {'complete': True}
                instances.append(self)

            def query_player(self, user_id, **kwargs):
                self.user_id = user_id
                self.player_name = 'Player ' + user_id
                barrier.wait(timeout=5)
                return pd.DataFrame([{'my_user_id': self.user_id}])

        with patch.object(main, 'SF6BattleLogCrawler', FakeCrawler):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda uid: main.query_player(
                    main.QueryPlayerRequest(user_id=uid, cookie='test')), ('111', '222')))
        for result, uid in zip(results, ('111', '222')):
            self.assertEqual(result['user_info']['user_id'], uid)
            self.assertEqual(result['data'][0]['my_user_id'], uid)
        self.assertEqual(len(instances), 2)
        for instance in instances:
            instance.session.close.assert_called_once()

    def test_partial_ranking_is_not_cached_as_success(self):
        fake = Mock()
        with patch.object(main, 'SF6BattleLogCrawler', return_value=fake), patch.object(
                main, '_fetch_ranking_page', side_effect=[[{'rating': 2000}], None]):
            response = self.client.post('/api/ranking-stats', json={'top_n': 2, 'cookie': 'test'})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(main.ranking_stats_cache, {})
        fake.session.close.assert_called_once()

    def test_logout_clears_server_credentials(self):
        main.stored_cookie = 'test'
        self.assertEqual(self.client.post('/api/logout').status_code, 200)
        self.assertIsNone(main.stored_cookie)
        self.assertIsNone(main.user_info['user_id'])


class CollectionTests(unittest.TestCase):
    def make_crawler(self, failing_pages):
        instance = SF6BattleLogCrawler.__new__(SF6BattleLogCrawler)
        instance.user_id = '123'
        instance.player_name = 'Test'
        instance.player_profile = {}
        instance.player_sid = None
        instance.collection_status = {}

        def fetch_page(page, battle_type):
            if page in failing_pages:
                raise TimeoutError('fixture timeout')
            return {'page': page}

        instance.fetch_page = fetch_page
        instance.parse_all_battles = lambda data: []
        instance.transform_to_dataframe = lambda data: pd.DataFrame(data)
        return instance

    def test_partial_failure_is_reported_by_both_entry_points(self):
        for method in ('query_player', 'crawl'):
            with self.subTest(method=method), patch('sf6_tracker.crawler.time.sleep'):
                instance = self.make_crawler({2})
                kwargs = {'user_id': '123'} if method == 'query_player' else {}
                getattr(instance, method)(pages=3, max_workers=2, fetch_profile=False, **kwargs)
                self.assertFalse(instance.collection_status['complete'])
                self.assertEqual(instance.collection_status['requested_pages'], 3)
                self.assertEqual(instance.collection_status['fetched_pages'], 2)
                self.assertEqual(instance.collection_status['failed_pages'], [2])

    def test_all_pages_failing_is_an_error(self):
        with patch('sf6_tracker.crawler.time.sleep'):
            with self.assertRaisesRegex(RuntimeError, '所有战绩页'):
                self.make_crawler({1, 2}).crawl(pages=2, max_workers=1)

    def test_retry_recovery_clears_failure_marker(self):
        instance = self.make_crawler(set())
        instance.fetch_page_with_info = lambda page, battle_type: (page, None, 'first attempt failed')
        with patch('sf6_tracker.crawler.time.sleep'):
            instance.crawl(pages=2, max_workers=1)
        self.assertTrue(instance.collection_status['complete'])

    def test_build_id_is_shared_without_sharing_player_state(self):
        with patch.dict(crawler_module._build_id_cache, {}, clear=True), patch.object(
                SF6BattleLogCrawler, 'fetch_build_id', return_value='build-test') as fetch:
            first, second = SF6BattleLogCrawler('a'), SF6BattleLogCrawler('b')
            try:
                self.assertEqual(fetch.call_count, 1)
                self.assertIsNot(first.session, second.session)
                self.assertEqual(second.build_id, 'build-test')
            finally:
                first.session.close()
                second.session.close()

    def test_expired_build_id_is_replaced_after_404(self):
        instance = self.make_crawler(set())
        instance.api_base_url = 'https://example.test/_next/data'
        instance.lang = 'zh-hans'
        instance.build_id = 'old'
        instance.fetch_build_id = Mock(return_value='new')
        instance.session = Mock()
        instance.session.get.side_effect = [Mock(status_code=404), Mock(status_code=200)]
        with patch.dict(crawler_module._build_id_cache, {}, clear=True):
            result = instance._get_data_response(instance.api_base_url + '/old/zh-hans/profile/123.json')
        self.assertEqual(result.status_code, 200)
        self.assertIn('/new/', instance.session.get.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
