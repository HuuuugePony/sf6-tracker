// Responsibility module: state.js. Shared bindings are declared in state.js; loaded with defer.
// 检测是否为桌面应用环境（pywebview）
const isDesktopApp = window.pywebview !== undefined;

// 如果是浏览器访问，立即显示 body
if (!isDesktopApp) {
    document.body.style.visibility = 'visible';
}

const API_BASE = window.location.origin;
let sessionId = null;
let cookie = null;
let rememberLogin = false;
let isLoggedIn = false;
let accountEpoch = 0;
let loginAttempt = 0;
let loginFetchCtrl = null;
let nameSearchCtrl = null;
let nameSearchId = 0;
let isHistoryMode = false;
let historyFetchId = 0;
let historyFetchCtrl = null;
let historyUpdateCtrl = null;
let historyData = {matchData: [], userInfo: {}, loaded: false, total: 0, hasMore: false};
const historyState = {players: [], playerId: '', error: '', loading: false, updating: false, message: '', updateError: false};

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
let currentBattleType = 'all';  // 当前对战类型
let selectedCharacter = '';  // 选中的角色筛选
let selectedOpponentCharacter = '';  // 选中的对手角色筛选
let resultFilter = 'all';
let dateFrom = '';
let dateTo = '';
let reviewFilter = 'all';
let selectedRivalCharId = null;  // 角色对阵胜率面板选中的角色ID
let currentViewMode = 'battles';  // battles / rival_winrate / insights（对战报告仍内嵌在玩家信息）
let chartMetric = 'mr';  // 图表指标: 'lp' 或 'mr'
let chartExpanded = true;  // 图表展开状态
let profileCollapsed = false;  // 恢复原版：玩家信息默认展开
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
const APP_VERSION = 'v0.8';

// 主页/查询对战数据是否加载中：加载未完成时切走再切回，继续显示加载中而非空状态
let battleRequestTarget = null;
const battleViews = new Map();
let activeBattleViewKey = null;
let pendingBattleScroll = null;

function saveBattleView() {
    if (!activeBattleViewKey || !isBattlePageActive()) return;
    const area = document.getElementById?.('battlesScrollArea');
    battleViews.set(activeBattleViewKey, {currentPage, currentBattleType, selectedCharacter,
        selectedOpponentCharacter, selectedRivalCharId, currentViewMode, chartMetric,
        chartExpanded, profileCollapsed, resultFilter, dateFrom, dateTo, reviewFilter,
        scrollTop: pendingBattleScroll ?? area?.scrollTop ?? 0});
    // State snapshots contain no records; keep only the most recently visited players.
    if (battleViews.size > 30) battleViews.delete(battleViews.keys().next().value);
}

function restoreBattleView(key) {
    const view = battleViews.get(key) || {};
    activeBattleViewKey = key;
    currentPage = view.currentPage || 1;
    currentBattleType = view.currentBattleType || 'all';
    selectedCharacter = view.selectedCharacter || '';
    selectedOpponentCharacter = view.selectedOpponentCharacter || '';
    selectedRivalCharId = view.selectedRivalCharId || null;
    currentViewMode = view.currentViewMode || 'battles';
    chartMetric = view.chartMetric || 'mr';
    chartExpanded = view.chartExpanded ?? false;
    profileCollapsed = view.profileCollapsed ?? false;
    resultFilter = view.resultFilter || 'all';
    dateFrom = view.dateFrom || '';
    dateTo = view.dateTo || '';
    reviewFilter = view.reviewFilter || 'all';
    pendingBattleScroll = view.scrollTop || 0;
}

function resetAccountData({keepHistory = false} = {}) {
    closePlayerInsights();
    if (keepHistory) saveBattleView();
    const localHistory = keepHistory && isHistoryMode ? {data: historyData, state: {...historyState},
        key: activeBattleViewKey, view: battleViews.get(activeBattleViewKey)} : null;
    ++accountEpoch;
    cancelNameSearch();
    for (const controller of [battleFetchCtrl, fightersFetchCtrl, rankingFetchCtrl, rankingStatsFetchCtrl]) controller?.abort();
    battleFetchCtrl = fightersFetchCtrl = rankingFetchCtrl = rankingStatsFetchCtrl = null;
    ++fightersFetchId;
    ++rankingFetchId;
    ++rankingStatsFetchId;
    if (battleRequestTarget) battleRequestTarget.loading = false;
    battleRequestTarget = null;
    homeData = {matchData: [], userInfo: {}, profile: null};
    queryData = {userId: null, matchData: [], userInfo: {}, profile: null};
    matchData = [];
    playerProfile = null;
    lastSearchResults = [];
    fightersState.cache = {friend: null, follow: null, block: null};
    fightersState.pages = {friend: 1, follow: 1, block: 1};
    fightersState.loading = false;
    Object.assign(rankingState, {loading: false, error: '', statsLoading: false, stats: null,
        statsError: '', cachedStats: {}, data: null, rankingList: null, pagination: null,
        statsSort: 'count', statsCharacterTool: '', statsShowAll: false, statsUsageAll: false, statsMrInput: ''});
    battleViews.clear();
    activeBattleViewKey = null;
    isHistoryMode = false;
    historyFetchCtrl?.abort();
    historyUpdateCtrl?.abort();
    historyUpdateCtrl = null;
    ++historyFetchId;
    historyState.playerId = '';
    historyState.players = [];
    historyState.loading = false;
    historyState.error = '';
    historyState.updating = false;
    historyState.message = '';
    historyState.updateError = false;
    historyData = {matchData: [], userInfo: {}, loaded: false, total: 0, hasMore: false};
    if (localHistory) {
        historyData = localHistory.data;
        Object.assign(historyState, localHistory.state, {loading: false, updating: false, message: ''});
        isHistoryMode = true;
        matchData = historyData.matchData;
        playerProfile = historyData.profile || null;
        activeBattleViewKey = localHistory.key;
        if (localHistory.key && localHistory.view) battleViews.set(localHistory.key, localHistory.view);
    }
}

let fightersFetchCtrl = null;

let fightersFetchId = 0;

let rankingFetchCtrl = null;
let rankingStatsFetchCtrl = null;

let rankingFetchId = 0;

let battleFetchCtrl = null;  // 主页/查询的对战数据加载共用
