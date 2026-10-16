// Responsibility module: search.js. Shared bindings are declared in state.js; loaded with defer.
function showSearchInput() {
    isHistoryMode = false;
    activeBattleViewKey = null;
    lastActiveTab = 'query';
    // 重置为搜索模式
    isQueryMode = false;
    queriedUserId = null;
    currentBattleType = 'all';

    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.includes('查询')) {
            tab.classList.add('active');
        }
    });

    renderQueryPage();
}

async function showSearchPage(userId) {
    isHistoryMode = false;
    // 设置为查询模式
    isQueryMode = true;
    queriedUserId = userId;
    restoreBattleView(`query:${userId}`);

    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.includes('查询')) {
            tab.classList.add('active');
        }
    });

    // 同步更新lastActiveTab，确保从排行榜等其他页面跳转过来时收藏按钮能正常重渲染
    lastActiveTab = 'query';

    // 如果没有cookie,先提示登录
    if (!cookie || !isLoggedIn) {
        renderQueryPage();
        showQueryHint('❌ 请先登录后查看其他玩家战绩', 'error');
        return;
    }

    if (queryData.userId === userId && queryData.battleType === currentBattleType && queryData.loaded) {
        matchData = queryData.matchData;
        playerProfile = queryData.profile;
        renderContent();
        return;
    }

    // 执行查询
    await executeQuery(userId);
}

async function executeQuery(userId) {
    return loadBattleRecords(userId);
}

function cancelNameSearch() {
    ++nameSearchId;
    if (nameSearchCtrl) nameSearchCtrl.abort();
    nameSearchCtrl = null;
}

function renderQueryPage() {
    const fixedNavSection = document.getElementById('fixedNavSection');
    const battlesScrollArea = document.getElementById('battlesScrollArea');

    // 清空可滚动区域
    battlesScrollArea.innerHTML = '';

    // 从 localStorage 加载数据
    loadSearchHistory();
    loadFavoritePlayers();

    // 渲染子标签栏 + 当前子标签内容
    fixedNavSection.innerHTML = `
        <div class="nav-panel">
            <h2>🔍 查询</h2>
            <div class="nav-panel-body">
                <div class="sub-nav">
                    <div class="sub-nav-item${querySubTab === 'search' ? ' active' : ''}" onclick="switchQuerySubTab('search')">查询</div>
                    <div class="sub-nav-item${querySubTab === 'footprint' ? ' active' : ''}" onclick="switchQuerySubTab('footprint')">足迹</div>
                </div>
                <div id="querySubPanel"></div>
                <div id="queryHint"></div>
            </div>
        </div>
    `;

    // 渲染当前子标签内容
    renderQuerySubPanel();

    // 恢复名字搜索结果到右侧内容区（页面重渲染后保持展示）
    if (querySubTab === 'search' && lastSearchResults.length > 0) {
        renderNameSearchResults();
    }
}

// 切换查询页子标签
function switchQuerySubTab(tab) {
    cancelNameSearch();
    querySubTab = tab;
    // 更新标签激活态
    document.querySelectorAll('.sub-nav-item').forEach(el => {
        el.classList.toggle('active', el.textContent.includes(tab === 'search' ? '查询' : '足迹'));
    });
    renderQuerySubPanel();
}

// 渲染当前子标签面板内容
function renderQuerySubPanel() {
    const panel = document.getElementById('querySubPanel');
    if (!panel) return;
    if (querySubTab === 'search') {
        renderQuerySearchPanel(panel);
    } else {
        renderQueryFootprintPanel(panel);
    }
}

// 渲染“查询”子标签
function renderQuerySearchPanel(panel) {
    panel.innerHTML = `
        <div class="query-search-section">
            <!-- 按ID搜索 -->
            <div class="search-bar">
                <input type="text" id="queryUserId" placeholder="输入玩家ID" onkeypress="if(event.key==='Enter') queryPlayerData()">
                <button onclick="queryPlayerData()" id="queryBtn" class="search-btn">搜索</button>
            </div>

            <!-- 按名字搜索 -->
            <div class="search-bar">
                <input type="text" id="queryFighterName" placeholder="输入玩家名字" onkeypress="if(event.key==='Enter') searchFighterByName()">
                <button onclick="searchFighterByName()" id="nameSearchBtn" class="search-btn">搜索</button>
            </div>
            <div id="nameSearchResults" class="name-search-results"></div>
        </div>
    `;
}

