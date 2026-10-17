// Responsibility module: reviews.js. Shared bindings are declared in state.js; loaded with defer.
// ========== 收藏对局功能 ==========
const favoriteNoteDirty = new Set();
function favoriteNoteElementId(replayId) { return `favorite-note-${encodeURIComponent(replayId)}`; }
function favoriteNoteSummary(note) {
    return note ? `${uiText('对局备注')} · ${note.replace(/\s+/g,' ').slice(0,60)}${note.length>60 ? '…' : ''}` : uiText('添加对局备注');
}
function favoriteBattleNoteHtml(battle) {
    const id=favoriteNoteElementId(battle.replay_id),note=typeof battle.note==='string' ? battle.note : '';
    const dirty=favoriteNoteDirty.has(battle.replay_id);
    return `<details class="favorite-note" ${dirty ? 'open' : ''}>
        <summary><span id="${escapeHtml(id)}-summary">${escapeHtml(favoriteNoteSummary(note))}</span></summary>
        <textarea class="personal-note-input" aria-label="${escapeHtml(`对局备注：${battle.replay_id}`)}" rows="3" maxlength="10000" placeholder="写下这场对局想记住的内容…" oninput="updateFavoriteBattleNote(${inlineJsString(battle.replay_id)},this.value)">${escapeHtml(note)}</textarea>
        <div class="favorite-note-save"><span id="${escapeHtml(id)}-status" role="status">${dirty ? '尚未保存，草稿仍在本页' : (note ? '已保存' : '自动保存到本机')}</span>
        <button class="report-more-btn ${dirty ? '' : 'notebook-hidden'}" id="${escapeHtml(id)}-retry" onclick="retryFavoriteBattleNote(${inlineJsString(battle.replay_id)})">重试保存</button></div>
        </details>`;
}
function updateFavoriteBattleNote(replayId,value) {
    const battle=favoriteBattles.find(b=>b.replay_id===replayId);
    if (!battle || typeof value!=='string' || value.length>10000) return;
    battle.note=value;favoriteNoteDirty.add(replayId);
    const saved=saveFavoriteBattles(),affected=saved ? [...favoriteNoteDirty] : [replayId];
    if (saved) favoriteNoteDirty.clear();
    for (const key of affected) {
        const id=favoriteNoteElementId(key),status=document.getElementById(`${id}-status`);
        if (status) status.textContent=saved ? '已保存' : '尚未保存：本地存储不可用或已满，草稿仍在本页，请重试';
        document.getElementById(`${id}-retry`)?.classList.toggle('notebook-hidden',!!saved);
    }
    const summary=document.getElementById(`${favoriteNoteElementId(replayId)}-summary`);
    if (summary) summary.textContent=favoriteNoteSummary(value);
}
function retryFavoriteBattleNote(replayId) {
    const battle=favoriteBattles.find(b=>b.replay_id===replayId);
    if (battle) updateFavoriteBattleNote(replayId,battle.note || '');
}
window.addEventListener('beforeunload',event=>{
    if (favoriteNoteDirty.size) {event.preventDefault();event.returnValue='';}
});

// 加载收藏对局


// 保存收藏对局


// 检查对局是否已收藏
function isBattleFavorited(replayId) {
    if (!replayId) return false;
    return favoriteBattles.some(b => b.replay_id === replayId);
}

// 切换对局收藏状态（通过replay_id从matchData查找记录）
function toggleBattleFavoriteById(replayId) {
    if (!replayId) return;

    const existingIndex = favoriteBattles.findIndex(b => b.replay_id === replayId);

    if (existingIndex !== -1) {
        // 已收藏，取消
        favoriteNoteDirty.delete(replayId);
        favoriteBattles.splice(existingIndex, 1);
        saveFavoriteBattles();
    } else {
        // 未收藏，从matchData中查找记录并添加
        const record = matchData.find(r => r.replay_id === replayId);
        if (!record) return;

        favoriteBattles.unshift({
            replay_id: record.replay_id,
            date: record.date,
            my_result: record.my_result,
            my_character: record.my_character,
            my_character_image: record.my_character_image,
            my_lp: record.my_lp,
            my_master_rating: record.my_master_rating,
            my_league_rank: record.my_league_rank,
            my_input_type: record.my_input_type,
            my_side: record.my_side,
            my_round_results: record.my_round_results,
            my_round_results_raw: record.my_round_results_raw,
            opponent_round_results_raw: record.opponent_round_results_raw,
            player_name: record.player_name,
            opponent_name: record.opponent_name,
            opponent_character: record.opponent_character,
            opponent_character_image: record.opponent_character_image,
            opponent_lp: record.opponent_lp,
            opponent_league_rank: record.opponent_league_rank,
            opponent_input_type: record.opponent_input_type,
            battle_type: record.battle_type,
            status: 'pending',
            addedAt: Date.now()
        });
        saveFavoriteBattles();
    }

    // 重新渲染当前战绩列表以更新星标状态
    if (isBattlePageActive()) {
        renderContent();
    }
}

