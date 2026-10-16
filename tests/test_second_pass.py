import io
import json
import threading
import requests
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

import desktop_app
import main
from sf6_tracker.battle_data import BattlePageError, parse_battle_page
from sf6_tracker.crawler import SF6BattleLogCrawler
from sf6_tracker.login_sessions import LoginSessions


def replay(replay_id='ABC'):
    return {'replay_id': replay_id, 'uploaded_at': 1700000000,
            'player1_info': {'player': {'short_id': 123, 'fighter_id': 'One'}, 'round_results': [1, 1]},
            'player2_info': {'player': {'short_id': 456, 'fighter_id': 'Two'}, 'round_results': [0, 0]}}


class ParsingTests(unittest.TestCase):
    def instance(self, payload):
        instance = SF6BattleLogCrawler.__new__(SF6BattleLogCrawler)
        instance.user_id = '123'
        instance.player_name = 'One'
        instance.player_sid = None
        instance.player_profile = {}
        instance.fetch_page = lambda page, battle_type: payload
        return instance

    def test_empty_page_and_missing_list_are_distinct(self):
        self.assertEqual(parse_battle_page({'pageProps': {'replay_list': []}}, lambda row: row).records, [])
        for data in ({}, {'pageProps': {}}, {'pageProps': {'replay_list': None}}):
            with self.assertRaises(BattlePageError):
                parse_battle_page(data, lambda row: row)

    def test_bad_record_does_not_discard_valid_records(self):
        instance = self.instance({'pageProps': {'replay_list': [replay(), {'replay_id': 'bad'}]}})
        result = instance.crawl(pages=1, max_workers=1)
        self.assertEqual(len(result), 1)
        self.assertEqual(instance.collection_status['failed_records'], 1)
        self.assertFalse(instance.collection_status['complete'])

    def test_structural_failure_is_not_reported_as_complete(self):
        instance = self.instance({'pageProps': {}})
        with patch('sf6_tracker.crawler.time.sleep'), self.assertRaises(RuntimeError):
            instance.crawl(pages=1, max_workers=1)
        self.assertEqual(instance.collection_status['parse_failed_pages'], [1])

    def test_replays_are_deduplicated_across_pages(self):
        instance = self.instance({'pageProps': {'replay_list': [replay()]}})
        self.assertEqual(len(instance.crawl(pages=2, max_workers=1)), 1)

    def test_wrong_banner_cannot_change_query_target(self):
        instance = self.instance(None)
        with self.assertRaises(BattlePageError):
            instance.parse_all_battles({'pageProps': {'replay_list': [],
                'fighter_banner_info': {'personal_info': {'short_id': 999}}}})
        self.assertEqual(instance.user_id, '123')

    def test_unrelated_replay_is_reported_instead_of_assigning_the_wrong_side(self):
        unrelated = replay()
        unrelated['player1_info']['player']['short_id'] = 999
        instance = self.instance({'pageProps': {'replay_list': [unrelated]}})
        self.assertEqual(len(instance.crawl(pages=1, max_workers=1)), 0)
        self.assertEqual(instance.collection_status['failed_records'], 1)
        self.assertFalse(instance.collection_status['complete'])

    def test_valid_empty_tail_stops_scheduling_remaining_pages(self):
        instance = self.instance({'pageProps': {'replay_list': []}})
        instance.fetch_page = Mock(return_value={'pageProps': {'replay_list': []}})
        instance.crawl(pages=10, max_workers=2)
        self.assertLessEqual(instance.fetch_page.call_count, 2)
        self.assertTrue(instance.collection_status['complete'])
        self.assertTrue(instance.collection_status['skipped_pages'])

    def test_all_invalid_records_do_not_stop_pagination(self):
        instance = self.instance({'pageProps': {'replay_list': [{'replay_id': 'bad'}]}})
        instance.fetch_page = Mock(side_effect=lambda page, kind: {'pageProps': {
            'replay_list': [replay('VALID')] if page == 4 else [{'replay_id': 'bad'}]}})
        result = instance.crawl(pages=4, max_workers=2)
        self.assertEqual(instance.fetch_page.call_count, 4)
        self.assertEqual(len(result), 1)
        self.assertFalse(instance.collection_status['complete'])

    def test_retries_run_concurrently_without_fixed_sleep(self):
        instance = self.instance(None)
        instance.fetch_page_with_info = lambda page, kind: (page, None, TimeoutError())
        rendezvous = threading.Barrier(3)
        def retry(page, kind):
            rendezvous.wait(timeout=3)
            return {'pageProps': {'replay_list': [replay(str(page))]}}
        instance.fetch_page = retry
        with patch('sf6_tracker.crawler.time.sleep') as sleep:
            result = instance.crawl(pages=3, max_workers=3)
        sleep.assert_not_called()
        self.assertEqual(len(result), 3)
        self.assertEqual(instance.collection_status['retried_pages'], [1, 2, 3])
        self.assertTrue(instance.collection_status['complete'])

    def test_unauthorized_response_is_not_retried(self):
        instance = self.instance(None)
        response = requests.Response()
        response.status_code = 401
        instance.fetch_page = Mock(side_effect=requests.HTTPError(response=response))
        with self.assertRaises(RuntimeError):
            instance.crawl(pages=1, max_workers=1)
        self.assertEqual(instance.fetch_page.call_count, 1)
        self.assertEqual(instance.collection_status['retried_pages'], [])

    def test_incomplete_profile_is_not_reported_as_success(self):
        instance = self.instance({'pageProps': {'replay_list': []}})
        instance.fetch_profile_page = Mock(return_value={'pageProps': {}})
        with patch('sf6_tracker.crawler.time.sleep'):
            instance.crawl(pages=1, max_workers=1, fetch_profile=True)
        self.assertFalse(instance.collection_status['profile_complete'])
        self.assertEqual(instance.player_profile, {})

    def test_progress_returns_first_page_before_slow_profile_completes(self):
        instance = self.instance({'pageProps': {'replay_list': [replay()]}})
        first_page = threading.Event()
        events = []
        def profile():
            self.assertTrue(first_page.wait(timeout=3), 'first page waited for profile')
            return {'profile': True}, {}
        def publish(event):
            events.append(event)
            if event['has_records_page']:
                first_page.set()
        instance._fetch_profile_with_retry = profile
        instance.extract_player_profile = lambda data: setattr(instance, 'player_profile', {'rank_matches': 20})
        instance.progress_callback = publish
        result = instance.crawl(pages=1, max_workers=1, fetch_profile=True)
        self.assertEqual(len(result), 1)
        self.assertTrue(events[0]['has_records_page'])
        self.assertFalse(events[0]['collection']['profile_complete'])
        self.assertTrue(instance.collection_status['complete'])
        self.assertIsNotNone(instance.collection_status['first_result_ms'])

    def test_progress_never_presents_a_later_page_as_the_first_page(self):
        instance = self.instance(None)
        page_two_ready = threading.Event()
        events = []
        def fetch(page, kind):
            if page == 1:
                self.assertTrue(page_two_ready.wait(timeout=3))
            else:
                page_two_ready.set()
            return {'pageProps': {'replay_list': [replay(str(page))]}}
        instance.fetch_page = fetch
        instance.progress_callback = events.append
        instance.crawl(pages=2, max_workers=2)
        for event in events:
            if event['has_records_page']:
                self.assertEqual(event['data'][0]['replay_id'], '1')
            else:
                self.assertEqual(event['data'], [])
        self.assertEqual(len(events[-1]['data']), 2)

    def test_exhausted_transport_budget_does_not_trigger_another_retry_round(self):
        from urllib3.exceptions import MaxRetryError
        for error in (requests.exceptions.RetryError('budget exhausted'),
                      requests.exceptions.ConnectionError(MaxRetryError(None, '/fixture', reason='budget exhausted'))):
            instance = self.instance(None)
            instance.fetch_page = Mock(side_effect=error)
            with self.assertRaises(RuntimeError):
                instance.crawl(pages=1, max_workers=1)
            self.assertEqual(instance.fetch_page.call_count, 1)

    def test_transient_body_connection_error_still_gets_one_page_retry(self):
        instance = self.instance(None)
        instance.fetch_page = Mock(side_effect=[requests.exceptions.ConnectionError('body interrupted'),
            {'pageProps': {'replay_list': [replay()]}}])
        self.assertEqual(len(instance.crawl(pages=1, max_workers=1)), 1)
        self.assertTrue(instance.collection_status['complete'])

    def test_cancelled_stream_stops_scheduling_later_pages(self):
        instance = self.instance({'pageProps': {'replay_list': [replay()]}})
        instance.cancel_event = threading.Event()
        instance.fetch_page = Mock(return_value={'pageProps': {'replay_list': [replay()]}})
        instance.progress_callback = lambda event: instance.cancel_event.set()
        with self.assertRaisesRegex(RuntimeError, '查询已取消'):
            instance.crawl(pages=10, max_workers=1)
        self.assertEqual(instance.fetch_page.call_count, 1)


