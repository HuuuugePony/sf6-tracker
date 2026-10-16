// Responsibility module: rankings.js. Shared bindings are declared in state.js; loaded with defer.
// ==================== 排行榜功能 ====================

let rankingStatsFetchId = 0;
// 排行榜状态
let rankingState = {
    characterId: 'chunli',
    characterFilter: 1,  // 1=所有角色, 4=特定角色（默认所有角色）
    homeFilter: 1,  // 1=全球, 3=地区
    page: 1,
    data: null,
    rankingList: null,
    pagination: null,  // {current_page, total_page, total_count}
    loading: false,
    error: '',
    view: 'list',  // 二级导航: list=排行榜, stats=数据统计
    stats: null,  // 统计接口返回数据
    statsLoading: false,
    statsError: '',
    statsCollapsed: {},  // 统计卡片收起状态 {usage/mr/avg: bool}
    statsSort: 'count', statsCharacterTool: '', statsShowAll: false, statsUsageAll: false, statsMrInput: '',
    statsHomeFilter: 1,  // 数据统计独立地区筛选: 1=全球, 3=中国
    cachedStats: {}  // 按地区缓存统计结果 {1: {...}, 3: {...}}
};

// 角色工具名映射
const characterToolNames = {
    1: 'ryu', 2: 'luke', 3: 'kimberly', 4: 'chunli', 5: 'manon',
    6: 'zangief', 7: 'jp', 8: 'dhalsim', 9: 'cammy', 10: 'ken',
    11: 'deejay', 12: 'lily', 13: 'aki', 14: 'rashid', 15: 'blanca',
    16: 'juri', 17: 'marisa', 18: 'guile', 19: 'ed', 20: 'honda',
    21: 'jamie', 22: 'gouki', 25: 'sagat', 26: 'vega', 27: 'terry',
    28: 'mai', 29: 'elena', 30: 'cviper', 31: 'alex', 32: 'ingrid'
};

// 官方段位图标：优先使用玩家实际段位master_league（榜单内为传奇=37）；
// 无字段时才按MR推断：≥1600=rank40，≥1700=rank41，≥1800=rank42
function getRankingRankIconUrl(mr, league) {
    let n;
    if (league && league >= 37) {
        n = league;
    } else {
        n = 37;
        if (mr >= 1800) n = 42;
        else if (mr >= 1700) n = 41;
        else if (mr >= 1600) n = 40;
    }
    return `https://www.streetfighter.com/6/buckler/assets/images/material/rank/rank${n}_l.png`;
}

// 格斗圈段位图标：直接用API返回的真实段位（实测：league_rank为真实段位号，1-37为LP/大师段位、39为传奇；
// master_league为传奇MR细分档39-42，如MR1720→41；官网图标rank1-37、39-42存在，rank38缺失）
function getFightersRankIconUrl(leagueRank, masterLeague) {
    let n = 0;
    if (masterLeague >= 39) n = masterLeague;   // 传奇MR细分档(39-42)
    else if (leagueRank > 0) n = leagueRank;    // 真实段位号(1-37/39)
    if (!n || n === 38) return '';              // rank38图标官网不存在
    return `https://www.streetfighter.com/6/buckler/assets/images/material/rank/rank${n}_l.png`;
}

function showRankingPage(shouldRefresh = false) {
    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.includes('排行榜')) {
            tab.classList.add('active');
        }
    });

    // 隐藏设置面板
    hideSettingsPage();

    // 渲染排行榜页面
    renderRankingPage();

    // 已在排行榜页再点一次：刷新当前视图数据（与刷新按钮行为一致）
    if (shouldRefresh) {
        refreshRankingView();
        return;
    }

    // 首次进入时自动加载数据
    if (!rankingState.data && !rankingState.loading) {
        fetchRankingData();
    }
    // 统计视图且无缓存时自动加载统计数据
    if (rankingState.view === 'stats' && !rankingState.stats && !rankingState.statsLoading) {
        fetchRankingStats();
    }
}

// 复用模板：加载中状态

// 复用模板：空状态


