// Bootstrap and navigation. See README.md (architecture) for module contracts.
// 路由处理 - 根据URL路径和参数显示不同页面
function handleRoute(shouldRefreshHome = false) {
    closePlayerInsights();
    saveBattleView();
    activeBattleViewKey = null;
    cancelNameSearch();
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const uid = urlParams.get('uid');

    if (path !== '/history' && path !== '/history/') {
        historyUpdateCtrl?.abort();
        historyUpdateCtrl = null;
        historyState.updating = false;
    }

    if (path === '/notes' || path === '/notes/') {
        showMatchupNotesPage(urlParams);
    } else if (path === '/history' || path === '/history/') {
        showHistoryPage();
    } else if (path === '/search' || path === '/search/') {
        // 查询页面
        if (uid) {
            // 有uid参数,直接显示查询结果
            showSearchPage(uid);
        } else {
            // 无uid参数,显示搜索框
            showSearchInput();
        }
    } else {
        // 默认主页 /home
        showHomePage(shouldRefreshHome);
    }
}

// 显示主页
function showHomePage(shouldRefresh = false) {
    isHistoryMode = false;
    lastActiveTab = 'home';
    // 重置为 home 模式
    isQueryMode = false;
    queriedUserId = null;
    restoreBattleView('home');

    // 从缓存恢复主页数据（不重新请求）
    matchData = homeData.battleType && homeData.battleType !== currentBattleType ? [] : homeData.matchData;
    // 只有当缓存中有用户信息时才恢复，否则保留当前的 currentUserInfo
    if (homeData.userInfo && homeData.userInfo.user_id) {
        currentUserInfo = homeData.userInfo;
    }
    playerProfile = homeData.profile;

    // 更新侧边栏激活状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.includes('主页')) {
            tab.classList.add('active');
        }
    });

    renderContent();

    // 只有在主页点击主页时才刷新数据（从查询页返回时不刷新）
    if (isLoggedIn && !homeData.loading && (shouldRefresh || !homeData.loaded || homeData.battleType !== currentBattleType)) {
        refreshHomeData();
    }
}

// 监听浏览器后退/前进按钮
window.addEventListener('popstate', () => {
    hideSettingsPage();  // 隐藏设置面板
    handleRoute(false);  // 浏览器导航不触发刷新
});

// 页面加载时处理路由
document.addEventListener('DOMContentLoaded', () => {
    // 初始化主题
    initTheme();

    // 初始化布局
    initLayout();

    // 加载收藏对局数据
    loadFavoriteBattles();

    // 从缓存恢复最新角色清单（含官方新角色）
    restoreCharacterRosterCache();

    // 版本徽章统一显示当前版本
    document.querySelectorAll('.version-badge').forEach(el => {
        el.textContent = APP_VERSION;
    });

    // 后台检查新版本（不打扰用户，失败静默）
    checkForUpdate();

    // 尝试从 localStorage 恢复登录状态
    const restored = loadLoginState();
    if (restored) {
        isLoggedIn = false;
        updateLoginStatus();
        handleRoute(false);
        // 后台验证，不阻塞离线历史，也不把已打开的页面切回主页。
        waitForServerAndRefresh();
    } else {
        handleRoute(false);
    }
});