class CollectionStreamTests(unittest.TestCase):
    def test_ranking_stats_preserves_rank_order_without_streaming(self):
        page_three = threading.Event()
        def fetch(_crawler, page, _region):
            if page == 2:
                self.assertTrue(page_three.wait(timeout=3))
            if page == 3:
                page_three.set()
            return [{'master_rating_ranking': rank, 'rating': 2000, 'character_tool_name': 'ryu',
                     'character_name': '隆'} for rank in range((page - 1) * 2 + 1, page * 2 + 1)]
        fake = Mock()
        with TestClient(main.app) as client, patch.dict(main.ranking_stats_cache, {}, clear=True), patch.object(
                main, 'SF6BattleLogCrawler', return_value=fake), patch.object(main, '_fetch_ranking_page', side_effect=fetch):
            response = client.post('/api/ranking-stats', json={'top_n': 5, 'cookie': 'fixture'})
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result['top_n'], 5)
            self.assertEqual(result['char_avg_rank'][0]['avg_rank'], 3.0)
        fake.session.close.assert_called_once()

    def test_incomplete_stats_does_not_cache_success(self):
        with TestClient(main.app) as client, patch.dict(main.ranking_stats_cache, {}, clear=True), patch.object(
                main, 'SF6BattleLogCrawler', return_value=Mock()), patch.object(main, '_fetch_ranking_page',
                side_effect=[[{'rating': 2000}], None]):
            response = client.post('/api/ranking-stats', json={'top_n': 2, 'cookie': 'fixture'})
            self.assertEqual(response.status_code, 502)
            self.assertEqual(main.ranking_stats_cache, {})

    def test_stream_contains_progress_and_final_archive_result(self):
        from sf6_tracker.collection_stream import collection_progress
        fake = Mock(user_id='123', player_name='One', player_profile={},
                    collection_status={'complete': True, 'profile_complete': True})
        def query(**kwargs):
            fake.progress_callback({'type': 'progress', 'data': [], 'has_records_page': True,
                                    'collection': {'fetched_pages': 1}})
            import pandas as pd
            return pd.DataFrame([])
        fake.query_player.side_effect = query
        with TestClient(main.app) as client, patch.object(main, 'SF6BattleLogCrawler', return_value=fake), patch.object(
                main, 'archive_result', return_value={'saved': True}):
            response = client.post('/api/query-player', json={'user_id': '123', 'cookie': 'fixture', 'stream': True})
        self.assertEqual(response.status_code, 200)
        events = [json.loads(line) for line in response.text.splitlines() if line]
        self.assertEqual([event['type'] for event in events], ['progress', 'complete'])
        self.assertTrue(events[-1]['result']['history']['saved'])
        fake.session.close.assert_called_once()
        self.assertIsNone(collection_progress.get())

    def test_stream_reports_collection_failure_without_success_event(self):
        with TestClient(main.app) as client, patch.object(main, 'SF6BattleLogCrawler', side_effect=RuntimeError('fixture failure')):
            response = client.post('/api/query-player', json={'user_id': '123', 'stream': True})
        events = [json.loads(line) for line in response.text.splitlines() if line]
        self.assertEqual([event['type'] for event in events], ['error'])
        self.assertIn('fixture failure', events[0]['message'])


