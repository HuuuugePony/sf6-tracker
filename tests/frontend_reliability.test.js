// Offline checks: node --test tests/frontend_reliability.test.js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
const source = [...page.matchAll(/<script src="\/web\/([^"?]+)[^"]*"[^>]*><\/script>/g)]
    .map(match => fs.readFileSync(path.join(__dirname, '../web', match[1]), 'utf8')).join('\n');

function fixture() {
    const pending = [];
    const context = vm.createContext({
        window: {location: {origin: 'http://localhost:7648'}, addEventListener() {}},
        document: {body: {style: {}}, addEventListener() {}},
        console: {warn() {}, error() {}, log() {}},
        AbortController, AbortSignal, setTimeout, clearTimeout, URL, URLSearchParams, TextDecoder,
        crypto: require('node:crypto').webcrypto,
        fetch: (url, options) => new Promise(resolve => pending.push({url, options, resolve})),
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    run(`globalThis.renderBattleContent = renderContent;
        globalThis.renderRankingContent = renderRankingPage;
        globalThis.renderFightersContent = renderFightersPage;
        globalThis.storeLoginState = saveLoginState;
        renderContent = () => {}; renderRankingPage = () => {};
        updateLoginStatus = () => {}; saveLoginState = () => {};
        updateFavoritePlayerName = () => {};
        cookie = 'test'; isLoggedIn = true;
        currentUserInfo = {user_id: '100', player_name: 'Owner'};`);
    const reply = (index, data, ok = true, status = ok ? 200 : 401) => pending[index].resolve({ok, status, json: async () => data});
    return {run, pending, reply, context};
}

const result = uid => ({success: true, data: [{my_user_id: uid}],
    user_info: {user_id: uid, player_name: 'Player ' + uid}, player_profile: {},
    collection: {complete: true, requested_pages: 10, failed_pages: []}});

test('late player response cannot overwrite a newer query or the signed in user', async () => {
    const f = fixture();
    f.run(`lastActiveTab = 'query'; isQueryMode = true; queriedUserId = '111';`);
    const first = f.run(`executeQuery('111')`);
    f.run(`queriedUserId = '222'`);
    const second = f.run(`executeQuery('222')`);
    f.reply(1, result('222'));
    await second;
    f.reply(0, result('111')); // Simulate a transport that completed despite abort.
    await first;
    assert.equal(f.run('matchData[0].my_user_id'), '222');
    assert.equal(f.run('queryData.userId'), '222');
    assert.equal(f.run('currentUserInfo.user_id'), '100');
    assert.equal(f.run('queryData.loading'), false);
});

function mockElements(f) {
    const elements = new Map();
    f.context.document.getElementById = id => {
        if (!elements.has(id)) elements.set(id, {value: '', innerHTML: '', textContent: '',
            disabled: false, style: {}, setAttribute() {}, classList: {add() {}, remove() {}, toggle() {}, contains() {return false;}}});
        return elements.get(id);
    };
    return id => f.context.document.getElementById(id);
}

test('logout invalidates a pending private list and clears account caches', async () => {
    const f = fixture();
    f.run(`renderFightersPage = () => {}; fightersState.cache.follow = {fighterList: ['old']};
        lastSearchResults = ['old'];`);
    const request = f.run('fetchFightersData()');
    f.run(`resetAccountData(); cookie = null; isLoggedIn = false;`);
    f.reply(0, {success: true, fighter_list: ['late response']});
    await request;
    assert.equal(f.run('fightersState.cache.friend'), null);
    assert.equal(f.run('fightersState.cache.follow'), null);
    assert.equal(f.run('lastSearchResults.length'), 0);
    assert.equal(f.run('fightersState.loading'), false);
});

test('private cached lists are hidden even if stale data remains after logout', () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`cookie = null; isLoggedIn = false; fightersState.cache.friend = {fighterList: ['old']};
        renderFightersList = () => {throw new Error('private data rendered');}; renderFightersContent();`);
    assert.ok(el('battlesScrollArea').innerHTML.includes('请先登录'));
});

test('late name search cannot replace the home page', async () => {
    const f = fixture();
    const el = mockElements(f);
    el('queryFighterName').value = 'First';
    f.run(`lastActiveTab = 'query'; isQueryMode = false; querySubTab = 'search';
        renderNameSearchResults = () => {throw new Error('stale render');};`);
    const request = f.run('searchFighterByName()');
    f.run(`lastActiveTab = 'home'`);
    f.reply(0, {success: true, fighter_list: ['old']});
    await request;
    assert.equal(f.run('lastSearchResults.length'), 0);
});

test('a newer name search owns the results and loading button', async () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`lastActiveTab = 'query'; isQueryMode = false; renderNameSearchResults = () => {};`);
    el('queryFighterName').value = 'First';
    const first = f.run('searchFighterByName()');
    el('queryFighterName').value = 'Second';
    const second = f.run('searchFighterByName()');
    f.reply(0, {success: true, fighter_list: ['First']});
    await first;
    assert.equal(el('nameSearchBtn').disabled, true);
    f.reply(1, {success: true, fighter_list: ['Second']});
    await second;
    assert.equal(f.run('lastSearchResults[0]'), 'Second');
    assert.equal(el('nameSearchBtn').disabled, false);
});

test('closing the login dialog cancels browser startup by its known session ID', async () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`isLoggedIn = false; hideLoading = () => {};`);
    const request = f.run('startLogin()');
    const id = JSON.parse(f.pending[0].options.body).session_id;
    f.run('hideLoginModal()');
    assert.equal(JSON.parse(f.pending[1].options.body).session_id, id);
    assert.ok(f.pending[1].url.endsWith('/api/login/cancel'));
    f.reply(0, {success: true, session_id: id});
    f.reply(1, {success: true});
    await request;
    assert.equal(f.run('sessionId'), null);
    assert.equal(el('confirmSection').style.display, 'none');
});

test('a cookie login response cannot sign back in after logout', async () => {
    const f = fixture();
    const el = mockElements(f);
    f.context.localStorage = {removeItem() {}};
    el('cookieInput').value = 'fixture';
    const login = f.run('cookieLogin()');
    const logout = f.run('clearLoginState()');
    f.reply(0, {success: true, cookie: 'fixture', user_id: '999'});
    f.reply(1, {success: true});
    await Promise.all([login, logout]);
    assert.equal(f.run('cookie'), null);
    assert.equal(f.run('isLoggedIn'), false);
});

test('pagination exposes all fetched records and clamps when filtering reduces the list', () => {
    const f = fixture();
    f.run(`matchData = Array.from({length: 130}, () => ({})); changePage(11)`);
    assert.equal(f.run('currentPage'), 11);
    assert.ok(f.run('renderMatchCardsHTML()').includes('第 11 / 13 页'));
    f.run(`matchData = [{}]; renderMatchCardsHTML()`);
    assert.equal(f.run('currentPage'), 1);
});

test('per-player view snapshots restore filters, page, expansion, and scroll', () => {
    const f = fixture();
    const el = mockElements(f);
    el('battlesScrollArea').scrollTop = 420;
    f.run(`activeBattleViewKey = 'home'; currentPage = 7; selectedCharacter = '春丽';
        currentBattleType = 'rank'; chartExpanded = true; profileCollapsed = true; saveBattleView();
        restoreBattleView('query:123'); restoreBattleView('home');`);
    assert.equal(f.run('currentPage'), 7);
    assert.equal(f.run('selectedCharacter'), '春丽');
    assert.equal(f.run('currentBattleType'), 'rank');
    assert.equal(f.run('chartExpanded'), true);
    assert.equal(f.run('profileCollapsed'), true);
    assert.equal(f.run('pendingBattleScroll'), 420);
});

test('refresh rendering restores the scroll position after replacing list HTML', () => {
    const f = fixture();
    const el = mockElements(f);
    const area = el('battlesScrollArea');
    area.scrollTop = 310;
    let html = '';
    Object.defineProperty(area, 'innerHTML', {get: () => html, set(value) {html = value; area.scrollTop = 0;}});
    f.run(`initProfileScrollToggle = () => {}; initChartTooltip = () => {};
        renderCharPickerTrigger = () => ''; renderLineChart = () => '';
        renderMatchCardsHTML = () => '<div>cards</div>'; matchData = [{}];
        homeData.loaded = true; renderBattleContent();`);
    assert.equal(area.scrollTop, 310);
});

test('the all-characters chart can stay expanded across rerenders', () => {
    const f = fixture();
    f.run(`selectedCharacter = ''; chartExpanded = true;
        matchData = [{date: '2026-10-14T12:00:00', my_lp: 20000, my_master_rating: 1600,
            my_character: '<img src=x>', opponent_character: 'Ryu', my_result: 'WIN'}]`);
    const html = f.run('renderLineChart()');
    assert.equal(f.run('chartExpanded'), true);
    assert.ok(html.includes('onclick="toggleChart()"'));
    assert.ok(!html.includes('<img src=x>'));
});