function renderRankingPage() {
    const fixedNavSection = document.getElementById('fixedNavSection');
    const battlesScrollArea = document.getElementById('battlesScrollArea');

    // 渲染筛选栏（角色选择使用通用弹窗模板）
    const rankingCharName = rankingState.characterFilter === 4
        ? (CHARACTER_ROSTER.find(c => c.tool === rankingState.characterId)?.name || '')
        : '';
    fixedNavSection.innerHTML = `
        <div class="nav-panel">
            <h2>🏆 排行榜</h2>
            <div class="nav-panel-body">
                <div id="rankingStatus"></div>
                <div class="sub-nav ranking-sub-nav">
                    <div class="sub-nav-item ${rankingState.view === 'list' ? 'active' : ''}" onclick="switchRankingView('list')">排行榜</div>
                    <div class="sub-nav-item ${rankingState.view === 'stats' ? 'active' : ''}" onclick="switchRankingView('stats')">数据统计</div>
                    <div class="ranking-sub-nav-filters">
                        <button class="ranking-refresh-btn" onclick="refreshRankingView()" title="刷新当前视图数据">刷新</button>
                    </div>
                </div>
                ${rankingState.view === 'list' ? `
                <div class="ranking-filters">
                    ${renderCharPickerTrigger({ onclick: 'openRankingCharacterPicker()', label: '所有角色', value: rankingCharName, imgMap: {} })}
                    <div class="ranking-region-btns">
                        <button class="ranking-region-btn ${rankingState.homeFilter === 1 ? 'active' : ''}" onclick="changeRankingRegion(1)">全球</button>
                        <button class="ranking-region-btn ${rankingState.homeFilter === 3 ? 'active' : ''}" onclick="changeRankingRegion(3)">中国</button>
                    </div>
                </div>` : `
                <div class="ranking-filters">
                    <div class="ranking-region-btns">
                        <button class="ranking-region-btn ${rankingState.statsHomeFilter === 1 ? 'active' : ''}" onclick="changeStatsRegion(1)">全球</button>
                        <button class="ranking-region-btn ${rankingState.statsHomeFilter === 3 ? 'active' : ''}" onclick="changeStatsRegion(3)">中国</button>
                    </div>
                </div>`}
            </div>
        </div>
    `;

    // 渲染排行榜数据区域
    if (rankingState.view === 'stats') {
        if (rankingState.statsLoading) {
            battlesScrollArea.innerHTML = `<div class="ranking-content">${loadingHtml('正在统计前500名数据...')}</div>`;
        } else if (rankingState.statsError) {
            battlesScrollArea.innerHTML = `<div class="ranking-content">${emptyStateHtml('❌', rankingState.statsError)}</div>`;
        } else if (rankingState.stats) {
            renderRankingStats(battlesScrollArea);
        } else {
            battlesScrollArea.innerHTML = `<div class="ranking-content">${emptyStateHtml('📊', '暂无统计数据')}</div>`;
        }
    } else if (rankingState.loading) {
        battlesScrollArea.innerHTML = loadingHtml('正在加载排行榜...');
    } else if (rankingState.error) {
        battlesScrollArea.innerHTML = emptyStateHtml('❌', rankingState.error);
    } else if (rankingState.data) {
        renderRankingTable(battlesScrollArea);
    } else {
        battlesScrollArea.innerHTML = emptyStateHtml('🏆', '选择角色查看排行榜');
    }
}

