// Filtering is shared by list, charts, summary, report, and export.
function currentBattleFilters() {
    return {character: selectedCharacter, opponent: selectedOpponentCharacter, result: resultFilter,
        from: dateFrom, to: dateTo, review: reviewFilter, type: isHistoryMode ? currentBattleType : 'all',
        reviews: new Map(favoriteBattles.map(record => [record.replay_id, record.status]))};
}

function recordBattleType(record) {
    const text = String(record.battle_type || '').toLowerCase();
    if (/rank|排位|ランク/.test(text)) return 'rank';
    if (/casual|休闲|カジュアル/.test(text)) return 'casual';
    if (/custom|自定义|比赛间|カスタム/.test(text)) return 'custom';
    if (/hub|大厅|ハブ/.test(text)) return 'hub';
    return '';
}

function filterBattleRecords(records, filters) {
    return records.filter(record => {
        const day = String(record.date || '').slice(0, 10);
        const result = String(record.my_result || '').toLowerCase();
        if (filters.character && record.my_character !== filters.character) return false;
        if (filters.opponent && record.opponent_character !== filters.opponent) return false;
        if (filters.result === 'win' && !/win|胜/.test(result)) return false;
        if (filters.result === 'lose' && !/lose|负|败/.test(result)) return false;
        if ((filters.from || filters.to) && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
        if (filters.from && day < filters.from) return false;
        if (filters.to && day > filters.to) return false;
        if (filters.type && filters.type !== 'all' && recordBattleType(record) !== filters.type) return false;
        if (filters.review && filters.review !== 'all' && filters.reviews.get(record.replay_id) !== filters.review) return false;
        return true;
    });
}

function changeBattleFilter(key, value) {
    const nextFrom = key === 'from' ? value : dateFrom;
    const nextTo = key === 'to' ? value : dateTo;
    if (nextFrom && nextTo && nextFrom > nextTo) {
        document.getElementById('filterStatus').textContent = '开始日期不能晚于结束日期';
        return;
    }
    if (key === 'result') resultFilter = value;
    else if (key === 'from') dateFrom = value;
    else if (key === 'to') dateTo = value;
    else if (key === 'review') reviewFilter = value;
    currentPage = 1;
    pendingBattleScroll = 0;
    renderContent();
}

function resetBattleFilters() {
    selectedCharacter = selectedOpponentCharacter = dateFrom = dateTo = '';
    resultFilter = reviewFilter = 'all';
    currentPage = 1;
    pendingBattleScroll = 0;
    renderContent();
}

function renderBattleFilters() {
    const chips = [selectedCharacter && `我方：${getCharacterDisplayName(selectedCharacter)}`,
        selectedOpponentCharacter && `对手：${getCharacterDisplayName(selectedOpponentCharacter)}`,
        resultFilter !== 'all' && (resultFilter === 'win' ? '只看胜局' : '只看负局'),
        dateFrom && `从 ${dateFrom}`, dateTo && `至 ${dateTo}`,
        reviewFilter !== 'all' && (reviewFilter === 'pending' ? '待复盘' : '已复盘')].filter(Boolean);
    return `<div class="battle-filter-panel">
        <div class="battle-filter-fields">
            <label>胜负<select aria-label="胜负筛选" onchange="changeBattleFilter('result',this.value)">
                <option value="all">全部结果</option><option value="win" ${resultFilter === 'win' ? 'selected' : ''}>胜局</option><option value="lose" ${resultFilter === 'lose' ? 'selected' : ''}>负局</option></select></label>
            <label>开始日期<input aria-label="开始日期" type="date" value="${escapeHtml(dateFrom)}" onchange="changeBattleFilter('from',this.value)"></label>
            <label>结束日期<input aria-label="结束日期" type="date" value="${escapeHtml(dateTo)}" onchange="changeBattleFilter('to',this.value)"></label>
            <label>复盘<select aria-label="复盘筛选" onchange="changeBattleFilter('review',this.value)">
                <option value="all">全部对局</option><option value="pending" ${reviewFilter === 'pending' ? 'selected' : ''}>待复盘</option><option value="watched" ${reviewFilter === 'watched' ? 'selected' : ''}>已复盘</option></select></label>
            <button class="subtle-button" onclick="resetBattleFilters()">重置筛选</button>
            <div class="battle-export-actions"><button data-export onclick="exportBattleRecords('csv')">导出 CSV</button><button data-export onclick="exportBattleRecords('json')">导出 JSON</button></div>
        </div>
        <div class="active-filter-row">${chips.length ? chips.map(chip => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join('') : '<span>未设置筛选条件</span>'}
            <span id="filterStatus" role="status"></span><span id="exportStatus" role="status"></span></div>
    </div>`;
}

function renderBattleOverview() {
    const info = isHistoryMode ? historyData.userInfo : isQueryMode ? queryData.userInfo : currentUserInfo;
    const name = info?.player_name || playerProfile?.player_name || (isHistoryMode ? '本地历史' : '玩家战绩');
    const id = isHistoryMode ? historyState.playerId : (queriedUserId || currentUserInfo.user_id);
    const records = getFilteredData();
    const wins = records.filter(isWinRecord).length;
    const reviews = new Map(favoriteBattles.map(fav => [fav.replay_id, fav.status]));
    const pending = records.filter(record => reviews.get(record.replay_id) === 'pending').length;
    const latest = records.reduce((last, record) => !last || String(record.date) > String(last.date) ? record : last, null);
    const metric = selectedCharacter ? (latest?.my_master_rating > 0 ? '最新 MR' : '最新 LP') : '使用角色';
    const value = selectedCharacter ? (latest?.my_master_rating || latest?.my_lp || '—') : new Set(records.map(record => record.my_character).filter(Boolean)).size;
    return `<section class="battle-overview">
        <div class="battle-overview-heading"><div><span class="source-badge">${isHistoryMode ? '本地历史 · 离线可用' : '官网近期记录'}</span>
            <h2>${escapeHtml(name)} <small>${escapeHtml(id || '')}</small></h2></div>
            <button class="primary-action" id="refreshBtn" onclick="refreshData()" ${isHistoryMode ? historyState.loading ? 'disabled' : '' : (isQueryMode ? queryData.loading : homeData.loading) ? 'disabled' : ''}>${isHistoryMode ? '刷新本地' : '同步官网'}</button></div>
        <div class="battle-overview-metrics"><div><span>筛选记录</span><strong>${records.length}</strong></div>
            <div><span>筛选胜率</span><strong>${records.length ? (wins * 100 / records.length).toFixed(1) + '%' : '—'}</strong></div>
            <div><span>${metric}</span><strong>${escapeHtml(value)}</strong></div><div><span>待复盘</span><strong>${pending}</strong></div></div>
    </section>`;
}

function setBattleReview(replayId, status) {
    if (!['pending', 'watched'].includes(status)) return;
    let favorite = favoriteBattles.find(record => record.replay_id === replayId);
    if (!favorite) {
        const record = matchData.find(item => item.replay_id === replayId);
        if (!record) return;
        favorite = {...record, status, addedAt: Date.now()};
        favoriteBattles.unshift(favorite);
    }
    favorite.status = status;
    saveFavoriteBattles();
    renderContent();
}

function renderBattleReviewActions(record) {
    const favorite = favoriteBattles.find(item => item.replay_id === record.replay_id);
    if (!record.replay_id) return '';
    return `<div class="match-review-actions">
        <button onclick="copyToClipboard(${inlineJsString(record.replay_id)},event)">复制录像码</button>
        <button onclick="toggleBattleFavoriteById(${inlineJsString(record.replay_id)})">${favorite ? '★ 取消收藏' : '☆ 收藏待复盘'}</button>
        <button class="${favorite?.status === 'watched' ? 'review-done' : ''}" onclick="setBattleReview(${inlineJsString(record.replay_id)},${inlineJsString(favorite?.status === 'watched' ? 'pending' : 'watched')})">${favorite?.status === 'watched' ? '✓ 已复盘 · 重标待复盘' : '标记已复盘'}</button>
    </div>`;
}