function showLoading(text) {
    const overlay = document.getElementById('loadingOverlay');
    if (text) {
        const txt = overlay.querySelector('.loading-text');
        if (txt) txt.textContent = text;
    }
    overlay.classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

// 是否停留在主页/查询页：异步完成回调据此决定是否更新界面（后台加载不弹回用户已切走的页面）
function isBattlePageActive() {
    return lastActiveTab === 'home' || lastActiveTab === 'query' || lastActiveTab === 'history';
}

function switchTab(tabName) {
    closePlayerInsights();
    saveBattleView();
    activeBattleViewKey = null;
    cancelNameSearch();
    if (tabName !== 'history') {
        isHistoryMode = false;
        ++historyFetchId;
        historyFetchCtrl?.abort();
        historyUpdateCtrl?.abort();
        historyUpdateCtrl = null;
        historyState.updating = false;
    }
    // 处理设置标签页
    if (tabName === 'settings') {
        lastActiveTab = 'settings';
        showSettingsPage();
        return;
    }

    // 隐藏设置面板
    hideSettingsPage();

    // 根据tab名称跳转到对应路由
    if (tabName === 'home') {
        // 只有在当前已经在主页时才刷新
        const shouldRefresh = (lastActiveTab === 'home');
        lastActiveTab = 'home';

        window.history.pushState({}, '', '/home');
        handleRoute(shouldRefresh);
    } else if (tabName === 'query') {
        lastActiveTab = 'query';

        window.history.pushState({}, '', '/search');
        handleRoute(false);
    } else if (tabName === 'ranking') {
        // 已在排行榜页时再点一次触发刷新（与主页语义一致）
        const shouldRefresh = (lastActiveTab === 'ranking');
        lastActiveTab = 'ranking';
        showRankingPage(shouldRefresh);
    } else if (tabName === 'fighters') {
        // 已在格斗圈页时再点一次触发刷新（与主页语义一致）
        const shouldRefresh = (lastActiveTab === 'fighters');
        lastActiveTab = 'fighters';
        showFightersPage(shouldRefresh);
    } else if (tabName === 'history') {
        lastActiveTab = 'history';
        window.history.pushState({}, '', '/history');
        handleRoute(false);
    } else if (tabName === 'favorites') {
        lastActiveTab = 'favorites';
        showFavoritesPage();
    } else if (tabName === 'notes') {
        lastActiveTab = 'notes';
        window.history.pushState({},'',notebookUrl());
        handleRoute(false);
    }
}

// 刷新主页数据（玩家信息 + 格斗记录）

// 切换图表指标

// ==================== 版本更新检查 ====================

// 比较两个版本号（支持 v 前缀），返回 a-b 的正负：正数表示 a 更新
function compareVersions(a, b) {
    const parse = (v) => String(v || '').replace(/^[vV]/, '').split('.').map(n => parseInt(n) || 0);
    const va = parse(a);
    const vb = parse(b);
    const len = Math.max(va.length, vb.length);
    for (let i = 0; i < len; i++) {
        const x = va[i] || 0;
        const y = vb[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

// 检查新版本：后端代理查询 GitHub Releases 最新版本，带重试（桌面端启动时后端可能尚未就绪）
async function checkForUpdate(retry = 0) {
    try {
        const response = await fetch(`${API_BASE}/api/version-check`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data || !data.success || !data.latest) return;
        const dismissed = localStorage.getItem('sf6_update_dismissed');
        if (compareVersions(data.latest, APP_VERSION) > 0 && dismissed !== data.latest) {
            showUpdateNotice(data.latest);
        }
    } catch (error) {
        // 后端未就绪时稍后重试；接口返回失败（如GitHub不可达）则静默放弃
        if (retry < 6) {
            setTimeout(() => checkForUpdate(retry + 1), 2000);
        }
    }
}

// 右下角新版本提示卡片，关闭后记住该版本不再重复提示
function showUpdateNotice(latest) {
    if (document.getElementById('updateNotice')) return;
    const notice = document.createElement('div');
    notice.id = 'updateNotice';
    notice.className = 'update-notice';
    notice.innerHTML = `
        <span class="update-notice-icon">🚀</span>
        <div class="update-notice-body">
            <div class="update-notice-title">发现新版本 v${escapeHtml(latest)}</div>
            <div class="update-notice-sub">当前版本 ${APP_VERSION}，建议前往 GitHub 下载更新</div>
        </div>
        <a class="update-notice-btn" href="https://github.com/HuuuugePony/sf6-tracker/releases" target="_blank" rel="noopener noreferrer">前往更新</a>
        <button class="update-notice-close" onclick="dismissUpdateNotice(${inlineJsString(latest)})" title="忽略该版本">&times;</button>
    `;
    document.body.appendChild(notice);
}

function dismissUpdateNotice(latest) {
    try {
        localStorage.setItem('sf6_update_dismissed', latest);
    } catch (error) {
        console.warn('保存更新忽略状态失败:', error);
    }
    const el = document.getElementById('updateNotice');
    if (el) el.remove();
}

