// Responsibility module: auth.js. Shared bindings are declared in state.js; loaded with defer.
async function waitForServerAndRefresh() {
    const epoch = accountEpoch;
    const attempt = loginAttempt;
    const requestCookie = cookie;
    try {
        const response = await fetch(`${API_BASE}/api/login/cookie`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cookie: requestCookie}), signal: AbortSignal.timeout(30000)
        });
        const data = await response.json();
        if (epoch !== accountEpoch || attempt !== loginAttempt || requestCookie !== cookie) return;
        if (!response.ok || !data.success) {
            if (response.status === 401) {
                const clearedEpoch = accountEpoch + 1;
                await clearLoginState({keepHistory: isHistoryMode});
                if (accountEpoch !== clearedEpoch) return;
            }
            else isLoggedIn = false;
            updateLoginStatus();
            document.getElementById('statusText').textContent = response.status === 401 ? '登录已过期' : '离线模式';
            if (isHistoryMode) {
                renderContent();
                if (!historyData.loaded && historyState.playerId) loadHistoryRecords();
            } else if (lastActiveTab === 'home' || lastActiveTab === 'query') handleRoute(false);
            return;
        }
        currentUserInfo = {user_id: String(data.user_id), player_name: data.player_name};
        isLoggedIn = true;
        saveLoginState();
        updateLoginStatus();
        loadCharacterRoster();
        if (lastActiveTab === 'home' || lastActiveTab === 'query') handleRoute(false);
    } catch (error) {
        if (epoch !== accountEpoch || attempt !== loginAttempt) return;
        isLoggedIn = false;
        updateLoginStatus();
        document.getElementById('statusText').textContent = '离线模式';
    }
}

function showLoginModal() {
    if (isLoggedIn) {
        return;
    }
    document.getElementById('rememberLogin').checked = rememberLogin;
    document.getElementById('loginModal').classList.add('show');
}

function hideLoginModal() {
    cancelLoginAttempt();
    document.getElementById('loginModal').classList.remove('show');
    document.getElementById('cookieInput').value = '';
    document.getElementById('confirmSection').style.display = 'none';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('confirmBtn').disabled = false;
    document.getElementById('cookieLoginBtn').disabled = false;
    hideLoading();
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

async function clearLoginState({keepHistory = false} = {}) {
    cancelLoginAttempt();
    resetAccountData({keepHistory});
    try { localStorage.removeItem('sf6_login_state'); } catch {}
    try { window.sessionStorage?.removeItem('sf6_login_state'); } catch {}
    rememberLogin = false;
    cookie = null;
    currentUserInfo = { user_id: null, player_name: null };
    isLoggedIn = false;
    updateLoginStatus();
    try {
        await fetch(`${API_BASE}/api/logout`, {method: 'POST', signal: AbortSignal.timeout(10000)});
    } catch (error) {
        console.warn('清理后端登录状态失败:', error);
    }
}

async function logout() {
    await clearLoginState();
    // 重定向到主页
    window.history.pushState({}, '', '/home');
    handleRoute(false);
}

function cancelLoginAttempt() {
    ++loginAttempt;
    loginFetchCtrl?.abort();
    loginFetchCtrl = null;
    const cancelledId = sessionId;
    sessionId = null;
    if (cancelledId) {
        fetch(`${API_BASE}/api/login/cancel`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({session_id: cancelledId}), signal: AbortSignal.timeout(10000)
        }).catch(() => {});
    }
}

async function loginRequest(path, body, attempt) {
    const controller = new AbortController();
    loginFetchCtrl = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body), signal: controller.signal
        });
        const data = await response.json();
        if (attempt !== loginAttempt) return null;
        if (!response.ok || !data.success) throw new Error(data.detail || '登录失败，请重试');
        return data;
    } finally {
        clearTimeout(timeout);
        if (loginFetchCtrl === controller) loginFetchCtrl = null;
    }
}