test('clicking a player ID saves the previous page before changing its filters', async () => {
    const f = fixture();
    const el = mockElements(f);
    el('battlesScrollArea').scrollTop = 180;
    f.context.document.querySelectorAll = () => [];
    f.context.window.history = {pushState(_state, _title, url) {
        const parsed = new URL(url, 'http://localhost:7648');
        f.context.window.location.pathname = parsed.pathname;
        f.context.window.location.search = parsed.search;
    }};
    f.run(`activeBattleViewKey = 'home'; currentPage = 7; selectedCharacter = '春丽';
        currentBattleType = 'rank'; executeQuery = async () => {};`);
    await f.run(`queryPlayerById('123')`);
    assert.equal(f.run("battleViews.get('home').currentPage"), 7);
    assert.equal(f.run("battleViews.get('home').selectedCharacter"), '春丽');
    assert.equal(f.run("battleViews.get('home').scrollTop"), 180);
});

test('saved login is verified before account data is loaded', async () => {
    const f = fixture();
    f.run(`showLoading = () => {}; hideLoading = () => {}; handleRoute = () => {};
        loadCharacterRoster = () => {}; isLoggedIn = false;`);
    const request = f.run('waitForServerAndRefresh()');
    assert.ok(f.pending[0].url.endsWith('/api/login/cookie'));
    f.reply(0, {success: true, user_id: '100', player_name: 'Verified'});
    await request;
    assert.equal(f.run('isLoggedIn'), true);
    assert.equal(f.run('currentUserInfo.player_name'), 'Verified');
});

test('a restore response is ignored if the account was cleared while it was pending', async () => {
    const f = fixture();
    f.run(`showLoading = () => {}; hideLoading = () => {}; handleRoute = () => {};
        loadCharacterRoster = () => {}; isLoggedIn = false;`);
    const request = f.run('waitForServerAndRefresh()');
    f.run(`resetAccountData(); cookie = null;`);
    f.reply(0, {success: true, user_id: '999', player_name: 'Old'});
    await request;
    assert.equal(f.run('isLoggedIn'), false);
    assert.equal(f.run('cookie'), null);
});

test('query completed after returning home only updates query cache', async () => {
    const f = fixture();
    f.run(`lastActiveTab = 'query'; isQueryMode = true; queriedUserId = '111';`);
    const request = f.run(`executeQuery('111')`);
    f.run(`lastActiveTab = 'home'; isQueryMode = false; queriedUserId = null;
        matchData = [{my_user_id: '100'}];`);
    f.reply(0, result('111'));
    await request;
    assert.equal(f.run('matchData[0].my_user_id'), '100');
    assert.equal(f.run('queryData.matchData[0].my_user_id'), '111');
});

test('failed refresh retains records and exposes the server error', async () => {
    const f = fixture();
    f.run(`matchData = [{my_user_id: '100'}]; homeData.matchData = matchData;`);
    const request = f.run('refreshData()');
    assert.equal(f.run('matchData.length'), 1);
    f.reply(0, {detail: 'Please log in again'}, false);
    await request;
    assert.equal(f.run('matchData[0].my_user_id'), '100');
    assert.equal(f.run('homeData.error'), 'Please log in again');
    assert.equal(f.run('homeData.loading'), false);
});

test('a response received after logout cannot restore private records', async () => {
    const f = fixture();
    const request = f.run('refreshData()');
    f.run(`cookie = null; matchData = []; homeData = {matchData: []};`);
    f.reply(0, result('100'));
    await request;
    assert.equal(f.run('matchData.length'), 0);
    assert.equal(f.run('homeData.matchData.length'), 0);
});

test('ranking statistics follow the latest selected region', async () => {
    const f = fixture();
    f.run(`lastActiveTab = 'ranking'; rankingState.view = 'stats';`);
    const first = f.run('fetchRankingStats()');
    f.run('rankingState.statsHomeFilter = 3');
    const second = f.run('fetchRankingStats()');
    assert.equal(f.pending[0].options.signal.aborted, true);
    f.reply(1, {success: true, region: 3});
    await second;
    f.reply(0, {success: true, region: 1});
    await first;
    assert.equal(f.run('rankingState.stats.region'), 3);
    assert.equal(f.run('rankingState.cachedStats[3].region'), 3);
    assert.equal(f.run('rankingState.cachedStats[1]'), undefined);
});

test('ranking and fighters keep their original centered loading without collection counters', async () => {
    for (const kind of ['ranking', 'fighters']) {
        const f = fixture();
        const el = mockElements(f);
        f.run(`lastActiveTab='${kind}'; renderRankingPage=renderRankingContent; renderFightersPage=renderFightersContent;`);
        const request = f.run(kind === 'ranking' ? 'fetchRankingData()' : 'fetchFightersData()');
        assert.ok(el('battlesScrollArea').innerHTML.includes(kind === 'ranking' ? '正在加载排行榜...' : '正在加载格斗圈列表...'));
        assert.ok(!el('battlesScrollArea').innerHTML.includes('0/1'));
        assert.ok(!el('fixedNavSection').innerHTML.includes('加载中…'));
        f.reply(0,{success:true,data:{},ranking_list:[],fighter_list:[]});
        await request;
        assert.equal(f.run(`${kind === 'ranking' ? 'rankingState' : 'fightersState'}.loading`), false);
        assert.ok(!el('fixedNavSection').innerHTML.includes('加载中…'));
        assert.ok(!el('battlesScrollArea').innerHTML.includes('正在连接'));
    }
});

test('ranking and fighters timeouts release loading instead of leaving an endless spinner', async () => {
    for (const kind of ['ranking', 'fighters']) {
        const f = fixture();
        const el = mockElements(f);
        const timers = [];
        f.context.setTimeout = callback => {timers.push(callback); return timers.length;};
        f.context.clearTimeout = () => {};
        f.context.fetch = (_url, {signal}) => new Promise((_resolve,reject) =>
            signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
        f.run(`lastActiveTab='${kind}'; renderRankingPage=renderRankingContent; renderFightersPage=renderFightersContent;`);
        const request = f.run(kind === 'ranking' ? 'fetchRankingData()' : 'fetchFightersData()');
        timers[0]();
        await request;
        assert.equal(f.run(`${kind === 'ranking' ? 'rankingState' : 'fightersState'}.loading`), false);
        assert.ok(el('battlesScrollArea').innerHTML.includes('超时'));
        assert.ok(!el('fixedNavSection').innerHTML.includes('加载中…'));
    }
});

test('ranking statistics keep their original loading and cache only the completed result', async () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`lastActiveTab='ranking'; rankingState.view='stats'; renderRankingPage=renderRankingContent;`);
    const request = f.run('fetchRankingStats()');
    assert.ok(el('battlesScrollArea').innerHTML.includes('正在统计前500名数据...'));
    assert.ok(!el('battlesScrollArea').innerHTML.includes('0/?'));
    assert.equal(JSON.parse(f.pending[0].options.body).stream, undefined);
    assert.equal(f.run('rankingState.statsLoading'), true);
    assert.equal(f.run('rankingState.stats'), null);
    const result = {success:true,top_n:500,character_usage:[],mr_distribution:[],char_avg_rank:[]};
    f.reply(0, result);
    await request;
    assert.equal(f.run('rankingState.statsLoading'), false);
    assert.ok(!el('fixedNavSection').innerHTML.includes('加载中…'));
    assert.equal(f.run('rankingState.cachedStats[1].top_n'), 500);
});