class LoginApiTests(unittest.TestCase):
    def setUp(self):
        self.previous = main.login_sessions, main.user_info, main.stored_cookie, main._auth_generation
        main.login_sessions = LoginSessions()
        main.user_info = {'user_id': None, 'player_name': None}
        main.stored_cookie = None
        self.client = TestClient(main.app)
        self.driver = Mock()
        self.driver.get_cookies.return_value = [{'domain': '.streetfighter.com', 'name': 'test', 'value': 'fixture'}]
        self.driver.current_url = main.OFFICIAL_LOGIN_URL
        self.sid = main.login_sessions.reserve(main._auth_generation)
        main.login_sessions.attach(self.sid, self.driver)

    def tearDown(self):
        main.login_sessions.close_all()
        main.login_sessions, main.user_info, main.stored_cookie, main._auth_generation = self.previous
        self.client.close()

    def test_unfinished_login_is_not_success_and_browser_stays_available(self):
        with patch.object(main, 'verify_login_cookie', side_effect=HTTPException(401, 'not logged in')):
            response = self.client.post('/api/login/confirm', json={'session_id': self.sid})
        self.assertEqual(response.status_code, 409)
        self.assertIsNone(main.stored_cookie)
        self.driver.quit.assert_not_called()

    def test_normal_browser_opens_only_fixed_official_url_without_auth_changes(self):
        generation = main._auth_generation
        with patch.object(main.webbrowser, 'open', return_value=True) as open_browser:
            response = self.client.post('/api/login/open-official', json={'url': 'https://untrusted.example'})
        self.assertEqual(response.status_code, 200)
        open_browser.assert_called_once_with(main.OFFICIAL_LOGIN_URL, new=2)
        self.assertEqual(main._auth_generation, generation)
        self.assertIsNone(main.stored_cookie)

    def test_normal_browser_error_is_sanitized(self):
        with patch.object(main.webbrowser, 'open', side_effect=RuntimeError('private launch detail')):
            response = self.client.post('/api/login/open-official')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private launch detail', response.text)

    def test_verification_requires_returning_to_https_buckler(self):
        for url in ('https://cid.capcom.com/login', 'http://www.streetfighter.com/6/buckler/zh-hans',
                    'https://www.streetfighter.com.attacker.example/6/buckler/',
                    'https://www.streetfighter.com/other'):
            self.driver.current_url = url
            with patch.object(main, 'verify_login_cookie') as verify:
                response = self.client.post('/api/login/confirm', json={'session_id': self.sid})
            self.assertEqual(response.status_code, 409)
            verify.assert_not_called()
        self.driver.quit.assert_not_called()

    def test_empty_cookie_does_not_send_a_verification_request(self):
        self.driver.get_cookies.return_value = []
        with patch.object(main, 'verify_login_cookie') as verify:
            response = self.client.post('/api/login/confirm', json={'session_id': self.sid})
        self.assertEqual(response.status_code, 409)
        verify.assert_not_called()
        self.driver.quit.assert_not_called()

    def test_load_timeout_preserves_interactive_window(self):
        import sys
        from types import SimpleNamespace
        class LoadTimeout(Exception):
            pass
        main.login_sessions.cancel(self.sid)
        driver = Mock()
        driver.get.side_effect = LoadTimeout()
        with patch.object(main, 'create_login_driver', return_value=driver), patch.dict(sys.modules, {
                'selenium.common.exceptions': SimpleNamespace(TimeoutException=LoadTimeout)}):
            response = self.client.post('/api/login/start', json={})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['page_pending'])
        driver.quit.assert_not_called()
        driver.get.assert_called_once_with(main.OFFICIAL_LOGIN_URL)

    def test_login_driver_uses_eager_without_stealth_or_personal_profile_flags(self):
        import sys
        from types import SimpleNamespace
        options = SimpleNamespace()
        edge = Mock()
        with patch.dict(sys.modules, {
                'selenium': SimpleNamespace(webdriver=SimpleNamespace(Edge=edge)),
                'selenium.webdriver.edge.options': SimpleNamespace(Options=lambda: options)}):
            main.create_login_driver()
        self.assertEqual(vars(options), {'page_load_strategy': 'eager'})
        edge.assert_called_once_with(options=options)

    def test_verified_login_commits_identity_and_closes_browser(self):
        with patch.object(main, 'verify_login_cookie', return_value={'user_id': '123', 'player_name': 'Fixture'}):
            response = self.client.post('/api/login/confirm', json={'session_id': self.sid})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(main.user_info['user_id'], '123')
        self.driver.quit.assert_called_once()

    def test_cancel_is_idempotent_and_closes_browser(self):
        for _ in range(2):
            self.assertEqual(self.client.post('/api/login/cancel', json={'session_id': self.sid}).status_code, 200)
        self.driver.quit.assert_called_once()

    def test_logout_invalidates_inflight_cookie_validation(self):
        generation = main._auth_generation
        main.logout()
        with self.assertRaises(HTTPException) as caught:
            main._commit_login('fixture', {'user_id': '123'}, generation)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIsNone(main.stored_cookie)

    def test_new_login_intent_invalidates_older_validation(self):
        older = main._begin_login_generation()
        newer = main._begin_login_generation()
        with self.assertRaises(HTTPException):
            main._commit_login('old-fixture', {'user_id': '111'}, older)
        main._commit_login('new-fixture', {'user_id': '222'}, newer)
        self.assertEqual(main.user_info['user_id'], '222')

    def test_cookie_verification_closes_client_without_exposing_network_errors(self):
        fake = Mock()
        fake._get_data_response.side_effect = RuntimeError('SENSITIVE FIXTURE')
        with patch.object(main, 'SF6BattleLogCrawler', return_value=fake):
            with self.assertRaises(HTTPException) as caught:
                main.verify_login_cookie('fixture')
        self.assertNotIn('SENSITIVE', caught.exception.detail)
        fake.session.close.assert_called_once()

    def test_rank_average_uses_valid_ranks_only(self):
        main.ranking_stats_cache.clear()
        rows = [{'character_tool_name': 'ryu', 'rating': 2000, 'master_rating_ranking': 20},
                {'character_tool_name': 'ryu', 'rating': 2000}]
        with patch.object(main, 'SF6BattleLogCrawler', return_value=Mock()), patch.object(
                main, '_fetch_ranking_page', return_value=rows):
            result = main.get_ranking_stats(main.RankingStatsRequest(top_n=2, cookie='fixture', force=True))
        self.assertEqual(result['char_avg_rank'][0]['avg_rank'], 20)
        self.assertEqual(result['char_avg_rank'][0]['rank_sample_count'], 1)
        main.ranking_stats_cache.clear()