function acceptLogin(data) {
    if (!data.cookie || !/^\d+$/.test(String(data.user_id || ''))) throw new Error('未获取到有效账号信息，请重试');
    resetAccountData({keepHistory: isHistoryMode});
    cookie = data.cookie;
    currentUserInfo = {user_id: String(data.user_id), player_name: data.player_name || '未知玩家'};
    isLoggedIn = true;
    sessionId = null;
    rememberLogin = document.getElementById('rememberLogin')?.checked === true;
    saveLoginState();
    updateLoginStatus();
    hideLoginModal();
    loadCharacterRoster();
    handleRoute(false);
}

async function openOfficialLogin() {
    const btn = document.getElementById('officialLoginBtn');
    if (btn.disabled) return;
    const attempt = loginAttempt;
    btn.disabled = true;
    showStatus('officialLoginStatus', '正在打开默认浏览器…', 'info');
    try {
        const response = await fetch(`${API_BASE}/api/login/open-official`, {
            method:'POST', signal:AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (attempt !== loginAttempt) return;
        if (!response.ok || !data.success) throw new Error(data.detail || '打开失败，请手动访问官网');
        showStatus('officialLoginStatus', '已请求打开。请在官网完成登录，再将 Cookie 粘贴到下方；应用不会自动读取普通浏览器。', 'info');
    } catch (error) {
        if (attempt === loginAttempt) showStatus('officialLoginStatus',
            error.name === 'TimeoutError' ? '打开请求超时，请手动访问官网' : error.message, 'error');
    } finally { btn.disabled = false; }
}

async function startLogin() {
    if (sessionId) return;
    const attempt = ++loginAttempt;
    const id = crypto.randomUUID();
    sessionId = id; // Known before browser startup, so closing the dialog can cancel it.
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    showStatus('loginStatus', '正在启动 Edge，可以关闭此窗口取消…', 'info');
    try {
        const data = await loginRequest('/api/login/start', {session_id: id}, attempt);
        if (!data) return;
        showStatus('loginStatus', `${data.message || '等待手动登录'}。完成后点“验证登录”；反复验证失败请改用上方普通浏览器与 Cookie 导入。`, 'info');
        document.getElementById('confirmSection').style.display = 'block';
    } catch (error) {
        if (attempt !== loginAttempt) return;
        cancelLoginAttempt();
        showStatus('loginStatus', error.name === 'AbortError' ? '浏览器启动超时，请重试' : error.message, 'error');
        btn.disabled = false;
    }
}

async function confirmLogin() {
    if (!sessionId) {
        showStatus('confirmStatus', '请先打开登录浏览器', 'error');
        return;
    }
    const btn = document.getElementById('confirmBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    const attempt = loginAttempt;
    showStatus('confirmStatus', '正在验证账号…', 'info');
    try {
        const data = await loginRequest('/api/login/confirm', {session_id: sessionId}, attempt);
        if (data) acceptLogin(data);
    } catch (error) {
        if (attempt === loginAttempt) showStatus('confirmStatus',
            error.name === 'AbortError' ? '验证超时，可稍后重试' : error.message, 'error');
    } finally {
        if (attempt === loginAttempt) btn.disabled = false;
    }
}

async function cookieLogin() {
    const input = document.getElementById('cookieInput');
    const value = input.value.trim();
    if (!value) {
        showStatus('cookieLoginStatus', '请粘贴 Cookie', 'error');
        return;
    }
    cancelLoginAttempt();
    const attempt = ++loginAttempt;
    const btn = document.getElementById('cookieLoginBtn');
    btn.disabled = true;
    showStatus('cookieLoginStatus', '正在验证账号…', 'info');
    try {
        const data = await loginRequest('/api/login/cookie', {cookie: value}, attempt);
        if (data) acceptLogin(data);
    } catch (error) {
        if (attempt === loginAttempt) showStatus('cookieLoginStatus',
            error.name === 'AbortError' ? '验证超时，请重试' : error.message, 'error');
    } finally {
        if (attempt === loginAttempt) btn.disabled = false;
    }
}
