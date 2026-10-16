// Responsibility module: theme.js. Shared bindings are declared in state.js; loaded with defer.
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

function clearCache() {
    const btn = document.querySelector('.btn-clear-cache');
    if (btn.classList.contains('confirm-state')) {
        // 第二次点击，执行清空
        clearTimeout(clearCacheTimer);
        btn.classList.remove('confirm-state');
        btn.textContent = '清空';

        // 收藏和备注属于用户资料，不作为缓存删除。
        ['sf6_login_state', 'sf6_search_history', 'sf6_character_roster'].forEach(key => localStorage.removeItem(key));
        clearLoginState();

        // 重置前端状态
        cookie = null;
        isLoggedIn = false;
        matchData = [];
        currentUserInfo = { user_id: null, player_name: null };
        playerProfile = null;
        homeData = { matchData: [], userInfo: { user_id: null, player_name: null }, profile: null };
        queryData = { userId: null, matchData: [], userInfo: { user_id: null, player_name: null }, profile: null };
        searchHistory = [];

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

function initLayout() {
    const savedLayout = localStorage.getItem('sf6_layout');
    if (savedLayout === 'spacious') {
        setLayout('spacious');
    } else {
        setLayout('compact');
    }
}

let clearCacheTimer = null;
