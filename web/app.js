        // 检测是否为桌面应用环境（pywebview）
        const isDesktopApp = window.pywebview !== undefined;
        
        // 如果是浏览器访问，立即显示 body
        if (!isDesktopApp) {
            document.body.style.visibility = 'visible';
        }
        
        const API_BASE = 'http://localhost:8000';
        let sessionId = null;
        let cookie = null;
        let isLoggedIn = false;
        
        // 当前显示的数据
        let matchData = [];
        let currentUserInfo = { user_id: null, player_name: null };
        let playerProfile = null;
        
        // 主页数据缓存（登录用户）
        let homeData = {
            matchData: [],
            userInfo: { user_id: null, player_name: null },
            profile: null
        };
        
        // 查询数据缓存（被查询的玩家）
        let queryData = {
            userId: null,
            matchData: [],
            userInfo: { user_id: null, player_name: null },
            profile: null
        };
        
        let currentPage = 1;
        const pageSize = 10;
        const maxPages = 10;
        let currentBattleType = 'all';  // 当前对战类型
        let selectedCharacter = '';  // 选中的角色筛选
        let selectedOpponentCharacter = '';  // 选中的对手角色筛选
        let selectedRivalCharId = null;  // 角色对阵胜率面板选中的角色ID
        let currentViewMode = 'battles';  // 当前视图模式: 'battles' / 'rival_winrate'（对战报告已内嵌到玩家信息卡片）
        let chartMetric = 'mr';  // 图表指标: 'lp' 或 'mr'
        let chartExpanded = true;  // 图表展开状态
        let profileCollapsed = false;  // 玩家信息收起状态
        let isQueryMode = false;  // 是否为查询模式
        let queriedUserId = null;  // 当前查询的用户ID
        let lastActiveTab = 'home';  // 记录上次激活的标签
        let searchHistory = [];  // 历史搜索记录
        let favoritePlayers = [];  // 收藏的玩家列表
        let favoriteBattles = [];  // 收藏的对局列表
        let favBattleFilter = 'all';  // 收藏对局筛选: all/pending/watched
        let querySubTab = 'search';  // 查询页子标签: 'search' | 'footprint'
        let lastSearchResults = [];  // 名字搜索结果缓存（官方 fighter_banner_list 条目，渲染到右侧内容区）
        
        // 当前应用版本（更新提示时与 GitHub Releases 最新版本比较）
        const APP_VERSION = 'v0.6';
        
        // 主页/查询对战数据是否加载中：加载未完成时切走再切回，继续显示加载中而非空状态
        let battleLoading = false;
        
        // 路由处理 - 根据URL路径和参数显示不同页面
        function handleRoute(shouldRefreshHome = false) {
            const path = window.location.pathname;
            const urlParams = new URLSearchParams(window.location.search);
            const uid = urlParams.get('uid');
            
            if (path === '/search' || path === '/search/') {
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
            // 重置为 home 模式
            isQueryMode = false;
            queriedUserId = null;
            currentBattleType = 'all';
            selectedCharacter = '';  // 重置角色筛选
            selectedOpponentCharacter = '';  // 重置对手筛选
            selectedRivalCharId = null;  // 重置对阵胜率面板选中角色
            currentPage = 1;  // 重置页码
            
            // 从缓存恢复主页数据（不重新请求）
            matchData = homeData.matchData;
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
            if (isLoggedIn && shouldRefresh) {
                refreshHomeData();
            }
        }
        
        // 显示搜索输入页面
        function showSearchInput() {
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
        
        // 显示搜索结果页面
        async function showSearchPage(userId) {
            // 设置为查询模式
            isQueryMode = true;
            queriedUserId = userId;
            currentBattleType = 'all';
            selectedCharacter = '';  // 重置角色筛选
            selectedOpponentCharacter = '';  // 重置对手筛选
            selectedRivalCharId = null;  // 重置对阵胜率面板选中角色
            currentPage = 1;  // 重置页码
            
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
            if (!cookie) {
                renderQueryPage();
                showQueryHint('❌ 请先登录后查看其他玩家战绩', 'error');
                return;
            }
            
            // 先渲染查询页面（显示加载遮罩）
            renderQueryPage();
            
            // 执行查询
            await executeQuery(userId);
        }
        
        // 执行查询操作
        async function executeQuery(userId) {
            const queryBtn = document.getElementById('queryBtn');
            
            try {
                if (queryBtn) queryBtn.disabled = true;
                
                // 统一加载显示：内容区spinner（无遮罩不阻挡操作）
                document.getElementById('battlesScrollArea').innerHTML = loadingHtml(`正在查询玩家 ${userId} ...`);
                
                const response = await fetch(`${API_BASE}/api/query-player`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        user_id: userId,
                        cookie: cookie,
                        pages: 10,
                        max_workers: 5,
                        battle_type: currentBattleType
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 保存到查询数据缓存
                    queryData.userId = userId;
                    queryData.matchData = sanitizeRecords(data.data);
                    queryData.userInfo = data.user_info || { user_id: userId, player_name: `玩家${userId}` };
                    queryData.profile = data.player_profile || null;
                    
                    // 更新当前显示的数据
                    matchData = queryData.matchData;
                    currentUserInfo = queryData.userInfo;
                    playerProfile = queryData.profile;
                    
                    // 更新收藏中的玩家名称
                    if (currentUserInfo.player_name) {
                        updateFavoritePlayerName(userId, currentUserInfo.player_name);
                    }
                    
                    // 渲染内容（用户已切走页面时不弹回，数据已保存，切回后重新进入即可查看）
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                } else {
                    if (lastActiveTab === 'query') {
                        renderQueryPage();
                        showQueryHint('❌ 查询失败', 'error');
                    }
                }
            } catch (error) {
                console.error('查询请求异常:', error);
                if (lastActiveTab === 'query') {
                    renderQueryPage();
                    showQueryHint(`❌ 查询失败: ${error.message}`, 'error');
                }
            } finally {
                if (queryBtn) queryBtn.disabled = false;
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
                updateLoginStatus();
                // 先渲染主页（显示空状态或缓存数据）
                handleRoute(false);
                // 等待后端服务就绪后自动刷新
                waitForServerAndRefresh();
            } else {
                handleRoute(false);  // 未登录时不触发刷新
            }
        });
        
        // 等待后端服务就绪并自动刷新
        async function waitForServerAndRefresh() {
            const maxRetries = 10;  // 最多重试10次
            const retryDelay = 500;  // 每次间隔500ms
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    // 尝试请求一个轻量级接口检测服务是否就绪
                    const response = await fetch(`${API_BASE}/`, {
                        method: 'GET'
                    });
                    
                    if (response.ok) {
                        // 先设置用户信息到后端（因为后端重启后全局变量会丢失）
                        if (currentUserInfo && currentUserInfo.user_id) {
                            try {
                                await fetch(`${API_BASE}/api/set-user-info`, {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify(currentUserInfo)
                                });
                            } catch (error) {
                                console.error('同步用户信息失败:', error);
                            }
                        }
                        
                        // 后台更新角色列表（自动发现官方新角色，不阻塞主页刷新）
                        loadCharacterRoster();
                        
                        // 然后刷新主页数据
                        refreshHomeData();
                        return;
                    }
                } catch (error) {
                    // 等待后重试
                }
                
                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
            
            console.warn('后端服务启动超时，请手动刷新');
        }

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
            return lastActiveTab === 'home' || lastActiveTab === 'query';
        }
        
        function showLoginModal() {
            if (isLoggedIn) {
                return;
            }
            document.getElementById('loginModal').classList.add('show');
        }
        
        function hideLoginModal() {
            document.getElementById('loginModal').classList.remove('show');
        }
        
        function updateLoginStatus() {
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            const loginBtn = document.getElementById('headerLoginBtn');
            const userInfo = document.getElementById('userInfo');
            const playerName = document.getElementById('playerName');
            const userId = document.getElementById('userId');
            
            if (isLoggedIn) {
                indicator.classList.add('logged-in');
                statusText.textContent = '已登录';
                loginBtn.style.display = 'none';
                
                // 显示玩家名称和用户码
                if (currentUserInfo.player_name) {
                    playerName.textContent = currentUserInfo.player_name;
                } else {
                    playerName.textContent = '未知玩家';
                }
                
                if (currentUserInfo.user_id) {
                    userId.textContent = `(${currentUserInfo.user_id})`;
                } else {
                    userId.textContent = '(-)';
                }
                
                // 始终显示用户信息区域
                userInfo.style.display = 'flex';
            } else {
                indicator.classList.remove('logged-in');
                statusText.textContent = '未登录';
                loginBtn.style.display = 'block';
                userInfo.style.display = 'none';
            }
        }
        
        // 保存登录状态到 localStorage
        function saveLoginState() {
            try {
                const loginState = {
                    cookie: cookie,
                    userInfo: currentUserInfo,
                    timestamp: Date.now()
                };
                localStorage.setItem('sf6_login_state', JSON.stringify(loginState));
            } catch (error) {
                console.error('保存登录状态失败:', error);
            }
        }
        
        // 从 localStorage 加载登录状态
        function loadLoginState() {
            try {
                const savedState = localStorage.getItem('sf6_login_state');
                if (savedState) {
                    const loginState = JSON.parse(savedState);
                    
                    // 检查是否过期（7天）
                    const sevenDays = 7 * 24 * 60 * 60 * 1000;
                    if (Date.now() - loginState.timestamp > sevenDays) {
                        console.warn('登录状态已过期，清除缓存');
                        localStorage.removeItem('sf6_login_state');
                        return false;
                    }
                    
                    // 恢复登录状态
                    cookie = loginState.cookie;
                    currentUserInfo = loginState.userInfo;
                    isLoggedIn = true;
                    return true;
                }
            } catch (error) {
                console.error('加载登录状态失败:', error);
            }
            return false;
        }
        
        // 清除登录状态
        function clearLoginState() {
            localStorage.removeItem('sf6_login_state');
            cookie = null;
            currentUserInfo = { user_id: null, player_name: null };
            isLoggedIn = false;
            updateLoginStatus();
        }
        
        // 退出登录
        function logout() {
            clearLoginState();
            // 重定向到主页
            window.history.pushState({}, '', '/home');
            handleRoute(false);
        }
        
        function switchTab(tabName) {
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
            } else if (tabName === 'favorites') {
                lastActiveTab = 'favorites';
                showFavoritesPage();
            }
        }
        
        // ==================== 设置面板功能 ====================
        
        function showSettingsPage() {
            // 更新侧边栏激活状态
            document.querySelectorAll('.sidebar-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.textContent.includes('设置')) {
                    tab.classList.add('active');
                }
            });
            
            // 隐藏主内容，显示设置面板
            document.getElementById('scrollableContent').style.display = 'none';
            document.getElementById('settingsPanel').style.display = 'block';
        }
        
        function hideSettingsPage() {
            document.getElementById('scrollableContent').style.display = '';
            document.getElementById('settingsPanel').style.display = 'none';
        }
        
        // 主题切换（dark / light / sf6）
        function setTheme(theme) {
            document.body.classList.remove('light-theme', 'sf6-theme');
            ['themeDarkBtn', 'themeLightBtn', 'themeSf6Btn'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                document.getElementById('themeLightBtn').classList.add('active');
            } else if (theme === 'sf6') {
                document.body.classList.add('sf6-theme');
                document.getElementById('themeSf6Btn').classList.add('active');
            } else {
                document.getElementById('themeDarkBtn').classList.add('active');
            }
            localStorage.setItem('sf6_theme', theme);
        }
        
        // 清空缓存 - 双击确认
        let clearCacheTimer = null;
        function clearCache() {
            const btn = document.querySelector('.btn-clear-cache');
            if (btn.classList.contains('confirm-state')) {
                // 第二次点击，执行清空
                clearTimeout(clearCacheTimer);
                btn.classList.remove('confirm-state');
                btn.textContent = '清空';
                
                // 清除localStorage
                localStorage.clear();
                
                // 重置前端状态
                cookie = null;
                isLoggedIn = false;
                matchData = [];
                currentUserInfo = { user_id: null, player_name: null };
                playerProfile = null;
                homeData = { matchData: [], userInfo: { user_id: null, player_name: null }, profile: null };
                queryData = { userId: null, matchData: [], userInfo: { user_id: null, player_name: null }, profile: null };
                searchHistory = [];
                favoritePlayers = [];
                favoriteBattles = [];
                favBattleFilter = 'all';
                
                // 更新UI
                updateLoginStatus();
                
                // 短暂显示成功状态
                btn.textContent = '已清空';
                btn.classList.add('done-state');
                setTimeout(() => {
                    btn.classList.remove('done-state');
                    btn.textContent = '清空';
                }, 1500);
            } else {
                // 第一次点击，进入确认状态
                btn.classList.add('confirm-state');
                btn.textContent = '确认清空？';
                // 3秒后自动复位
                clearTimeout(clearCacheTimer);
                clearCacheTimer = setTimeout(() => {
                    btn.classList.remove('confirm-state');
                    btn.textContent = '清空';
                }, 3000);
            }
        }
        
        // 初始化主题（从localStorage恢复）
        function initTheme() {
            const savedTheme = localStorage.getItem('sf6_theme');
            if (savedTheme === 'light') {
                setTheme('light');
            } else if (savedTheme === 'sf6') {
                setTheme('sf6');
            } else {
                setTheme('dark');
            }
        }
        
        // 布局密度切换
        function setLayout(layout) {
            if (layout === 'compact') {
                document.body.classList.remove('spacious-mode');
                document.getElementById('layoutCompactBtn').classList.add('active');
                document.getElementById('layoutSpaciousBtn').classList.remove('active');
            } else {
                document.body.classList.add('spacious-mode');
                document.getElementById('layoutSpaciousBtn').classList.add('active');
                document.getElementById('layoutCompactBtn').classList.remove('active');
            }
            localStorage.setItem('sf6_layout', layout);
        }
        
        // 初始化布局（从 localStorage恢复）
        function initLayout() {
            const savedLayout = localStorage.getItem('sf6_layout');
            if (savedLayout === 'spacious') {
                setLayout('spacious');
            } else {
                setLayout('compact');
            }
        }
                
        // ==================== 排行榜功能 ====================
                
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
            view: 'list',  // 二级导航: list=排行榜, stats=数据统计
            stats: null,  // 统计接口返回数据
            statsLoading: false,
            statsError: '',
            statsCollapsed: {},  // 统计卡片收起状态 {usage/mr/avg: bool}
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
        function loadingHtml(text) {
            return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding-bottom:12%">
                <div class="spinner" style="margin-bottom:0"></div>
                <div class="empty-state-text" style="color:#999">${text}</div></div>`;
        }
        // 复用模板：空状态
        function emptyStateHtml(icon, text) {
            return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">${text}</div></div>`;
        }

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
                const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${charTool}_l.png` : '';
                const charImgHtml = charImgUrl
                    ? `<img src="${charImgUrl}" alt="${charName}" onerror="this.parentElement.innerHTML='<div class=\\'char-fallback\\'>${charName}</div>'">`
                    : `<div class="char-fallback">${charName || '?'}</div>`;
                
                // 官方称号图（图片区底图：上下充满卡片，信息叠在图片上方）
                const emblemImgHtml = titlePlate
                    ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${titlePlate}.png" alt="" onerror="this.style.display='none'">`
                    : '';
                // 官方段位图标（优先实际段位master_league，legend优先）
                const rankIconUrl = getRankingRankIconUrl(mr, player.master_league);
                // 卡片整体可点击：查询该玩家
                const cardClickAttrs = shortId
                    ? ` onclick="queryPlayerById('${shortId}', event)"`
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
                                    ${platform ? `<span class="ranking-card-platform">${platform}</span>` : ''}
                                    <span class="ranking-player-name">${name}</span>
                                </div>
                                ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${titleVal}</span></div>` : ''}
                                <div class="ranking-card-meta">
                                    ${renderFlagHtml(homeId, region)}
                                    <span>${charName}</span>
                                    ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard('${shortId}', event)" title="右键复制ID">${shortId}</span>` : ''}
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
            if (card) card.classList.toggle('collapsed', !!rankingState.statsCollapsed[key]);
        }
        
        // 数据统计地区筛选栏已移至nav-panel内，不再单独渲染
        
        // 切换统计地区：优先用本地缓存，无缓存时重新拉取
        function changeStatsRegion(filter) {
            if (rankingState.statsHomeFilter === filter || rankingState.statsLoading) return;
            rankingState.statsHomeFilter = filter;
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
            
            rankingState.statsLoading = true;
            rankingState.statsError = '';
            renderRankingPage();
            
            try {
                const response = await fetch(`${API_BASE}/api/ranking-stats`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ top_n: 500, home_filter: rankingState.statsHomeFilter, force: !!force, cookie: cookie })
                });
                
                const result = await response.json();
                
                if (!response.ok || !result.success) {
                    rankingState.statsError = result.detail || '加载失败，请重试';
                    return;
                }
                
                rankingState.stats = result;
                if (!rankingState.cachedStats) rankingState.cachedStats = {};
                rankingState.cachedStats[rankingState.statsHomeFilter] = result;
            } catch (error) {
                console.error('排行榜统计请求异常:', error);
                rankingState.statsError = '请求失败: ' + error.message;
            } finally {
                rankingState.statsLoading = false;
                if (rankingState.view === 'stats' && lastActiveTab === 'ranking') renderRankingPage();
            }
        }
        
        // 渲染数据统计面板（角色使用 / MR分段 / 平均排名）
        function renderRankingStats(container) {
            const s = rankingState.stats;
            if (!s) return;
            
            const charImg = (tool) => tool
                ? `<img src="https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${tool}_l.png" onerror="this.style.display='none'">`
                : '';
            
            // 1. 角色使用情况（数量/占比）
            const maxUsage = Math.max(...s.character_usage.map(c => c.count), 1);
            const usageRows = s.character_usage.map(c => `
                <div class="rstat-row">
                    <span class="rstat-name" title="${c.name}">${charImg(c.tool)}${c.name}</span>
                    <div class="report-bar-track"><div class="report-bar-fill" style="width:${(c.count / maxUsage * 100).toFixed(1)}%"></div></div>
                    <span class="rstat-val">${c.count}人 · ${c.percent}%</span>
                </div>
            `).join('');
            
            // 2. MR分段占比
            const maxMr = Math.max(...s.mr_distribution.map(b => b.count), 1);
            const mrRows = s.mr_distribution.map(b => `
                <div class="rstat-row">
                    <span class="rstat-name">${b.label}</span>
                    <div class="report-bar-track"><div class="report-bar-fill" style="width:${(b.count / maxMr * 100).toFixed(1)}%"></div></div>
                    <span class="rstat-val">${b.count}人 · ${b.percent}%</span>
                </div>
            `).join('');
            
            // 3. 角色平均排名（按平均排名升序）
            const maxAvgCount = Math.max(...s.char_avg_rank.map(c => c.count), 1);
            const avgRows = s.char_avg_rank.map(c => `
                <div class="rstat-row">
                    <span class="rstat-name" title="${c.name}">${charImg(c.tool)}${c.name}</span>
                    <div class="report-bar-track"><div class="report-bar-fill" style="width:${(c.count / maxAvgCount * 100).toFixed(1)}%"></div></div>
                    <span class="rstat-val"><span class="rstat-avg">平均${c.avg_rank}名</span> · ${c.count}人</span>
                </div>
            `).join('');
            
            const updatedAt = s.updated_at ? new Date(s.updated_at * 1000).toLocaleString() : '';
            const collapsed = rankingState.statsCollapsed || {};
            const regionName = s.home_filter === 3 ? '中国' : '全球';
            
            const cardHtml = (key, icon, title, sub, rowsHtml) => `
                <div class="rstat-card${collapsed[key] ? ' collapsed' : ''}" id="rstat-${key}">
                    <div class="rstat-title" onclick="toggleRstatCard('${key}')" title="点击收起/展开">
                        ${icon} ${title} <span class="rstat-sub">${sub}</span><span class="rstat-toggle">▼</span>
                    </div>
                    <div class="rstat-body">${rowsHtml || '<div class="empty-state-text">暂无数据</div>'}</div>
                </div>
            `;
            
            container.innerHTML = `
                <div class="ranking-content">
                    <div class="ranking-stats-wrap">
                        <div class="ranking-stats-note">统计范围：${regionName} · Master榜前${s.top_n}名（传奇段位）${updatedAt ? ' · 更新于 ' + updatedAt : ''}${s.from_cache ? '（缓存）' : ''}</div>
                        ${cardHtml('usage', '👥', '角色使用情况', `前${s.top_n}名玩家的角色数量与占比`, usageRows)}
                        ${cardHtml('mr', '📈', 'MR分段占比', `前${s.top_n}名玩家Master分数分布`, mrRows)}
                        ${cardHtml('avg', '🎯', '角色平均排名', `前${s.top_n}名内各角色玩家的平均名次（越靠前越强）`, avgRows)}
                    </div>
                </div>
            `;
        }
                
        async function fetchRankingData() {
            if (!cookie) {
                showStatus('rankingStatus', '❌ 请先登录后查看排行榜', 'error');
                return;
            }
            
            // 取消上一次未完成的请求，避免旧响应覆盖新数据
            if (rankingFetchCtrl) rankingFetchCtrl.abort();
            rankingFetchCtrl = new AbortController();
            const myId = ++rankingFetchId;
                    
            rankingState.loading = true;
            const battlesScrollArea = document.getElementById('battlesScrollArea');
            battlesScrollArea.innerHTML = loadingHtml('正在加载排行榜...');
                    
            try {
                // 根据地区设置参数
                const homeFilter = rankingState.homeFilter;
                const homeCategoryId = homeFilter === 3 ? 7 : 0;
                const homeId = homeFilter === 3 ? 36 : 0;
                        
                const response = await fetch(`${API_BASE}/api/ranking`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    signal: rankingFetchCtrl.signal,
                    body: JSON.stringify({
                        character_id: rankingState.characterId,
                        character_filter: rankingState.characterFilter,
                        platform: 1,
                        home_filter: homeFilter,
                        home_category_id: homeCategoryId,
                        home_id: homeId,
                        page: rankingState.page,
                        season_type: 1,
                        cookie: cookie
                    })
                });
                
                if (myId !== rankingFetchId) return;  // 已被更新的请求取代
                        
                const result = await response.json();
                
                if (myId !== rankingFetchId) return;
                
                if (!response.ok) {
                    // HTTP错误（如403未登录、500服务错误）
                    rankingState.loading = false;
                    rankingState.data = null;
                    rankingState.rankingList = null;
                    if (lastActiveTab === 'ranking') {
                        battlesScrollArea.innerHTML = emptyStateHtml('❌', result.detail || '加载失败，请重试');
                    }
                    return;
                }
                        
                if (result.success) {
                    rankingState.data = result.data;
                    rankingState.rankingList = result.ranking_list || null;
                    rankingState.pagination = result.pagination || null;
                    rankingState.loading = false;
                    if (lastActiveTab === 'ranking') {
                        renderRankingTable(battlesScrollArea);
                    }
                } else {
                    rankingState.loading = false;
                    if (lastActiveTab === 'ranking') {
                        battlesScrollArea.innerHTML = emptyStateHtml('❌', '加载失败，请重试');
                    }
                }
            } catch (error) {
                // 被新请求取消时静默退出，不触碰任何状态
                if (error.name === 'AbortError' || myId !== rankingFetchId) return;
                console.error('排行榜请求异常:', error);
                rankingState.loading = false;
                if (lastActiveTab === 'ranking') {
                    battlesScrollArea.innerHTML = emptyStateHtml('❌', '请求失败: ' + error.message);
                }
            }
        }
        
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
        let fightersFetchCtrl = null;
        let fightersFetchId = 0;
        let rankingFetchCtrl = null;
        let rankingFetchId = 0;
        let battleFetchCtrl = null;  // 主页/查询的对战数据加载共用
        
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
            if (fightersState.loading) {
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
            return `<img class="ranking-card-flag" src="https://www.streetfighter.com/6/buckler/assets/images/material/national_frag/frag${String(homeId).padStart(3, '0')}.png" width="18" height="12" alt="${escapeHtml(region || '')}" title="${escapeHtml(region || '')}" onerror="this.outerHTML='<span class=\\'ranking-card-region\\'>🌐 ${escapeHtml(region || '')}</span>'">`;
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
                const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${charTool}_l.png` : '';
                const charImgHtml = charImgUrl
                    ? `<img src="${charImgUrl}" alt="${charName}" onerror="this.parentElement.innerHTML='<div class=\\'char-fallback\\'>${charName || '?'}</div>'">`
                    : `<div class="char-fallback">${charName || '?'}</div>`;
                
                // 官方称号底板图（与排行榜卡片一致）
                const emblemImgHtml = titlePlate
                    ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${titlePlate}.png" alt="" onerror="this.style.display='none'">`
                    : '';
                // 官方段位图标（API真实段位，无legend回退）
                const rankIconUrl = getFightersRankIconUrl(leagueRank, masterLeague);
                // 卡片整体可点击：查询该玩家（与排行榜一致）
                const cardClickAttrs = shortId
                    ? ` onclick="queryPlayerById('${shortId}', event)"`
                    : '';
                
                return `
                    <div class="ranking-card fighters-card${titlePlate ? ' has-emblem' : ''}"${cardClickAttrs}>
                        <div class="ranking-card-visual${titlePlate ? ' has-emblem' : ''}">
                            ${emblemImgHtml}
                            <div class="ranking-card-info">
                                <div class="ranking-card-name-row">
                                    ${platform ? `<span class="ranking-card-platform">${platform}</span>` : ''}
                                    <span class="ranking-player-name">${name}</span>
                                    ${onlineStatus ? `<span class="fighters-online-status ${onlineOffline ? 'offline' : ''}">${onlineStatus}</span>` : ''}
                                </div>
                                ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${titleVal}</span></div>` : ''}
                                <div class="ranking-card-meta">
                                    ${renderFlagHtml(homeId, region)}
                                    ${charName ? `<span>${charName}</span>` : ''}
                                    ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard('${shortId}', event)" title="右键复制ID">${shortId}</span>` : ''}
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
            fightersFetchCtrl = new AbortController();
            const myId = ++fightersFetchId;
            
            fightersState.loading = true;
            renderFightersPage();  // 刷新按钮进入置灰禁用态 + 列表区显示加载动画
            
            try {
                const response = await fetch(`${API_BASE}/api/fighters-list`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    signal: fightersFetchCtrl.signal,
                    body: JSON.stringify({
                        list_type: fightersState.listType,
                        page: fightersState.pages[fightersState.listType],
                        order_type: fightersState.orderType,
                        order_order: fightersState.orderOrder,
                        cookie: cookie
                    })
                });
                
                if (myId !== fightersFetchId) return false;  // 已被更新的请求取代
                
                const result = await response.json();
                
                if (myId !== fightersFetchId) return false;
                
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
                if (error.name === 'AbortError' || myId !== fightersFetchId) {
                    return false;
                }
                console.error('格斗圈请求异常:', error);
                fightersState.loading = false;
                if (lastActiveTab === 'fighters') {
                    renderFightersPage();
                    document.getElementById('battlesScrollArea').innerHTML = emptyStateHtml('❌', '请求失败: ' + error.message);
                }
                return false;
            }
        }
        
        // 点击后立即刷新二级导航选中态（不等数据请求返回后的整体重渲染）
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
        
        // 刷新主页数据（玩家信息 + 格斗记录）
        async function refreshHomeData() {
            if (!cookie) {
                return;
            }
            
            // 取消上一次未完成的对战数据加载
            if (battleFetchCtrl) battleFetchCtrl.abort();
            battleFetchCtrl = new AbortController();
            const battleSignal = battleFetchCtrl.signal;
            
            // 统一加载显示：内容区spinner；用户已切走页面时后台静默加载不弹回
            if (isBattlePageActive()) {
                document.getElementById('battlesScrollArea').innerHTML = loadingHtml('全力加载中...');
            }
            battleLoading = true;  // 切走再切回时保持加载中显示
            
            try {
                let response;
                
                if (isQueryMode && queriedUserId) {
                    // 查询模式：刷新查询用户的数据
                    response = await fetch(`${API_BASE}/api/query-player`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        signal: battleSignal,
                        body: JSON.stringify({
                            user_id: queriedUserId,
                            cookie: cookie,
                            pages: 10,
                            max_workers: 5,
                            battle_type: currentBattleType
                        })
                    });
                } else {
                    // 主页模式：刷新登录用户的数据
                    response = await fetch(`${API_BASE}/api/crawl`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        signal: battleSignal,
                        body: JSON.stringify({
                            cookie: cookie,
                            pages: 10,
                            max_workers: 10,
                            battle_type: currentBattleType
                        })
                    });
                }
                
                const data = await response.json();
                
                if (data.success) {
                    // 更新格斗记录
                    matchData = sanitizeRecords(data.data);
                    
                    // 主页模式下同步官方最新玩家名（游戏内改名后右上角自动更新），查询模式不覆盖登录用户信息
                    if (!isQueryMode && data.user_info && data.user_info.player_name
                            && data.user_info.player_name !== currentUserInfo.player_name) {
                        currentUserInfo.player_name = data.user_info.player_name;
                        homeData.userInfo = currentUserInfo;
                        saveLoginState();
                        updateLoginStatus();
                    }
                    
                    // 更新玩家资料
                    if (data.player_profile) {
                        playerProfile = data.player_profile;
                    }
                    
                    // 保存到主页数据缓存
                    homeData.matchData = matchData;
                    homeData.userInfo = currentUserInfo;
                    homeData.profile = playerProfile;
                    
                    // 重新渲染内容（用户已切走页面时不弹回）
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                } else {
                    console.error('刷新失败:', data);
                    // 检查是否是Cookie失效
                    if (data.detail && (data.detail.includes('未找到用户信息') || data.detail.includes('重新登录'))) {
                        console.warn('Cookie已失效，清除登录状态');
                        clearLoginState();
                        alert('登录状态已过期，请重新登录');
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') return;  // 被新加载取消，静默退出
                console.error('刷新请求异常:', error);
            } finally {
                if (!battleSignal.aborted) {
                    battleLoading = false;
                }
            }
        }
        
        function renderContent() {
            const fixedNavSection = document.getElementById('fixedNavSection');
            const battlesScrollArea = document.getElementById('battlesScrollArea');
            
            if (!isLoggedIn && !isQueryMode) {
                fixedNavSection.innerHTML = emptyStateHtml('🔒', '请先登录后查看战绩');
                battlesScrollArea.innerHTML = '';
                return;
            }
            
            // 渲染固定区域（玩家资料 + 导航栏）- 始终显示
            let fixedHtml = '';
            
            // 始终显示玩家资料
            if (playerProfile) {
                fixedHtml += renderPlayerProfile();
            }
            
            // 渲染二级导航栏（包含角色筛选）
            fixedHtml += `
                <div class="sub-nav">
                    <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'all' ? 'active' : ''}" data-mode="battles" data-type="all" onclick="switchViewMode('battles'); switchBattleType('all')">全部</div>
                    <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'rank' ? 'active' : ''}" data-mode="battles" data-type="rank" onclick="switchViewMode('battles'); switchBattleType('rank')">排位赛</div>
                    <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'casual' ? 'active' : ''}" data-mode="battles" data-type="casual" onclick="switchViewMode('battles'); switchBattleType('casual')">休闲赛</div>
                    <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'custom' ? 'active' : ''}" data-mode="battles" data-type="custom" onclick="switchViewMode('battles'); switchBattleType('custom')">比赛间对战</div>
                    <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'hub' ? 'active' : ''}" data-mode="battles" data-type="hub" onclick="switchViewMode('battles'); switchBattleType('hub')">格斗中心对战</div>
                    <div class="sub-nav-item ${currentViewMode === 'rival_winrate' ? 'active' : ''}" data-mode="rival_winrate" onclick="switchViewMode('rival_winrate')">角色对阵</div>
                    <div class="character-filter">
                        ${currentViewMode === 'rival_winrate' ? `
                            ${(() => {
                                const rivalCharName = selectedRivalCharId ? getCharacterNameById(selectedRivalCharId) : '';
                                return renderCharPickerTrigger({ onclick: 'openRivalCharacterPicker()', label: '选择角色', value: rivalCharName, imgMap: buildCharacterImageMap() });
                            })()}
                        ` : (currentViewMode === 'battles' ? `
                            ${(() => {
                                const imgMap = buildCharacterImageMap();
                                return renderCharPickerTrigger({ onclick: 'openMyCharacterPicker()', label: '全部角色', value: getCharacterDisplayName(selectedCharacter), imgMap: imgMap })
                                    + renderCharPickerTrigger({ onclick: 'openOpponentCharacterPicker()', label: '全部对手', value: getCharacterDisplayName(selectedOpponentCharacter), imgMap: imgMap });
                            })()}
                        ` : '')}
                    </div>
                </div>
            `;
            
            fixedNavSection.innerHTML = fixedHtml;
            
            // 渲染可滚动区域
            if (currentViewMode === 'rival_winrate') {
                // 角色对阵胜率模式
                battlesScrollArea.innerHTML = renderRivalWinrateContent();
            } else if (matchData.length === 0) {
                // 数据加载中时继续显示加载动画，避免切走再切回时误显示空状态
                battlesScrollArea.innerHTML = battleLoading
                    ? loadingHtml('全力加载中...')
                    : emptyStateHtml('📊', '暂无对战记录');
            } else {
                // 渲染折线图和战绩列表
                let scrollableHtml = renderLineChart();
                scrollableHtml += renderMatchCardsHTML();
                battlesScrollArea.innerHTML = scrollableHtml;
                
                // 添加图表节点的事件监听
                setTimeout(() => {
                    initChartTooltip();
                }, 100);
            }
            
            // 绑定滚动联动（向下滚收起玩家信息，到顶继续上滚展开）
            initProfileScrollToggle();
        }
        
        function renderPlayerProfile() {
            if (!playerProfile) return '';
            
            // 获取当前显示的玩家信息
            const displayPlayerName = playerProfile.player_name || currentUserInfo.player_name || '未知玩家';
            const displayPlayerId = queriedUserId || currentUserInfo.user_id || '-';
            
            // 检查是否已收藏
            const isFavorited = favoritePlayers.some(p => p.userId === displayPlayerId);
            const favButtonText = isFavorited ? '★' : '☆';
            const favButtonTitle = isFavorited ? '取消收藏' : '加入收藏';
            
            // 在线状态样式
            const onlineStatus = playerProfile.online_status_name || '';
            let statusClass = 'status-offline';
            
            // 只要有状态文本且不是离线，就显示为活跃状态
            if (onlineStatus && onlineStatus.trim() !== '') {
                // 只有明确包含"离线"或"オフライン"才是离线状态
                if (!onlineStatus.includes('离线') && !onlineStatus.includes('オフライン')) {
                    statusClass = 'status-online';
                }
            }
            
            const statusBadge = onlineStatus ? `<span class="online-status-badge ${statusClass}">${onlineStatus}</span>` : '';
            
            // 战斗统计详细数据
            const detail = playerProfile.battle_stats_detail || {};
            const fmtPct = (v) => v ? (v * 100).toFixed(2) + '%' : '0.00%';
            const fmtCount = (v) => v ? v.toFixed(1) + '次' : '0.0次';
            const fmtTime = (v) => v ? v.toFixed(1) + '秒' : '0.0秒';
            const fmtInt = (v) => v ? v.toString() : '0';
            
            return `
                <div class="player-profile-section ${profileCollapsed ? 'collapsed' : ''}">
                    <div class="profile-header">
                        <div class="profile-title">玩家信息</div>
                        <div class="profile-player-info">
                            ${statusBadge}
                            <span class="profile-player-name" oncontextmenu="return copyToClipboard('${displayPlayerName}', event)" title="右键复制名称">${displayPlayerName}</span>
                            <span class="profile-player-id" oncontextmenu="return copyToClipboard('${displayPlayerId}', event)" title="右键复制ID">(${displayPlayerId})</span>
                            ${isQueryMode && queriedUserId ? `
                                <button class="btn-toggle-favorite" onclick="toggleFavorite('${displayPlayerId}', '${displayPlayerName}')" title="${favButtonTitle}">${favButtonText}</button>
                            ` : ''}
                            <button class="profile-collapse-btn" onclick="toggleProfileCollapse()" title="${profileCollapsed ? '展开详情' : '收起详情'}">
                                <span class="profile-collapse-arrow">▲</span>
                            </button>
                        </div>
                    </div>
                    <div class="profile-body-wrapper">
                    <div class="profile-stats">
                        <div class="stat-item">
                            <div class="stat-label">排位赛</div>
                            <div class="stat-value">${playerProfile.rank_matches || '0'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">休闲赛</div>
                            <div class="stat-value">${playerProfile.casual_matches || '0'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">比赛间对战</div>
                            <div class="stat-value">${playerProfile.custom_matches || '0'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">格斗中心对战</div>
                            <div class="stat-value">${playerProfile.hub_matches || '0'}</div>
                        </div>
                        <div class="stat-item stat-time">
                            <div class="stat-label">练习时间</div>
                            <div class="stat-value">${playerProfile.practice_time || '-'}</div>
                        </div>
                        <div class="stat-item stat-time">
                            <div class="stat-label">排位赛时间</div>
                            <div class="stat-value">${playerProfile.rank_time || '-'}</div>
                        </div>
                        <div class="stat-item stat-time">
                            <div class="stat-label">我的比赛间对战时间</div>
                            <div class="stat-value">${playerProfile.my_custom_time || '-'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">挑战完成次数</div>
                            <div class="stat-value">${fmtInt(playerProfile.challenges_completed)}</div>
                        </div>
                    </div>
                    
                    <div class="profile-report">
                        ${matchData && matchData.length ? renderReportContent() : ''}
                    </div>
                    
                    <div class="profile-detail-toggle" onclick="toggleProfileDetail(this)">
                        <span class="arrow">▼</span> 趋势（最近100场战斗）
                    </div>
                    <div class="profile-detail-panel" id="profileDetailPanel">
                        <article class="battle-stats-article">
                            <!-- 斗气槽使用率 -->
                            <div class="battle-stats-block">
                                <h3>斗气槽使用率：过去平均100战</h3>
                                <div class="battle-stats-inner">
                                    <div class="battle-stats-left">
                                        <ul class="gauge-rate-list">
                                            <li class="li-parry"><span class="rate-name">斗气招架</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_guard)}</span></li>
                                            <li class="li-impact"><span class="rate-name">斗气迸放</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_impact)}</span></li>
                                            <li class="li-arts"><span class="rate-name">斗气爆发技</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_arts)}</span></li>
                                            <li class="li-rush-parry"><span class="rate-name">招架斗气冲锋</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_rush_from_parry)}</span></li>
                                            <li class="li-rush-cancel"><span class="rate-name">取消斗气冲锋</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_rush_from_cancel)}</span></li>
                                            <li class="li-reversal"><span class="rate-name">斗气反攻</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_reversal)}</span></li>
                                            <li class="li-damage"><span class="rate-name">伤害</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_other)}</span></li>
                                        </ul>
                                    </div>
                                    <div class="battle-stats-right">
                                        <dl class="battle-dl">
                                            <dt>斗气反攻：过去平均100战</dt>
                                            <dd><ul>
                                                <li><span class="stat-name">使用次数</span><span class="stat-count">${fmtCount(detail.drive_reversal)}</span></li>
                                            </ul></dd>
                                            <dt>斗气招架：过去平均100战</dt>
                                            <dd><ul>
                                                <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.drive_parry)}</span></li>
                                                <li><span class="stat-name">摔投对手的斗气招架次数</span><span class="stat-count">${fmtCount(detail.throw_drive_parry)}</span></li>
                                                <li><span class="stat-name">斗气招架被摔投次数</span><span class="stat-count">${fmtCount(detail.received_throw_drive_parry)}</span></li>
                                                <li><span class="stat-name">完美招架次数</span><span class="stat-count">${fmtCount(detail.just_parry)}</span></li>
                                            </ul></dd>
                                            <dt>斗气迸放：过去平均100战</dt>
                                            <dd>
                                                <div class="battle-sub-title">[自行使用]</div>
                                                <ul>
                                                    <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.drive_impact)}</span></li>
                                                    <li><span class="stat-name">确反康成功次数</span><span class="stat-count">${fmtCount(detail.punish_counter)}</span></li>
                                                    <li><span class="stat-name">成功对上对手的斗气迸放次数</span><span class="stat-count">${fmtCount(detail.drive_impact_to_drive_impact)}</span></li>
                                                </ul>
                                                <div class="battle-sub-title">[对手使用]</div>
                                                <ul>
                                                    <li><span class="stat-name">承受次数</span><span class="stat-count">${fmtCount(detail.received_drive_impact)}</span></li>
                                                    <li><span class="stat-name">受到确反康次数</span><span class="stat-count">${fmtCount(detail.received_punish_counter)}</span></li>
                                                    <li><span class="stat-name">被对手的斗气迸放对上次数</span><span class="stat-count">${fmtCount(detail.received_drive_impact_to_drive_impact)}</span></li>
                                                </ul>
                                            </dd>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 超必杀槽使用率 -->
                            <div class="battle-stats-block">
                                <h3>超级必杀槽使用率：过去平均100战</h3>
                                <div class="battle-stats-inner">
                                    <div class="battle-stats-left">
                                        <ul class="gauge-rate-list">
                                            <li class="li-lv1"><span class="rate-name">Lv1</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv1)}</span></li>
                                            <li class="li-lv2"><span class="rate-name">Lv2</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv2)}</span></li>
                                            <li class="li-lv3"><span class="rate-name">Lv3</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv3)}</span></li>
                                            <li class="li-ca"><span class="rate-name">终极必杀技</span><span class="rate-value">${fmtPct(detail.gauge_rate_ca)}</span></li>
                                        </ul>
                                    </div>
                                    <div class="battle-stats-right">
                                        <dl class="battle-dl">
                                            <dt>眩晕：过去平均100战</dt>
                                            <dd><ul>
                                                <li><span class="stat-name">让对手眩晕次数</span><span class="stat-count">${fmtCount(detail.stun)}</span></li>
                                                <li><span class="stat-name">眩晕次数</span><span class="stat-count">${fmtCount(detail.received_stun)}</span></li>
                                            </ul></dd>
                                            <dt>摔投：过去平均100战</dt>
                                            <dd><ul>
                                                <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.throw_count)}</span></li>
                                                <li><span class="stat-name">承受次数</span><span class="stat-count">${fmtCount(detail.received_throw_count)}</span></li>
                                                <li><span class="stat-name">拆投次数</span><span class="stat-count">${fmtCount(detail.throw_tech)}</span></li>
                                            </ul></dd>
                                            <dt>版边：过去平均100战</dt>
                                            <dd><ul>
                                                <li><span class="stat-name">将对手逼进版边的时间</span><span class="stat-count">${fmtTime(detail.corner_time)}</span></li>
                                                <li><span class="stat-name">被对手逼进版边的时间</span><span class="stat-count">${fmtTime(detail.cornered_time)}</span></li>
                                            </ul></dd>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 综合统计 -->
                            <div class="battle-stats-block">
                                <div class="battle-stats-inner">
                                    <div class="battle-stats-left">
                                        <dl class="battle-dl">
                                            <dt>排位赛对战次数</dt>
                                            <dd><ul><li><span class="stat-name">排位赛对战次数</span><span class="stat-count">${fmtInt(playerProfile.rank_matches)}次</span></li></ul></dd>
                                            <dt>休闲赛对战次数</dt>
                                            <dd><ul><li><span class="stat-name">休闲赛对战次数</span><span class="stat-count">${fmtInt(playerProfile.casual_matches)}次</span></li></ul></dd>
                                            <dt>比赛间对战次数（1vs1）</dt>
                                            <dd><ul><li><span class="stat-name">比赛间对战次数</span><span class="stat-count">${fmtInt(playerProfile.custom_matches)}次</span></li></ul></dd>
                                            <dt>格斗中心对战次数</dt>
                                            <dd><ul><li><span class="stat-name">格斗中心对战次数</span><span class="stat-count">${fmtInt(playerProfile.hub_matches)}次</span></li></ul></dd>
                                        </dl>
                                    </div>
                                    <div class="battle-stats-right">
                                        <dl class="battle-dl">
                                            <dt>累计格斗点</dt>
                                            <dd><ul><li><span class="stat-name">累计格斗点</span><span class="stat-count">${fmtInt(playerProfile.fighting_points)}点</span></li></ul></dd>
                                            <dt>挑战完成次数</dt>
                                            <dd><ul><li><span class="stat-name">挑战完成次数</span><span class="stat-count">${fmtInt(playerProfile.challenges_completed)}次</span></li></ul></dd>
                                            <dt>其他斗气操作</dt>
                                            <dd><ul><li><span class="stat-name">其他斗气使用率</span><span class="stat-count">${fmtPct(detail.gauge_rate_drive_other)}</span></li></ul></dd>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                    </div>
                </div>
            `;
        }
        
        // 切换详细战斗统计面板展开/收起（JS动态高度动画，不重建DOM）
        function toggleProfileDetail(el) {
            el.classList.toggle('expanded');
            const panel = document.getElementById('profileDetailPanel');
            if (!panel) return;
            
            if (el.classList.contains('expanded')) {
                // 展开：从0动画到实际内容高度
                panel.classList.add('show');
                panel.style.maxHeight = panel.scrollHeight + 'px';
                // 动画完成后移除max-height限制，允许内容自由变化
                const onEnd = (e) => {
                    if (e.propertyName !== 'max-height') return;
                    if (panel.classList.contains('show')) {
                        panel.style.maxHeight = 'none';
                    }
                    panel.removeEventListener('transitionend', onEnd);
                };
                panel.addEventListener('transitionend', onEnd);
            } else {
                // 收起：先固定当前实际高度，然后动画到0
                panel.style.maxHeight = panel.scrollHeight + 'px';
                panel.offsetHeight; // 强制重排
                panel.classList.remove('show');
                panel.style.maxHeight = '0px';
            }
        }
        
        // 设置玩家信息收起/展开状态（带高度动画，不重建DOM；silent时不改变状态直接跳过）
        function setProfileCollapsed(collapsed) {
            if (profileCollapsed === collapsed) return;
            profileCollapsed = collapsed;
            const section = document.querySelector('.player-profile-section');
            const wrapper = section?.querySelector('.profile-body-wrapper');
            if (!section || !wrapper) return;
        
            if (profileCollapsed) {
                // 先固定当前实际高度，然后动画到0
                wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
                wrapper.offsetHeight; // 强制重排
                section.classList.add('collapsed');
                wrapper.style.maxHeight = '0px';
            } else {
                // 从0动画到实际内容高度
                section.classList.remove('collapsed');
                wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
                // 动画完成后移除max-height限制，允许内容自由增长
                const onEnd = (e) => {
                    if (e.propertyName !== 'max-height') return;
                    if (!profileCollapsed) {
                        wrapper.style.maxHeight = '';
                    }
                    wrapper.removeEventListener('transitionend', onEnd);
                };
                wrapper.addEventListener('transitionend', onEnd);
            }
        
            // 更新按钮 title
            const btn = section.querySelector('.profile-collapse-btn');
            if (btn) {
                btn.title = profileCollapsed ? '展开详情' : '收起详情';
            }
        }
        
        // 切换玩家信息收起/展开状态（手动点击按钮）
        function toggleProfileCollapse() {
            setProfileCollapsed(!profileCollapsed);
        }
        
        // 滚动联动：首次向下滚仅收起玩家信息（吞掉该次滚动，列表不下滑），滚回顶部后继续向上滚自动展开
        let _profileScrollLastY = 0;
        function initProfileScrollToggle() {
            const area = document.getElementById('battlesScrollArea');
            if (!area || area._profileScrollBound) return;
            area._profileScrollBound = true;
            _profileScrollLastY = area.scrollTop;
            area.addEventListener('wheel', (e) => {
                // 弹窗打开时不联动
                const modal = document.getElementById('reportListModal');
                if (modal && modal.classList.contains('show')) return;
                if (e.deltaY > 0) {
                    if (!profileCollapsed) {
                        // 展开状态下首次向下滚：只收起玩家信息，吞掉本次滚动，避免趋势分析被一起滑走
                        setProfileCollapsed(true);
                        e.preventDefault();
                        return;
                    }
                } else if (e.deltaY < 0 && area.scrollTop <= 0) {
                    // 已到顶部仍向上滚 → 自动展开
                    setProfileCollapsed(false);
                }
                _profileScrollLastY = area.scrollTop;
            }, { passive: false });
        }
        
        // 切换视图模式
        function switchViewMode(mode) {
            currentViewMode = mode;
            if (mode === 'battles') {
                selectedRivalCharId = null;  // 重置角色选择
            }
            renderContent();
        }
        
        // 获取有对阵数据的角色列表（用于下拉框）
        function getRivalWinrateCharacters() {
            if (!playerProfile || !playerProfile.character_win_rates_by_rival) return [];
            
            return playerProfile.character_win_rates_by_rival
                .filter(c => c.rival_character_win_rates && c.rival_character_win_rates.length > 0)
                .map(c => ({
                    id: c.character_id,
                    name: getCharacterNameById(c.character_id)
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // 选择角色用于对阵胜率显示（charId 必须是数字角色ID）
        function selectRivalChar(charId) {
            selectedRivalCharId = charId;
            // 整体重渲染：导航栏触发按钮显示选中角色 + 滚动区显示胜率表格
            if (currentViewMode === 'rival_winrate') {
                renderContent();
            }
        }
        
        // 渲染角色对阵胜率内容（在可滚动区域）
        function renderRivalWinrateContent() {
            if (!playerProfile || !playerProfile.character_win_rates_by_rival || playerProfile.character_win_rates_by_rival.length === 0) {
                return emptyStateHtml('📊', '暂无角色对阵数据，请刷新页面重新获取');
            }
            
            if (!selectedRivalCharId) {
                return emptyStateHtml('👆', '请在右上角下拉框中选择一个角色');
            }
            
            // 找到选中角色的数据
            const charData = playerProfile.character_win_rates_by_rival.find(c => c.character_id === selectedRivalCharId);
            if (!charData || !charData.rival_character_win_rates) {
                return emptyStateHtml('❓', '该角色暂无对阵数据');
            }
            
            // 过滤掉battle_count为0的数据，并按对战次数降序排列
            const rivalStats = charData.rival_character_win_rates
                .filter(r => r.battle_count > 0)
                .sort((a, b) => b.battle_count - a.battle_count);
            
            if (rivalStats.length === 0) {
                return emptyStateHtml('📭', '该角色暂无有效对战数据');
            }
            
            const charName = getCharacterNameById(selectedRivalCharId);
            
            let html = `
                <div style="padding: 20px;">
                    <h3 class="rival-detail-title">${charName} 对阵各角色胜率（最近赛季）</h3>
                    <table class="rival-winrate-table">
                        <thead>
                            <tr>
                                <th>对手角色</th>
                                <th>对战次数</th>
                                <th>胜场</th>
                                <th>胜率</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            for (const stat of rivalStats) {
                const winRate = stat.battle_count > 0 ? ((stat.win_count / stat.battle_count) * 100).toFixed(1) : '0.0';
                const winRateClass = parseFloat(winRate) >= 50 ? 'rival-winrate-win' : 'rival-winrate-loss';
                html += `
                    <tr>
                        <td>${stat.rival_character_name || '未知'}</td>
                        <td>${stat.battle_count}</td>
                        <td>${stat.win_count}</td>
                        <td class="${winRateClass}">${winRate}%</td>
                    </tr>
                `;
            }
            
            html += '</tbody></table></div>';
            return html;
        }
        
        // 根据角色ID获取角色名称（优先查动态花名册，支持自动更新的新角色）
        function getCharacterNameById(charId) {
            const roster = CHARACTER_ROSTER.find(c => c.id === charId);
            if (roster) return roster.name;
            const charMap = {
                1: '隆', 2: '卢克', 3: '金柏莉', 4: '春丽', 5: '曼侬',
                6: '桑吉尔夫', 7: 'JP', 8: '达尔西姆', 9: '嘉米', 10: '肯',
                11: '迪·杰', 12: '莉莉', 13: '阿鬼', 14: '拉希德', 15: '布兰卡',
                16: '韩蛛俐', 17: '玛丽莎', 18: '古烈', 19: '爱德', 20: '埃德蒙·本田',
                21: '杰米', 22: '豪鬼', 25: '沙加特', 26: '维加', 27: '特瑞',
                28: '舞', 29: '艾琳娜', 30: '深红毒蛇', 31: '阿里克斯', 32: '英格丽德'
            };
            return charMap[charId] || `角色${charId}`;
        }
        
        // 渲染查询页面（仅用于显示搜索输入框）
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
            hint.innerHTML = message;
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
                                            <span class="favorite-name" id="fav-name-${index}" ondblclick="startEditRemark(${index}, event)">${player.remark || player.playerName || '未知玩家'}</span>
                                            <button class="btn-edit-remark" onclick="startEditRemark(${index}, event)" title="编辑备注">✏️</button>
                                        </div>
                                        <div class="favorite-id">ID: ${player.userId}</div>
                                        ${player.playerName && player.remark ? `<div class="favorite-player-name">${player.playerName}</div>` : ''}
                                    </div>
                                    <div class="favorite-actions">
                                        <button class="btn-favorite-query" onclick="queryPlayerFromFavorite('${player.userId}')" title="查询">🔍</button>
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
                                        <div class="history-id">ID: ${item.userId}</div>
                                        <div class="history-time">${formatTime(item.timestamp)}</div>
                                    </div>
                                    <div class="history-actions">
                                        <button class="btn-query-from-history" onclick="queryPlayerFromHistory('${item.userId}')" title="查询">🔍</button>
                                        <button class="btn-fav-from-history" onclick="event.stopPropagation(); addToFavorites('${item.userId}')" title="加入收藏">⭐</button>
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
            if (!name) {
                showQueryHint('❌ 请输入玩家名字', 'error');
                return;
            }
            
            if (!cookie) {
                showQueryHint('❌ 请先登录获取Cookie', 'error');
                return;
            }
            
            try {
                btn.disabled = true;
                resultsDiv.innerHTML = '';
                showQueryHint('🔍 搜索中...', 'info');
                
                const response = await fetch(`${API_BASE}/api/search-fighter`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        fighter_id: name,
                        page: 1,
                        cookie: cookie
                    })
                });
                
                const data = await response.json();
                
                if (data.success && data.fighter_list && data.fighter_list.length > 0) {
                    clearQueryHint();
                    // 结果渲染到右侧内容区（格斗圈卡片风格），左侧面板仅显示紧凑计数提示
                    lastSearchResults = data.fighter_list;
                    resultsDiv.innerHTML = `<div class="search-count-hint">已找到 ${data.fighter_list.length} 名玩家 →</div>`;
                    renderNameSearchResults();
                } else if (data.success) {
                    clearQueryHint();
                    resultsDiv.innerHTML = '<div class="empty-hint">未找到匹配的玩家</div>';
                    lastSearchResults = [];
                    renderNameSearchResults();
                } else {
                    showQueryHint('❌ 搜索失败', 'error');
                }
            } catch (error) {
                console.error('名字搜索异常:', error);
                showQueryHint('❌ 搜索失败: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
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
                    ? `<img class="ranking-card-emblem" src="https://www.streetfighter.com/6/buckler/assets/images/material/title/${titlePlate}.png" alt="" onerror="this.style.display='none'">`
                    : '';
                // 段位图标 + 官方风格分数文案（22813积分 / MR1500）
                const rankIconUrl = getFightersRankIconUrl(leagueRank, masterLeague);
                const scoreHtml = mr > 0 ? `MR${mr}` : (lp > 0 ? `${lp}积分` : '');
                // 角色头像
                const charImgUrl = charTool ? `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${charTool}_l.png` : '';
                const charImgHtml = charImgUrl
                    ? `<img src="${charImgUrl}" alt="${escapeHtml(charName)}" onerror="this.parentElement.innerHTML='<div class=\\'char-fallback\\'>${escapeHtml(charName) || '?'}</div>'">`
                    : `<div class="char-fallback">${escapeHtml(charName) || '?'}</div>`;
                // 国旗图（复用通用函数，tooltip显示地区名）
                const flagHtml = renderFlagHtml(homeId, item.region);
                const cardClickAttrs = shortId ? ` onclick="queryPlayerById('${shortId}', event)"` : '';
                
                return `
                    <div class="ranking-card fighters-card search-fighter-card${titlePlate ? ' has-emblem' : ''}"${cardClickAttrs}>
                        <div class="ranking-card-visual${titlePlate ? ' has-emblem' : ''}">
                            ${emblemImgHtml}
                            <div class="ranking-card-info">
                                <div class="ranking-card-name-row">
                                    ${platform ? `<span class="ranking-card-platform">${platform}</span>` : ''}
                                    <span class="ranking-player-name">${escapeHtml(name)}</span>
                                </div>
                                ${titleVal ? `<div class="ranking-card-meta"><span class="ranking-card-title">${escapeHtml(titleVal)}</span></div>` : ''}
                                <div class="ranking-card-meta">
                                    ${flagHtml}
                                    ${scoreHtml ? `<span class="search-card-score">${scoreHtml}</span>` : ''}
                                    ${shortId ? `<span class="ranking-player-id" oncontextmenu="return copyToClipboard('${shortId}', event)" title="右键复制ID">${shortId}</span>` : ''}
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
            
            // 重置角色选择为所有角色
            selectedCharacter = '';
            selectedOpponentCharacter = '';  // 重置对手筛选
            currentPage = 1;  // 重置页码
            
            // 保存到历史记录
            addToSearchHistory(userId);
            
            // 跳转到查询结果页面
            window.history.pushState({}, '', `/search?uid=${userId}`);
            handleRoute();
        }
        
        // 在查询模式下切换对战类型
        async function queryPlayerByType(userId, battleType) {
            const battlesScrollArea = document.getElementById('battlesScrollArea');
            
            if (!userId || !cookie) {
                return;
            }
            
            // 取消上一次未完成的对战数据加载
            if (battleFetchCtrl) battleFetchCtrl.abort();
            battleFetchCtrl = new AbortController();
            const battleSignal = battleFetchCtrl.signal;
            
            try {
                // 统一加载显示：内容区spinner（无遮罩不阻挡操作）
                document.getElementById('battlesScrollArea').innerHTML = loadingHtml('正在加载对战记录...');
                battleLoading = true;  // 切走再切回时保持加载中显示
                
                const response = await fetch(`${API_BASE}/api/query-player`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    signal: battleSignal,
                    body: JSON.stringify({
                        user_id: userId,
                        cookie: cookie,
                        pages: 10,
                        max_workers: 5,
                        battle_type: battleType
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 更新全局数据
                    matchData = sanitizeRecords(data.data);
                    // 注意：不更新currentUserInfo，保持原有用户信息显示
                    playerProfile = data.player_profile || null;
                    
                    // 重新渲染内容（包括玩家信息、二级导航栏、战绩列表等；用户已切走页面时不弹回）
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') return;  // 被新加载取消，静默退出
                console.error('查询请求异常:', error);
            } finally {
                if (!battleSignal.aborted) {
                    battleLoading = false;
                }
            }
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
            
            // 重置角色选择为所有角色
            selectedCharacter = '';
            selectedOpponentCharacter = '';  // 重置对手筛选
            currentPage = 1;  // 重置页码
            
            // 跳转到查询结果页面
            window.history.pushState({}, '', `/search?uid=${userId}`);
            handleRoute();
        }
        
        // 复制文本到剪贴板
        function copyToClipboard(text, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            
            if (!text) {
                return false;
            }
            
            // 使用现代 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    showCopyFeedback(event);
                }).catch(err => {
                    console.error('Clipboard API 复制失败:', err);
                    fallbackCopyToClipboard(text, event);
                });
            } else {
                // 降级方案：使用传统方法
                fallbackCopyToClipboard(text, event);
            }
            
            // 对于 oncontextmenu 事件，必须返回 false 来阻止默认菜单
            return false;
        }
        
        // 降级的复制方法
        function fallbackCopyToClipboard(text, event) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                showCopyFeedback(event);
            } catch (err) {
                console.error('复制失败:', err);
            }
            
            document.body.removeChild(textArea);
        }
        
        // 显示复制成功的反馈
        function showCopyFeedback(event) {
            if (!event || !event.target) return;
            
            // 创建临时提示元素
            const feedback = document.createElement('div');
            feedback.textContent = '✓ 已复制';
            feedback.style.position = 'absolute';
            feedback.style.background = 'rgba(39, 174, 96, 0.9)';
            feedback.style.color = 'white';
            feedback.style.padding = '4px 8px';
            feedback.style.borderRadius = '2px';
            feedback.style.fontSize = '11px';
            feedback.style.fontWeight = '600';
            feedback.style.zIndex = '1000';
            feedback.style.pointerEvents = 'none';
            feedback.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
            
            // 获取目标元素的位置（确保不超出视口）
            const rect = event.target.getBoundingClientRect();
            let feedbackLeft = rect.left + rect.width / 2 - 30;
            let feedbackTop = rect.top - 30;
            // 防止超出右边界
            if (feedbackLeft + 60 > window.innerWidth) {
                feedbackLeft = window.innerWidth - 70;
            }
            // 防止超出左边界
            if (feedbackLeft < 5) {
                feedbackLeft = 5;
            }
            // 防止超出上边界，改为显示在下方
            if (feedbackTop < 5) {
                feedbackTop = rect.bottom + 5;
            }
            feedback.style.left = feedbackLeft + 'px';
            feedback.style.top = feedbackTop + 'px';
            
            document.body.appendChild(feedback);
            
            // 动画效果
            feedback.animate([
                { opacity: 1, transform: 'translateY(0)' },
                { opacity: 0, transform: 'translateY(-10px)' }
            ], {
                duration: 1500,
                easing: 'ease-out'
            }).onfinish = () => {
                feedback.remove();
            };
        }
        
        // ========== 收藏对局功能 ==========
        
        // 加载收藏对局
        function loadFavoriteBattles() {
            try {
                const data = localStorage.getItem('sf6_favorite_battles');
                favoriteBattles = data ? JSON.parse(data) : [];
            } catch (error) {
                console.error('加载收藏对局失败:', error);
                favoriteBattles = [];
            }
        }
        
        // 保存收藏对局
        function saveFavoriteBattles() {
            try {
                localStorage.setItem('sf6_favorite_battles', JSON.stringify(favoriteBattles));
            } catch (error) {
                console.error('保存收藏对局失败:', error);
            }
        }
        
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
            if (lastActiveTab === 'home' || lastActiveTab === 'query') {
                renderContent();
            }
        }
        
        // 显示收藏对局页面
        function showFavoritesPage() {
            // 更新侧边栏激活状态
            document.querySelectorAll('.sidebar-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.textContent.includes('收藏')) {
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
                            <div class="sub-nav-item${favBattleFilter === 'pending' ? ' active' : ''}" onclick="setFavFilter('pending')">待看<span class="fav-count">${pendingCount}</span></div>
                            <div class="sub-nav-item${favBattleFilter === 'watched' ? ' active' : ''}" onclick="setFavFilter('watched')">已看<span class="fav-count">${watchedCount}</span></div>
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
                    favBattleFilter === 'pending' ? '没有待看的对局' : '没有已看的对局';
                battlesScrollArea.innerHTML = emptyStateHtml('📌', emptyMsg);
                return;
            }
            
            let html = '';
            filteredBattles.forEach((battle, index) => {
                const resultClass = (battle.my_result || '').toLowerCase().includes('胜') || (battle.my_result || '').toLowerCase().includes('win') ? 'win' : 'lose';
                const isWatched = battle.status === 'watched';
                const statusText = isWatched ? '✓ 已看' : '待看';
                const statusClass = isWatched ? 'status-watched' : 'status-pending';
                const nextStatus = isWatched ? 'pending' : 'watched';
                const nextStatusText = isWatched ? '标记待看' : '标记已看';
                
                html += `
                    <div class="match-card fav-match-card ${isWatched ? 'watched' : ''}">
                        <div class="match-header">
                            <span class="match-date">${battle.date || '未知时间'}</span>
                            <span class="match-result ${resultClass}">${battle.my_result || '-'}</span>
                            <div class="match-header-right">
                                ${battle.replay_id ? `<span class="replay-id" onclick="copyToClipboard('${battle.replay_id}', event)" oncontextmenu="return copyToClipboard('${battle.replay_id}', event)" title="点击复制录像码" style="cursor: pointer;">录像: ${battle.replay_id}</span>` : ''}
                                <div class="fav-actions">
                                    <button class="fav-status-btn ${statusClass}" onclick="toggleBattleStatus('${battle.replay_id}')" title="${nextStatusText}">${statusText}</button>
                                    <button class="fav-remove-btn" onclick="removeBattleFavorite('${battle.replay_id}')" title="删除">✕</button>
                                </div>
                            </div>
                        </div>
                        <div class="match-body">
                            <div class="match-player">
                                <div class="player-avatar">
                                    ${battle.my_character_image ? `<img src="${battle.my_character_image}" alt="${battle.my_character}" class="character-img" onerror="handleImageError(this, '${battle.my_character || "?"}')">` : `<div class="character-placeholder">${battle.my_character || '?'}</div>`}
                                </div>
                                <div class="player-info">
                                    <div class="player-name-row">
                                        <span class="match-player-name" oncontextmenu="return copyToClipboard('${battle.player_name || '我'}', event)" title="右键复制名称">${battle.player_name || '我'}</span>
                                    </div>
                                    <div class="player-stats-row">
                                        <span class="detail-item">LP: ${battle.my_lp || '-'}</span>
                                        <span class="detail-item">${battle.my_league_rank || '-'}</span>
                                        <span class="detail-item ${battle.my_input_type === '经典' ? 'input-classic' : (battle.my_input_type === '现代' ? 'input-modern' : '')}">${battle.my_input_type || '-'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="match-vs">${renderRoundScoreHTML(battle) || 'VS'}</div>
                            <div class="match-player">
                                <div class="player-avatar">
                                    ${battle.opponent_character_image ? `<img src="${battle.opponent_character_image}" alt="${battle.opponent_character}" class="character-img" onerror="handleImageError(this, '${battle.opponent_character || "?"}')">` : `<div class="character-placeholder">${battle.opponent_character || '?'}</div>`}
                                </div>
                                <div class="player-info">
                                    <div class="player-name-row">
                                        <span class="match-player-name">${battle.opponent_name || '对手'}</span>
                                    </div>
                                    <div class="player-stats-row">
                                        <span class="detail-item">LP: ${battle.opponent_lp || '-'}</span>
                                        <span class="detail-item">${battle.opponent_league_rank || '-'}</span>
                                        <span class="detail-item ${battle.opponent_input_type === '经典' ? 'input-classic' : (battle.opponent_input_type === '现代' ? 'input-modern' : '')}">${battle.opponent_input_type || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="match-footer">
                            <span class="side-badge">${battle.my_side === 1 ? '1P' : (battle.my_side === 2 ? '2P' : '')}</span>
                            ${battle.battle_type ? `<span class="battle-type">${battle.battle_type}</span>` : ''}
                        </div>
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
        
        // 切换对局状态（待看/已看）
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
                favoriteBattles.splice(index, 1);
                saveFavoriteBattles();
                renderFavoritesPage();
            }
        }
        
        // ========== 历史搜索和收藏功能 ==========
        
        // 加载搜索历史
        function loadSearchHistory() {
            try {
                const history = localStorage.getItem('sf6_search_history');
                searchHistory = history ? JSON.parse(history) : [];
            } catch (error) {
                console.error('加载搜索历史失败:', error);
                searchHistory = [];
            }
        }
        
        // 保存搜索历史
        function saveSearchHistory() {
            try {
                localStorage.setItem('sf6_search_history', JSON.stringify(searchHistory));
            } catch (error) {
                console.error('保存搜索历史失败:', error);
            }
        }
        
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
        function loadFavoritePlayers() {
            try {
                const favorites = localStorage.getItem('sf6_favorite_players');
                favoritePlayers = favorites ? JSON.parse(favorites) : [];
            } catch (error) {
                console.error('加载收藏列表失败:', error);
                favoritePlayers = [];
            }
        }
        
        // 保存收藏列表
        function saveFavoritePlayers() {
            try {
                localStorage.setItem('sf6_favorite_players', JSON.stringify(favoritePlayers));
            } catch (error) {
                console.error('保存收藏列表失败:', error);
            }
        }
        
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
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            // 小于1分钟
            if (diff < 60000) {
                return '刚刚';
            }
            // 小于1小时
            if (diff < 3600000) {
                return `${Math.floor(diff / 60000)}分钟前`;
            }
            // 小于1天
            if (diff < 86400000) {
                return `${Math.floor(diff / 3600000)}小时前`;
            }
            // 小于7天
            if (diff < 604800000) {
                return `${Math.floor(diff / 86400000)}天前`;
            }
            
            // 超过7天显示具体日期
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        }
        
        function showCrawlSettings() {
            const contentArea = document.getElementById('contentArea');
            contentArea.innerHTML = `
                <div class="section">
                    <h2>爬取设置</h2>
                    <div class="form-group">
                        <label for="pages">爬取页数：</label>
                        <input type="number" id="pages" value="10" min="1" max="100">
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
        
        // ==================== 每局结果图标条 ====================
        
        // 将旧版"✓-✗"格式比分字符串转为数值数组（旧缓存数据兜底）
        function parseRoundResultsString(str) {
            if (!str || str === '-') return [];
            return str.split('-').map(ch => ch.trim() === '✓' ? 1 : 0);
        }
        
        // 渲染每局结果图标（放在VS区域内）：每局一行 [自己图标] 局数 [对手图标（镜像）]
        // 原始值语义：0=负，1-8=不同胜法，直接对应官方 icon_result{n} 图标
        // 左侧（自己）用 _l 原图，右侧（对手）用 _r 图再经 CSS scaleX(-1) 镜像，
        // 保证图标朝向对称且图内文字保持正向（直接用 _l 镜像会把文字翻反）
        // 无数据时返回空字符串，调用方回退显示"VS"
        function renderRoundScoreHTML(record) {
            const my = Array.isArray(record.my_round_results_raw) && record.my_round_results_raw.length
                ? record.my_round_results_raw : parseRoundResultsString(record.my_round_results);
            const opp = Array.isArray(record.opponent_round_results_raw) && record.opponent_round_results_raw.length
                ? record.opponent_round_results_raw : parseRoundResultsString(record.opponent_round_results);
            
            if (!my.length && !opp.length) {
                return '';
            }
            
            const rounds = Math.max(my.length, opp.length);
            const iconUrl = (v, side) => {
                const n = Math.min(Math.max(parseInt(v, 10) || 0, 0), 8);
                return `https://www.streetfighter.com/6/buckler/assets/images/profile/icon_result${n}_${side}.png`;
            };
            let rowsHtml = '';
            for (let i = 0; i < rounds; i++) {
                const mv = typeof my[i] === 'number' ? my[i] : 0;
                const ov = typeof opp[i] === 'number' ? opp[i] : 0;
                rowsHtml += `<div class="round-score-row">
                    <img class="round-icon" src="${iconUrl(mv, 'l')}" alt="第${i + 1}局" title="第${i + 1}局" onerror="this.style.visibility='hidden'">
                    <span class="round-label">${i + 1}</span>
                    <img class="round-icon flip" src="${iconUrl(ov, 'r')}" alt="第${i + 1}局" title="第${i + 1}局" onerror="this.style.visibility='hidden'">
                </div>`;
            }
            return `<div class="round-score" title="每局结果（左：自己，右：对手）">${rowsHtml}</div>`;
        }
        
        function renderMatchCardsHTML() {
            // 获取筛选后的数据
            const filteredData = getFilteredData();
            
            // 计算总页数和当前页数据
            const totalPages = Math.min(Math.ceil(filteredData.length / pageSize), maxPages);
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredData.length);
            const pageData = filteredData.slice(startIndex, endIndex);
            
            let html = `
                <div class="toolbar">
                    <div class="toolbar-title">共 ${filteredData.length} 条对战记录（第 ${currentPage}/${totalPages} 页）${selectedCharacter ? ' - 角色: ' + getCharacterDisplayName(selectedCharacter) : ''}${selectedOpponentCharacter ? ' - 对手: ' + getCharacterDisplayName(selectedOpponentCharacter) : ''}</div>
                    <button class="refresh-btn" onclick="refreshData()" id="refreshBtn">
                        <span>刷 新</span>
                    </button>
                </div>
            `;
            
            if (pageData.length === 0) {
                html += emptyStateHtml('📊', '暂无对战记录');
            } else {
                pageData.forEach(record => {
                    const resultClass = (record.my_result || '').toLowerCase().includes('胜') || (record.my_result || '').toLowerCase().includes('win') ? 'win' : 'lose';
                    const resultText = record.my_result || '-';
                    
                    // 构造角色头像URL
                    const myCharacterImg = record.my_character_image ? `<img src="${record.my_character_image}" alt="${record.my_character}" class="character-img">` : '';
                    const opponentCharacterImg = record.opponent_character_image ? `<img src="${record.opponent_character_image}" alt="${record.opponent_character}" class="character-img">` : '';
                    
                    html += `
                        <div class="match-card">
                            <div class="match-header">
                                <span class="match-date">${record.date || '未知时间'}</span>
                                <span class="match-result ${resultClass}">${resultText}</span>
                                <div class="match-header-right">
                                    ${record.replay_id ? `<span class="replay-id" onclick="copyToClipboard('${record.replay_id}', event)" oncontextmenu="return copyToClipboard('${record.replay_id}', event)" title="点击复制录像码" style="cursor: pointer;">录像: ${record.replay_id}</span>` : ''}
                                    <button class="fav-star-btn ${isBattleFavorited(record.replay_id) ? 'active' : ''}" onclick="toggleBattleFavoriteById('${record.replay_id}')" title="${isBattleFavorited(record.replay_id) ? '取消收藏' : '收藏对局'}">${isBattleFavorited(record.replay_id) ? '★' : '☆'}</button>
                                </div>
                            </div>
                            <div class="match-body">
                                <div class="match-player">
                                    <div class="player-avatar">
                                        ${myCharacterImg ? `<img src="${record.my_character_image}" alt="${record.my_character}" class="character-img" onerror="handleImageError(this, '${record.my_character || "?"}')">` : `<div class="character-placeholder">${record.my_character || '?'}</div>`}
                                    </div>
                                    <div class="player-info">
                                        <div class="player-name-row">
                                            <span class="match-player-name" oncontextmenu="return copyToClipboard('${record.player_name || '我'}', event)" title="右键复制名称">${record.player_name || '我'}</span>
                                            ${record.my_short_id ? `<span class="player-id" onclick="queryPlayerById('${record.my_user_id}', event)" oncontextmenu="return copyToClipboard('${record.my_short_id}', event)" title="左键查询，右键复制ID">(${record.my_short_id})</span>` : ''}
                                        </div>
                                        <div class="player-stats-row">
                                            <span class="detail-item">LP: ${record.my_lp || '-'}</span>
                                            <span class="detail-item">${record.my_league_rank || '-'}</span>
                                            <span class="detail-item ${record.my_input_type === '经典' ? 'input-classic' : (record.my_input_type === '现代' ? 'input-modern' : '')}">${record.my_input_type || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="match-vs">${renderRoundScoreHTML(record) || 'VS'}</div>
                                <div class="match-player">
                                    <div class="player-avatar">
                                        ${opponentCharacterImg ? `<img src="${record.opponent_character_image}" alt="${record.opponent_character}" class="character-img" onerror="handleImageError(this, '${record.opponent_character || "?"}')">` : `<div class="character-placeholder">${record.opponent_character || '?'}</div>`}
                                    </div>
                                    <div class="player-info">
                                        <div class="player-name-row">
                                            <span class="match-player-name" oncontextmenu="return copyToClipboard('${record.opponent_name || '对手'}', event)" title="右键复制名称">${record.opponent_name || '对手'}</span>
                                            ${record.opponent_short_id ? `<span class="player-id opponent-id" onclick="queryPlayerById('${record.opponent_user_id}', event)" oncontextmenu="return copyToClipboard('${record.opponent_short_id}', event)" title="左键查询，右键复制ID">(${record.opponent_short_id})</span>` : ''}
                                        </div>
                                        <div class="player-stats-row">
                                            <span class="detail-item">LP: ${record.opponent_lp || '-'}</span>
                                            <span class="detail-item">${record.opponent_league_rank || '-'}</span>
                                            <span class="detail-item ${record.opponent_input_type === '经典' ? 'input-classic' : (record.opponent_input_type === '现代' ? 'input-modern' : '')}">${record.opponent_input_type || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="match-footer">
                                <span class="side-badge">${record.my_side === 1 ? '1P' : (record.my_side === 2 ? '2P' : record.my_side)}</span>
                                ${record.battle_type ? `<span class="battle-type">${record.battle_type}</span>` : ''}
                            </div>
                        </div>
                    `;
                });
                
                // 添加分页控件
                html += `
                    <div class="pagination">
                        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                        <span class="page-info">第 ${currentPage} / ${totalPages} 页</span>
                        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
                    </div>
                `;
            }
            
            return html;
        }
        
        function changePage(page) {
            const filteredData = getFilteredData();
            const totalPages = Math.min(Math.ceil(filteredData.length / pageSize), maxPages);
            if (page < 1 || page > totalPages) {
                return;
            }
            currentPage = page;
            renderContent();
        }
        
        // 全部角色列表（id → 中文名 + 官网tool名，用于头像平铺筛选）
        // 硬编码作为兜底，登录后会通过 /api/characters 自动更新（发现官方新角色）
        let CHARACTER_ROSTER = [
            { id: 1, name: '隆', tool: 'ryu' }, { id: 2, name: '卢克', tool: 'luke' },
            { id: 3, name: '金柏莉', tool: 'kimberly' }, { id: 4, name: '春丽', tool: 'chunli' },
            { id: 5, name: '曼侬', tool: 'manon' }, { id: 6, name: '桑吉尔夫', tool: 'zangief' },
            { id: 7, name: 'JP', tool: 'jp' }, { id: 8, name: '达尔西姆', tool: 'dhalsim' },
            { id: 9, name: '嘉米', tool: 'cammy' }, { id: 10, name: '肯', tool: 'ken' },
            { id: 11, name: '迪·杰', tool: 'deejay' }, { id: 12, name: '莉莉', tool: 'lily' },
            { id: 13, name: '阿鬼', tool: 'aki' }, { id: 14, name: '拉希德', tool: 'rashid' },
            { id: 15, name: '布兰卡', tool: 'blanka' }, { id: 16, name: '韩蛛俐', tool: 'juri' },
            { id: 17, name: '玛丽莎', tool: 'marisa' }, { id: 18, name: '古烈', tool: 'guile' },
            { id: 19, name: '爱德', tool: 'ed' }, { id: 20, name: '埃德蒙·本田', tool: 'honda' },
            { id: 21, name: '杰米', tool: 'jamie' }, { id: 22, name: '豪鬼', tool: 'gouki' },
            { id: 25, name: '沙加特', tool: 'sagat' }, { id: 26, name: '维加', tool: 'vega' },
            { id: 27, name: '特瑞', tool: 'terry' }, { id: 28, name: '舞', tool: 'mai' },
            { id: 29, name: '艾琳娜', tool: 'elena' }, { id: 30, name: '深红毒蛇', tool: 'cviper' },
            { id: 31, name: '阿里克斯', tool: 'alex' }, { id: 32, name: '英格丽德', tool: 'ingrid' }
        ];
        
        // ==================== 角色列表自动更新 ====================
        
        // 合并后端返回的最新角色清单：按 tool/id 匹配更新中文名，追加新角色
        function applyCharacterRoster(serverList) {
            if (!Array.isArray(serverList) || serverList.length === 0) return;
            serverList.forEach(item => {
                if (!item || !item.tool) return;
                const existing = CHARACTER_ROSTER.find(c => c.tool === item.tool || (item.id && c.id === item.id));
                if (existing) {
                    if (item.name) existing.name = item.name;
                    if (item.id) existing.id = item.id;
                } else if (item.id) {
                    CHARACTER_ROSTER.push({ id: item.id, name: item.name || item.tool, tool: item.tool });
                }
            });
        }
        
        // 从 localStorage 恢复角色清单缓存（启动时立即生效，保证新角色不丢失）
        function restoreCharacterRosterCache() {
            try {
                const cached = localStorage.getItem('sf6_character_roster');
                if (cached) {
                    const { characters } = JSON.parse(cached);
                    applyCharacterRoster(characters);
                }
            } catch (error) {
                console.error('恢复角色清单缓存失败:', error);
            }
        }
        
        // 向后端拉取最新角色清单并合并（后端带24h缓存，频繁调用无压力）
        async function loadCharacterRoster() {
            if (!cookie) return;
            try {
                const response = await fetch(`${API_BASE}/api/characters`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cookie: cookie })
                });
                if (!response.ok) return;
                const data = await response.json();
                if (data.success && Array.isArray(data.characters) && data.characters.length > 0) {
                    const newCount = data.characters.filter(c =>
                        !CHARACTER_ROSTER.some(r => r.tool === c.tool || r.id === c.id)
                    ).length;
                    applyCharacterRoster(data.characters);
                    try {
                        localStorage.setItem('sf6_character_roster', JSON.stringify({
                            characters: data.characters,
                            timestamp: Date.now()
                        }));
                    } catch (e) { /* 忽略缓存写入失败 */ }
                    if (newCount > 0) {
                        console.log(`[角色列表] 发现 ${newCount} 个新角色，已自动更新`);
                    }
                }
            } catch (error) {
                console.error('更新角色列表失败:', error);
            }
        }
        
        // 从对局数据中构建 角色名 → 头像URL 映射（优先使用真实数据中的链接）
        function buildCharacterImageMap() {
            const map = {};
            matchData.forEach(r => {
                if (r.my_character && r.my_character_image && !map[r.my_character]) {
                    map[r.my_character] = r.my_character_image;
                }
                if (r.opponent_character && r.opponent_character_image && !map[r.opponent_character]) {
                    map[r.opponent_character] = r.opponent_character_image;
                }
            });
            return map;
        }
        
        // 获取角色头像URL：数据中的真实链接优先，否则用官网规则构造
        function getCharacterTileImageUrl(name, imgMap) {
            if (imgMap[name]) return imgMap[name];
            const roster = CHARACTER_ROSTER.find(c => c.name === name);
            if (roster) {
                return `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${roster.tool}_l.png`;
            }
            return '';
        }
        
        // 筛选头像加载失败时降级为文字占位
        function handleTileImgError(img, name) {
            const span = document.createElement('span');
            span.className = 'char-tile-fallback';
            span.textContent = (name || '?').charAt(0);
            img.replaceWith(span);
        }
        
        // ==================== 角色选择弹窗（通用模板） ====================
        let charPickerCallback = null;
        
        // 打开角色选择弹窗
        // opts: { title, allowAll, allLabel, currentValue(''=全部), currentId(当前选中角色ID，用于高亮), availableNames(null=全部可选), availableIds(有数据的角色ID数组), onSelect(item|null) }
        function openCharacterPicker(opts) {
            const overlay = document.getElementById('characterPickerModal');
            const grid = document.getElementById('charPickerGrid');
            const titleEl = document.getElementById('charPickerTitle');
            if (!overlay || !grid) return;
            
            titleEl.textContent = opts.title || '选择角色';
            charPickerCallback = opts.onSelect;
            
            const imgMap = buildCharacterImageMap();
            const availableNames = opts.availableNames ? new Set(opts.availableNames) : null;
            const availableIds = opts.availableIds ? new Set(opts.availableIds) : null;
            // 有任一限制集合时才做可用性判断；数据中的角色名可能与花名册不一致，优先用ID判断
            const hasRestriction = availableNames || availableIds;
            let html = '';
            
            if (opts.allowAll) {
                html += `<div class="char-tile ${!opts.currentValue ? 'selected' : ''}" onclick="pickAllCharacter()" title="${opts.allLabel || '全部角色'}"><span class="char-tile-all">全部</span></div>`;
            }
            
            CHARACTER_ROSTER.forEach(c => {
                const isAvailable = !hasRestriction || (availableNames && availableNames.has(c.name)) || (availableIds && availableIds.has(c.id));
                const url = getCharacterTileImageUrl(c.name, imgMap);
                const inner = url
                    ? `<img src="${url}" class="char-tile-img" alt="${c.name}" onerror="handleTileImgError(this, '${c.name}')">`
                    : `<span class="char-tile-fallback">${c.name.charAt(0)}</span>`;
                if (isAvailable) {
                    const selectedCls = (opts.currentValue === c.name || (opts.currentId && opts.currentId === c.id)) ? 'selected' : '';
                    html += `<div class="char-tile ${selectedCls}" onclick="pickCharacterById(${c.id})" title="${c.name}">${inner}</div>`;
                } else {
                    html += `<div class="char-tile no-data" title="${c.name}（暂无数据）">${inner}</div>`;
                }
            });
            
            grid.innerHTML = html;
            overlay.classList.add('show');
        }
        
        function closeCharacterPicker() {
            const overlay = document.getElementById('characterPickerModal');
            if (overlay) overlay.classList.remove('show');
            charPickerCallback = null;
        }
        
        function pickCharacterById(id) {
            const item = CHARACTER_ROSTER.find(c => c.id === id);
            if (charPickerCallback && item) charPickerCallback(item);
            closeCharacterPicker();
        }
        
        function pickAllCharacter() {
            if (charPickerCallback) charPickerCallback(null);
            closeCharacterPicker();
        }
        
        // 角色选择触发按钮（头像+名称，未选择时显示占位文案）
        function renderCharPickerTrigger(opts) {
            // opts: { onclick, label, value, imgMap }
            if (opts.value) {
                const url = getCharacterTileImageUrl(opts.value, opts.imgMap || {});
                const imgHtml = url
                    ? `<img src="${url}" class="char-picker-trigger-img" alt="${opts.value}" onerror="this.style.display='none'">`
                    : '';
                return `<button class="char-picker-trigger has-value" onclick="${opts.onclick}">${imgHtml}<span>${opts.value}</span><span class="char-picker-trigger-arrow">▼</span></button>`;
            }
            return `<button class="char-picker-trigger" onclick="${opts.onclick}"><span>${opts.label}</span><span class="char-picker-trigger-arrow">▼</span></button>`;
        }
        
        // 根据角色ID获取数据中的真实角色名（筛选基于数据名；找不到时回退花名册中文名）
        function getCharacterDataNameById(id) {
            const rec = matchData.find(r => r.my_character_id === id || r.opponent_character_id === id);
            if (rec) {
                if (rec.my_character_id === id && rec.my_character) return rec.my_character;
                if (rec.opponent_character_id === id && rec.opponent_character) return rec.opponent_character;
            }
            const roster = CHARACTER_ROSTER.find(c => c.id === id);
            return roster ? roster.name : '';
        }
        
        // 根据数据中的角色名获取中文显示名（数据名可能与花名册不一致，通过ID映射为中文）
        function getCharacterDisplayName(dataName) {
            if (!dataName) return '';
            const roster = CHARACTER_ROSTER.find(c => c.name === dataName);
            if (roster) return dataName;
            const rec = matchData.find(r => r.my_character === dataName || r.opponent_character === dataName);
            const id = rec ? (rec.my_character === dataName ? rec.my_character_id : rec.opponent_character_id) : 0;
            if (id) {
                const name = getCharacterNameById(id);
                if (!name.startsWith('角色')) return name;
            }
            return dataName;
        }
        
        // 场景1：筛选我的角色（用角色ID判断可用性，避免数据角色名与花名册不一致导致全灰）
        function openMyCharacterPicker() {
            const availableIds = [...new Set(matchData.map(r => r.my_character_id).filter(id => id))];
            const currentRec = selectedCharacter ? matchData.find(r => r.my_character === selectedCharacter) : null;
            openCharacterPicker({
                title: '选择我的角色',
                allowAll: true,
                allLabel: '全部角色',
                currentValue: selectedCharacter,
                currentId: currentRec ? currentRec.my_character_id : null,
                availableIds: availableIds,
                onSelect: (item) => filterByCharacter(item ? getCharacterDataNameById(item.id) : '')
            });
        }
        
        // 场景2：筛选对手角色
        function openOpponentCharacterPicker() {
            const baseData = selectedCharacter ? matchData.filter(r => r.my_character === selectedCharacter) : matchData;
            const availableIds = [...new Set(baseData.map(r => r.opponent_character_id).filter(id => id))];
            const currentRec = selectedOpponentCharacter ? matchData.find(r => r.opponent_character === selectedOpponentCharacter) : null;
            openCharacterPicker({
                title: '选择对手角色',
                allowAll: true,
                allLabel: '全部对手',
                currentValue: selectedOpponentCharacter,
                currentId: currentRec ? currentRec.opponent_character_id : null,
                availableIds: availableIds,
                onSelect: (item) => filterByOpponentCharacter(item ? getCharacterDataNameById(item.id) : '')
            });
        }
        
        // 场景3：角色对阵胜率面板选择角色
        function openRivalCharacterPicker() {
            const chars = getRivalWinrateCharacters();
            if (chars.length === 0) {
                openCharacterPicker({
                    title: '选择角色（对阵胜率）',
                    allowAll: false,
                    currentValue: '',
                    availableNames: [],
                    onSelect: () => {}
                });
                return;
            }
            openCharacterPicker({
                title: '选择角色（对阵胜率）',
                allowAll: false,
                currentValue: '',
                currentId: selectedRivalCharId || null,
                availableIds: chars.map(c => c.id),
                // 注意：必须传数字角色ID，renderRivalWinrateContent 按 character_id 严格匹配
                onSelect: (item) => { if (item) selectRivalChar(item.id); }
            });
        }
        
        // 场景4：排行榜选择角色
        function openRankingCharacterPicker() {
            const currentValue = rankingState.characterFilter === 4
                ? (CHARACTER_ROSTER.find(c => c.tool === rankingState.characterId)?.name || '')
                : '';
            openCharacterPicker({
                title: '选择角色（排行榜）',
                allowAll: true,
                allLabel: '所有角色',
                currentValue: currentValue,
                availableNames: null,
                onSelect: (item) => changeRankingCharacter(item ? item.tool : 'all')
            });
        }
        
        // 根据选中的角色筛选数据
        function filterByCharacter(character) {
            selectedCharacter = character;
            selectedOpponentCharacter = '';  // 切换角色时重置对手筛选
            currentPage = 1;  // 重置页码
            renderContent();
        }
        
        // 根据选中的对手角色筛选数据
        function filterByOpponentCharacter(character) {
            selectedOpponentCharacter = character;
            currentPage = 1;  // 重置页码
            renderContent();
        }
        
        // 获取筛选后的数据
        function getFilteredData() {
            let data = matchData;
            if (selectedCharacter) {
                data = data.filter(record => record.my_character === selectedCharacter);
            }
            if (selectedOpponentCharacter) {
                data = data.filter(record => record.opponent_character === selectedOpponentCharacter);
            }
            return data;
        }
        
        // 切换图表指标
        function switchChartMetric(metric) {
            chartMetric = metric;
            renderContent();  // 重新渲染整个区域（包括图表和战绩）
        }
        
        // 切换图表展开/收起状态（使用CSS动画，不重建DOM）
        function toggleChart() {
            chartExpanded = !chartExpanded;
            const chartSection = document.querySelector('.chart-section');
            if (chartSection) {
                if (chartExpanded) {
                    chartSection.classList.remove('collapsed');
                } else {
                    chartSection.classList.add('collapsed');
                }
            }
        }
        
        // 渲染折线图
        function renderLineChart() {
            const filteredData = getFilteredData();
                    
            if (filteredData.length === 0) return '';
            
            // 如果没有选择角色（全部角色），则默认收起图表
            const shouldCollapse = !selectedCharacter;
            if (shouldCollapse) {
                chartExpanded = false;
            }
                    
            // 按时间正序排列（从旧到新）
            const sortedData = [...filteredData].sort((a, b) => {
                const dateA = new Date(a.date || 0);
                const dateB = new Date(b.date || 0);
                return dateA - dateB;
            });
                    
            // 提取数据点
            const dataPoints = sortedData.map((record, index) => ({
                index: index,
                date: record.date,
                lp: parseInt(record.my_lp) || 0,
                mr: parseInt(record.my_master_rating) || 0,
                result: record.my_result,
                character: record.my_character,
                opponent: record.opponent_character
            }));
                    
            if (dataPoints.length === 0) return '';
                    
            // 先过滤掉MR和LP都小于等于0的异常数据点
            const allValidDataPoints = dataPoints.filter(point => point.lp > 0 || point.mr > 0);
            
            if (allValidDataPoints.length === 0) return '';
                    
            // 检查是否有有效的MR分数据（至少有一个非零值）
            const hasValidMR = allValidDataPoints.some(point => point.mr > 0);
                    
            // 如果有MR分则使用MR，否则使用LP
            if (!hasValidMR && chartMetric === 'mr') {
                chartMetric = 'lp';
            } else if (hasValidMR && chartMetric !== 'mr' && chartMetric !== 'lp') {
                chartMetric = 'mr';
            }
            
            // 根据当前选择的指标过滤数据点，避免0值拉伸数据范围
            const validDataPoints = allValidDataPoints.filter(point => point[chartMetric] > 0);
            
            if (validDataPoints.length === 0) return '';
                    
            // 计算数值范围
            const values = validDataPoints.map(p => p[chartMetric]);
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            const range = maxVal - minVal || 1;
            
            // SVG参数（使用响应式宽度）
            const padding = { top: 20, right: 30, bottom: 40, left: 60 };
            const viewBoxWidth = 800;
            const viewBoxHeight = 250;
            const chartWidth = viewBoxWidth - padding.left - padding.right;
            const chartHeight = viewBoxHeight - padding.top - padding.bottom;
            
            // 生成SVG路径
            let pathD = '';
            let circles = '';
            
            validDataPoints.forEach((point, i) => {
                const x = padding.left + (i / (validDataPoints.length - 1 || 1)) * chartWidth;
                const normalizedValue = (point[chartMetric] - minVal) / range;
                const y = padding.top + chartHeight - normalizedValue * chartHeight;
                
                if (i === 0) {
                    pathD += `M ${x} ${y}`;
                } else {
                    pathD += ` L ${x} ${y}`;
                }
                
                // 根据输赢决定颜色（对调：胜-绿色，负-红色）
                const isWin = point.result && (point.result.includes('胜') || point.result.toLowerCase().includes('win'));
                const color = isWin ? '#44ff44' : '#ff4444';
                
                // 添加节点圆点
                circles += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5" 
                    class="chart-point" 
                    data-index="${i}" 
                    data-lp="${point.lp}" 
                    data-mr="${point.mr}" 
                    data-character="${point.character}" 
                    data-opponent="${point.opponent}" 
                    data-result="${point.result}" 
                    data-date="${new Date(point.date).toLocaleString('zh-CN')}" />
                `;
            });
            
            // Y轴刻度
            const yAxisLines = [];
            for (let i = 0; i <= 4; i++) {
                const value = minVal + (range * i / 4);
                const y = padding.top + chartHeight - (i / 4) * chartHeight;
                yAxisLines.push(`
                    <line x1="${padding.left}" y1="${y}" x2="${viewBoxWidth - padding.right}" y2="${y}" stroke="#333333" stroke-width="1" stroke-dasharray="4,4" />
                    <text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" fill="#999999" font-size="11">${Math.round(value)}</text>
                `);
            }
            
            // X轴标签（显示第一个、中间和最后一个日期）
            const xLabels = [];
            if (validDataPoints.length > 0) {
                const firstDate = new Date(validDataPoints[0].date).toLocaleDateString('zh-CN');
                const lastDate = new Date(validDataPoints[validDataPoints.length - 1].date).toLocaleDateString('zh-CN');
                const midIndex = Math.floor(validDataPoints.length / 2);
                const midDate = new Date(validDataPoints[midIndex].date).toLocaleDateString('zh-CN');
                
                xLabels.push(`<text x="${padding.left}" y="${viewBoxHeight - 10}" text-anchor="start" fill="#999999" font-size="10">${firstDate}</text>`);
                xLabels.push(`<text x="${padding.left + chartWidth / 2}" y="${viewBoxHeight - 10}" text-anchor="middle" fill="#999999" font-size="10">${midDate}</text>`);
                xLabels.push(`<text x="${viewBoxWidth - padding.right}" y="${viewBoxHeight - 10}" text-anchor="end" fill="#999999" font-size="10">${lastDate}</text>`);
            }
            
            const unitLabel = chartMetric === 'lp' ? 'LP' : 'MR';
            
            // 计算对局数和胜率
            const totalMatches = sortedData.length;
            const wins = sortedData.filter(record => {
                const result = record.my_result || '';
                return result.includes('胜') || result.toLowerCase().includes('win');
            }).length;
            const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : 0;
            
            return `
                <div class="chart-section ${chartExpanded ? '' : 'collapsed'}">
                    <div class="chart-header">
                        <div class="chart-title-section">
                            <div class="chart-title">趋势分析</div>
                            <div class="chart-stats">
                                <div class="chart-stat-item">
                                    对局数：<span class="chart-stat-value">${totalMatches}</span>
                                </div>
                                <div class="chart-stat-item">
                                    胜率：<span class="chart-stat-value" style="color: ${parseFloat(winRate) >= 50 ? '#4ade80' : '#f87171'}">${winRate}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="chart-controls">
                            <button class="chart-toggle-btn" ${shouldCollapse ? 'disabled' : ''} onclick="${shouldCollapse ? '' : 'toggleChart()'}"><span class="chart-toggle-arrow">▲</span></button>
                            <button class="chart-type-btn ${chartMetric === 'mr' ? 'active' : ''}" onclick="switchChartMetric('mr')">M阶分 (MR)</button>
                            <button class="chart-type-btn ${chartMetric === 'lp' ? 'active' : ''}" onclick="switchChartMetric('lp')">积分 (LP)</button>
                        </div>
                    </div>
                    <div class="chart-container-wrapper">
                    <div class="chart-container">
                        <svg class="chart-svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet">
                            <!-- Y轴网格线和刻度 -->
                            ${yAxisLines.join('')}
                            
                            <!-- X轴标签 -->
                            ${xLabels.join('')}
                            
                            <!-- Y轴标题 -->
                            <text x="15" y="${viewBoxHeight / 2}" transform="rotate(-90 15 ${viewBoxHeight / 2})" text-anchor="middle" fill="#999999" font-size="11">${unitLabel}</text>
                            
                            <!-- 折线路径 -->
                            <path d="${pathD}" fill="none" stroke="#666666" stroke-width="2" />
                            
                            <!-- 数据点 -->
                            ${circles}
                        </svg>
                        <div class="chart-tooltip" id="chartTooltip"></div>
                    </div>
                    </div>
                </div>
            `;
        }
        
        // 初始化图表提示框
        function initChartTooltip() {
            const tooltip = document.getElementById('chartTooltip');
            const points = document.querySelectorAll('.chart-point');
            
            if (!tooltip) return;
            
            points.forEach(point => {
                point.addEventListener('mouseenter', (e) => {
                    // 放大圆点（用r属性而非CSS transform，避免命中区域突变导致抽搐）
                    point.setAttribute('r', '6');
                    point.classList.add('active');
                    
                    const lp = e.target.getAttribute('data-lp');
                    const mr = e.target.getAttribute('data-mr');
                    const character = e.target.getAttribute('data-character');
                    const opponent = e.target.getAttribute('data-opponent');
                    const result = e.target.getAttribute('data-result');
                    const date = e.target.getAttribute('data-date');
                    
                    tooltip.innerHTML = `
                        <div class="tooltip-row">
                            <span class="tooltip-label">时间：</span>
                            <span class="tooltip-value">${date}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">对位：</span>
                            <span class="tooltip-value">${character} vs ${opponent}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">结果：</span>
                            <span class="tooltip-value" style="color: ${result && (result.includes('胜') || result.toLowerCase().includes('win')) ? '#44ff44' : '#ff4444'}">${result}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">LP：</span>
                            <span class="tooltip-value">${lp}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">MR：</span>
                            <span class="tooltip-value">${mr}</span>
                        </div>
                    `;
                    tooltip.classList.add('show');
                });
                
                point.addEventListener('mousemove', (e) => {
                    const container = point.closest('.chart-container');
                    const rect = container.getBoundingClientRect();
                    const tooltipEl = document.getElementById('chartTooltip');
                    
                    // 初始位置：鼠标右上方
                    let x = e.clientX - rect.left + 15;
                    let y = e.clientY - rect.top - 10;
                    
                    // 获取tooltip的尺寸
                    const tooltipWidth = tooltipEl.offsetWidth || 200; // 估算宽度
                    const tooltipHeight = tooltipEl.offsetHeight || 150; // 估算高度
                    
                    // 容器边界
                    const containerWidth = rect.width;
                    const containerHeight = rect.height;
                    
                    // 检查右边界，如果超出则显示在左侧
                    if (x + tooltipWidth > containerWidth) {
                        x = e.clientX - rect.left - tooltipWidth - 15;
                    }
                    
                    // 检查上边界，如果超出则显示在下方
                    if (y < 0) {
                        y = e.clientY - rect.top + 20;
                    }
                    
                    // 检查下边界，如果超出则向上调整
                    if (y + tooltipHeight > containerHeight) {
                        y = containerHeight - tooltipHeight - 10;
                    }
                    
                    // 确保不会超出左边界
                    if (x < 0) {
                        x = 10;
                    }
                    
                    tooltip.style.left = x + 'px';
                    tooltip.style.top = y + 'px';
                });
                
                point.addEventListener('mouseleave', () => {
                    // 恢复圆点大小
                    point.setAttribute('r', '4');
                    point.classList.remove('active');
                    tooltip.classList.remove('show');
                });
            });
        }
        
        // 处理图片加载失败
        function handleImageError(imgElement, characterName) {
            imgElement.style.display = 'none';
            const placeholder = document.createElement('div');
            placeholder.className = 'character-placeholder';
            placeholder.textContent = characterName || '?';
            imgElement.parentElement.insertBefore(placeholder, imgElement);
        }

        function showStatus(elementId, message, type) {
            const element = document.getElementById(elementId);
            if (!element) return;  // 目标容器不存在时静默跳过，避免空指针报错
            element.className = `status ${type}`;
            element.innerHTML = message;
        }

        async function startLogin() {
            showLoading('正在启动登录流程...');
            try {
                const response = await fetch(`${API_BASE}/api/login/start`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({})
                });

                const data = await response.json();
                
                if (data.success) {
                    sessionId = data.session_id;
                    showStatus('loginStatus', `✅ ${data.message}`, 'success');
                    document.getElementById('confirmSection').style.display = 'block';
                } else {
                    showStatus('loginStatus', `❌ ${data.message}`, 'error');
                }
            } catch (error) {
                showStatus('loginStatus', `❌ 请求失败: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        }

        async function confirmLogin() {
            if (!sessionId) {
                showStatus('confirmStatus', '❌ 请先启动登录流程', 'error');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/api/login/confirm`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ session_id: sessionId })
                });

                const data = await response.json();
                
                if (data.success) {
                    cookie = data.cookie;
                    currentUserInfo = {
                        user_id: data.user_id,
                        player_name: data.player_name
                    };
                    isLoggedIn = true;
                    updateLoginStatus();
                    hideLoginModal();
                    showStatus('confirmStatus', `✅ 登录成功！欢迎 ${data.player_name || '用户'}`, 'success');
                    
                    // 保存登录状态到 localStorage
                    saveLoginState();
                    
                    // 后台更新角色列表（自动发现官方新角色）
                    loadCharacterRoster();
                    
                    // 自动开始爬取数据
                    setTimeout(() => {
                        autoCrawlData();
                    }, 500);
                } else {
                    showStatus('confirmStatus', `❌ 获取信息失败`, 'error');
                }
            } catch (error) {
                showStatus('confirmStatus', `❌ 请求失败: ${error.message}`, 'error');
            }
        }

        async function cookieLogin() {
            const cookieInput = document.getElementById('cookieInput');
            const cookieValue = cookieInput.value.trim();
            
            if (!cookieValue) {
                showStatus('cookieLoginStatus', '❌ 请粘贴Cookie字符串', 'error');
                return;
            }
            
            const btn = document.getElementById('cookieLoginBtn');
            btn.disabled = true;
            btn.textContent = '登录中...';
            
            try {
                const response = await fetch(`${API_BASE}/api/login/cookie`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cookie: cookieValue, user_id: currentUserInfo?.user_id || null })
                });

                const data = await response.json();
                
                if (data.success) {
                    cookie = data.cookie;
                    currentUserInfo = {
                        user_id: data.user_id,
                        player_name: data.player_name
                    };
                    isLoggedIn = true;
                    updateLoginStatus();
                    hideLoginModal();
                    showStatus('cookieLoginStatus', `✅ 登录成功！欢迎 ${data.player_name || '用户'}`, 'success');
                    
                    // 保存登录状态到 localStorage
                    saveLoginState();
                    
                    // 后台更新角色列表（自动发现官方新角色）
                    loadCharacterRoster();
                    
                    // 清空输入框
                    cookieInput.value = '';
                    
                    // 自动开始爬取数据
                    setTimeout(() => {
                        autoCrawlData();
                    }, 500);
                } else {
                    showStatus('cookieLoginStatus', `❌ ${data.detail || 'Cookie无效或已过期'}`, 'error');
                }
            } catch (error) {
                showStatus('cookieLoginStatus', `❌ 请求失败: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Cookie登录';
            }
        }

        async function autoCrawlData() {
            // 取消上一次未完成的对战数据加载
            if (battleFetchCtrl) battleFetchCtrl.abort();
            battleFetchCtrl = new AbortController();
            const battleSignal = battleFetchCtrl.signal;
            
            // 统一加载显示：内容区spinner（无遮罩不阻挡操作）
            if (isBattlePageActive()) {
                document.getElementById('battlesScrollArea').innerHTML = loadingHtml('全力加载中...');
            }
            battleLoading = true;  // 切走再切回时保持加载中显示
            try {
                const response = await fetch(`${API_BASE}/api/crawl`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    signal: battleSignal,
                    body: JSON.stringify({
                        cookie: cookie,
                        pages: 10,
                        max_workers: 10,
                        battle_type: currentBattleType
                    })
                });

                const data = await response.json();
                
                if (data.success) {
                    matchData = sanitizeRecords(data.data);
                    // 更新用户信息
                    if (data.user_info) {
                        currentUserInfo = data.user_info;
                        updateLoginStatus();
                    } else {
                        console.warn('后端未返回 user_info');
                    }
                    // 保存玩家资料
                    if (data.player_profile) {
                        playerProfile = data.player_profile;
                    } else {
                        console.warn('未收到玩家资料');
                    }
                    
                    // 保存到主页数据缓存
                    homeData.matchData = matchData;
                    homeData.userInfo = currentUserInfo;
                    homeData.profile = playerProfile;
                    
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                } else {
                    // 静默处理，不弹窗
                    console.warn('爬取返回失败:', data);
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') return;  // 被新加载取消，静默退出
                // 静默处理，不弹窗
                console.error('请求失败:', error);
                if (isBattlePageActive()) {
                    renderContent();
                }
            } finally {
                if (!battleSignal.aborted) {
                    battleLoading = false;
                }
            }
        }

        async function crawlData() {
            if (!cookie) {
                showStatus('crawlStatus', '❌ 请先获取Cookie', 'error');
                return;
            }

            const pages = parseInt(document.getElementById('pages').value);
            const maxWorkers = parseInt(document.getElementById('maxWorkers').value);

            showLoading('正在爬取数据...');
            try {
                const response = await fetch(`${API_BASE}/api/crawl`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        cookie: cookie,
                        pages: pages,
                        max_workers: maxWorkers
                    })
                });

                const data = await response.json();
                
                if (data.success) {
                    matchData = sanitizeRecords(data.data);
                    // 更新用户信息
                    if (data.user_info) {
                        currentUserInfo = data.user_info;
                        updateLoginStatus();
                    }
                    showStatus('crawlStatus', `✅ 爬取成功！共 ${data.total_records} 条记录`, 'success');
                    setTimeout(() => {
                        renderContent();
                    }, 1000);
                } else {
                    showStatus('crawlStatus', `❌ 爬取失败`, 'error');
                }
            } catch (error) {
                showStatus('crawlStatus', `❌ 请求失败: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        }

        async function refreshData() {
            if (!cookie) {
                alert('Cookie未设置，请重新登录');
                return;
            }
            
            // 取消上一次未完成的对战数据加载
            if (battleFetchCtrl) battleFetchCtrl.abort();
            battleFetchCtrl = new AbortController();
            const battleSignal = battleFetchCtrl.signal;
            
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;  // 加载态仅置灰，与其他刷新按钮一致
            }
            
            // 统一加载显示：内容区spinner（无遮罩不阻挡操作）
            if (isBattlePageActive()) {
                document.getElementById('battlesScrollArea').innerHTML = loadingHtml('正在刷新对战记录...');
            }
            battleLoading = true;  // 切走再切回时保持加载中显示
            try {
                let response;
                
                if (isQueryMode && queriedUserId) {
                    // 查询模式：刷新查询用户的数据
                    response = await fetch(`${API_BASE}/api/query-player`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        signal: battleSignal,
                        body: JSON.stringify({
                            user_id: queriedUserId,
                            cookie: cookie,
                            pages: 10,
                            max_workers: 5,
                            battle_type: currentBattleType
                        })
                    });
                } else {
                    // 主页模式：刷新登录用户的数据
                    response = await fetch(`${API_BASE}/api/crawl`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        signal: battleSignal,
                        body: JSON.stringify({
                            cookie: cookie,
                            pages: 10,
                            max_workers: 10,
                            battle_type: currentBattleType
                        })
                    });
                }

                const data = await response.json();
                
                if (data.success) {
                    matchData = sanitizeRecords(data.data);
                    currentPage = 1;  // 刷新后页码回到第一页
                    // 注意：不更新currentUserInfo，保持原有用户信息显示
                    
                    // 保存玩家资料
                    if (data.player_profile) {
                        playerProfile = data.player_profile;
                    }
                    
                    // 同步回对应数据缓存，避免切换导航后返回时被旧缓存覆盖
                    if (isQueryMode && queriedUserId) {
                        queryData.matchData = matchData;
                        queryData.profile = playerProfile;
                    } else {
                        homeData.matchData = matchData;
                        homeData.userInfo = currentUserInfo;
                        homeData.profile = playerProfile;
                    }
                    
                    if (isBattlePageActive()) {
                        renderContent();
                    }
                } else {
                    console.error('刷新失败:', data);
                    alert('刷新失败：' + (data.detail || '未知错误'));
                }
            } catch (error) {
                if (error.name === 'AbortError') return;  // 被新加载取消，静默退出
                console.error('请求异常:', error);
                alert('请求失败: ' + error.message);
            } finally {
                if (!battleSignal.aborted) {
                    battleLoading = false;
                    if (refreshBtn) {
                        refreshBtn.disabled = false;
                    }
                }
            }
        }

        // ==================== 对战数据通用工具 ====================

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        // ==================== 后端脏数据清洗 ====================
        // 后端在个别边界情况下可能把 Python 的 None 转成字面量字符串（如 "None"、"M阶None"、"None积分"），
        // 渲染前统一清洗，避免界面显示 "None"、用 "None" 作为图片URL/玩家ID
        const DIRTY_NONE_VALUES = new Set(['None', 'null', 'NaN', 'undefined']);

        function cleanNoneStr(v) {
            if (typeof v !== 'string') return v;
            const t = v.trim();
            if (DIRTY_NONE_VALUES.has(t)) return '';
            // 段位显示字段的脏值（如 "M阶None"、"None积分"）直接降级为 "-"
            if (t === 'M阶None' || t === 'None积分') return '-';
            return v;
        }

        function sanitizeRecord(r) {
            if (!r || typeof r !== 'object') return r;
            for (const k of Object.keys(r)) {
                if (typeof r[k] === 'string') r[k] = cleanNoneStr(r[k]);
            }
            return r;
        }

        function sanitizeRecords(list) {
            return Array.isArray(list) ? list.map(sanitizeRecord) : [];
        }

        function isWinRecord(record) {
            const r = record.my_result || '';
            return r.includes('胜') || r.toLowerCase().includes('win');
        }

        function parseRecordDate(record) {
            const d = new Date(record.date);
            return isNaN(d.getTime()) ? null : d;
        }

        // 计算当前连胜/连败与历史最佳连胜（输入为时间倒序，最新在前）
        function computeStreakStats(recordsDesc) {
            let curType = null, curLen = 0;
            if (recordsDesc.length > 0) {
                curType = isWinRecord(recordsDesc[0]) ? 'win' : 'lose';
                for (const r of recordsDesc) {
                    const t = isWinRecord(r) ? 'win' : 'lose';
                    if (t === curType) curLen++; else break;
                }
            }
            let best = 0, run = 0;
            for (let i = recordsDesc.length - 1; i >= 0; i--) {
                if (isWinRecord(recordsDesc[i])) { run++; best = Math.max(best, run); } else run = 0;
            }
            return { curType, curLen, bestWinStreak: best };
        }

        // ==================== 对战报告 ====================

        let reportPeriod = 'all';  // today/all（官方仅保留当前赛季最近约100局）

        function switchReportPeriod(period) {
            reportPeriod = period;
            // 报告内嵌在玩家信息卡片中，整体重渲染即可
            renderContent();
        }

        // 判断是否排位赛（battle_type为官方本地化名称，兼容中/日/英文；缺失时用MR存在性兜底）
        function isRankRecord(r) {
            const t = String(r.battle_type || '');
            if (t) return /排位|ランク|RANK/i.test(t);
            return parseInt(r.my_master_rating) > 0;
        }

        function getReportMatches() {
            // 报告仅统计排位赛
            const rankData = matchData.filter(isRankRecord);
            if (reportPeriod === 'all') return rankData;
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return rankData.filter(r => {
                const d = parseRecordDate(r);
                return d && d >= start;
            });
        }

        // 报告排行聚合与渲染辅助（卡片内只显示Top3，全量通过弹窗查看）
        function aggregateReportChars(list) {
            const map = new Map();
            for (const r of list) {
                const key = r.my_character || '未知';
                if (!map.has(key)) map.set(key, { name: key, count: 0, wins: 0, img: '' });
                const c = map.get(key);
                c.count++;
                if (isWinRecord(r)) c.wins++;
                if (!c.img && r.my_character_image) c.img = r.my_character_image;
            }
            return [...map.values()].sort((a, b) => b.count - a.count);
        }

        function aggregateReportOpps(list) {
            const map = new Map();
            for (const r of list) {
                const key = r.opponent_character || '未知';
                if (!map.has(key)) map.set(key, { name: key, count: 0, wins: 0, img: '' });
                const o = map.get(key);
                o.count++;
                if (isWinRecord(r)) o.wins++;
                if (!o.img && r.opponent_character_image) o.img = r.opponent_character_image;
            }
            return [...map.values()].sort((a, b) => b.count - a.count);
        }

        function reportWinRateHtml(w, c) {
            const rate = c > 0 ? ((w / c) * 100).toFixed(0) : '0';
            const cls = parseInt(rate) >= 50 ? 'report-winrate-good' : 'report-winrate-bad';
            return `<span class="${cls}">${rate}%</span>`;
        }

        function reportRowHtml(item, maxCount) {
            const pct = maxCount > 0 ? ((item.count / maxCount) * 100).toFixed(0) : '0';
            return `
                <div class="report-bar-row">
                    <span class="report-bar-name" title="${escapeHtml(item.name)}">${item.img ? `<img src="${item.img}" style="width:16px;height:16px;object-fit:contain;vertical-align:-3px;margin-right:3px;" onerror="this.style.display='none'">` : ''}${escapeHtml(item.name)}</span>
                    <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>
                    <span class="report-bar-val">${item.count}局 · 胜率${reportWinRateHtml(item.wins, item.count)}</span>
                </div>
            `;
        }

        // 窄列面板行：不显示角色名称，只用角色头像（悬停提示名称）
        function reportRowSlimHtml(item, maxCount) {
            const pct = maxCount > 0 ? ((item.count / maxCount) * 100).toFixed(0) : '0';
            const icon = item.img
                ? `<img src="${item.img}" onerror="this.style.display='none'">`
                : escapeHtml(String(item.name).slice(0, 1));
            return `
                <div class="report-bar-row" title="${escapeHtml(item.name)} · ${item.count}局">
                    <span class="report-bar-icon">${icon}</span>
                    <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>
                    <span class="report-bar-val">${item.count}局 · 胜率${reportWinRateHtml(item.wins, item.count)}</span>
                </div>
            `;
        }

        function showReportFullList(type) {
            const list = getReportMatches();
            const items = type === 'char' ? aggregateReportChars(list) : aggregateReportOpps(list);
            const titleEl = document.getElementById('reportListTitle');
            const bodyEl = document.getElementById('reportListBody');
            const overlay = document.getElementById('reportListModal');
            if (!titleEl || !bodyEl || !overlay) return;
            titleEl.textContent = type === 'char' ? '🥋 使用角色（全部）' : '⚔️ 对手角色（全部）';
            const maxCount = items.length ? items[0].count : 1;
            bodyEl.innerHTML = items.length
                ? items.map(i => reportRowHtml(i, maxCount)).join('')
                : '<div class="empty-state"><div class="empty-state-icon">🌙</div><div class="empty-state-text">该时段暂无排位赛对局</div></div>';
            overlay.classList.add('show');
        }

        function closeReportListModal() {
            const overlay = document.getElementById('reportListModal');
            if (overlay) overlay.classList.remove('show');
        }

        function renderReportContent() {
            const periods = [
                { key: 'today', label: '今天' },
                { key: 'all', label: '本赛季' }
            ];
            const periodBar = `
                <div class="report-period-bar">
                    ${periods.map(p => `<button class="report-period-btn ${reportPeriod === p.key ? 'active' : ''}" onclick="switchReportPeriod('${p.key}')">${p.label}</button>`).join('')}
                    <span class="report-scope-hint">📌 仅统计排位赛 · 官方只保留当前赛季最近约100局</span>
                </div>
            `;

            if (!matchData || matchData.length === 0) {
                return `<div class="report-container">${periodBar}
                    <div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无对战记录</div></div></div>`;
            }

            const list = getReportMatches();
            if (list.length === 0) {
                return `<div class="report-container">${periodBar}
                    <div class="empty-state"><div class="empty-state-icon">🌙</div><div class="empty-state-text">好像什么都没有~</div></div></div>`;
            }

            // 时间正序（从旧到新）
            const asc = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));

            const total = list.length;
            const wins = list.filter(isWinRecord).length;
            const winRate = ((wins / total) * 100).toFixed(1);

            // 分数变化：优先MR，无MR时用LP
            const mrSeries = asc.map(r => parseInt(r.my_master_rating) || 0).filter(v => v > 0);
            const lpSeries = asc.map(r => parseInt(r.my_lp) || 0).filter(v => v > 0);
            const useMr = mrSeries.length > 0;
            const series = useMr ? mrSeries : lpSeries;
            const pointName = useMr ? 'MR' : 'LP';
            const delta = series.length >= 2 ? series[series.length - 1] - series[0] : 0;
            const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
            const deltaClass = delta > 0 ? 'report-delta-up' : (delta < 0 ? 'report-delta-down' : '');

            const streak = computeStreakStats(list);
            const curStreakText = streak.curLen === 0 ? '-' : `${streak.curLen}${streak.curType === 'win' ? '连胜' : '连败'}`;
            const curStreakColor = streak.curLen === 0 ? '#ffffff' : (streak.curType === 'win' ? '#4ade80' : '#f87171');

            // 个人最佳：仅基于当前已加载的最近约100局（不做本地持久化）
            const bestMr = Math.max(0, ...matchData.map(r => parseInt(r.my_master_rating) || 0));
            const bestLp = Math.max(0, ...matchData.map(r => parseInt(r.my_lp) || 0));
            const bestMain = bestMr > 0 ? `MR ${bestMr}` : (bestLp > 0 ? `LP ${bestLp}` : '-');
            const bestSub = (bestMr > 0 && bestLp > 0) ? `LP最高 ${bestLp} · 最近约100局` : '最近约100局';

            // 角色使用 / 对手角色统计（卡片内只显Top3，全量弹窗查看）
            const charList = aggregateReportChars(list);
            const charTop = charList.slice(0, 3);
            const oppList = aggregateReportOpps(list);
            const oppTop = oppList.slice(0, 3);

            // 时段分布
            const hours = new Array(24).fill(0);
            for (const r of list) { const d = parseRecordDate(r); if (d) hours[d.getHours()]++; }
            const maxHour = Math.max(1, ...hours);
            const peakHour = hours.indexOf(Math.max(...hours));

            const charBars = charTop.map(c => reportRowSlimHtml(c, charTop[0].count)).join('');
            const oppRows = oppTop.map(o => reportRowSlimHtml(o, oppTop[0].count)).join('');

            const hourCols = hours.map((h, i) => `
                <div class="report-hour-col" title="${i}点：${h}局">
                    <div class="report-hour-bar ${i === peakHour && h > 0 ? 'peak' : ''}" style="height:${((h / maxHour) * 100).toFixed(0)}%"></div>
                </div>
            `).join('');

            return `
                <div class="report-container">
                    ${periodBar}
                    <div class="report-summary-grid">
                        <div class="report-stat-card">
                            <div class="report-stat-label">对局数</div>
                            <div class="report-stat-value">${total}</div>
                            <div class="report-stat-sub">${wins}胜 ${total - wins}负</div>
                        </div>
                        <div class="report-stat-card">
                            <div class="report-stat-label">胜率</div>
                            <div class="report-stat-value" style="color:${parseFloat(winRate) >= 50 ? '#4ade80' : '#f87171'}">${winRate}%</div>
                            <div class="report-stat-sub">胜${wins} / 负${total - wins}</div>
                        </div>
                        <div class="report-stat-card">
                            <div class="report-stat-label">${pointName}变化</div>
                            <div class="report-stat-value ${deltaClass}">${deltaText}</div>
                            <div class="report-stat-sub">期间首场→末场</div>
                        </div>
                        <div class="report-stat-card">
                            <div class="report-stat-label">当前状态</div>
                            <div class="report-stat-value" style="color:${curStreakColor};font-size:16px;">${curStreakText}</div>
                            <div class="report-stat-sub">期间最佳连胜 ${streak.bestWinStreak}</div>
                        </div>
                        <div class="report-stat-card">
                            <div class="report-stat-label">个人最佳</div>
                            <div class="report-stat-value" style="font-size:16px;">${bestMain}</div>
                            <div class="report-stat-sub">${bestSub}</div>
                        </div>
                    </div>
                    <div class="report-grid">
                        <div class="report-panel report-panel-slim">
                            <div class="report-panel-title">🥋 使用角色${charList.length > 3 ? `<button class="report-more-btn" onclick="showReportFullList('char')">全部</button>` : ''}</div>
                            ${charBars}
                        </div>
                        <div class="report-panel report-panel-slim">
                            <div class="report-panel-title">⚔️ 对手角色${oppList.length > 3 ? `<button class="report-more-btn" onclick="showReportFullList('opp')">全部</button>` : ''}</div>
                            ${oppRows}
                        </div>
                        <div class="report-panel">
                            <div class="report-panel-title">🕒 时段分布${hours[peakHour] > 0 ? `（高峰：${peakHour}点）` : ''}</div>
                            <div class="report-hour-chart">${hourCols}</div>
                            <div class="report-hour-labels"><span>0点</span><span>6点</span><span>12点</span><span>18点</span><span>23点</span></div>
                        </div>
                    </div>
                </div>
            `;
        }

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
                <button class="update-notice-close" onclick="dismissUpdateNotice('${escapeHtml(latest)}')" title="忽略该版本">&times;</button>
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

