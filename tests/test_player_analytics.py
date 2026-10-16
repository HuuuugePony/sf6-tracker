import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
import main
import player_analytics as analytics
from crawler import SF6BattleLogCrawler
from history_store import clean_profile


def ranked(uid, rank, tool='chunli', character_id=4, rating=2000):
    return {'rating': rating, 'master_rating_ranking': rank, 'character_id': character_id,
            'character_tool_name': tool, 'character_name': tool,
            'fighter_banner_info': {'personal_info': {'short_id': uid, 'fighter_id': f'Player {uid}'}, 'home_name': '中国'}}


class AnalyticsTests(unittest.TestCase):
    def test_ladder_missing_scores_are_not_zero_and_entries_are_not_players(self):
        rows = [ranked('1', 1, rating=2100), ranked('1', 2, 'ken', 10, rating=1900),
                ranked('2', 3, rating=0), ranked('3', 4, rating=None)]
        result = analytics.ladder_analysis(rows, 500)
        s = result['summary']
        self.assertEqual(s['entries'], 4)
        self.assertEqual(s['unique_players'], 3)
        self.assertEqual(s['mr_samples'], 2)
        self.assertEqual(s['median_mr'], 2000)
        self.assertEqual((s['q1_mr'], s['q3_mr']), (1950, 2050))
        self.assertEqual(s['thresholds'], [{'rank': 1, 'rating': 2100}])
        self.assertEqual(analytics.ladder_analysis([], 500)['summary']['median_mr'], None)

    def test_deduplication_keeps_other_characters_and_unknown_identities(self):
        rows = [ranked('1', 1), ranked('1', 1), ranked('1', 2, 'ken', 10), {'rating': 1900}, {'rating': 1800}]
        self.assertEqual(len(analytics.unique_ranked_entries(rows)), 4)

    def test_profile_availability_distinguishes_missing_from_observed_zero(self):
        crawler = SF6BattleLogCrawler.__new__(SF6BattleLogCrawler)
        result = crawler.extract_player_profile({'pageProps': {'play': {
            'base_info': {}, 'battle_stats': {'drive_parry': 0, 'received_drive_impact': 2.2}}}})
        self.assertEqual(set(result['battle_stats_available_fields']), {'drive_parry', 'received_drive_impact'})
        cleaned = clean_profile({**result, 'cookie': 'never store this'})
        self.assertNotIn('cookie', cleaned)
        self.assertIn('drive_parry', cleaned['battle_stats_available_fields'])
        self.assertNotIn('just_parry', cleaned['battle_stats_available_fields'])


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.created, self.profile_ids = [], []
        self.fail = set()
        self.rows = [ranked('100', 1), ranked('101', 2), ranked('101', 2),
                     ranked('bad', 3), ranked('999', 3, 'ken', 10), ranked('102', 4), ranked('103', 5), ranked('104', 6)]
        analytics._benchmark_cache.clear()

    def factory(self, cookie=None):
        client = Mock()
        client.api_base_url, client.build_id, client.lang = 'https://fixture.invalid', 'build', 'zh-hans'
        client._get_data_response.return_value = SimpleNamespace(raise_for_status=lambda: None,
            json=lambda: {'pageProps': {'master_rating_ranking': {'ranking_fighter_list': self.rows}}})
        client.set_user_id.side_effect = lambda uid: setattr(client, 'user_id', uid)
        def fetch():
            self.profile_ids.append(client.user_id)
            return (None, {}) if client.user_id in self.fail else ({'profile': True}, {'player_name': f'Elite {client.user_id}'})
        client._fetch_profile_with_retry.side_effect = fetch
        client.player_profile = {'battle_stats_detail': {'drive_parry': 0}, 'battle_stats_available_fields': ['drive_parry']}
        self.created.append(client)
        return client

    def test_benchmark_is_bounded_excludes_self_and_never_collects_battles(self):
        result = analytics.elite_benchmark(4, 'chunli', '100', 'private-cookie', self.factory)
        self.assertEqual(set(self.profile_ids), {'101', '102', '103'})
        self.assertEqual(result['leader_id'], '101')
        self.assertEqual(len(result['samples']), 3)
        self.assertNotIn('private-cookie', json.dumps(result))
        for client in self.created:
            client.session.close.assert_called_once()
            client.crawl.assert_not_called()
        again = analytics.elite_benchmark(4, 'chunli', '100', 'private-cookie', self.factory)
        self.assertTrue(again['from_cache'])
        self.assertEqual(len(self.created), 4)

    def test_partial_reference_is_explicit_and_not_cached(self):
        self.fail = {'101'}
        result = analytics.elite_benchmark(4, 'chunli', '100', 'fixture', self.factory)
        self.assertEqual(len(result['samples']), 2)
        self.assertEqual(result['requested_samples'], 3)
        self.assertEqual(result['leader_id'], '101')
        self.assertEqual(len(analytics._benchmark_cache), 0)

    def test_conflicting_character_identity_is_not_compared(self):
        self.rows = [ranked('101', 1, character_id=10), ranked('102', 2, tool='ken', character_id=4)]
        with self.assertRaisesRegex(ValueError, '暂无可用'):
            analytics.elite_benchmark(4, 'chunli', '100', 'fixture', self.factory)
        self.assertEqual(self.profile_ids, [])

    def test_endpoint_validates_input_and_login_before_any_fetch(self):
        with TestClient(main.app) as client, patch.object(main, 'stored_cookie', None), patch.object(main, 'SF6BattleLogCrawler') as factory:
            self.assertEqual(client.post('/api/player-benchmark', json={'character_id': 0, 'character_tool': 'chunli'}).status_code, 422)
            self.assertEqual(client.post('/api/player-benchmark', json={'character_id': 4, 'character_tool': '../x'}).status_code, 422)
            self.assertEqual(client.post('/api/player-benchmark', json={'character_id': 4, 'character_tool': 'chunli'}).status_code, 403)
            factory.assert_not_called()