test('HTML and inline events preserve names containing quotes without executing them', () => {
    const f = fixture();
    const name = `O'Brien "><img src=x onerror=alert(1)> & \\ 中文`;
    f.context.sampleName = name;
    const encoded = f.run('inlineJsString(sampleName)');
    assert.doesNotMatch(encoded, /[<>"']/);
    const decoded = encoded.replace(/&(quot|#39|lt|gt|amp);/g, (_, key) =>
        ({quot: '"', '#39': "'", lt: '<', gt: '>', amp: '&'})[key]);
    assert.equal(vm.runInNewContext(decoded), name);
    f.run(`matchData = [{player_name: sampleName, opponent_name: sampleName, my_result: '胜', replay_id: 'ABC'}]`);
    const html = f.run('renderMatchCardsHTML()');
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('O&#39;Brien'));
    const events = [...html.matchAll(/(?:onclick|oncontextmenu|onerror)="([^"]*)"/g)];
    for (const [, encodedEvent] of events) {
        const handler = encodedEvent.replace(/&(quot|#39|lt|gt|amp);/g, (_, key) =>
            ({quot: '"', '#39': "'", lt: '<', gt: '>', amp: '&'})[key]);
        assert.doesNotThrow(() => new Function('event', handler));
    }
});

test('partial results and refresh errors show an actionable notice while retaining cards', () => {
    const f = fixture();
    const fixed = {innerHTML: ''};
    const area = {innerHTML: ''};
    f.context.document.getElementById = id => id === 'fixedNavSection' ? fixed : area;
    f.run(`initProfileScrollToggle = () => {}; initChartTooltip = () => {};
        renderCharPickerTrigger = () => ''; renderLineChart = () => '';
        renderMatchCardsHTML = () => '<div>saved cards</div>';
        matchData = [{my_user_id: '100'}];
        homeData.collection = {complete: false, requested_pages: 10, failed_pages: [2]};
        renderBattleContent();`);
    assert.ok(fixed.innerHTML.includes('数据不完整'));
    assert.ok(fixed.innerHTML.includes('重试'));
    assert.ok(area.innerHTML.includes('saved cards'));
    f.run(`homeData.error = '<img src=x>'; renderBattleContent()`);
    assert.ok(fixed.innerHTML.includes('&lt;img src=x&gt;'));
    assert.ok(area.innerHTML.includes('saved cards'));
});

test('clearing cache preserves favorites, notes, and appearance preferences', () => {
    const f = fixture();
    const storage = new Map([
        ['sf6_favorite_players', '[{"remark":"my note"}]'],
        ['sf6_favorite_battles', '[{"replay_id":"ABC"}]'],
        ['sf6_matchup_notes_v1','{"version":1,"notes":[]}'],
        ['sf6_theme', 'light'], ['sf6_login_state', 'test'], ['sf6_search_history', '[]'],
    ]);
    f.context.localStorage = {removeItem: key => storage.delete(key)};
    const button = {classList: {contains: () => true, remove() {}, add() {}}};
    f.context.document.querySelector = () => button;
    f.run(`favoritePlayers = [{remark: 'my note'}]; favoriteBattles = [{replay_id: 'ABC'}]; clearCache()`);
    assert.equal(storage.has('sf6_login_state'), false);
    assert.equal(storage.has('sf6_search_history'), false);
    assert.equal(storage.get('sf6_theme'), 'light');
    assert.ok(storage.has('sf6_favorite_players'));
    assert.ok(storage.has('sf6_favorite_battles'));
    assert.ok(storage.has('sf6_matchup_notes_v1'));
    assert.equal(f.run('favoritePlayers[0].remark'), 'my note');
    assert.equal(f.run('favoriteBattles[0].replay_id'), 'ABC');
    f.reply(0, {success: true});
});

test('result, inclusive dates, character and review filters compose consistently', () => {
    const f = fixture();
    f.context.rows = [
        {replay_id:'A', date:'2026-10-14 00:00:00', my_result:'WIN', my_character:'春丽', battle_type:'排位赛'},
        {replay_id:'B', date:'2026-10-14 23:59:59', my_result:'WIN', my_character:'春丽', battle_type:'排位赛'},
        {replay_id:'C', date:'2026-10-15 00:00:00', my_result:'WIN', my_character:'春丽', battle_type:'排位赛'},
        {replay_id:'D', date:'2026-10-14 12:00:00', my_result:'LOSE', my_character:'春丽', battle_type:'排位赛'}
    ];
    f.run(`matchData=rows; resultFilter='win'; dateFrom=dateTo='2026-10-14'; selectedCharacter='春丽';
        favoriteBattles=[{replay_id:'B',status:'pending'}]; reviewFilter='pending';`);
    assert.equal(f.run("filterBattleRecords(matchData, currentBattleFilters()).map(r=>r.replay_id).join(',')"), 'B');
    // Withdrawn filters must never affect the restored online page.
    assert.equal(f.run('getFilteredData().length'), 4);
    f.run('resetBattleFilters()');
    assert.equal(f.run('getFilteredData().length'), 4);
});

test('invalid date range keeps the last valid filter and explains the error', () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`dateFrom='2026-10-10'; dateTo='2026-10-14'; changeBattleFilter('from','2026-10-20')`);
    assert.equal(f.run('dateFrom'), '2026-10-10');
    assert.ok(el('filterStatus').textContent.includes('不能晚于'));
});

test('marking reviewed persists a favorite and is immediately reflected by review filters', () => {
    const f = fixture();
    f.context.localStorage = {setItem() {}};
    f.run(`matchData=[{replay_id:'ABC',my_result:'WIN'}]; setBattleReview('ABC','watched'); reviewFilter='watched'`);
    assert.equal(f.run('filterBattleRecords(matchData, currentBattleFilters()).length'), 1);
    assert.equal(f.run('favoriteBattles[0].status'), 'watched');
    f.run(`setBattleReview('ABC','pending')`);
    assert.equal(f.run('filterBattleRecords(matchData, currentBattleFilters()).length'), 0);
    assert.equal(f.run('favoriteBattles.length'), 1);
});

test('online layout restores expanded player info, embedded report, refresh and header star', () => {
    const f = fixture();
    const el = mockElements(f);
    f.run(`initProfileScrollToggle=()=>{}; initChartTooltip=()=>{};
        renderCharPickerTrigger=()=>''; renderLineChart=()=>'<div>chart</div>';
        renderReportContent=()=>'<div>original report</div>';
        restoreBattleView('home'); playerProfile={player_name:'原版玩家'};
        matchData=[{replay_id:'ABC',date:'2026-10-14',my_character:'春丽',my_result:'WIN'}];
        homeData.loaded=true; homeData.collection={complete:true}; renderBattleContent();`);
    const fixed = el('fixedNavSection').innerHTML;
    const cards = el('battlesScrollArea').innerHTML;
    assert.ok(fixed.includes('原版玩家'));
    assert.ok(fixed.includes('profile-report'));
    assert.ok(fixed.includes('original report'));
    assert.ok(!fixed.includes('player-profile-section collapsed'));
    assert.ok(!fixed.includes('battle-overview'));
    assert.ok(!fixed.includes('battle-filter-panel'));
    assert.ok(!fixed.includes('官方整体资料'));
    assert.ok(!fixed.includes('battle-data-notice'));
    assert.ok(!cards.includes('local-analysis'));
    assert.ok(!cards.includes('match-review-actions'));
    assert.ok(cards.includes('id="refreshBtn"'));
    assert.ok(cards.includes('fav-star-btn'));
});

test('CSV is quoted, Unicode-friendly, and treats names as data rather than formulas', () => {
    const f = fixture();
    f.context.exportRows = [{replay_id:'ABC',player_name:'=HYPERLINK("bad")',opponent_name:'中文,"引号"\n换行'}];
    const csv = f.run("serializeBattleExport(exportRows,'csv')");
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.ok(csv.includes('中文,""引号""\n换行'));
    const json = JSON.parse(f.run("serializeBattleExport(exportRows,'json')"));
    assert.equal(json.records[0].opponent_name, f.context.exportRows[0].opponent_name);
    assert.equal(json.records[0].player_name, f.context.exportRows[0].player_name);
});

test('local history load is available without login and does not overwrite the signed-in identity', async () => {
    const f = fixture();
    f.run(`cookie=null; isLoggedIn=false; isHistoryMode=true; lastActiveTab='history';
        historyState.playerId='123'; historyData.userInfo={user_id:'123'};`);
    const request = f.run('loadHistoryRecords()');
    assert.ok(!('body' in f.pending[0].options));
    assert.ok(!f.pending[0].url.includes('owner_id'));
    f.reply(0,{success:true,data:[{replay_id:'ABC',my_user_id:'123'}],total_records:1,has_more:false});
    await request;
    assert.equal(f.run('matchData[0].replay_id'), 'ABC');
    assert.equal(f.run('currentUserInfo.user_id'), '100');
});

test('local history controls only select saved players, never querying accounts', () => {
    const f = fixture();
    f.run(`historyState.players=[{user_id:'123',player_name:'本地玩家',total_records:4}]; historyState.playerId='123';`);
    const controls = f.run('renderHistoryControls()');
    assert.ok(controls.includes('本地玩家'));
    assert.equal((controls.match(/<select/g) || []).length, 1);
    assert.ok(!controls.includes('保存账号'));
    assert.ok(!controls.includes('selectHistoryOwner'));
});

test('local history renders saved profile and rival stats for the selected player', async () => {
    const f = fixture();
    f.run(`isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';
        queriedUserId='999'; historyData.userInfo={user_id:'123',player_name:'离线玩家'};`);
    const request = f.run('loadHistoryRecords()');
    f.reply(0, {success:true, data:[], total_records:0, has_more:false,
        user_info:{user_id:'123',player_name:'离线玩家'}, profile_updated_at:'2026-10-14T10:00:00Z',
        player_profile:{rank_matches:42,practice_time:'12:30',online_status_name:'在线',
            character_win_rates_by_rival:[{character_id:4,
                rival_character_win_rates:[{rival_character_name:'隆',battle_count:10,win_count:6}]}]}});
    await request;
    const html = f.run('renderPlayerProfile()');
    assert.ok(html.includes('离线玩家'));
    assert.ok(html.includes('(123)'));
    assert.ok(html.includes('12:30'));
    assert.ok(!html.includes('(999)'));
    assert.ok(!html.includes('status-online'));
    f.run('selectedRivalCharId=4');
    assert.ok(f.run('renderRivalWinrateContent()').includes('60.0%'));
    assert.equal(f.run('currentUserInfo.user_id'), '100');
    const next = f.run("selectHistoryPlayer('456')");
    assert.equal(f.run('playerProfile'), null);
    f.reply(1,{success:true,data:[],total_records:0,has_more:false,player_profile:null});
    await next;
    assert.equal(f.run('playerProfile'), null);
});

test('repeated clicks reuse an in-flight collection instead of restarting it', async () => {
    const f = fixture();
    const first = f.run('loadBattleRecords()');
    await f.run('loadBattleRecords()');
    assert.equal(f.pending.length, 1);
    assert.equal(f.pending[0].options.signal.aborted, false);
    f.reply(0, result('100'));
    await first;
    assert.equal(f.run('homeData.loaded'), true);
    const refresh = f.run('loadBattleRecords()');
    assert.equal(f.pending.length, 2);
    f.reply(1,result('100'));
    await refresh;
});

test('a late local history response cannot overwrite data after an account change', async () => {
    const f = fixture();
    f.run(`isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';`);
    const request = f.run('loadHistoryRecords()');
    f.run('resetAccountData()');
    f.reply(0,{success:true,data:[{replay_id:'OLD'}],total_records:1,has_more:false});
    await request;
    assert.equal(f.run('matchData.length'),0);
    assert.equal(f.run('historyState.loading'),false);
});

test('history update merges the selected player archive and keeps the login identity', async () => {
    const f = fixture();
    f.run(`isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';
        historyData.matchData=[{replay_id:'OLD'}]; matchData=historyData.matchData;`);
    const request = f.run('updateHistoryData()');
    assert.ok(f.run('historyState.message').includes('正在连接 · 0/10'));
    await f.run('updateHistoryData()');
    assert.equal(f.pending.length, 1);
    const body = JSON.parse(f.pending[0].options.body);
    assert.equal(body.user_id, '123');
    assert.equal(body.battle_type, 'all');
    assert.equal(body.stream, true);
    assert.equal(f.run('matchData[0].replay_id'), 'OLD');
    f.reply(0, {success:true,data:[{replay_id:'NEW'}],history:{saved:true},collection:{complete:true}});
    await new Promise(setImmediate);
    assert.ok(f.pending[1].url.endsWith('/api/history/players'));
    f.reply(1,{success:true,players:[{user_id:'123',player_name:'Selected',total_records:2}]});
    await new Promise(setImmediate);
    f.reply(2,{success:true,data:[{replay_id:'NEW'},{replay_id:'OLD'}],total_records:2,has_more:false});
    await request;
    assert.equal(f.run('matchData.length'), 2);
    assert.equal(f.run('currentUserInfo.user_id'), '100');
    assert.equal(f.run('historyState.updating'), false);
    assert.ok(f.run('historyState.message').includes('更新完成'));
});

test('failed archive update retains local records and exposes the failure', async () => {
    const f = fixture();
    f.run(`isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';
        historyData.matchData=[{replay_id:'OLD'}]; matchData=historyData.matchData;`);
    const request = f.run('updateHistoryData()');
    f.reply(0,{success:true,data:[],history:{saved:false,warning:'磁盘已满'}});
    await request;
    assert.equal(f.run('matchData[0].replay_id'), 'OLD');
    assert.ok(f.run('historyState.error').includes('磁盘已满'));
    assert.equal(f.run('historyState.updateError'), true);
    assert.equal(f.pending.length, 1);
});

test('history update cannot overwrite a different selected player', async () => {
    const f = fixture();
    f.run(`isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';`);
    const update = f.run('updateHistoryData()');
    const select = f.run("selectHistoryPlayer('456')");
    assert.equal(f.pending[0].options.signal.aborted, true);
    f.reply(1,{success:true,data:[{replay_id:'OTHER'}],total_records:1,has_more:false});
    await select;
    f.reply(0,{success:true,history:{saved:true},data:[]});
    await update;
    assert.equal(f.pending.length, 2);
    assert.equal(f.run('matchData[0].replay_id'), 'OTHER');
});

test('offline update asks for login without issuing a collection request', async () => {
    const f = fixture();
    f.run(`isLoggedIn=false; cookie=null; isHistoryMode=true; lastActiveTab='history';
        historyState.playerId='123'; globalThis.loginShown=false; showLoginModal=()=>{loginShown=true;};`);
    await f.run('updateHistoryData()');
    assert.equal(f.pending.length, 0);
    assert.equal(f.run('loginShown'), true);
});

test('logging in from history retains the selected archive', () => {
    const f = fixture();
    mockElements(f);
    f.run(`isLoggedIn=false; isHistoryMode=true; lastActiveTab='history'; historyState.playerId='123';
        historyData.matchData=[{replay_id:'LOCAL'}]; hideLoginModal=()=>{};
        loadCharacterRoster=()=>{}; handleRoute=()=>{};`);
    f.run("acceptLogin({cookie:'fixture',user_id:'100',player_name:'Owner'})");
    assert.equal(f.run('isLoggedIn'), true);
    assert.equal(f.run('isHistoryMode'), true);
    assert.equal(f.run('historyState.playerId'), '123');
    assert.equal(f.run('matchData[0].replay_id'), 'LOCAL');
});

function streamedReply(events, {truncated=false} = {}) {
    const text = events.map(event => JSON.stringify(event)).join('\n') + (truncated ? '' : '\n');
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return {ok:true,headers:{get:()=> 'application/x-ndjson'}, body:{getReader:()=>({
        async read() {
            if (offset === bytes.length) return {done:true};
            const value = bytes.slice(offset, offset + 3); // Split UTF-8 and JSON across chunks.
            offset += value.length;
            return {done:false,value};
        }, async cancel() {}, releaseLock() {}
    })}};
}

test('stream parser handles split UTF-8 and requires a final result', async () => {
    const f = fixture();
    f.context.streamResponse = streamedReply([
        {type:'progress',data:[{replay_id:'春丽'}]},
        {type:'complete',result:{success:true,data:[{replay_id:'春丽'}]}}
    ]);
    f.run('globalThis.progressEvents=[]');
    const result = await f.run('readCollectionResponse(streamResponse,event=>progressEvents.push(event))');
    assert.equal(result.data[0].replay_id, '春丽');
    assert.equal(f.run('progressEvents.length'), 1);
    f.context.streamResponse = streamedReply([{type:'progress',data:[]}],{truncated:true});
    await assert.rejects(f.run('readCollectionResponse(streamResponse)'), /尚未完整获取/);
});

test('online collections display streamed records before completion', async () => {
    const f = fixture();
    f.run(`homeData.matchData=[{replay_id:'OLD',my_user_id:'100',date:'2026-10-13'}]; matchData=homeData.matchData;`);
    let finish;
    const progress = new TextEncoder().encode(JSON.stringify({type:'progress',has_records_page:true,
        data:[{replay_id:'FIRST',my_user_id:'100',date:'2026-10-15'}],collection:{fetched_pages:1,requested_pages:10,complete:false}})+'\n');
    let reads = 0;
    f.pending.length = 0;
    const request = f.run('loadBattleRecords()');
    assert.equal(f.run('homeData.collection.fetched_pages'), 0);
    assert.equal(f.run('homeData.collection.requested_pages'), 10);
    f.pending[0].resolve({ok:true,headers:{get:()=> 'application/x-ndjson'},body:{getReader:()=>({
        async read() {
            if (++reads === 1) return {value:progress,done:false};
            if (reads === 2) return new Promise(resolve=>{finish=resolve;});
            return {done:true};
        },async cancel(){},releaseLock(){}
    })}});
    await new Promise(setImmediate);
    assert.equal(f.run('homeData.loading'), true);
    assert.equal(f.run('matchData[0].replay_id'), 'FIRST');
    assert.equal(f.run('matchData[1].replay_id'), 'OLD');
    const final = {type:'complete',result:{...result('100'),collection:{complete:true}}};
    finish({value:new TextEncoder().encode(JSON.stringify(final)+'\n'),done:false});
    await request;
    assert.equal(f.run('homeData.loading'), false);
    assert.equal(f.run('homeData.collection.complete'), true);
});

test('history export reads remaining pages before applying the filter snapshot', async () => {
    const f = fixture();
    mockElements(f);
    f.context.document.querySelectorAll = () => [];
    f.run(`isHistoryMode=true; historyState.playerId='123';
        historyData.hasMore=true; historyData.nextOffset=1;
        matchData=[{replay_id:'A',my_result:'LOSE'}]; resultFilter='win';
        globalThis.savedExport=null; saveBattleExport=async (name,text)=>{savedExport=JSON.parse(text);return {saved:true};};`);
    const request = f.run("exportBattleRecords('json')");
    f.reply(0,{success:true,data:[{replay_id:'B',my_result:'WIN'}],has_more:false});
    await request;
    assert.equal(f.run('savedExport.records.length'),1);
    assert.equal(f.run('savedExport.records[0].replay_id'),'B');
});

test('delivered scripts execute independently in HTML order', () => {
    const context = vm.createContext({window:{location:{origin:'http://localhost'},addEventListener(){}},
        document:{body:{style:{}},addEventListener(){}},console,AbortController,AbortSignal,setTimeout,clearTimeout,URLSearchParams});
    for (const match of page.matchAll(/<script src="\/web\/([^"?]+)[^"]*"[^>]*><\/script>/g)) {
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',match[1]),'utf8'),context,{filename:match[1]});
    }
    assert.equal(vm.runInContext('typeof renderContent',context),'function');
    assert.equal(vm.runInContext('typeof loadBattleRecords',context),'function');
});