class StartupTests(unittest.TestCase):
    def test_other_service_or_instance_is_not_accepted(self):
        for payload in ({'app': 'other', 'ready': True, 'instance_id': 'mine'},
                        {'app': 'sf6-tracker', 'ready': True, 'instance_id': 'other'}):
            opener = Mock()
            opener.open.return_value = io.StringIO(json.dumps(payload))
            with patch('urllib.request.build_opener', return_value=opener), patch.object(
                    desktop_app.time, 'monotonic', side_effect=[0, 0, 2]), patch.object(desktop_app.time, 'sleep'):
                self.assertFalse(desktop_app.wait_for_server(timeout=1, instance_id='mine'))

    def test_correct_instance_is_accepted(self):
        opener = Mock()
        opener.open.return_value = io.StringIO(json.dumps({'app': 'sf6-tracker', 'ready': True, 'instance_id': 'mine'}))
        with patch('urllib.request.build_opener', return_value=opener):
            self.assertTrue(desktop_app.wait_for_server(timeout=1, instance_id='mine'))

    def test_failed_server_stops_waiting(self):
        failed = threading.Event()
        failed.set()
        with patch('urllib.request.build_opener') as opener:
            self.assertFalse(desktop_app.wait_for_server(timeout=1, instance_id='mine', failed=failed))
        opener.assert_not_called()

    def test_busy_port_releases_reserved_socket(self):
        sock = Mock()
        sock.bind.side_effect = OSError('busy')
        with patch.object(desktop_app.socket, 'socket', return_value=sock), self.assertRaises(OSError):
            desktop_app.ServerHandle()
        sock.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