// 显示收藏对局页面
function showFavoritesPage() {
    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-page') === 'favorites') {
            tab.classList.add('active');
        }
    });

    // 隐藏设置面板
    hideSettingsPage();

    renderFavoritesPage();
}

// 渲染收藏对局页面
function renderFavoritesPage() {
    const fixedNavSection = document.getElementById('fixedNavSection');
    const battlesScrollArea = document.getElementById('battlesScrollArea');

    // 统计各状态数量
    const totalCount = favoriteBattles.length;
    const pendingCount = favoriteBattles.filter(b => b.status === 'pending').length;
    const watchedCount = favoriteBattles.filter(b => b.status === 'watched').length;

    // 渲染筛选栏
    fixedNavSection.innerHTML = `
        <div class="nav-panel">
            <h2>📌 收藏对局</h2>
            <div class="nav-panel-body">
                <div class="sub-nav">
                    <div class="sub-nav-item${favBattleFilter === 'all' ? ' active' : ''}" onclick="setFavFilter('all')">全部<span class="fav-count">${totalCount}</span></div>
                    <div class="sub-nav-item${favBattleFilter === 'pending' ? ' active' : ''}" onclick="setFavFilter('pending')">待复盘<span class="fav-count">${pendingCount}</span></div>
                    <div class="sub-nav-item${favBattleFilter === 'watched' ? ' active' : ''}" onclick="setFavFilter('watched')">已复盘<span class="fav-count">${watchedCount}</span></div>
                </div>
            </div>
        </div>
    `;

    // 筛选数据
    let filteredBattles = favoriteBattles;
    if (favBattleFilter === 'pending') {
        filteredBattles = favoriteBattles.filter(b => b.status === 'pending');
    } else if (favBattleFilter === 'watched') {
        filteredBattles = favoriteBattles.filter(b => b.status === 'watched');
    }

    // 渲染列表
    if (filteredBattles.length === 0) {
        const emptyMsg = favBattleFilter === 'all' ? '还没有收藏对局，在战绩列表中点击 ☆ 收藏' :
            favBattleFilter === 'pending' ? '没有待复盘的对局' : '没有已复盘的对局';
        battlesScrollArea.innerHTML = emptyStateHtml('📌', emptyMsg);
        return;
    }

    let html = '';
    filteredBattles.forEach((battle, index) => {
        const resultClass = (battle.my_result || '').toLowerCase().includes('胜') || (battle.my_result || '').toLowerCase().includes('win') ? 'win' : 'lose';
        const isWatched = battle.status === 'watched';
        const statusText = isWatched ? '✓ 已复盘' : '待复盘';
        const statusClass = isWatched ? 'status-watched' : 'status-pending';
        const nextStatus = isWatched ? 'pending' : 'watched';
        const nextStatusText = isWatched ? '标记待复盘' : '标记已复盘';

        html += `
            <div class="match-card fav-match-card ${isWatched ? 'watched' : ''}">
                <div class="match-header">
                    <span class="match-date">${escapeHtml(battle.date || '未知时间')}</span>
                    <span class="match-result ${resultClass}">${escapeHtml(battle.my_result || '-')}</span>
                    <div class="match-header-right">
                        ${battle.replay_id ? `<span class="replay-id" onclick="copyToClipboard(${inlineJsString(battle.replay_id)}, event)" oncontextmenu="return copyToClipboard(${inlineJsString(battle.replay_id)}, event)" title="点击复制录像码" style="cursor: pointer;">录像: ${escapeHtml(battle.replay_id)}</span>` : ''}
                        <div class="fav-actions">
                            <button class="fav-status-btn ${statusClass}" onclick="toggleBattleStatus(${inlineJsString(battle.replay_id)})" title="${nextStatusText}">${statusText}</button>
                            <button class="fav-remove-btn" onclick="removeBattleFavorite(${inlineJsString(battle.replay_id)})" title="删除">✕</button>
                        </div>
                    </div>
                </div>
                <div class="match-body">
                    <div class="match-player">
                        <div class="player-avatar">
                            ${battle.my_character_image ? `<img src="${escapeHtml(battle.my_character_image)}" alt="${escapeHtml(battle.my_character)}" class="character-img" onerror="handleImageError(this, ${inlineJsString(battle.my_character || "?")})">` : `<div class="character-placeholder">${escapeHtml(battle.my_character || '?')}</div>`}
                        </div>
                        <div class="player-info">
                            <div class="player-name-row">
                                <span class="match-player-name" oncontextmenu="return copyToClipboard(${inlineJsString(battle.player_name || '我')}, event)" title="右键复制名称">${escapeHtml(battle.player_name || '我')}</span>
                            </div>
                            <div class="player-stats-row">
                                <span class="detail-item">LP: ${escapeHtml(battle.my_lp || '-')}</span>
                                <span class="detail-item">${escapeHtml(battle.my_league_rank || '-')}</span>
                                <span class="detail-item ${battle.my_input_type === '经典' ? 'input-classic' : (battle.my_input_type === '现代' ? 'input-modern' : '')}">${escapeHtml(battle.my_input_type || '-')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="match-vs">${renderRoundScoreHTML(battle) || 'VS'}</div>
                    <div class="match-player">
                        <div class="player-avatar">
                            ${battle.opponent_character_image ? `<img src="${escapeHtml(battle.opponent_character_image)}" alt="${escapeHtml(battle.opponent_character)}" class="character-img" onerror="handleImageError(this, ${inlineJsString(battle.opponent_character || "?")})">` : `<div class="character-placeholder">${escapeHtml(battle.opponent_character || '?')}</div>`}
                        </div>
                        <div class="player-info">
                            <div class="player-name-row">
                                <span class="match-player-name">${escapeHtml(battle.opponent_name || '对手')}</span>
                            </div>
                            <div class="player-stats-row">
                                <span class="detail-item">LP: ${escapeHtml(battle.opponent_lp || '-')}</span>
                                <span class="detail-item">${escapeHtml(battle.opponent_league_rank || '-')}</span>
                                <span class="detail-item ${battle.opponent_input_type === '经典' ? 'input-classic' : (battle.opponent_input_type === '现代' ? 'input-modern' : '')}">${escapeHtml(battle.opponent_input_type || '-')}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="match-footer">
                    <span class="side-badge">${battle.my_side === 1 ? '1P' : (battle.my_side === 2 ? '2P' : '')}</span>
                    ${battle.battle_type ? `<span class="battle-type">${escapeHtml(battle.battle_type)}</span>` : ''}
                </div>
                ${favoriteBattleNoteHtml(battle)}
            </div>
        `;
    });

    battlesScrollArea.innerHTML = html;
}

// 设置收藏筛选
function setFavFilter(filter) {
    favBattleFilter = filter;
    renderFavoritesPage();
}

// 切换对局状态（待复盘/已复盘）
function toggleBattleStatus(replayId) {
    const battle = favoriteBattles.find(b => b.replay_id === replayId);
    if (battle) {
        battle.status = battle.status === 'pending' ? 'watched' : 'pending';
        saveFavoriteBattles();
        renderFavoritesPage();
    }
}

// 删除收藏对局
function removeBattleFavorite(replayId) {
    const index = favoriteBattles.findIndex(b => b.replay_id === replayId);
    if (index !== -1) {
        favoriteNoteDirty.delete(replayId);
        favoriteBattles.splice(index, 1);
        saveFavoriteBattles();
        renderFavoritesPage();
    }
}