// 查询页轻量内联提示（替代已删除的 queryStatus 大框；查询/足迹两个子标签共用）
function showQueryHint(message, type) {
    const hint = document.getElementById('queryHint');
    if (!hint) return;
    hint.className = `query-inline-hint ${type || ''}`.trim();
    hint.textContent = message;
}

function clearQueryHint() {
    const hint = document.getElementById('queryHint');
    if (!hint) return;
    hint.className = '';
    hint.innerHTML = '';
}

// 渲染“足迹”子标签
function renderQueryFootprintPanel(panel) {
    panel.innerHTML = `
        <!-- 收藏列表 -->
        <div class="favorites-section">
            <h5>⭐ 收藏列表 (${favoritePlayers.length})</h5>
            ${favoritePlayers.length === 0 ?
                '<div class="empty-hint">暂无收藏玩家</div>' :
                `<div class="favorites-list">
                    ${favoritePlayers.map((player, index) => `
                        <div class="favorite-item" data-index="${index}">
                            <div class="favorite-info">
                                <div class="favorite-name-row">
                                    <span class="favorite-name" id="fav-name-${index}" ondblclick="startEditRemark(${index}, event)">${escapeHtml(player.remark || player.playerName || '未知玩家')}</span>
                                    <button class="btn-edit-remark" onclick="startEditRemark(${index}, event)" title="编辑备注">✏️</button>
                                </div>
                                <div class="favorite-id">ID: ${escapeHtml(player.userId)}</div>
                                ${player.playerName && player.remark ? `<div class="favorite-player-name">${escapeHtml(player.playerName)}</div>` : ''}
                            </div>
                            <div class="favorite-actions">
                                <button class="btn-favorite-query" onclick="queryPlayerFromFavorite(${inlineJsString(player.userId)})" title="查询">🔍</button>
                                <button class="btn-remove-fav" onclick="removeFavorite(${index})" title="取消收藏">❌</button>
                            </div>
                        </div>
                    `).join('')}
                </div>`
            }
        </div>

        <!-- 历史搜索记录 -->
        <div class="history-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h5 style="margin:0;">🕒 历史搜索 (${searchHistory.length})</h5>
                ${searchHistory.length > 0 ? `<button class="btn-clear-history" onclick="clearSearchHistory()">清空历史</button>` : ''}
            </div>
            ${searchHistory.length === 0 ?
                '<div class="empty-hint">暂无搜索记录</div>' :
                `<div class="history-list">
                    ${searchHistory.map((item, index) => `
                        <div class="history-item">
                            <div class="history-info">
                                <div class="history-id">ID: ${escapeHtml(item.userId)}</div>
                                <div class="history-time">${formatTime(item.timestamp)}</div>
                            </div>
                            <div class="history-actions">
                                <button class="btn-query-from-history" onclick="queryPlayerFromHistory(${inlineJsString(item.userId)})" title="查询">🔍</button>
                                <button class="btn-fav-from-history" onclick="event.stopPropagation(); addToFavorites(${inlineJsString(item.userId)})" title="加入收藏">⭐</button>
                            </div>
                        </div>
                    `).join('')}
                </div>`
            }
        </div>
    `;
}