function renderRankingTable(container) {
    // 使用后端提取的ranking_list (master_rating_ranking.ranking_fighter_list)
    let rankingList = rankingState.rankingList;

    // 如果后端没有找到，前端再尝试从原始数据中提取
    if ((!rankingList || rankingList.length === 0) && rankingState.data) {
        const data = rankingState.data;
        const mr = data.master_rating_ranking;
        if (mr && Array.isArray(mr.ranking_fighter_list)) {
            rankingList = mr.ranking_fighter_list;
        }
    }


    if (!rankingList || rankingList.length === 0) {
        container.innerHTML = emptyStateHtml('📊', '暂无排行榜数据');
        return;
    }

    // 分页信息
    const pagination = rankingState.pagination || {};
    const totalPage = pagination.total_page || 0;
    const totalCount = pagination.total_count || rankingList.length;

    const rows = rankingList.map((player, index) => {
        // 真实字段结构:
        //   名次: player.master_rating_ranking
        //   MR分数: player.rating
        //   LP: player.league_point
        //   角色名: player.character_name
        //   角色工具名: player.character_tool_name
        //   称号: player.ranking_title_data.title_data_val
        //   地区: player.fighter_banner_info.home_name
        //   玩家名: player.fighter_banner_info.personal_info.fighter_id
        //   短ID: player.fighter_banner_info.personal_info.short_id
        //   平台: player.fighter_banner_info.personal_info.platform_name
        const banner = player.fighter_banner_info || {};
        const personalInfo = banner.personal_info || {};
        const rank = player.master_rating_ranking || player.order || (index + 1 + (rankingState.page - 1) * rankingList.length);
        const name = personalInfo.fighter_id || '-';
        const shortId = personalInfo.short_id || '';
        const platform = personalInfo.platform_name || '';
        const mr = player.rating || 0;
        const lp = player.league_point || 0;
        const charName = player.character_name || (player.character_id ? getCharacterNameById(player.character_id) : '');
        const charTool = player.character_tool_name || '';
        const titleData = player.ranking_title_data || {};
        const titleVal = titleData.title_data_val || '';
        const titlePlate = titleData.title_data_plate_name || '';
        const region = banner.home_name || '';
        const homeId = banner.home_id || 0;

        // 角色图片URL
        const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${encodeURIComponent(charTool)}_l.png` : '';
        const charImgHtml = charImgUrl
            ? `<img src="${charImgUrl}" alt="${escapeHtml(charName)}" onerror="handleImageError(this, this.alt)">`
            : `<div class="char-fallback">${escapeHtml(charName || '?')}</div>`;

        // 官方称号图（图片区底图：上下充满卡片，信息叠在图片上方）
        const emblemImgHtml = titlePlate
            ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${encodeURIComponent(titlePlate)}.png" alt="" onerror="this.style.display='none'">`
            : '';
        // 官方段位图标（优先实际段位master_league，legend优先）
        const rankIconUrl = getRankingRankIconUrl(mr, player.master_league);
        // 卡片整体可点击：查询该玩家
        const cardClickAttrs = shortId
            ? ` onclick="queryPlayerById(${inlineJsString(shortId)}, event)"`
            : '';

        // 排名样式
        let rankClass = '';
        if (rank == 1) rankClass = 'rank-gold';
        else if (rank == 2) rankClass = 'rank-silver';
        else if (rank == 3) rankClass = 'rank-bronze';

        return `
            <div class="ranking-card ${rankClass}${titlePlate ? ' has-emblem' : ''}"${cardClickAttrs}>
                <div class="ranking-card-rank">${rank}</div>
                <div class="ranking-card-visual${titlePlate ? ' has-emblem' : ''}">
                    ${emblemImgHtml}
                    <div class="ranking-card-info">
                        <div class="ranking-card-name-row">
                            ${platform ? `<span class="ranking-card-platform">${escapeHtml(platform)}</span>` : ''}
                            <span class="ranking-player-name">${escapeHtml(name)}</span>
                        </div>
                        ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${escapeHtml(titleVal)}</span></div>` : ''}
                        <div class="ranking-card-meta">
                            ${renderFlagHtml(homeId, region)}
                            <span>${escapeHtml(charName)}</span>
                            ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard(${inlineJsString(shortId)}, event)" title="右键复制ID">${escapeHtml(shortId)}</span>` : ''}
                        </div>
                    </div>
                    <div class="ranking-card-char">${charImgHtml}</div>
                </div>
                <div class="ranking-card-divider"></div>
                <div class="ranking-card-score">
                    <span class="ranking-card-mr">${mr > 0 ? mr : lp}</span>
                    <span class="ranking-card-mr-label">${mr > 0 ? 'MR' : 'LP'}</span>
                </div>
                <div class="ranking-card-rankicon"><img src="${rankIconUrl}" alt="段位" onerror="this.style.display='none'"></div>
            </div>
        `;
    }).join('');

    // 分页控件
    const hasPrev = rankingState.page > 1;
    const hasNext = totalPage > 0 ? rankingState.page < totalPage : rankingList.length >= 20;
    const paginationHtml = `
        <div class="ranking-pagination">
            <button class="ranking-page-btn" onclick="changeRankingPage(${rankingState.page - 1})" ${!hasPrev ? 'disabled' : ''}>上一页</button>
            <span class="ranking-page-info">第 ${rankingState.page} 页${totalPage > 0 ? ' / 共' + totalPage + '页' : ''}（共${totalCount}人）</span>
            <button class="ranking-page-btn" onclick="changeRankingPage(${rankingState.page + 1})" ${!hasNext ? 'disabled' : ''}>下一页</button>
            ${totalPage > 0 ? `
                <span class="ranking-page-jump">
                    <input type="number" id="rankingPageInput" class="ranking-page-input" min="1" max="${totalPage}" value="${rankingState.page}"
                           onkeydown="if (event.key === 'Enter') gotoRankingPage()" title="输入页码后回车或点跳转">
                    <button class="ranking-page-btn" onclick="gotoRankingPage()">跳转</button>
                </span>
            ` : ''}
        </div>
    `;

    container.innerHTML = `
        <div class="ranking-content">
            <div class="ranking-list">
                ${rows}
            </div>
            ${paginationHtml}
        </div>
    `;
}

function changeRankingCharacter(toolName) {
    if (toolName === 'all') {
        // 所有角色：character_filter=1
        rankingState.characterFilter = 1;
    } else {
        // 特定角色：character_filter=4
        rankingState.characterFilter = 4;
        rankingState.characterId = toolName;
    }
    rankingState.page = 1;
    fetchRankingData();
    renderRankingPage();  // 刷新筛选栏，展示选中的角色
}

function changeRankingRegion(filter) {
    rankingState.homeFilter = filter;
    rankingState.page = 1;
    // 更新按钮状态
    document.querySelectorAll('.ranking-region-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((filter === 1 && btn.textContent.includes('全球')) || (filter === 3 && btn.textContent.includes('中国'))) {
            btn.classList.add('active');
        }
    });
    fetchRankingData();
}

function changeRankingPage(page) {
    if (page < 1) return;
    rankingState.page = page;
    fetchRankingData();
}

// 输入页码跳转（自动限制在有效范围内）
function gotoRankingPage() {
    const input = document.getElementById('rankingPageInput');
    if (!input) return;
    const totalPage = (rankingState.pagination && rankingState.pagination.total_page) || 0;
    let page = parseInt(input.value, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (totalPage > 0 && page > totalPage) page = totalPage;
    input.value = page;
    if (page === rankingState.page) return;
    changeRankingPage(page);
}

// 排行榜二级导航切换（选中态点击不重复处理，即时切换）
function switchRankingView(view) {
    if (rankingState.view === view) return;
    rankingState.view = view;
    renderRankingPage();
    if (view === 'stats' && !rankingState.stats && !rankingState.statsLoading) {
        fetchRankingStats();
    }
}

// 二级导航刷新按钮：刷新当前视图数据（统计视图强制绕过服务端缓存）
function refreshRankingView() {
    if (rankingState.view === 'stats') {
        if (rankingState.statsLoading) return;
        rankingState.stats = null;
        fetchRankingStats(true);
    } else {
        if (rankingState.loading) return;
        fetchRankingData();
    }
}

// 统计卡片收起/展开（不重建DOM，直接切换类）
function toggleRstatCard(key) {
    if (!rankingState.statsCollapsed) rankingState.statsCollapsed = {};
    rankingState.statsCollapsed[key] = !rankingState.statsCollapsed[key];
    const card = document.getElementById('rstat-' + key);
    if (card) {
        card.classList.toggle('collapsed', !!rankingState.statsCollapsed[key]);
        card.querySelector?.('.rstat-title')?.setAttribute('aria-expanded', String(!rankingState.statsCollapsed[key]));
    }
}

// 数据统计地区筛选栏已移至nav-panel内，不再单独渲染

// 切换统计地区：优先用本地缓存，无缓存时重新拉取
function changeStatsRegion(filter) {
    if (rankingState.statsHomeFilter === filter || rankingState.statsLoading) return;
    rankingState.statsHomeFilter = filter;
    rankingState.statsCharacterTool = '';
    rankingState.statsShowAll = false;
    const cached = rankingState.cachedStats && rankingState.cachedStats[filter];
    if (cached) {
        rankingState.stats = cached;
        rankingState.statsError = '';
        renderRankingPage();
    } else {
        rankingState.stats = null;
        fetchRankingStats();
    }
}

// 拉取排行榜数据统计（传奇段位前500，force=true时绕过服务端缓存）
async function fetchRankingStats(force) {
    if (!cookie) {
        rankingState.statsError = '❌ 请先登录后查看数据统计';
        rankingState.statsLoading = false;
        if (rankingState.view === 'stats') renderRankingPage();
        return;
    }

    const requestId = ++rankingStatsFetchId;
    const homeFilter = rankingState.statsHomeFilter;
    const requestCookie = cookie;
    rankingStatsFetchCtrl?.abort();
    const controller = new AbortController();
    rankingStatsFetchCtrl = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    rankingState.statsLoading = true;
    rankingState.statsError = '';
    renderRankingPage();

    try {
        const response = await fetch(`${API_BASE}/api/ranking-stats`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({ top_n: 500, home_filter: homeFilter, force: !!force, cookie: requestCookie })
        });

        const result = await response.json();
        if (requestId !== rankingStatsFetchId || requestCookie !== cookie) return;

        if (!response.ok || !result.success) {
            rankingState.statsError = result.detail || '加载失败，请重试';
            return;
        }

        rankingState.stats = result;
        if (!rankingState.cachedStats) rankingState.cachedStats = {};
        rankingState.cachedStats[homeFilter] = result;
    } catch (error) {
        if (requestId !== rankingStatsFetchId || requestCookie !== cookie) return;
        console.error('排行榜统计请求异常:', error);
        rankingState.statsError = error.name === 'AbortError' ? '统计超时，请重试' : '请求失败: ' + error.message;
    } finally {
        clearTimeout(timeout);
        if (requestId === rankingStatsFetchId) {
            rankingStatsFetchCtrl = null;
            rankingState.statsLoading = false;
            if (requestCookie === cookie && rankingState.view === 'stats' && lastActiveTab === 'ranking') renderRankingPage();
        }
    }
}

// Statistics interactions are local: no additional profile or leaderboard requests.
function rankingMilestoneGap(input, threshold) {
    const text = String(input ?? '').trim(), mr = Number(text);
    return text && Number.isInteger(mr) && mr > 0 && mr <= 99999
        && typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0 ? mr - threshold : null;
}

function rankingHighlights(stats) {
    const rows = (stats.character_details || []).filter(c => c.count > 0 && c.tool && c.tool !== 'unknown');
    const common = [...rows].sort((a,b) => b.count - a.count)[0];
    const head = (stats.summary?.head_entries || 0) >= 20 ? rows.filter(c => c.count >= 5 && c.top100_count >= 3
        && Number.isFinite(c.head_share_difference) && c.head_share_difference > 0)
        .sort((a,b) => b.head_share_difference - a.head_share_difference)[0] : null;
    const uncommon = rows.filter(c => c.tool !== common?.tool && c.count >= 3 && Number.isFinite(c.max_mr) && c.max_mr > 0)
        .sort((a,b) => a.count - b.count || b.max_mr - a.max_mr)[0];
    return [
        common && {title:'榜单最常见', row:common, value:`${common.percent}%`, note:`${common.count} 条榜单记录`},
        head && {title:'前100占比更高', row:head, value:`+${head.head_share_difference}pp`, note:'相较完整样本的占比差'},
        uncommon && {title:'较少见的上榜角色', row:uncommon, value:`${uncommon.max_mr} MR`, note:`${uncommon.count} 条记录 · 最高MR`}
    ].filter(Boolean);
}

function sortedRankingCharacters(stats, sort, tool = '') {
    const rows = [...(stats.character_details || [])].filter(row => !tool || row.tool === tool);
    const value = row => {
        const n = row[sort === 'median' ? 'median_mr' : sort === 'head' ? 'head_share_difference' : 'count'];
        return typeof n === 'number' && Number.isFinite(n) ? n : -Infinity;
    };
    return rows.sort((a,b) => (value(b) - value(a) || b.count - a.count || String(a.tool).localeCompare(String(b.tool))));
}

function updateRankingStatsView(patch, focusCharacters = false) {
    Object.assign(rankingState, patch);
    const area = document.getElementById('battlesScrollArea'), top = area.scrollTop;
    renderRankingStats(area);
    area.scrollTop = top;
    if (focusCharacters) document.getElementById('rstat-avg')?.scrollIntoView?.({behavior:'smooth',block:'start'});
}

function focusRankingStatsCharacter(tool) {
    updateRankingStatsView({statsCharacterTool:tool, statsShowAll:false,
        statsCollapsed:{...rankingState.statsCollapsed, avg:false}}, true);
}

function openStatsCharacterPicker() {
    const selected = (rankingState.stats?.character_details || []).find(c => c.tool === rankingState.statsCharacterTool);
    const available = CHARACTER_ROSTER.filter(c => (rankingState.stats?.character_details || []).some(row => row.tool === c.tool));
    openCharacterPicker({title:'选择角色（统计参考）', allowAll:true, allLabel:'全部角色', currentValue:selected?.name || '',
        currentId:available.find(c => c.tool === selected?.tool)?.id, availableIds:available.map(c => c.id),
        onSelect:item => updateRankingStatsView({statsCharacterTool:item?.tool || '',statsShowAll:false})});
}

function applyRankingMrInput() {
    const input = document.getElementById('statsMrInput');
    const value = input.value.trim();
    const valid = !value || rankingMilestoneGap(value, 1) !== null;
    if (!valid) { input.setCustomValidity?.('请输入大于0的整数MR'); input.reportValidity?.(); return; }
    input.setCustomValidity?.('');
    updateRankingStatsView({statsMrInput:value});
    document.getElementById('statsMrInput')?.focus?.({preventScroll:true});
}

// Compact hierarchy: overview, milestones, paired charts, then actionable references.
function renderRankingStats(container) {
    const s = rankingState.stats;
    if (!s) return;
    const summary = s.summary;
    const metric = n => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('zh-CN') : '—';
    const charImg = tool => tool ? `<img alt="" src="https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${encodeURIComponent(tool)}_l.png" onerror="this.style.display='none'">` : '';
    const collapsed = rankingState.statsCollapsed || {};
    const card = (key,title,caption,body) => `<section class="rstat-card${collapsed[key] ? ' collapsed' : ''}" id="rstat-${key}"><button class="rstat-title" onclick="toggleRstatCard(${inlineJsString(key)})" aria-expanded="${!collapsed[key]}">${title}<span class="rstat-sub">${caption}</span><span class="rstat-toggle" aria-hidden="true">⌄</span></button><div class="rstat-body">${body}</div></section>`;
    const kpi = (label,value,note) => `<div class="report-stat-card"><div class="report-stat-label">${label}</div><div class="report-stat-value">${value}</div><div class="report-stat-sub">${note}</div></div>`;
    const usage = s.character_usage || [], mr = s.mr_distribution || [];
    const visibleUsage = rankingState.statsUsageAll ? usage : usage.slice(0,8);
    const maxUsage = Math.max(...usage.map(c => c.count),1), maxMr = Math.max(...mr.map(c => c.count),1);
    const usageRows = visibleUsage.map(c => `<button class="rstat-usage-row" onclick="focusRankingStatsCharacter(${inlineJsString(c.tool)})" title="查看${escapeHtml(c.name)}的参考玩家"><span class="rstat-name">${charImg(c.tool)}${escapeHtml(c.name)}</span><span class="report-bar-track"><i class="report-bar-fill" style="width:${c.count / maxUsage * 100}%"></i></span><span class="rstat-val">${c.percent}%<small>${c.count} 条</small></span></button>`).join('');
    const usageBody = usageRows + (usage.length > 8 ? `<button class="report-more-btn rstat-more" onclick="updateRankingStatsView({statsUsageAll:!rankingState.statsUsageAll})">${rankingState.statsUsageAll ? '收起' : `全部 ${usage.length} 个角色`}</button>` : '');
    const mrRows = mr.filter(b => b.count > 0).map(b => `<div class="rstat-row"><span class="rstat-name">${escapeHtml(b.label)}</span><span class="report-bar-track"><i class="report-bar-fill" style="width:${b.count/maxMr*100}%"></i></span><span class="rstat-val">${b.percent}%<small>${b.count} 条</small></span></div>`).join('');
    const thresholds = summary?.thresholds || [];
    const milestoneBody = `<div class="rstat-mr-control"><label for="statsMrInput">对照 MR</label><input id="statsMrInput" type="number" inputmode="numeric" min="1" max="99999" step="1" placeholder="输入你的MR" value="${escapeHtml(rankingState.statsMrInput)}" oninput="this.setCustomValidity('')" onkeydown="if(event.key==='Enter')applyRankingMrInput()"><button class="report-period-btn" onclick="applyRankingMrInput()">对照</button>${rankingState.statsMrInput ? '<button class="report-more-btn" onclick="updateRankingStatsView({statsMrInput:\'\'})">清除</button>' : ''}<span class="insight-muted">仅对照当前门槛，不预测名次</span></div>
        <div class="rstat-milestones">${thresholds.map(t => {const gap=rankingMilestoneGap(rankingState.statsMrInput,t.rating);return `<div><span>#${t.rank}</span><strong>${metric(t.rating)} <small>MR</small></strong>${gap === null ? '' : `<em>${gap === 0 ? '正好持平' : `${gap > 0 ? '高出' : '还差'} ${metric(Math.abs(gap))}`}</em>`}</div>`;}).join('')}</div>`;
    const highlights = rankingHighlights(s);
    const highlightsHtml = highlights.length ? `<div class="rstat-highlights">${highlights.map(h => `<button onclick="focusRankingStatsCharacter(${inlineJsString(h.row.tool)})" title="查看参考玩家"><small>${h.title}</small><div>${charImg(h.row.tool)}<b>${escapeHtml(h.row.name)}</b><strong>${escapeHtml(String(h.value))}</strong></div><span>${escapeHtml(h.note)} <i>参考 →</i></span></button>`).join('')}</div>` : '';
    const details = sortedRankingCharacters(s, rankingState.statsSort, rankingState.statsCharacterTool);
    const shown = rankingState.statsShowAll ? details : details.slice(0,8);
    const playerLink = p => p.user_id ? `<button class="rstat-player-link" onclick="queryPlayerById(${inlineJsString(p.user_id)},event)">${escapeHtml(p.player_name)}<small>${metric(p.rating)} MR</small></button>` : escapeHtml(p.player_name);
    const table = shown.length ? `<div class="insights-table-wrap"><table class="insights-table rstat-character-table"><thead><tr><th>角色</th><th>占比 / 条目</th><th>MR 中位 / 最高</th><th title="前100占比减完整样本占比；pp为百分点">头部占比差 ⓘ</th><th>参考玩家</th></tr></thead><tbody>${shown.map(c => `<tr><td><span class="rstat-name">${charImg(c.tool)}${escapeHtml(c.name)}</span>${c.count < 5 ? '<small>小样本</small>' : ''}</td><td>${c.percent}%<small>${c.count} 条</small></td><td title="${c.mr_samples} 条有效MR">${metric(c.median_mr)} / ${metric(c.max_mr)}</td><td>${c.head_share_difference == null ? '—' : `${c.head_share_difference >= 0 ? '+' : ''}${metric(c.head_share_difference)}pp`}<small>${c.top100_percent == null ? '—' : `前100占比 ${c.top100_percent}%`}</small></td><td>${(c.representatives || []).slice(0,1).map(playerLink).join('')}${c.representatives?.length > 1 ? `<details class="rstat-representatives"><summary>另 ${c.representatives.length-1} 位</summary>${c.representatives.slice(1).map(playerLink).join('')}</details>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="insight-empty">暂无该角色数据，可切换“全部角色”</div>';
    const selected = (s.character_details || []).find(c => c.tool === rankingState.statsCharacterTool);
    const controls = `<div class="rstat-reference-controls"><div class="rstat-sort" aria-label="角色参考排序">${[['count','出场占比'],['median','MR中位数'],['head','头部占比差']].map(([key,label])=>`<button class="report-period-btn${rankingState.statsSort === key ? ' active' : ''}" aria-pressed="${rankingState.statsSort === key}" onclick="updateRankingStatsView({statsSort:${inlineJsString(key)},statsShowAll:false})">${label}</button>`).join('')}</div>${renderCharPickerTrigger({onclick:'openStatsCharacterPicker()',label:'全部角色',value:selected?.name || '',imgMap:{}})}${rankingState.statsCharacterTool ? '<button class="report-more-btn" onclick="updateRankingStatsView({statsCharacterTool:\'\'})">清除</button>' : ''}</div>`;
    const tableBody = controls + table + (details.length > 8 ? `<button class="report-more-btn rstat-more" onclick="updateRankingStatsView({statsShowAll:!rankingState.statsShowAll})">${rankingState.statsShowAll ? '收起' : `展开全部 ${details.length} 个角色`}</button>` : '');
    const regions = (s.region_distribution || []).filter(r => r.name !== '地区未提供' && r.count > 0);
    container.innerHTML = `<div class="ranking-content"><div class="ranking-stats-wrap rstat-dashboard profile-report">
        <div class="ranking-stats-note">${s.home_filter === 3 ? '中国' : '全球'} · Master前${s.top_n} · ${s.updated_at ? escapeHtml(new Date(s.updated_at*1000).toLocaleString('zh-CN')) : '更新时间未知'}${s.from_cache ? ' · 缓存' : ''} · 非强度榜</div>
        ${summary ? `<div class="report-summary-grid rstat-overview">${kpi('榜单样本',`${summary.entries} 条`,`${summary.unique_players ?? '—'} 位玩家`)}${kpi('MR中位数',metric(summary.median_mr),`中间50% ${metric(summary.q1_mr)}–${metric(summary.q3_mr)}`)}${kpi('上榜MR范围',`${metric(summary.min_mr)}–${metric(summary.max_mr)}`,`${summary.mr_samples} 条有效MR`)}${kpi('角色集中度',`${summary.top3_character_share}%`,`前三角色 · 共${summary.character_count}个角色`)}</div>` : ''}
        ${thresholds.length ? card('thresholds','榜单门槛','',milestoneBody) : ''}
        ${highlightsHtml}
        <div class="rstat-charts">${card('usage','角色占比',`${visibleUsage.length} / ${usage.length}角色 · 点击看参考`,usageBody || '<div class="insight-empty">暂无角色数据</div>')}${card('mr','MR分布','按当前榜单样本',mrRows || '<div class="insight-empty">暂无有效MR</div>')}</div>
        ${card('avg','角色与参考玩家',`${details.length}个角色`,tableBody)}
        <details class="rstat-extra"><summary>更多数据与口径${regions.length ? ` · ${regions.length}个地区` : ''}</summary>
        ${regions.length ? `<div class="rstat-regions">${regions.map(r=>`<span>${escapeHtml(r.name)} <b>${r.percent}%</b><small>${r.count} 条</small></span>`).join('')}</div>` : ''}
        <p>仅统计本次返回的Master榜条目，同一玩家不同角色各占一条，不代表全服人口或角色强度。“头部”指官网标记前100的有效样本；占比差为头部减完整样本，pp为百分点。小样本不作强弱结论。MR对照仅使用实际读到的位次门槛，不能推算你的实际排名。未知地区不单独占板块。</p>
        </details></div></div>`;
}

async function fetchRankingData() {
    if (!cookie) {
        showStatus('rankingStatus', '❌ 请先登录后查看排行榜', 'error');
        return;
    }

    // 取消上一次未完成的请求，避免旧响应覆盖新数据
    if (rankingFetchCtrl) rankingFetchCtrl.abort();
    const controller = new AbortController();
    rankingFetchCtrl = controller;
    const myId = ++rankingFetchId;
    const requestCookie = cookie;
    let timedOut = false;
    const timeout = setTimeout(() => {timedOut = true; controller.abort();}, 30000);

    rankingState.loading = true;
    rankingState.error = '';
    if (lastActiveTab === 'ranking') renderRankingPage();

    try {
        // 根据地区设置参数
        const homeFilter = rankingState.homeFilter;
        const homeCategoryId = homeFilter === 3 ? 7 : 0;
        const homeId = homeFilter === 3 ? 36 : 0;

        const response = await fetch(`${API_BASE}/api/ranking`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            signal: controller.signal,
            body: JSON.stringify({
                character_id: rankingState.characterId,
                character_filter: rankingState.characterFilter,
                platform: 1,
                home_filter: homeFilter,
                home_category_id: homeCategoryId,
                home_id: homeId,
                page: rankingState.page,
                season_type: 1,
                cookie: requestCookie
            })
        });

        if (myId !== rankingFetchId || requestCookie !== cookie) return;  // 已被更新的请求取代

        const result = await response.json();

        if (myId !== rankingFetchId || requestCookie !== cookie) return;

        if (!response.ok) {
            // HTTP错误（如403未登录、500服务错误）
            rankingState.data = null;
            rankingState.rankingList = null;
            throw new Error(result.detail || '加载失败，请重试');
        }

        if (result.success) {
            rankingState.data = result.data;
            rankingState.rankingList = result.ranking_list || null;
            rankingState.pagination = result.pagination || null;
        } else {
            throw new Error('加载失败，请重试');
        }
    } catch (error) {
        // 被新请求取消时静默退出，不触碰任何状态
        if ((error.name === 'AbortError' && !timedOut) || myId !== rankingFetchId || requestCookie !== cookie) return;
        console.error('排行榜请求异常:', error);
        rankingState.error = timedOut ? '排行榜加载超时，请重试' : '请求失败: ' + error.message;
    } finally {
        clearTimeout(timeout);
        if (myId === rankingFetchId) {
            rankingState.loading = false;
            rankingFetchCtrl = null;
            if (requestCookie === cookie && lastActiveTab === 'ranking') renderRankingPage();
        }
    }
}