test('a successful background login verification does not redirect an open archive', async () => {
    const f = fixture();
    f.run(`lastActiveTab='history'; isHistoryMode=true; loadCharacterRoster=()=>{};
        handleRoute=()=>{throw new Error('unexpected redirect');};`);
    const request=f.run('waitForServerAndRefresh()');
    f.reply(0,{success:true,user_id:'100',player_name:'Owner'});
    await request;
    assert.equal(f.run('isHistoryMode'),true);
    assert.equal(f.run('isLoggedIn'),true);
});

test('expired background credentials do not discard an explicitly opened local archive', async () => {
    const f=fixture();
    mockElements(f);
    f.context.localStorage={removeItem(){}};
    f.run(`lastActiveTab='history'; isHistoryMode=true; historyData.loaded=true;
        historyData.matchData=[{replay_id:'LOCAL'}]; matchData=historyData.matchData;
        historyState.playerId='123';`);
    const request=f.run('waitForServerAndRefresh()');
    f.reply(0,{detail:'expired'},false,401);
    await new Promise(setImmediate);
    f.reply(1,{success:true});
    await request;
    assert.equal(f.run('isHistoryMode'),true);
    assert.equal(f.run('matchData[0].replay_id'),'LOCAL');
    assert.equal(f.run('cookie'),null);
});