// 按名字搜索玩家
async function searchFighterByName() {
    const nameInput = document.getElementById('queryFighterName');
    const resultsDiv = document.getElementById('nameSearchResults');
    const btn = document.getElementById('nameSearchBtn');
    const name = nameInput.value.trim();
    if (!name || !cookie) {
        showQueryHint(!name ? '请输入玩家名字' : '请先登录', 'error');
        return;
    }
    cancelNameSearch();
    const requestId = ++nameSearchId;
    const epoch = accountEpoch;
    const controller = new AbortController();
    nameSearchCtrl = controller;
    const stillActive = () => requestId === nameSearchId && epoch === accountEpoch
        && lastActiveTab === 'query' && !isQueryMode && querySubTab === 'search'
        && document.getElementById('queryFighterName') === nameInput;
    const timeout = setTimeout(() => controller.abort(), 30000);
    btn.disabled = true;
    showQueryHint(requestProgressText('正在搜索玩家'), 'info');
    try {
        const response = await fetch(`${API_BASE}/api/search-fighter`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({fighter_id: name, page: 1, cookie})
        });
        const data = await response.json();
        if (!stillActive()) return;
        if (!response.ok || !data.success) throw new Error(data.detail || '搜索失败，请重试');
        lastSearchResults = data.fighter_list || [];
        clearQueryHint();
        resultsDiv.textContent = lastSearchResults.length ? `已找到 ${lastSearchResults.length} 名玩家 →` : '未找到匹配的玩家';
        renderNameSearchResults();
    } catch (error) {
        if (stillActive()) showQueryHint(error.name === 'AbortError' ? '搜索超时，请重试' : error.message, 'error');
    } finally {
        clearTimeout(timeout);
        if (requestId === nameSearchId) {
            btn.disabled = false;
            nameSearchCtrl = null;
        }
    }
}

// 格式化活跃时间带（官方 play_time_zone：start_hour/start_minute/end_hour/end_minute）
function formatPlayTimeZone(ptz) {
    if (!ptz || (ptz.start_hour === 0 && ptz.start_minute === 0 && ptz.end_hour === 0 && ptz.end_minute === 0)) return '';
    const p2 = n => String(n).padStart(2, '0');
    return `${p2(ptz.start_hour || 0)}:${p2(ptz.start_minute || 0)}~${p2(ptz.end_hour || 0)}:${p2(ptz.end_minute || 0)}`;
}

