// Responsibility module: storage.js. Shared bindings are declared in state.js; loaded with defer.
function saveLoginState() {
    try {
        const loginState = {
            cookie: cookie,
            userInfo: currentUserInfo,
            timestamp: Date.now()
        };
        // Persistent credentials are opt-in. Session storage is not encryption either.
        const target = rememberLogin ? localStorage : window.sessionStorage;
        if (!target) throw new Error('Session storage unavailable');
        target.setItem('sf6_login_state', JSON.stringify(loginState));
        if (rememberLogin) window.sessionStorage?.removeItem('sf6_login_state');
        else localStorage.removeItem('sf6_login_state');
    } catch (error) {
        // If session storage is blocked, never leave an old persistent credential.
        if (!rememberLogin) { try { localStorage.removeItem('sf6_login_state'); } catch {} }
        console.warn('登录状态未能保存，仅本页有效');
    }
}

function loadLoginState() {
    try {
        const sessionState = window.sessionStorage?.getItem('sf6_login_state');
        const savedState = sessionState || localStorage.getItem('sf6_login_state');
        if (savedState) {
            const loginState = JSON.parse(savedState);

            // 检查是否过期（7天）
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (!Number.isFinite(loginState.timestamp) || Date.now() - loginState.timestamp > sevenDays
                || typeof loginState.cookie !== 'string' || !loginState.cookie
                || !/^\d+$/.test(String(loginState.userInfo?.user_id || ''))) {
                console.warn('登录状态已过期，清除缓存');
                if (sessionState) window.sessionStorage.removeItem('sf6_login_state');
                else localStorage.removeItem('sf6_login_state');
                return false;
            }

            // 恢复登录状态
            cookie = loginState.cookie;
            currentUserInfo = loginState.userInfo;
            rememberLogin = !sessionState; // Respect existing remembered logins until logout / next login.
            isLoggedIn = true;
            return true;
        }
    } catch (error) {
        console.warn('登录状态无法读取，请重新登录');
    }
    return false;
}

function loadFavoriteBattles() {
    try {
        const data = localStorage.getItem('sf6_favorite_battles');
        favoriteBattles = data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('加载收藏对局失败:', error);
        favoriteBattles = [];
    }
}

function saveFavoriteBattles() {
    try {
        localStorage.setItem('sf6_favorite_battles', JSON.stringify(favoriteBattles));
        return true;
    } catch (error) {
        console.warn('保存收藏对局失败');
        return false;
    }
}

function loadSearchHistory() {
    try {
        const history = localStorage.getItem('sf6_search_history');
        searchHistory = history ? JSON.parse(history) : [];
    } catch (error) {
        console.error('加载搜索历史失败:', error);
        searchHistory = [];
    }
}

function saveSearchHistory() {
    try {
        localStorage.setItem('sf6_search_history', JSON.stringify(searchHistory));
    } catch (error) {
        console.error('保存搜索历史失败:', error);
    }
}

function loadFavoritePlayers() {
    try {
        const favorites = localStorage.getItem('sf6_favorite_players');
        favoritePlayers = favorites ? JSON.parse(favorites) : [];
    } catch (error) {
        console.error('加载收藏列表失败:', error);
        favoritePlayers = [];
    }
}

function saveFavoritePlayers() {
    try {
        localStorage.setItem('sf6_favorite_players', JSON.stringify(favoritePlayers));
    } catch (error) {
        console.error('保存收藏列表失败:', error);
    }
}