test('training priorities require samples and quantify a clearly conditional target', () => {
    const f = fixture();
    f.context.analyticsRows = Array.from({length:25}, (_, i) => ({replay_id:String(i), battle_type:'排位赛',
        my_character_id:4, my_character:'春丽', opponent_character:i < 20 ? '肯' : '隆',
        my_result:i < 6 ? 'WIN' : 'LOSE', my_master_rating:1500,
        date:new Date(Date.UTC(2026,9,15,0,i)).toISOString()}));
    const result = f.run('analyzePlayerRecords(analyticsRows,4)');
    assert.equal(result.overall.n,25);
    assert.equal(result.priorities.length,1);
    assert.equal(result.priorities[0].name,'肯');
    assert.equal(result.scenarioWins,4);
    assert.equal(f.run('analyzePlayerRecords([],4).overall.rate'),null);
});

test('training analysis deduplicates and never mixes character MR or invents round data', () => {
    const f = fixture();
    f.context.analyticsRows = [
        {replay_id:'A',battle_type:'排位赛',my_character_id:4,my_result:'WIN',my_master_rating:1600,date:'2026-10-15',my_round_results_raw:[0,1,1]},
        {replay_id:'B',battle_type:'排位赛',my_character_id:4,my_result:'LOSE',my_master_rating:1500,date:'2026-10-14',my_round_results_raw:[1,0,0]},
        {replay_id:'A',battle_type:'排位赛',my_character_id:4,my_result:'WIN',my_master_rating:1600,date:'2026-10-15'},
        {replay_id:'C',battle_type:'排位赛',my_character_id:9,my_result:'WIN',my_master_rating:2200,date:'2026-10-16'},
        {replay_id:'D',battle_type:'休闲赛',my_character_id:4,my_result:'WIN',my_master_rating:2600,date:'2026-10-16'}
    ];
    assert.equal(f.run('analyzePlayerRecords(analyticsRows,4).overall.n'),2);
    assert.equal(f.run('analyzePlayerRecords(analyticsRows,4).scoreChange'),100);
    assert.equal(f.run('analyzePlayerRecords(analyticsRows,0).scoreChange'),null);
    assert.equal(f.run('analyzePlayerRecords([analyticsRows[3]],9).roundRate'),null);
});

test('benchmark comparisons distinguish missing fields from zero and use percentage points', () => {
    const f = fixture();
    f.run(`globalThis.own={battle_stats_detail:{drive_parry:0,gauge_rate_drive_impact:.2},battle_stats_available_fields:['drive_parry','gauge_rate_drive_impact']};
        globalThis.ref={leader_id:'1',samples:[{user_id:'1',profile:{battle_stats_detail:{drive_parry:2,gauge_rate_drive_impact:.1},battle_stats_available_fields:['drive_parry','gauge_rate_drive_impact']}}]};`);
    assert.equal(f.run("insightMetricValue(own,'drive_parry')"),0);
    assert.equal(f.run("insightMetricValue({battle_stats_detail:{drive_parry:0}},'drive_parry')"),null);
    const row = f.run("insightComparisons(own,ref).find(r=>r.key==='gauge_rate_drive_impact')");
    assert.ok(Math.abs(row.delta * 100 - 10) < 1e-9);
    assert.equal(row.n,1);
    f.run(`ref.samples.push({user_id:'2',profile:{battle_stats_detail:{gauge_rate_drive_impact:.2},battle_stats_available_fields:['gauge_rate_drive_impact']}},
        {user_id:'3',profile:{battle_stats_detail:{gauge_rate_drive_impact:.9},battle_stats_available_fields:['gauge_rate_drive_impact']}});`);
    assert.equal(f.run("insightComparisons(own,ref).find(r=>r.key==='gauge_rate_drive_impact').reference"),.2);
    assert.equal(f.run("insightComparisons(own,{...ref,leader_id:'missing'},'leader').find(r=>r.key==='drive_parry').reference"),null);
});

test('training analysis opens inline offline and keeps selected player identity', () => {
    const f = fixture();
    const el = mockElements(f);
    f.context.localStorage={getItem(){return null;}};
    f.run(`renderContent=renderBattleContent; initProfileScrollToggle=()=>{};
        isHistoryMode=true; historyState.playerId='123'; queriedUserId='999';
        historyData.userInfo={user_id:'123',player_name:'本地玩家'}; cookie=null; isLoggedIn=false;
        matchData=[{replay_id:'A',battle_type:'排位赛',my_character_id:4,my_character:'春丽',opponent_character:'肯',my_result:'LOSE'}];
        playerProfile={battle_stats_detail:{received_drive_impact:.5},battle_stats_available_fields:['received_drive_impact']};
        openPlayerInsights();`);
    assert.equal(f.pending.length,0);
    assert.equal(f.run('playerInsights.snapshot.userId'),'123');
    assert.equal(f.run('currentViewMode'),'insights');
    assert.ok(el('fixedNavSection').innerHTML.includes('data-mode="insights"'));
    assert.ok(el('battlesScrollArea').innerHTML.includes('id="playerInsightsBody"'));
    assert.ok(!page.includes('playerInsightsModal'));
    assert.ok(el('fixedNavSection').innerHTML.includes('本地玩家'));
    assert.ok(el('fixedNavSection').innerHTML.includes('player-profile-section'));
    assert.ok(!el('playerInsightsBody').innerHTML.includes('<h2>'));
    assert.ok(el('playerInsightsBody').innerHTML.includes('report-stat-card'));
    assert.ok(el('playerInsightsBody').innerHTML.includes('report-panel insights-card'));
    assert.ok(el('playerInsightsBody').innerHTML.includes('账号近100战综合趋势'));
    assert.ok(!el('playerInsightsBody').innerHTML.includes('999'));
});