// 名字搜索结果渲染到右侧内容区：格斗圈卡片风格 + 官方右侧状态区（国旗/活跃时间带/在线状态）
function renderNameSearchResults() {
    const area = document.getElementById('battlesScrollArea');
    if (!area) return;

    if (!lastSearchResults.length) {
        area.innerHTML = emptyStateHtml('🔍', '未找到匹配的玩家');
        return;
    }

    const rows = lastSearchResults.map(fighter => {
        // 条目即官方 fighter_banner 结构，复用格斗圈字段解析
        const item = parseFighterItem(fighter);
        const { name, shortId, platform, onlineStatus, onlineOffline, charName, charTool, mr, lp, leagueRank, masterLeague, titleVal, titlePlate } = item;
        const homeId = fighter.home_id || item.homeId;
        const timeZoneText = formatPlayTimeZone(fighter.play_time_zone);

        // 称号底板图（与格斗圈卡片一致）
        const emblemImgHtml = titlePlate
            ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${encodeURIComponent(titlePlate)}.png" alt="" onerror="this.style.display='none'">`
            : '';
        // 段位图标 + 官方风格分数文案（22813积分 / MR1500）
        const rankIconUrl = getFightersRankIconUrl(leagueRank, masterLeague);
        const scoreHtml = mr > 0 ? `MR${mr}` : (lp > 0 ? `${lp}积分` : '');
        // 角色头像
        const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${encodeURIComponent(charTool)}_l.png` : '';
        const charImgHtml = charImgUrl
            ? `<img src="${charImgUrl}" alt="${escapeHtml(charName)}" onerror="handleImageError(this, this.alt)">`
            : `<div class="char-fallback">${escapeHtml(charName) || '?'}</div>`;
        // 国旗图（复用通用函数，tooltip显示地区名）
        const flagHtml = renderFlagHtml(homeId, item.region);
        const cardClickAttrs = shortId ? ` onclick="queryPlayerById(${inlineJsString(shortId)}, event)"` : '';

        return `
            <div class="ranking-card fighters-card search-fighter-card${titlePlate ? ' has-emblem' : ''}"${cardClickAttrs}>
                <div class="ranking-card-visual${titlePlate ? ' has-emblem' : ''}">
                    ${emblemImgHtml}
                    <div class="ranking-card-info">
                        <div class="ranking-card-name-row">
                            ${platform ? `<span class="ranking-card-platform">${escapeHtml(platform)}</span>` : ''}
                            <span class="ranking-player-name">${escapeHtml(name)}</span>
                        </div>
                        ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${escapeHtml(titleVal)}</span></div>` : ''}
                        <div class="ranking-card-meta">
                            ${flagHtml}
                            ${scoreHtml ? `<span class="search-card-score">${scoreHtml}</span>` : ''}
                            ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard(${inlineJsString(shortId)}, event)" title="右键复制ID">${escapeHtml(shortId)}</span>` : ''}
                        </div>
                    </div>
                    ${(charTool || charName) ? `<div class="ranking-card-char">${charImgHtml}</div>` : ''}
                </div>
                <div class="ranking-card-divider"></div>
                <div class="search-card-status">
                    ${rankIconUrl ? `<img class="search-card-rankicon" src="${rankIconUrl}" width="90" height="90" alt="段位" onerror="this.style.display='none'">` : ''}
                    ${timeZoneText ? `<span class="search-card-time" title="活跃时间带">活跃 ${timeZoneText}</span>` : ''}
                    ${onlineStatus ? `<span class="fighters-online-status ${onlineOffline ? 'offline' : ''}">${escapeHtml(onlineStatus)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    area.innerHTML = `
        <div class="ranking-content">
            <div class="ranking-list">${rows}</div>
        </div>
    `;
}

// 查询玩家数据
async function queryPlayerData() {
    const userIdInput = document.getElementById('queryUserId');

    const userId = userIdInput.value.trim();

    if (!userId) {
        showQueryHint('❌ 请输入玩家ID', 'error');
        return;
    }

    if (!cookie) {
        showQueryHint('❌ 请先登录获取Cookie', 'error');
        return;
    }

    // 保存到历史记录
    addToSearchHistory(userId);

    // 跳转到查询结果页面
    window.history.pushState({}, '', `/search?uid=${userId}`);
    handleRoute();
}

// 在查询模式下切换对战类型
async function queryPlayerByType(userId, battleType) {
    return loadBattleRecords(userId, battleType);
}

// 通过点击ID查询玩家
async function queryPlayerById(userId, event) {
    // 阻止事件冒泡
    if (event) {
        event.stopPropagation();
    }

    if (!userId) {
        console.warn('无效的用户ID');
        return;
    }

    // 跳转到查询结果页面
    window.history.pushState({}, '', `/search?uid=${userId}`);
    handleRoute();
}

// ========== 历史搜索和收藏功能 ==========

// 加载搜索历史


// 保存搜索历史


// 添加到搜索历史
function addToSearchHistory(userId) {
    // 移除已存在的记录
    searchHistory = searchHistory.filter(item => item.userId !== userId);

    // 添加到开头
    searchHistory.unshift({
        userId: userId,
        timestamp: Date.now()
    });

    // 只保留最近20条
    if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(0, 20);
    }

    saveSearchHistory();
}

// 清空搜索历史（直接清空，不弹确认框）
function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    renderQueryPage();
}

// 从历史记录查询（足迹子标签下不存在 queryUserId 输入框，直接按ID查询）
function queryPlayerFromHistory(userId) {
    const input = document.getElementById('queryUserId');
    if (input) input.value = userId;
    addToSearchHistory(userId);
    window.history.pushState({}, '', `/search?uid=${userId}`);
    handleRoute();
}

// 加载收藏列表


// 保存收藏列表


// 添加到收藏
function addToFavorites(userId) {
    // 检查是否已存在
    const existing = favoritePlayers.find(p => p.userId === userId);
    if (existing) {
        showQueryHint('⚠️ 该玩家已在收藏列表中', 'error');
        return;
    }

    // 直接添加，备注为空
    favoritePlayers.unshift({
        userId: userId,
        playerName: '',  // 将在首次查询时更新
        remark: '',  // 初始备注为空
        addedAt: Date.now()
    });

    saveFavoritePlayers();
    renderQueryPage();
    showQueryHint('✅ 已添加到收藏列表，点击 ✏️ 按钮可添加备注', 'success');
}

// 从收藏列表查询（同 queryPlayerFromHistory：不依赖搜索子标签的输入框）
function queryPlayerFromFavorite(userId) {
    const input = document.getElementById('queryUserId');
    if (input) input.value = userId;
    addToSearchHistory(userId);
    window.history.pushState({}, '', `/search?uid=${userId}`);
    handleRoute();
}

// 移除收藏（直接删除，不弹确认框）
function removeFavorite(index) {
    favoritePlayers.splice(index, 1);
    saveFavoritePlayers();
    renderQueryPage();
}

// 开始编辑备注（内联编辑）
function startEditRemark(index, event) {
    if (event) {
        event.stopPropagation();
    }

    const nameElement = document.getElementById(`fav-name-${index}`);
    if (!nameElement) return;

    const currentRemark = favoritePlayers[index].remark || '';

    // 创建输入框替换原文本
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentRemark;
    input.className = 'remark-edit-input';
    input.id = `remark-input-${index}`;

    // 保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✓';
    saveBtn.className = 'btn-save-remark';
    saveBtn.onclick = () => saveRemark(index);

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✗';
    cancelBtn.className = 'btn-cancel-remark';
    cancelBtn.onclick = () => cancelEdit(index);

    // 替换元素
    const nameRow = nameElement.parentElement;
    nameElement.style.display = 'none';

    const editContainer = document.createElement('div');
    editContainer.className = 'remark-edit-container';
    editContainer.id = `edit-container-${index}`;
    editContainer.appendChild(input);
    editContainer.appendChild(saveBtn);
    editContainer.appendChild(cancelBtn);

    nameRow.insertBefore(editContainer, nameRow.children[1]);

    // 自动聚焦并选中文本
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    // 按回车保存，按ESC取消
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveRemark(index);
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cancelEdit(index);
        }
    });
}

// 保存备注
function saveRemark(index) {
    const input = document.getElementById(`remark-input-${index}`);
    if (!input) return;

    const newRemark = input.value.trim();
    favoritePlayers[index].remark = newRemark;

    saveFavoritePlayers();
    renderQueryPage();
}

// 取消编辑
function cancelEdit(index) {
    renderQueryPage();
}

// 更新收藏中的玩家名称
function updateFavoritePlayerName(userId, playerName) {
    const player = favoritePlayers.find(p => p.userId === userId);
    if (player && !player.playerName) {
        player.playerName = playerName;
        saveFavoritePlayers();
    }
}

// 切换收藏状态（添加/取消）
function toggleFavorite(userId, playerName) {
    const existingIndex = favoritePlayers.findIndex(p => p.userId === userId);

    if (existingIndex !== -1) {
        // 已收藏，直接取消收藏（不弹确认框）
        favoritePlayers.splice(existingIndex, 1);
        saveFavoritePlayers();
        renderContent();
        showQueryHint('✅ 已取消收藏', 'success');
    } else {
        // 未收藏，添加收藏
        favoritePlayers.unshift({
            userId: userId,
            playerName: playerName || '',
            remark: '',
            addedAt: Date.now()
        });
        saveFavoritePlayers();
        renderContent();
        showQueryHint('✅ 已添加到收藏列表', 'success');
    }
}

// 格式化时间


function showCrawlSettings() {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <div class="section">
            <h2>爬取设置</h2>
            <div class="form-group">
                <label for="pages">爬取页数：</label>
                <input type="number" id="pages" value="10" min="1" max="50">
            </div>
            <div class="form-group">
                <label for="maxWorkers">并发线程数：</label>
                <input type="number" id="maxWorkers" value="5" min="1" max="10">
            </div>
            <button onclick="crawlData()" id="crawlBtn">开始爬取</button>
            <div id="crawlStatus"></div>
        </div>
    `;
}

// 旧版 renderMatchCards 已移除：翻页/角色筛选/图表切换/刷新等操作统一走 renderContent，
// 保证二级导航（含"角色对阵"）与角色筛选区始终完整渲染
