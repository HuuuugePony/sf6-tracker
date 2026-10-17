"""Offline region request and cache isolation checks."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
import main


class RankingRegionTests(unittest.TestCase):
    def test_stats_cache_and_fetch_use_the_complete_region(self):
        rows = [{'rating': 2000, 'character_name': '隆', 'character_tool_name': 'ryu',
                 'master_rating_ranking': 1}]
        with TestClient(main.app) as client, patch.dict(main.ranking_stats_cache, {}, clear=True), patch.object(
                main, 'SF6BattleLogCrawler', return_value=Mock()), patch.object(
                main, '_fetch_ranking_page', return_value=rows) as fetch:
            for home_id in (85, 138, 85):
                response = client.post('/api/ranking-stats', json={
                    'cookie': 'fixture', 'top_n': 1, 'home_filter': 3,
                    'home_category_id': 7, 'home_id': home_id})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['home_id'], home_id)
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(fetch.call_args_list[0].args[2:], (3, 7, 85))
            self.assertEqual(fetch.call_args_list[1].args[2:], (3, 7, 138))
            self.assertEqual(set(main.ranking_stats_cache), {(1, 3, 7, 85), (1, 3, 7, 138)})
            self.assertTrue(response.json()['from_cache'])

    def test_unlisted_regions_are_rejected_before_fetch(self):
        with TestClient(main.app) as client, patch.object(main, 'SF6BattleLogCrawler') as crawler:
            for home_id in (0, 169, 195, 999, -1):
                response = client.post('/api/ranking-stats', json={
                    'cookie': 'fixture', 'home_filter': 3,
                    'home_category_id': 7, 'home_id': home_id})
                self.assertEqual(response.status_code, 422)
            crawler.assert_not_called()

    def test_stats_page_does_not_hardcode_a_region(self):
        response = Mock()
        response.json.return_value = {'pageProps': {'master_rating_ranking': {'ranking_fighter_list': []}}}
        crawler = SimpleNamespace(api_base_url='https://fixture.invalid', build_id='fixture',
                                  lang='zh-hans', session=Mock())
        crawler.session.get.return_value = response
        main._fetch_ranking_page(crawler, 2, 3, 7, 138)
        url = crawler.session.get.call_args.args[0]
        self.assertIn('home_filter=3&home_category_id=7&home_id=138&page=2', url)


if __name__ == '__main__':
    unittest.main()
