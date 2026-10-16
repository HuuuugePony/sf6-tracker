// Responsibility module: reports.js. Shared bindings are declared in state.js; loaded with defer.
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
        { key: 'all', label: isHistoryMode ? '全部历史' : '本赛季' }
    ];
    const periodBar = `
        <div class="report-period-bar">
            ${periods.map(p => `<button class="report-period-btn ${reportPeriod === p.key ? 'active' : ''}" onclick="switchReportPeriod(${inlineJsString(p.key)})">${p.label}</button>`).join('')}
            <span class="report-scope-hint">${isHistoryMode ? '📌 仅统计本地已加载的排位赛记录' : '📌 仅统计排位赛 · 官方只保留当前赛季最近约100局'}</span>
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
    const bestScope = isHistoryMode ? '本地已加载记录' : '最近约100局';
    const bestSub = (bestMr > 0 && bestLp > 0) ? `LP最高 ${bestLp} · ${bestScope}` : bestScope;

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
