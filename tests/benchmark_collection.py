"""Synthetic scheduler comparison; no network, cookies, or real player data.

The reference reproduces the previous eager-page / one-second / serial-retry
schedule. This measures scheduling overhead, not official-server performance.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter
import json
import logging
from statistics import median
import threading
import time

from crawler import SF6BattleLogCrawler


def fixture(empty=False, fail_first=()):
    instance = SF6BattleLogCrawler.__new__(SF6BattleLogCrawler)
    instance.user_id, instance.player_name = '123', 'Fixture'
    instance.player_profile = {}
    counts, lock = Counter(), threading.Lock()

    def fetch(page, kind):
        with lock:
            counts[page] += 1
            attempt = counts[page]
        time.sleep(0.1)
        if page in fail_first and attempt == 1:
            raise TimeoutError('simulated transient failure')
        return {'pageProps': {'replay_list': [] if empty else [{'replay_id': str(page)}]}}

    instance.fetch_page = fetch
    instance.parse_all_battles = lambda data: data['pageProps']['replay_list']
    instance.transform_to_dataframe = lambda rows: rows
    return instance, counts


def previous_schedule(instance):
    records, failed = {}, []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(instance.fetch_page_with_info, page, 'all') for page in range(1, 11)]
        for future in as_completed(futures):
            page, data, error = future.result()
            if error:
                failed.append(page)
            else:
                records[page] = instance.parse_all_battles(data)
    if failed:
        time.sleep(1)
        for page in sorted(failed):
            records[page] = instance.parse_all_battles(instance.fetch_page(page, 'all'))
    return [row for page in sorted(records) for row in records[page]]


if __name__ == '__main__':
    logging.disable(logging.INFO)
    for label, options in [('full_10_pages', {}), ('empty_history', {'empty': True}),
                           ('three_transient_failures', {'fail_first': (1, 2, 3)})]:
        samples = {'before': [], 'after': []}
        request_counts = {}
        expected = None
        for name, collect in [('before', previous_schedule),
                              ('after', lambda client: client.crawl(pages=10, max_workers=5))]:
            for _ in range(3):
                client, counts = fixture(**options)
                start = time.perf_counter()
                rows = collect(client)
                samples[name].append(round((time.perf_counter() - start) * 1000))
                request_counts[name] = sum(counts.values())
                replay_ids = sorted(row['replay_id'] for row in rows)
                if expected is None:
                    expected = replay_ids
                assert replay_ids == expected, 'scheduler changed returned records'
        print(json.dumps({'scenario': label, 'median_ms': {k: median(v) for k, v in samples.items()},
                          'requests': request_counts, 'records': len(expected)}))

    # Separate first visible records from full completion. The same requests
    # still finish; a slow profile no longer blocks the first screen.
    import pandas as pd
    samples = []
    for _ in range(3):
        client, counts = fixture()
        client.transform_to_dataframe = lambda rows: pd.DataFrame(rows)
        def profile():
            time.sleep(.6)
            return {'rank_matches': 10}, {}
        client._fetch_profile_with_retry = profile
        client.extract_player_profile = lambda data: setattr(client, 'player_profile', data)
        client.progress_callback = lambda event: None
        client.crawl(pages=10, max_workers=5, fetch_profile=True)
        samples.append(client.collection_status)
    print(json.dumps({'scenario': 'slow_profile_first_screen',
        'first_records_ms': median(row['first_result_ms'] for row in samples),
        'full_completion_ms': median(row['elapsed_ms'] for row in samples),
        'requests': sum(counts.values()) + 1}))