test('training analysis shares the original wheel collapse and upward profile reveal', () => {
    const f = fixture();
    const el = mockElements(f);
    let wheel;
    el('battlesScrollArea').scrollTop = 0;
    el('battlesScrollArea').addEventListener = (type, listener) => {if (type === 'wheel') wheel = listener;};
    f.run(`currentViewMode='insights'; profileCollapsed=false;
        setProfileCollapsed=value=>{profileCollapsed=value;};initProfileScrollToggle();`);
    let prevented = false;
    wheel({deltaY:120,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
    assert.equal(f.run('profileCollapsed'),true);
    el('battlesScrollArea').scrollTop = 160;
    wheel({deltaY:-120,preventDefault(){throw new Error('native scrolling must remain available');}});
    assert.equal(f.run('profileCollapsed'),true);
    el('battlesScrollArea').scrollTop = 0;
    wheel({deltaY:-120,preventDefault(){throw new Error('upward wheel must not be swallowed');}});
    assert.equal(f.run('profileCollapsed'),false);
    f.run("currentViewMode='battles'");
    wheel({deltaY:120,preventDefault(){}});
    assert.equal(f.run('profileCollapsed'),true);
});

test('inline training refresh keeps the reference request and selected character while updating records', async () => {
    const f = fixture();
    mockElements(f);
    f.context.localStorage={getItem(){return null;},setItem(){}};
    f.run(`renderContent=renderBattleContent; initProfileScrollToggle=()=>{};
        matchData=[{replay_id:'A',battle_type:'排位赛',my_character_id:4,my_result:'WIN'}];
        openPlayerInsights(); changeInsightCharacter(4);`);
    const request = f.run('fetchInsightBenchmark()');
    f.run(`matchData.push({replay_id:'B',battle_type:'排位赛',my_character_id:4,my_result:'LOSE'}); renderContent();`);
    assert.equal(f.run('playerInsights.snapshot.matches.length'),2);
    assert.equal(f.run('playerInsights.characterId'),4);
    assert.equal(f.pending[0].options.signal.aborted,false);
    f.reply(0,{success:true,samples:[],character_id:4,requested_samples:3,updated_at:1});
    await request;
    assert.equal(f.run('playerInsights.loading'),false);
    assert.equal(f.run('playerInsights.benchmark.character_id'),4);
});

test('leaving inline analysis cancels its request and restores original battle content', async () => {
    const f = fixture();
    const el = mockElements(f);
    f.context.localStorage={getItem(){return null;}};
    f.run(`renderContent=renderBattleContent; initProfileScrollToggle=()=>{};
        initChartTooltip=()=>{}; renderLineChart=()=>'<div>原有趋势图</div>';
        renderMatchCardsHTML=()=>'<div>原有对局</div>';
        matchData=[{replay_id:'A',battle_type:'排位赛',my_character_id:4,my_result:'WIN'}];
        openPlayerInsights();`);
    const request=f.run('fetchInsightBenchmark()');
    f.run("switchViewMode('battles')");
    assert.equal(f.pending[0].options.signal.aborted,true);
    assert.equal(f.run('playerInsights.open'),false);
    assert.ok(el('battlesScrollArea').innerHTML.includes('原有对局'));
    f.reply(0,{success:true,samples:[{}],character_id:4});
    await request;
    assert.equal(f.run('playerInsights.benchmark'),null);
});

test('inline analysis groups comparisons instead of exposing every metric at once', () => {
    const f = fixture();
    const el = mockElements(f);
    f.context.localStorage={getItem(){return null;}};
    f.run(`openPlayerInsights();renderPlayerInsights();`);
    assert.equal((el('playerInsightsBody').innerHTML.match(/class="insight-compare-row"/g)||[]).length,5);
    assert.ok(el('playerInsightsBody').innerHTML.includes('<details class="insight-method"'));
    assert.ok(!el('playerInsightsBody').innerHTML.includes('id="insightsMethod" open'));
    f.run(`playerInsights.group='资源分配';renderPlayerInsights();`);
    assert.equal((el('playerInsightsBody').innerHTML.match(/class="insight-compare-row"/g)||[]).length,8);
});

test('closed training analysis cannot apply a late benchmark or store its result', async () => {
    const f = fixture();
    mockElements(f);
    f.run(`renderPlayerInsights=()=>{}; playerInsights.open=true;
        playerInsights.characterId=4; playerInsights.snapshot={userId:'100'};`);
    const request = f.run('fetchInsightBenchmark()');
    f.run('closePlayerInsights()');
    assert.equal(f.pending[0].options.signal.aborted,true);
    f.reply(0,{success:true,samples:[{}],character_id:4});
    await request;
    assert.equal(f.run('playerInsights.benchmark'),null);
});

test('training drilldown opens ranked local matches and clears unrelated filters', () => {
    const f = fixture();
    mockElements(f);
    f.run(`isHistoryMode=true; currentBattleType='hub'; resultFilter='win'; reviewFilter='watched';
        dateFrom='2000-01-01'; dateTo='2000-01-02'; playerInsights.characterId=4;
        playerInsights.snapshot={periodKey:'all',matches:[{my_character_id:4,my_character:'春丽'}]};
        inspectInsightMatchup('肯');`);
    assert.equal(f.run('currentBattleType'),'rank');
    assert.equal(f.run('selectedCharacter'),'春丽');
    assert.equal(f.run('selectedOpponentCharacter'),'肯');
    assert.equal(f.run('resultFilter'),'all');
    assert.equal(f.run('dateFrom'),'');
});

test('training reuses the avatar picker and handles selecting a character or all without fetching', () => {
    const f=fixture(), el=mockElements(f);
    f.context.localStorage={getItem(){return null;}};
    f.run(`openPlayerInsights();renderPlayerInsights();openInsightCharacterPicker();`);
    assert.ok(el('charPickerTitle').textContent.includes('训练分析'));
    assert.ok(el('charPickerGrid').innerHTML.includes('char-tile-img'));
    assert.ok(!el('playerInsightsBody').innerHTML.includes('id="insightCharacter"'));
    assert.ok(el('playerInsightsBody').innerHTML.includes('openInsightCharacterPicker()'));
    f.run('pickCharacterById(9)');
    assert.equal(f.run('playerInsights.characterId'),9);
    f.run('openInsightCharacterPicker();pickAllCharacter()');
    assert.equal(f.run('playerInsights.characterId'),0);
    assert.equal(f.pending.length,0);
});

test('replay draw only uses ranked losses of the chosen character and avoids immediate repeats', () => {
    const f=fixture();
    f.context.lossRows=[
        {replay_id:'A',battle_type:'排位赛',my_character_id:4,my_result:'LOSE'},
        {replay_id:'B',battle_type:'排位赛',my_character_id:4,my_result:'LOSE'},
        {replay_id:'C',battle_type:'排位赛',my_character_id:9,my_result:'LOSE'},
        {replay_id:'D',battle_type:'休闲赛',my_character_id:4,my_result:'LOSE'},
        {replay_id:'E',battle_type:'排位赛',my_character_id:4,my_result:'WIN'},
        {battle_type:'排位赛',my_character_id:4,my_result:'LOSE'}];
    assert.equal(f.run("pickInsightLoss(lossRows,4,'A',()=>0).replay_id"),'B');
    assert.equal(f.run("pickInsightLoss(lossRows,9,null,()=>0).replay_id"),'C');
    assert.equal(f.run('pickInsightLoss([],4,null)'),null);
});

test('adding a drawn replay uses the existing pending queue once and ignores out of scope records', () => {
    const f=fixture();
    f.run(`saveFavoriteBattles=()=>{};isBattlePageActive=()=>false;renderPlayerInsights=()=>{};
        matchData=[{replay_id:'LOSS',battle_type:'排位赛',my_character_id:4,my_result:'LOSE'},
            {replay_id:'WIN',battle_type:'排位赛',my_character_id:4,my_result:'WIN'}];
        playerInsights.open=true;playerInsights.characterId=4;playerInsights.snapshot={matches:matchData};
        queueInsightReplay('LOSS');queueInsightReplay('LOSS');queueInsightReplay('WIN');queueInsightReplay('other');`);
    assert.equal(f.run('favoriteBattles.length'),1);
    assert.equal(f.run('favoriteBattles[0].status'),'pending');
    assert.equal(f.run('favoriteBattles[0].replay_id'),'LOSS');
    assert.equal(f.pending.length,0);
});

test('MR milestone comparison rejects empty, invalid, fractional and missing input without inventing a rank', () => {
    const f=fixture();
    for (const input of ['', ' ', 'abc', 'NaN', 'Infinity', '-10', '0', '1700.5']) {
        f.context.mrInput=input;
        assert.equal(f.run('rankingMilestoneGap(mrInput,1800)'),null);
    }
    assert.equal(f.run("rankingMilestoneGap('1700',1800)"),-100);
    assert.equal(f.run("rankingMilestoneGap('1900',1800)"),100);
    assert.equal(f.run("rankingMilestoneGap('1800',1800)"),0);
    assert.equal(f.run("rankingMilestoneGap('1800',null)"),null);
});

test('ranking highlights need samples for head comparisons and describe presence, not character strength', () => {
    const f=fixture();
    f.run(`globalThis.ladder={summary:{head_entries:100},character_details:[
        {tool:'chunli',name:'春丽',count:100,percent:50,head_share_difference:0,top100_count:50,max_mr:2200},
        {tool:'ken',name:'肯',count:20,percent:10,head_share_difference:20,top100_count:30,max_mr:2100},
        {tool:'cammy',name:'嘉米',count:1,percent:.5,head_share_difference:50,top100_count:1,max_mr:2300}]};`);
    assert.equal(f.run("rankingHighlights(ladder).find(h=>h.title==='前100占比更高').row.tool"),'ken');
    f.run('ladder.summary.head_entries=10');
    assert.equal(f.run("rankingHighlights(ladder).some(h=>h.title==='前100占比更高')"),false);
    assert.equal(f.run('rankingHighlights({}).length'),0);
});

test('ranking character sorts keep missing MR last and never mutate the cached source', () => {
    const f=fixture();
    f.run(`globalThis.ladder={character_details:[{tool:'a',count:20,median_mr:null},{tool:'b',count:10,median_mr:1800},{tool:'c',count:5,median_mr:2000}]};`);
    assert.equal(f.run("sortedRankingCharacters(ladder,'median')[0].tool"),'c');
    assert.equal(f.run("sortedRankingCharacters(ladder,'median').at(-1).tool"),'a');
    assert.equal(f.run("sortedRankingCharacters(ladder,'count','b').length"),1);
    assert.equal(f.run('ladder.character_details[0].tool'),'a');
});

test('compact ranking statistics limit long lists, keep local actions offline, and preserve scroll', () => {
    const f=fixture(), el=mockElements(f);
    f.context.statsRows=Array.from({length:12},(_,i)=>({tool:'role'+i,name:'角色'+i,count:20-i,percent:10,
        median_mr:1800+i,max_mr:2000+i,mr_samples:20-i,head_share_difference:1,top100_count:5,top100_percent:11,representatives:[]}));
    f.run(`rankingState.stats={character_usage:statsRows,character_details:statsRows,mr_distribution:[],region_distribution:[{name:'地区未提供',count:100,percent:100}]};
        renderRankingStats(document.getElementById('battlesScrollArea'));`);
    assert.equal((el('battlesScrollArea').innerHTML.match(/class="rstat-usage-row"/g)||[]).length,8);
    assert.ok(el('battlesScrollArea').innerHTML.includes('展开全部 12 个角色'));
    assert.ok(!el('battlesScrollArea').innerHTML.includes('id="rstat-regions"'));
    el('battlesScrollArea').scrollTop=250;
    f.run("updateRankingStatsView({statsSort:'median',statsShowAll:true})");
    assert.equal(el('battlesScrollArea').scrollTop,250);
    assert.equal(f.pending.length,0);
    f.run("rankingState.statsCollapsed.avg=true;focusRankingStatsCharacter('role1')");
    assert.equal(f.run('rankingState.statsCollapsed.avg'),false);
    assert.equal(f.run('rankingState.statsCharacterTool'),'role1');
});

test('ranking wheel events do not trigger the battle profile collapse handler', () => {
    const f=fixture(), el=mockElements(f);
    let wheel;
    el('battlesScrollArea').addEventListener=(type,listener)=>{if(type==='wheel')wheel=listener;};
    f.run(`lastActiveTab='ranking';profileCollapsed=false;
        setProfileCollapsed=()=>{throw new Error('ranking must not collapse a battle profile');};initProfileScrollToggle();`);
    wheel({deltaY:120,preventDefault(){throw new Error('ranking wheel was swallowed');}});
    assert.equal(f.run('profileCollapsed'),false);
});

test('shared avatar picker labels are escaped and decorative images do not repeat the button name', () => {
    const f=fixture();
    f.context.roleName='<角色 "test">';
    const html=f.run("renderCharPickerTrigger({onclick:'openInsightCharacterPicker()',value:roleName,imgMap:{[roleName]:'https://fixture.invalid/role.png'}})");
    assert.ok(html.includes('&lt;角色 &quot;test&quot;&gt;'));
    assert.ok(!html.includes('<角色'));
    assert.ok(html.includes('alt=""'));
    assert.ok(html.includes('aria-haspopup="dialog"'));
});

function notebookFixture(initial) {
    const f=fixture(), el=mockElements(f), storage=new Map(initial ? [['sf6_matchup_notes_v1',initial]] : []);
    f.context.localStorage={getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value)};
    f.context.document.querySelectorAll=()=>[];
    f.run('loadMatchupNotebook()');
    return {...f,el,storage};
}

test('plain matchup notes autosave offline by role pair, not queried player', () => {
    const f=notebookFixture();
    f.run(`cookie=null;isLoggedIn=false;queriedUserId='999';
        matchupNotebook.ownId=4;matchupNotebook.opponentId=10;updateNotebookContent('春丽对肯');
        matchupNotebook.ownId=1;updateNotebookContent('隆对肯');
        matchupNotebook.ownId=4;matchupNotebook.opponentId=9;updateNotebookContent('春丽对嘉米');`);
    const notes=JSON.parse(f.storage.get('sf6_matchup_notes_v1')).notes;
    assert.equal(notes.length,3);
    assert.ok(notes.some(n=>n.ownId===4 && n.opponentId===10 && n.content==='春丽对肯'));
    assert.ok(notes.some(n=>n.ownId===1 && n.content==='隆对肯'));
    assert.ok(!f.storage.get('sf6_matchup_notes_v1').includes('999'));
    assert.equal(f.pending.length,0);
});

test('old structured notes and saved sources migrate to editable text without data loss', () => {
    const f=notebookFixture(JSON.stringify({version:1,notes:[{ownId:4,opponentId:10,situation:'问题',answer:'我的应对',
        test:'测试记录',version:'old-version',sourcesText:'https://example.com/personal',references:[{title:'旧参考',fact:'机制',practice:'练法',
            source:{url:'https://example.com/source',title:'原文标题',publisher:'作者',published:'2022-01-01',checked:'2026-10-16'}}]}]}));
    const exported=JSON.parse(f.run('serializeMatchupNotebook()'));
    assert.equal(exported.version,2);
    for (const text of ['问题','我的应对','测试记录','old-version','https://example.com/personal','旧参考','机制','练法','原文标题','作者','2022-01-01','2026-10-16','https://example.com/source']) assert.ok(exported.notes[0].content.includes(text),text);
    f.run(String.raw`updateNotebookContent(currentNotebookEntry().content+'\n补充')`);
    assert.ok(f.run('currentNotebookEntry().content').endsWith('补充'));
});

test('notebook only renders one empty text box with no built-in strategy or validation controls', () => {
    const f=notebookFixture();
    f.run('renderMatchupNotebook()');
    const html=f.el('battlesScrollArea').innerHTML;
    assert.equal((html.match(/<textarea /g)||[]).length,1);
    assert.ok(!/参考与练习|已实测|待验证|建议练法|游戏版本/.test(html));
    assert.equal(f.run('currentNotebookEntry().content'),'');
});

test('storage failure retains a draft for export and retries without losing other role notes', () => {
    const f=notebookFixture();
    let fail=true;
    f.context.localStorage.setItem=(key,value)=>{if(fail)throw Error('quota');f.storage.set(key,value);};
    f.run("updateNotebookContent('尚未保存的草稿')");
    assert.equal(f.run('matchupNotebook.dirty.size'),1);
    assert.ok(f.run('serializeMatchupNotebook()').includes('尚未保存的草稿'));
    assert.ok(f.el('notebookStatus').textContent.includes('尚未保存'));
    f.storage.set('sf6_matchup_notes_v1',JSON.stringify({version:1,notes:[{ownId:0,opponentId:9,answer:'另一个窗口的笔记'}]}));
    fail=false;
    assert.equal(f.run('persistMatchupNotebook()'),true);
    assert.equal(f.run('matchupNotebook.notes.size'),2);
    assert.equal(f.run('matchupNotebook.dirty.size'),0);
});

test('corrupt notebook storage is preserved verbatim and never overwritten by a new edit', () => {
    const f=notebookFixture('{corrupt');
    f.run("updateNotebookContent('new')");
    assert.equal(f.storage.get('sf6_matchup_notes_v1'),'{corrupt');
    assert.equal(f.run('matchupNotebook.readBlocked'),true);
    assert.equal(JSON.parse(f.run('serializeMatchupNotebook()')).raw,'{corrupt');
});

test('notebook import validates the whole backup first and never overwrites an existing strategy', () => {
    const f=notebookFixture();
    f.run("updateNotebookContent('existing')");
    f.context.backup=JSON.stringify({version:1,notes:[{ownId:4,opponentId:10,answer:'overwrite'},
        {ownId:4,opponentId:9,answer:'new',cookie:'must not survive'}]});
    const result=f.run('importMatchupNotebookText(backup)');
    assert.equal(result.added,1); assert.equal(result.skipped,1);
    assert.equal(f.run('currentNotebookEntry().content'),'existing');
    assert.ok(!f.run('serializeMatchupNotebook()').includes('must not survive'));
    const before=f.storage.get('sf6_matchup_notes_v1');
    f.context.backup=JSON.stringify({version:1,notes:[{ownId:0,opponentId:1,answer:'valid'},
        {ownId:-1,opponentId:9,answer:'invalid'}]});
    assert.throws(()=>f.run('importMatchupNotebookText(backup)'));
    assert.equal(f.storage.get('sf6_matchup_notes_v1'),before);
});

test('notebook content is escaped plain text, never rendered as HTML or links', () => {
    const f=notebookFixture();
    f.context.hostile='</textarea><img src=x onerror=alert(1)>';
    f.run(String.raw`updateNotebookContent(hostile+'\njavascript:alert(1)');renderMatchupNotebook();`);
    const html=f.el('battlesScrollArea').innerHTML;
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;/textarea&gt;'));
    assert.ok(!html.includes('<a '));
});

test('training links notebook to the opponent and current character without mixing player identity', () => {
    const f=fixture();
    f.run(`globalThis.opened=null;switchTab=tab=>{opened=tab;};
        playerInsights.characterId=4;matchData=[{opponent_character_id:10,opponent_character:'Ken'}];
        openMatchupNotesFor('Ken');`);
    assert.equal(f.run('opened'),'notes');
    assert.equal(f.run('matchupNotebook.ownId'),4);
    assert.equal(f.run('matchupNotebook.opponentId'),10);
    assert.equal(f.run('notebookUrl()'),'/notes?opponent=10&character=4');
});

function authStorageFixture() {
    const f=fixture(), el=mockElements(f), persistent=new Map(), session=new Map();
    const adapter=map=>({getItem:key=>map.get(key) ?? null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
    f.context.localStorage=adapter(persistent);
    f.context.window.sessionStorage=adapter(session);
    return {...f,el,persistent,session};
}

test('new login defaults to session storage and removes an old persistent credential', () => {
    const f=authStorageFixture();
    f.persistent.set('sf6_login_state','legacy');
    f.run('rememberLogin=false;storeLoginState()');
    assert.equal(f.persistent.has('sf6_login_state'),false);
    assert.equal(JSON.parse(f.session.get('sf6_login_state')).cookie,'test');
    assert.equal(f.run('loadLoginState()'),true);
    assert.equal(f.run('rememberLogin'),false);
});

test('remembering login is opt-in and session credentials are removed when selected', () => {
    const f=authStorageFixture();
    f.session.set('sf6_login_state','old');
    f.run('rememberLogin=true;storeLoginState()');
    assert.equal(f.session.has('sf6_login_state'),false);
    assert.equal(JSON.parse(f.persistent.get('sf6_login_state')).cookie,'test');
    assert.equal(f.run('loadLoginState()'),true);
    assert.equal(f.run('rememberLogin'),true);
});

test('malformed or expired saved credentials are not accepted and do not clear notes', () => {
    for (const timestamp of [0,'yesterday']) {
        const f=authStorageFixture();
        f.persistent.set('sf6_matchup_notes_v1','notes');
        f.persistent.set('sf6_login_state',JSON.stringify({cookie:'fixture',userInfo:{user_id:'100'},timestamp}));
        assert.equal(f.run('loadLoginState()'),false);
        assert.equal(f.persistent.has('sf6_login_state'),false);
        assert.equal(f.persistent.get('sf6_matchup_notes_v1'),'notes');
    }
});

test('blocked session storage never falls back to silently persisting a credential', () => {
    const f=authStorageFixture();
    f.persistent.set('sf6_login_state','old');
    f.context.window.sessionStorage.setItem=()=>{throw Error('blocked');};
    f.run('rememberLogin=false;storeLoginState()');
    assert.equal(f.persistent.has('sf6_login_state'),false);
    assert.equal(f.session.size,0);
    assert.equal(f.run('cookie'),'test');
});

test('logout clears both credential stores without removing personal notes', async () => {
    const f=authStorageFixture();
    f.persistent.set('sf6_login_state','saved');f.session.set('sf6_login_state','saved');
    f.persistent.set('sf6_matchup_notes_v1','notes');
    f.run('globalThis.done=clearLoginState()');
    f.pending[0].resolve({ok:true});await f.context.done;
    assert.equal(f.persistent.has('sf6_login_state'),false);
    assert.equal(f.session.has('sf6_login_state'),false);
    assert.equal(f.persistent.get('sf6_matchup_notes_v1'),'notes');
});

test('normal browser entry only opens official page and does not start WebDriver or accept login', async () => {
    const f=fixture(), el=mockElements(f);
    f.run('isLoggedIn=false;globalThis.done=openOfficialLogin()');
    assert.equal(f.pending.length,1);
    assert.ok(f.pending[0].url.endsWith('/api/login/open-official'));
    assert.equal(f.pending[0].options.body,undefined);
    f.pending[0].resolve({ok:true,json:async()=>({success:true})});await f.context.done;
    assert.equal(f.run('isLoggedIn'),false);
    assert.equal(f.run('sessionId'),null);
    assert.ok(el('officialLoginStatus').textContent.includes('不会自动读取普通浏览器'));
});

test('login palettes keep body, helper, link and placeholder text readable in every theme', () => {
    const css=fs.readFileSync(path.join(__dirname,'../web/styles.css'),'utf8');
    const block=selector=>{
        const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const rule=css.match(new RegExp('(?:^|\\n)\\s*'+escaped+'\\s*\\{([^}]+)\\}'));
        assert.ok(rule,selector);return rule[1];
    };
    const luminance=hex=>{
        const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
            .map(v=>v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    for (const [selector,background] of [['.login-modal-content','#1a1a1a'],
            ['body.light-theme .login-modal-content','#ffffff'],['body.sf6-theme .login-modal-content','#12214a']]) {
        const values=Object.fromEntries([...block(selector).matchAll(/--login-([a-z]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
        for (const key of ['text','muted','link']) assert.ok(contrast(values[key],background)>=4.5,`${selector} ${key}`);
        assert.ok(contrast(values.placeholder,values.field)>=4.5,`${selector} placeholder`);
    }
    for (const prefix of ['#loginModal','body.light-theme #loginModal']) {
        for (const state of ['error','info','success']) {
            const rule=block(`${prefix} .status.${state}`);
            const text=rule.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})/)[1];
            const background=rule.match(/background:\s*(#[0-9a-f]{6})/)[1];
            assert.ok(contrast(text,background)>=4.5,`${prefix} ${state}`);
        }
    }
    // Retain the scoped fixes against generic desktop label/link/input overrides.
    assert.ok(block('#loginModal .login-hint').includes('var(--login-muted) !important'));
    assert.ok(block('#loginModal #cookieInput').includes('var(--login-text) !important'));
    assert.ok(block('#loginModal .login-official-link').includes('var(--login-link) !important'));
});

test('favorite battle notes autosave by replay ID without changing status or replacing the editor', () => {
    const f=authStorageFixture();
    f.run(String.raw`favoriteBattles=[{replay_id:'A',status:'pending'},{replay_id:'B',status:'watched',note:'已有备注'}];
        renderFavoritesPage=()=>{throw Error('must not rerender while typing');};
        updateFavoriteBattleNote('A','第一行\n第二行');`);
    const rows=JSON.parse(f.persistent.get('sf6_favorite_battles'));
    assert.equal(rows[0].note,'第一行\n第二行');assert.equal(rows[0].status,'pending');
    assert.equal(rows[1].note,'已有备注');assert.equal(rows[1].status,'watched');
    f.run('favoriteBattles=[];loadFavoriteBattles()');
    assert.equal(f.run('favoriteBattles[0].note'),'第一行\n第二行');
    assert.equal(f.run('favoriteNoteDirty.size'),0);
});

test('favorite note text is escaped and missing notes remain backwards compatible', () => {
    const f=authStorageFixture();
    f.context.hostile='</textarea><img src=x onerror=alert(1)>';
    const html=f.run("favoriteBattleNoteHtml({replay_id:'a\"b',note:hostile})");
    assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;/textarea&gt;'));
    assert.ok(f.run("favoriteBattleNoteHtml({replay_id:'old'})").includes('添加对局备注'));
    f.run(`favoriteBattles=[{replay_id:'old',status:'pending',note:'要保留'}];renderFavoritesPage=()=>{};
        toggleBattleStatus('old');`);
    assert.equal(f.run('favoriteBattles[0].note'),'要保留');
});

test('favorite note save failures keep a draft, expose retry, and never claim saved', () => {
    const f=authStorageFixture();
    f.context.localStorage.setItem=()=>{throw Error('quota');};
    f.run("favoriteBattles=[{replay_id:'A',status:'pending'}];updateFavoriteBattleNote('A','草稿')");
    assert.equal(f.run('favoriteBattles[0].note'),'草稿');assert.equal(f.run('favoriteNoteDirty.size'),1);
    const status=f.el('favorite-note-A-status').textContent;
    assert.ok(status.includes('尚未保存'));
    assert.ok(f.run('favoriteBattleNoteHtml(favoriteBattles[0])').includes(' open>'));
    f.context.localStorage.setItem=(key,value)=>f.persistent.set(key,value);
    f.run("retryFavoriteBattleNote('A')");
    assert.equal(f.run('favoriteNoteDirty.size'),0);
    assert.equal(JSON.parse(f.persistent.get('sf6_favorite_battles'))[0].note,'草稿');
    assert.equal(f.el('favorite-note-A-status').textContent,'已保存');
});

test('empty favorite notes can be saved without removing the favorite, and invalid IDs do nothing', () => {
    const f=authStorageFixture();
    f.run("favoriteBattles=[{replay_id:'A',status:'watched',note:'old'}];updateFavoriteBattleNote('A','');updateFavoriteBattleNote('missing','bad')");
    assert.equal(f.run('favoriteBattles.length'),1);assert.equal(f.run('favoriteBattles[0].note'),'');
    assert.equal(f.run('favoriteBattles[0].status'),'watched');
});
