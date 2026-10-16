// Local reads work offline. Only the explicit update action contacts the official API.
function historyIsCurrent(id, epoch) {
    return id === historyFetchId && epoch === accountEpoch && lastActiveTab === 'history' && isHistoryMode;
}

function beginHistoryRequest() {
    historyFetchCtrl?.abort();
    historyFetchCtrl = new AbortController();
    historyState.loading = true;
    historyState.error = '';
    historyState.updateError = false;
    return {id: ++historyFetchId, epoch: accountEpoch, signal: historyFetchCtrl.signal};
}

async function showHistoryPage() {
    isHistoryMode = true;
    isQueryMode = false;
    lastActiveTab = 'history';
    hideSettingsPage();
    document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.toggle('active', tab.textContent.includes('本地历史')));
    const request = beginHistoryRequest();
    playerProfile = historyData.profile || null;
    matchData = historyData.matchData;
    renderContent();
    try {
        const data = await apiJson('/api/history/players', request);
        if (!historyIsCurrent(request.id, request.epoch)) return;
        historyState.players = data.players;
        const preferred = data.players.find(player => player.user_id === historyState.playerId)
            || data.players.find(player => player.user_id === currentUserInfo.user_id) || data.players[0];
        if (preferred) return selectHistoryPlayer(preferred.user_id);
        historyState.playerId = '';
        historyData = {matchData: [], userInfo: {}, loaded: true, total: 0, hasMore: false};
        matchData = [];
        playerProfile = null;
    } catch (error) {
        if (!historyIsCurrent(request.id, request.epoch)) return;
        historyState.error = error.name === 'AbortError' ? '读取本地历史超时，请重试' : error.message;
    } finally {
        if (historyIsCurrent(request.id, request.epoch)) {
            historyState.loading = false;
            renderContent();
        }
    }
}

function selectHistoryPlayer(playerId) {
    historyUpdateCtrl?.abort();
    historyUpdateCtrl = null;
    historyState.updating = false;
    historyState.message = '';
    historyState.error = '';
    historyState.updateError = false;
    saveBattleView();
    historyState.playerId = playerId;
    restoreBattleView(`history:${playerId}`);
    historyData = {matchData: [], userInfo: historyState.players.find(p => p.user_id === playerId) || {},
        profile: null, profileUpdatedAt: null, loaded: false, total: 0, hasMore: false, nextOffset: 0};
    matchData = [];
    playerProfile = null;
    return loadHistoryRecords();
}

async function updateHistoryData() {
    if (!isHistoryMode || !historyState.playerId || historyState.updating || historyState.loading) return;
    if (!cookie || !isLoggedIn) {
        historyState.message = '更新需要联网登录；登录后再次点击“更新”。';
        renderContent();
        showLoginModal();
        return;
    }
    const playerId = historyState.playerId, epoch = accountEpoch, requestCookie = cookie;
    const controller = new AbortController();
    historyUpdateCtrl = controller;
    historyState.updating = true;
    historyState.updateError = false;
    historyState.error = '';
    historyState.message = '正在连接 · 0/10，等待官网响应；已有本地记录仍可查看…';
    const isCurrent = () => historyUpdateCtrl === controller && epoch === accountEpoch
        && requestCookie === cookie && isHistoryMode && lastActiveTab === 'history'
        && historyState.playerId === playerId;
    const timeout = setTimeout(() => controller.abort(), 60000);
    renderContent();
    try {
        const response = await fetch(`${API_BASE}/api/query-player`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
            body: JSON.stringify({user_id: playerId, cookie: requestCookie,
                pages: 10, max_workers: 5, battle_type: 'all', stream: true})
        });
        const data = await readCollectionResponse(response, event => {
            if (!isCurrent()) return;
            historyState.message = `正在联网更新：已读取 ${event.collection.fetched_pages}/${event.collection.requested_pages} 页，已有本地记录仍可查看…`;
            renderContent();
        });
        if (!isCurrent() || controller.signal.aborted) return;
        if (data.history?.saved !== true) throw new Error(data.history?.warning || '查询已完成，但保存失败，请重试更新');
        // Re-read the merged archive, not just the latest online window.
        const players = await apiJson('/api/history/players', {signal: controller.signal});
        if (!isCurrent()) return;
        historyState.players = players.players;
        await loadHistoryRecords();
        if (!isCurrent()) return;
        if (!historyState.error) historyState.message = data.collection?.complete === false
            ? `已保存本次成功获取的记录；${(data.collection.failed_pages || []).length} 页失败，${data.collection.failed_records || 0} 条解析失败${data.collection.profile_complete === false ? '，资料未更新' : ''}。可再次更新补齐。`
            : `更新完成，本地共 ${historyData.total} 条记录。`;
    } catch (error) {
        if (!isCurrent()) return;
        historyState.message = '';
        historyState.error = error.name === 'AbortError'
            ? '更新超时，本地记录已保留，可稍后重试。' : `${error.message}；本地记录已保留。`;
        historyState.updateError = true;
    } finally {
        clearTimeout(timeout);
        if (historyUpdateCtrl === controller) {
            historyUpdateCtrl = null;
            historyState.updating = false;
            if (isHistoryMode && lastActiveTab === 'history') renderContent();
        }
    }
}

async function loadHistoryRecords(append = false) {
    if (!historyState.playerId) return;
    const request = beginHistoryRequest();
    const offset = append ? historyData.nextOffset : 0;
    renderContent();
    try {
        const params = new URLSearchParams({player_id: historyState.playerId,
            offset: String(offset), limit: '2000'});
        const data = await apiJson(`/api/history/records?${params}`, request);
        if (!historyIsCurrent(request.id, request.epoch)) return;
        const rows = append ? [...historyData.matchData, ...data.data] : data.data;
        historyData.matchData = [...new Map(rows.map(record => [record.replay_id, record])).values()];
        Object.assign(historyData, {loaded: true, total: data.total_records, hasMore: data.has_more,
            nextOffset: offset + data.data.length, profile: data.player_profile || null,
            profileUpdatedAt: data.profile_updated_at || null,
            userInfo: data.user_info || historyData.userInfo});
        matchData = historyData.matchData;
        playerProfile = historyData.profile;
    } catch (error) {
        if (!historyIsCurrent(request.id, request.epoch)) return;
        historyState.error = error.name === 'AbortError' ? '读取本地历史超时，请重试' : error.message;
    } finally {
        if (historyIsCurrent(request.id, request.epoch)) {
            historyState.loading = false;
            renderContent();
        }
    }
}

function renderHistoryControls() {
    return `<div class="history-controls">
        <label>本地玩家<select aria-label="历史玩家" onchange="selectHistoryPlayer(this.value)">
            ${historyState.players.length ? historyState.players.map(p => `<option value="${escapeHtml(p.user_id)}" ${p.user_id === historyState.playerId ? 'selected' : ''}>${escapeHtml(p.player_name)} · ${p.total_records} 条</option>`).join('') : '<option>暂无保存的玩家</option>'}</select></label>
        <span>${historyData.profileUpdatedAt
            ? `资料保存于 ${escapeHtml(new Date(historyData.profileUpdatedAt).toLocaleString('zh-CN'))}`
            : '离线查看已保存的玩家资料与战绩'}</span>
        <button type="button" class="refresh-btn history-update-btn" onclick="updateHistoryData()"
            ${!historyState.playerId || historyState.loading || historyState.updating ? 'disabled' : ''}
            title="联网获取当前玩家的近期战绩与资料，合并保存到本地">${historyState.updating ? '更新中…' : '更新'}</button></div>`;
}
