// Responsibility module: fighters.js. Shared bindings are declared in state.js; loaded with defer.
// ==================== 格斗圈功能（朋友/关注） ====================

// 格斗圈状态
let fightersState = {
    listType: 'friend',  // friend=朋友, follow=关注, block=屏蔽
    orderType: 'gamemode',  // gamemode/league_rank/registered/last_play
    orderOrder: 0,  // 0=降序, 1=升序
    pages: { friend: 1, follow: 1, block: 1 },
    cache: { friend: null, follow: null, block: null },  // {fighterList, pagination, data}
    loading: false
};

// 请求取消控制器：新加载发起时直接取消上一次未完成的请求










function showFightersPage(shouldRefresh = false) {
    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.includes('格斗圈')) {
            tab.classList.add('active');
        }
    });

    // 隐藏设置面板
    hideSettingsPage();

    // 渲染格斗圈页面
    renderFightersPage();

    // 已在格斗圈页再点一次：刷新当前列表（与刷新按钮行为一致）
    if (shouldRefresh) {
        refreshFightersData();
        return;
    }

    // 首次进入时自动加载数据
    if (!fightersState.cache[fightersState.listType] && !fightersState.loading) {
        fetchFightersData();
    }
}

function renderFightersPage() {
    const fixedNavSection = document.getElementById('fixedNavSection');
    const battlesScrollArea = document.getElementById('battlesScrollArea');
    const cache = fightersState.cache[fightersState.listType];

    // 渲染筛选栏（二级导航：朋友/关注/屏蔽 + 排序方式）
    fixedNavSection.innerHTML = `
        <div class="nav-panel">
            <h2>🤼 格斗圈</h2>
            <div class="nav-panel-body">
                <div id="fightersStatus"></div>
                <div class="sub-nav fighters-sub-nav">
                    <div class="sub-nav-item ${fightersState.listType === 'friend' ? 'active' : ''}" onclick="changeFightersTab('friend')">朋友</div>
                    <div class="sub-nav-item ${fightersState.listType === 'follow' ? 'active' : ''}" onclick="changeFightersTab('follow')">关注</div>
                    <div class="sub-nav-item ${fightersState.listType === 'block' ? 'active' : ''}" onclick="changeFightersTab('block')">屏蔽</div>
                    <div class="ranking-sub-nav-filters">
                        <button class="fighters-refresh-btn" id="fightersRefreshBtn" onclick="refreshFightersData()" ${fightersState.loading ? 'disabled' : ''}>刷新</button>
                    </div>
                </div>
                <div class="ranking-filters">
                    <div class="ranking-region-btns fighters-sort-nav">
                        <button class="ranking-region-btn ${fightersState.orderType === 'gamemode' ? 'active' : ''}" onclick="changeFightersOrderType('gamemode')">游戏模式</button>
                        <button class="ranking-region-btn ${fightersState.orderType === 'registered' ? 'active' : ''}" onclick="changeFightersOrderType('registered')">添加时间</button>
                        <button class="ranking-region-btn ${fightersState.orderType === 'last_play' ? 'active' : ''}" onclick="changeFightersOrderType('last_play')">上次游戏日期</button>
                        <button class="ranking-region-btn ${fightersState.orderType === 'league_rank' ? 'active' : ''}" onclick="changeFightersOrderType('league_rank')">段位</button>
                    </div>
                    <div class="ranking-region-btns">
                        <button class="ranking-region-btn ${fightersState.orderOrder === 0 ? 'active' : ''}" onclick="changeFightersOrderOrder(0)">降序</button>
                        <button class="ranking-region-btn ${fightersState.orderOrder === 1 ? 'active' : ''}" onclick="changeFightersOrderOrder(1)">升序</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 渲染数据区域
    if (!isLoggedIn || !cookie) {
        battlesScrollArea.innerHTML = emptyStateHtml('🤼', '请先登录后查看格斗圈');
    } else if (fightersState.loading) {
        battlesScrollArea.innerHTML = loadingHtml('正在加载格斗圈列表...');
    } else if (cache) {
        renderFightersList(battlesScrollArea);
    } else {
        battlesScrollArea.innerHTML = emptyStateHtml('🤼', '请先登录后查看格斗圈');
    }
}

// 国旗图（官方 fighter_banner 通用：home_id → frag###.png，tooltip显示地区名；内联宽高兜底防布局撑爆）
function renderFlagHtml(homeId, region) {
    if (!homeId) {
        return region ? `<span class="ranking-card-region">🌐 ${escapeHtml(region)}</span>` : '';
    }
    return `<img class="ranking-card-flag" src="https://www.streetfighter.com/6/buckler/assets/images/material/national_frag/frag${String(homeId).padStart(3, '0')}.png" width="18" height="12" alt="${escapeHtml(region || '')}" title="${escapeHtml(region || '')}" onerror="this.style.display=\'none\'">`;
}

// 格斗圈列表项字段解析（真实结构：角色/段位数据在fighter_banner_info内）
function parseFighterItem(item) {
    const banner = item.fighter_banner_info || item || {};
    const personalInfo = banner.personal_info || {};
    const league = banner.favorite_character_league_info || {};
    const onlineInfo = banner.online_status_info || {};
    // 官方返回数字码（0=离线，非0=在线各状态）；兼容旧字段文本名
    const onlineCode = typeof onlineInfo.online_status === 'number'
        ? onlineInfo.online_status
        : ((onlineInfo.online_status_data && typeof onlineInfo.online_status_data.online_status === 'number') ? onlineInfo.online_status_data.online_status : null);
    const onlineName = (onlineInfo.online_status_data && onlineInfo.online_status_data.online_status_name)
        || item.online_status_name || '';
    let onlineStatus = '';
    let onlineOffline = false;
    if (onlineName) {
        onlineStatus = onlineName;
        onlineOffline = onlineName.includes('离线') || onlineName.includes('オフライン');
    } else if (onlineCode !== null) {
        onlineOffline = onlineCode === 0;
        onlineStatus = onlineOffline ? '离线' : '在线';
    }
    const charName = banner.favorite_character_name || item.character_name
        || (banner.favorite_character_id ? getCharacterNameById(banner.favorite_character_id) : '');
    const titleData = banner.title_data || {};
    return {
        raw: item,
        name: personalInfo.fighter_id || item.fighter_id || '-',
        shortId: personalInfo.short_id || item.short_id || '',
        platform: personalInfo.platform_name || '',
        region: banner.home_name || '',
        homeId: banner.home_id || 0,
        onlineStatus: onlineStatus,
        onlineOffline: onlineOffline,
        charName: charName,
        charTool: banner.favorite_character_tool_name || item.character_tool_name || '',
        titleVal: titleData.title_data_val || '',
        titlePlate: titleData.title_data_plate_name || '',
        mr: league.master_rating || item.rating || 0,
        lp: league.league_point || item.league_point || 0,
        leagueRank: league.league_rank || 0,
        masterLeague: league.master_league || 0,
        registeredAt: item.registered_at || 0,
        lastPlayAt: banner.last_play_at || 0
    };
}

// 本地排序兑底：官方API对小列表不保证排序生效，前端按当前排序规则再排一次
function sortFighterItems(items) {
    const { orderType, orderOrder } = fightersState;
    let cmp;
    switch (orderType) {
        case 'registered':
            cmp = (a, b) => a.registeredAt - b.registeredAt;
            break;
        case 'last_play':
            cmp = (a, b) => a.lastPlayAt - b.lastPlayAt;
            break;
        case 'league_rank':
            cmp = (a, b) => (a.mr - b.mr) || (a.lp - b.lp);
            break;
        default:  // gamemode：按主要游玩内容类型分组
            cmp = (a, b) => {
                const ct = (it) => ((it.raw.fighter_banner_info || {}).max_content_play_time || {}).content_type || 0;
                return ct(a) - ct(b);
            };
    }
    const sorted = [...items].sort(cmp);
    return orderOrder === 0 ? sorted.reverse() : sorted;  // 0=降序, 1=升序
}

function renderFightersList(container) {
    const cache = fightersState.cache[fightersState.listType];
    const rawList = (cache && cache.fighterList) || [];
    const listLabel = { friend: '朋友', follow: '关注', block: '屏蔽' }[fightersState.listType] || '朋友';

    if (rawList.length === 0) {
        container.innerHTML = emptyStateHtml('🤼', '暂无' + listLabel + '数据');
        return;
    }

    // 解析字段并按当前排序规则本地排序兑底
    const fighterList = sortFighterItems(rawList.map(parseFighterItem));

    // 分页信息（官方API仅返回page页码，无总页数/总数）
    const page = fightersState.pages[fightersState.listType];

    const rows = fighterList.map((item) => {
        const { name, shortId, platform, region, homeId, onlineStatus, onlineOffline, charName, charTool, mr, lp, leagueRank, masterLeague, titleVal, titlePlate } = item;

        // 角色图片URL
        const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${encodeURIComponent(charTool)}_l.png` : '';
        const charImgHtml = charImgUrl
            ? `<img src="${charImgUrl}" alt="${escapeHtml(charName)}" onerror="handleImageError(this, this.alt)">`
            : `<div class="char-fallback">${escapeHtml(charName || '?')}</div>`;

        // 官方称号底板图（与排行榜卡片一致）
        const emblemImgHtml = titlePlate
            ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${encodeURIComponent(titlePlate)}.png" alt="" onerror="this.style.display='none'">`
            : '';
        // 官方段位图标（API真实段位，无legend回退）
        const rankIconUrl = getFightersRankIconUrl(leagueRank, masterLeague);
        // 卡片整体可点击：查询该玩家（与排行榜一致）
        const cardClickAttrs = shortId
            ? ` onclick="queryPlayerById(${inlineJsString(shortId)}, event)"`
            : '';

        return `
            <div class="ranking-card fighters-card${titlePlate ? ' has-emblem' : ''}"${cardClickAttrs}>
                <div class="ranking-card-visual${titlePlate ? ' has-emblem' : ''}">
                    ${emblemImgHtml}
                    <div class="ranking-card-info">
                        <div class="ranking-card-name-row">
                            ${platform ? `<span class="ranking-card-platform">${escapeHtml(platform)}</span>` : ''}
                            <span class="ranking-player-name">${escapeHtml(name)}</span>
                            ${onlineStatus ? `<span class="fighters-online-status ${onlineOffline ? 'offline' : ''}">${escapeHtml(onlineStatus)}</span>` : ''}
                        </div>
                        ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${escapeHtml(titleVal)}</span></div>` : ''}
                        <div class="ranking-card-meta">
                            ${renderFlagHtml(homeId, region)}
                            ${charName ? `<span>${escapeHtml(charName)}</span>` : ''}
                            ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard(${inlineJsString(shortId)}, event)" title="右键复制ID">${escapeHtml(shortId)}</span>` : ''}
                        </div>
                    </div>
                    ${(charTool || charName) ? `<div class="ranking-card-char">${charImgHtml}</div>` : ''}
                </div>
                <div class="ranking-card-divider"></div>
                ${(mr > 0 || lp > 0) ? `
                <div class="ranking-card-score">
                    <span class="ranking-card-mr">${mr > 0 ? mr : lp}</span>
                    <span class="ranking-card-mr-label">${mr > 0 ? 'MR' : 'LP'}</span>
                </div>` : ''}
                ${rankIconUrl ? `<div class="ranking-card-rankicon"><img src="${rankIconUrl}" alt="段位" onerror="this.style.display='none'"></div>` : ''}
            </div>
        `;
    }).join('');

    // 分页控件（官方API无总数：满20人视为可能还有下一页）
    const hasPrev = page > 1;
    const hasNext = fighterList.length >= 20;
    const paginationHtml = `
        <div class="ranking-pagination">
            <button class="ranking-page-btn" onclick="changeFightersPage(${page - 1})" ${!hasPrev ? 'disabled' : ''}>上一页</button>
            <span class="ranking-page-info">第 ${page} 页（本页${fighterList.length}人）</span>
            <button class="ranking-page-btn" onclick="changeFightersPage(${page + 1})" ${!hasNext ? 'disabled' : ''}>下一页</button>
        </div>
    `;

    container.innerHTML = `
        <div class="ranking-content">
            <div class="ranking-list">${rows}</div>
            ${paginationHtml}
        </div>
    `;
}

function changeFightersTab(listType) {
    if (fightersState.listType === listType) return;
    fightersFetchCtrl?.abort();
    ++fightersFetchId;
    fightersState.loading = false;
    fightersState.listType = listType;
    renderFightersPage();
    // 无缓存时自动加载（若上一次加载仍在进行中，新请求会直接取消它）
    if (!fightersState.cache[listType]) {
        fetchFightersData();
    }
}

function changeFightersOrderType(orderType) {
    if (fightersState.orderType === orderType) return;
    fightersState.orderType = orderType;
    fightersState.pages[fightersState.listType] = 1;
    fightersState.cache[fightersState.listType] = null;
    renderFightersPage();  // 立即刷新选中态，不等加载完成
    fetchFightersData();
}

function changeFightersOrderOrder(orderOrder) {
    if (fightersState.orderOrder === orderOrder) return;
    fightersState.orderOrder = orderOrder;
    fightersState.pages[fightersState.listType] = 1;
    fightersState.cache[fightersState.listType] = null;
    renderFightersPage();
    fetchFightersData();
}

function changeFightersPage(page) {
    if (page < 1) return;
    fightersState.pages[fightersState.listType] = page;
    renderFightersPage();  // 立即刷新选中态，不等加载完成
    fetchFightersData();
}

// 手动刷新格斗圈列表（清除缓存，回到第1页重新拉取；进行中的旧请求会被取消）
async function refreshFightersData() {
    if (!cookie) {
        showStatus('fightersStatus', '❌ 请先登录后查看格斗圈', 'error');
        return;
    }
    fightersState.pages[fightersState.listType] = 1;
    fightersState.cache[fightersState.listType] = null;
    const ok = await fetchFightersData();
    if (ok) {
        showStatus('fightersStatus', '✅ 格斗圈列表已刷新', 'success');
    }
}

async function fetchFightersData() {
    if (!cookie) {
        showStatus('fightersStatus', '❌ 请先登录后查看格斗圈', 'error');
        return false;
    }

    // 取消上一次未完成的请求，避免旧响应覆盖新数据
    if (fightersFetchCtrl) fightersFetchCtrl.abort();
    const controller = new AbortController();
    fightersFetchCtrl = controller;
    const myId = ++fightersFetchId;
    const requestCookie = cookie;
    let timedOut = false;
    const timeout = setTimeout(() => {timedOut = true; controller.abort();}, 30000);

    fightersState.loading = true;
    renderFightersPage();  // 刷新按钮进入置灰禁用态 + 列表区显示加载动画

    try {
        const response = await fetch(`${API_BASE}/api/fighters-list`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({
                list_type: fightersState.listType,
                page: fightersState.pages[fightersState.listType],
                order_type: fightersState.orderType,
                order_order: fightersState.orderOrder,
                cookie: requestCookie
            })
        });

        if (myId !== fightersFetchId || requestCookie !== cookie) return false;  // 已被更新的请求取代

        const result = await response.json();

        if (myId !== fightersFetchId || requestCookie !== cookie) return false;

        if (!response.ok) {
            // HTTP错误（如403未登录、500服务错误）
            fightersState.loading = false;
            fightersState.cache[fightersState.listType] = null;
            if (lastActiveTab === 'fighters') {
                renderFightersPage();
                document.getElementById('battlesScrollArea').innerHTML = emptyStateHtml('❌', result.detail || '加载失败，请重试');
            }
            return false;
        }

        if (result.success) {
            const fetchedList = result.fighter_list || [];
            const requestedPage = fightersState.pages[fightersState.listType];
            if (fetchedList.length === 0 && requestedPage > 1) {
                // 翻到空页：已无更多数据，回退到上一页
                fightersState.pages[fightersState.listType] = requestedPage - 1;
            } else {
                fightersState.cache[fightersState.listType] = {
                    fighterList: fetchedList,
                    pagination: result.pagination || {},
                    data: result.data || null
                };
            }
            fightersState.loading = false;
            if (lastActiveTab === 'fighters') {
                renderFightersPage();
            }
            return true;
        } else {
            fightersState.loading = false;
            if (lastActiveTab === 'fighters') {
                renderFightersPage();
                document.getElementById('battlesScrollArea').innerHTML = emptyStateHtml('❌', '加载失败，请重试');
            }
            return false;
        }
    } catch (error) {
        // 被新请求取消时静默退出，不触碰任何状态（新请求已接管界面）
        if ((error.name === 'AbortError' && !timedOut) || myId !== fightersFetchId || requestCookie !== cookie) {
            return false;
        }
        console.error('格斗圈请求异常:', error);
        fightersState.loading = false;
        if (lastActiveTab === 'fighters') {
            renderFightersPage();
            document.getElementById('battlesScrollArea').innerHTML = emptyStateHtml('❌', timedOut ? '格斗圈加载超时，请重试' : '请求失败: ' + error.message);
        }
        return false;
    } finally {
        clearTimeout(timeout);
        if (myId === fightersFetchId) fightersFetchCtrl = null;
    }
}
