// Responsibility module: battle-data.js. Shared bindings are declared in state.js; loaded with defer.
function refreshSubNavActive() {
    document.querySelectorAll('.sub-nav-item').forEach(el => {
        const type = el.dataset.type;
        if (type) {
            // 带对战类型属性的项：当前类型匹配即选中（主页/旧版两处导航通用）
            el.classList.toggle('active', currentBattleType === type);
        } else {
            const mode = el.dataset.mode || 'battles';
            el.classList.toggle('active', currentViewMode === mode);
        }
    });
}

function switchBattleType(battleType) {
    if (battleType === currentBattleType) return;
    if (isHistoryMode) {
        currentBattleType = battleType;
        currentPage = 1;
        pendingBattleScroll = 0;
        renderContent();
        return;
    }
    currentBattleType = battleType;
    currentPage = 1;  // 重置页码
    matchData = [];  // 清空数据
    selectedCharacter = '';  // 重置角色选择
    selectedOpponentCharacter = '';  // 重置对手筛选
    refreshSubNavActive();  // 立即反馈选中状态

    // 根据模式加载数据
    if (isQueryMode && queriedUserId) {
        // 查询模式：重新查询该玩家的新类型数据
        queryPlayerByType(queriedUserId, battleType);
    } else if (isLoggedIn) {
        // 主页模式：刷新登录用户的数据
        autoCrawlData();
    }
}

function isCurrentBattleTarget(userId, battleType) {
    return isBattlePageActive()
        && currentBattleType === battleType
        && (userId ? lastActiveTab === 'query' && isQueryMode && queriedUserId === userId
                   : lastActiveTab === 'home' && !isQueryMode);
}

async function loadBattleRecords(userId = null, battleType = currentBattleType, pages = 10, maxWorkers = 5) {
    if (!cookie || !isLoggedIn) return;
    const requestKey = JSON.stringify([userId, battleType, pages, maxWorkers, accountEpoch]);
    if (battleFetchCtrl?.requestKey === requestKey && !battleFetchCtrl.signal.aborted) return;
    if (battleFetchCtrl) battleFetchCtrl.abort();
    const controller = new AbortController();
    controller.requestKey = requestKey;
    battleFetchCtrl = controller;
    const requestCookie = cookie;
    const target = userId ? queryData : homeData;
    if (userId && target.userId !== userId) target.userInfo = {user_id: userId, player_name: `玩家${userId}`};
    if (battleRequestTarget) battleRequestTarget.loading = false;
    battleRequestTarget = target;
    if ((userId && target.userId !== userId) || (target.battleType && target.battleType !== battleType)) {
        Object.assign(target, { matchData: [], profile: null, collection: null, loaded: false });
        if (isCurrentBattleTarget(userId, battleType)) {
            matchData = [];
            playerProfile = null;
        }
    }
    if (userId) target.userId = userId;
    target.battleType = battleType;
    target.error = '';
    target.loading = true;
    target.collection = {requested_pages: pages, fetched_pages: 0, profile_complete: false, complete: false};
    const previousRecords = target.matchData;
    if (isCurrentBattleTarget(userId, battleType)) {
        matchData = target.matchData;
        playerProfile = target.profile;
        renderContent();
    }
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    try {
        const response = await fetch(`${API_BASE}/api/${userId ? 'query-player' : 'crawl'}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({
                ...(userId ? {user_id: userId} : {}),
                cookie: requestCookie, pages, max_workers: maxWorkers, battle_type: battleType, stream: true
            })
        });
        const data = await readCollectionResponse(response, event => {
            if (battleFetchCtrl !== controller || requestCookie !== cookie || controller.signal.aborted) return;
            target.collection = event.collection;
            if (event.has_records_page) {
                // During refresh, keep older visible records until the final
                // window arrives so progressive pages do not clamp pagination.
                const merged = new Map([...previousRecords, ...sanitizeRecords(event.data)]
                    .map(record => [record.replay_id, record]));
                target.matchData = [...merged.values()].sort((a, b) =>
                    (parseRecordDate(b)?.getTime() || 0) - (parseRecordDate(a)?.getTime() || 0));
            }
            if (event.player_profile) target.profile = event.player_profile;
            if (event.user_info?.player_name) target.userInfo = event.user_info;
            if (isCurrentBattleTarget(userId, battleType)) {
                matchData = target.matchData;
                playerProfile = target.profile;
                renderContent();
            }
        });
        if (battleFetchCtrl !== controller || requestCookie !== cookie) return;
        if (!response.ok || !data.success) throw new Error(data.detail || '获取战绩失败，请重试');
        if (controller.signal.aborted) return;
        const records = sanitizeRecords(data.data);
        const info = data.user_info || (userId ? {user_id: userId, player_name: `玩家${userId}`} : currentUserInfo);
        Object.assign(target, {
            matchData: records, userInfo: info, profile: data.player_profile || null,
            battleType, collection: data.collection || null, history: data.history || null, error: '', loaded: true,
            fetchedAt: new Date().toISOString()
        });
        if (userId) {
            target.userId = userId;
            if (info.player_name) updateFavoritePlayerName(userId, info.player_name);
        } else {
            currentUserInfo = info;
            saveLoginState();
            updateLoginStatus();
        }
        if (isCurrentBattleTarget(userId, battleType)) {
            matchData = records;
            playerProfile = target.profile;
        }
        return data;
    } catch (error) {
        if (battleFetchCtrl !== controller || requestCookie !== cookie) return;
        if (error.name === 'AbortError' && !timedOut) return;
        target.error = timedOut ? '请求超时，请稍后重试' : error.message;
        console.warn('战绩加载失败:', target.error);
    } finally {
        clearTimeout(timeout);
        if (battleFetchCtrl === controller) {
            target.loading = false;
            battleFetchCtrl = null;
            if (isCurrentBattleTarget(userId, battleType)) renderContent();
        }
    }
}

async function refreshHomeData() {
    return loadBattleRecords(isQueryMode ? queriedUserId : null);
}

async function autoCrawlData() {
    return loadBattleRecords();
}

async function crawlData() {
    const pages = Number(document.getElementById('pages')?.value || 10);
    const workers = Number(document.getElementById('maxWorkers')?.value || 5);
    return loadBattleRecords(null, currentBattleType, pages, workers);
}

async function refreshData() {
    if (isHistoryMode) return loadHistoryRecords();
    return loadBattleRecords(isQueryMode ? queriedUserId : null);
}
