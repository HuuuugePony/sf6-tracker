// Player-facing analysis. Never treats leaderboard presence as a character tier list.
const insightMetrics = [
    ['received_drive_impact', '承受斗气迸放', '风险观察'],
    ['received_throw_drive_parry', '招架被投', '风险观察'],
    ['received_throw_count', '承受摔投', '风险观察'],
    ['received_punish_counter', '迸放确反康', '风险观察'],
    ['received_stun', '被眩晕', '风险观察'],
    ['drive_parry', '斗气招架', '防守工具'],
    ['just_parry', '完美招架', '防守工具'],
    ['throw_tech', '拆投', '防守工具'],
    ['drive_reversal', '斗气反攻', '防守工具'],
    ['throw_count', '成功摔投', '进攻工具'],
    ['drive_impact', '成功斗气迸放', '进攻工具'],
    ['gauge_rate_drive_rush_from_cancel', '取消斗气冲锋占比', '资源分配'],
    ['gauge_rate_drive_rush_from_parry', '招架斗气冲锋占比', '资源分配'],
    ['gauge_rate_drive_arts', '斗气爆发技占比', '资源分配'],
    ['gauge_rate_drive_impact', '斗气迸放占比', '资源分配'],
    ['gauge_rate_sa_lv1', 'SA1 占比', '资源分配'],
    ['gauge_rate_sa_lv2', 'SA2 占比', '资源分配'],
    ['gauge_rate_sa_lv3', 'SA3 占比', '资源分配'],
    ['gauge_rate_ca', 'CA 占比', '资源分配']
];
const playerInsights = {open: false, snapshot: null, characterId: 0, benchmark: null,
    mode: 'median', group: '风险观察', drawReplayId: null, loading: false, error: '', requestId: 0, controller: null};

function insightCharacter(record) {
    return CHARACTER_ROSTER.find(c => c.id === Number(record.my_character_id))
        || CHARACTER_ROSTER.find(c => c.name === record.my_character || c.tool === record.my_character);
}

function insightOutcome(record) {
    const result = String(record.my_result || '').toLowerCase();
    if (/draw|平局/.test(result)) return 'draw';
    if (/win|胜/.test(result)) return 'win';
    if (/lose|负|败/.test(result)) return 'lose';
    return 'unknown';
}

function insightRate(records) {
    const wins = records.filter(r => insightOutcome(r) === 'win').length;
    const losses = records.filter(r => insightOutcome(r) === 'lose').length;
    const n = wins + losses;
    if (!n) return {n: 0, wins, losses, rate: null, low: null, high: null};
    const p = wins / n, z = 1.96, denominator = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denominator;
    const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
    return {n, wins, losses, rate: p * 100, low: (center - margin) * 100, high: (center + margin) * 100};
}

function analyzePlayerRecords(records, characterId) {
    const unique = new Map();
    records.filter(isRankRecord).forEach((r, i) => unique.set(r.replay_id || `row:${i}`, r));
    const all = [...unique.values()];
    const rows = all.filter(r => !characterId || insightCharacter(r)?.id === characterId)
        .sort((a, b) => (parseRecordDate(b)?.getTime() || 0) - (parseRecordDate(a)?.getTime() || 0));
    const known = rows.filter(r => ['win', 'lose'].includes(insightOutcome(r)));
    const overall = insightRate(known);
    const dated = known.filter(r => parseRecordDate(r));
    const recent = insightRate(dated.slice(0, 20)), previous = insightRate(dated.slice(20, 40));
    const opponents = [...new Set(rows.map(r => r.opponent_character || '未知'))].map(name => ({
        name, ...insightRate(rows.filter(r => (r.opponent_character || '未知') === name))
    })).sort((a, b) => b.losses - a.losses || b.n - a.n);
    const priorities = opponents.filter(row => row.n >= 10 && row.rate < 50);
    const rated = rows.filter(r => parseRecordDate(r) && Number.isFinite(Number(r.my_master_rating)) && Number(r.my_master_rating) > 0);
    const scoreChange = characterId && rated.length >= 2 ? Number(rated[0].my_master_rating) - Number(rated.at(-1).my_master_rating) : null;
    const difficulty = [
        {label: '对手高 100 MR 以上', test: diff => diff >= 100},
        {label: '双方差距小于 100 MR', test: diff => diff > -100 && diff < 100},
        {label: '对手低 100 MR 以上', test: diff => diff <= -100}
    ].map(group => ({label: group.label, ...insightRate(known.filter(r => Number(r.my_master_rating) > 0
        && Number.isFinite(Number(r.my_master_rating)) && Number.isFinite(Number(r.opponent_master_rating))
        && Number(r.opponent_master_rating) > 0 && group.test(Number(r.opponent_master_rating) - Number(r.my_master_rating))))}));
    const roundWin = value => Number.isInteger(value) && [1, 2, 3, 5, 6, 7, 8].includes(value);
    const roundRecords = known.filter(r => Array.isArray(r.my_round_results_raw));
    const roundWins = roundRecords.reduce((n, r) => n + r.my_round_results_raw.filter(roundWin).length, 0);
    const roundLosses = roundRecords.reduce((n, r) => n + r.my_round_results_raw.filter(v => v === 0).length, 0);
    const firstLost = roundRecords.filter(r => r.my_round_results_raw[0] === 0);
    const firstWon = roundRecords.filter(r => roundWin(r.my_round_results_raw[0]));
    const comeback = insightRate(firstLost), conversion = insightRate(firstWon);
    const tags = [];
    if (overall.n < 20) tags.push({label: '样本积累中', reason: '该角色明确胜负的排位记录少于 20 场'});
    const char = CHARACTER_ROSTER.find(c => c.id === characterId);
    if (char && all.length >= 20 && rows.length / all.length >= .7) tags.push({label: `主修${char.name}`, reason: '当前加载排位记录中，该角色占比至少 70%（总样本至少 20 条）'});
    if (previous.n === 20 && recent.n === 20) {
        const diff = recent.rate - previous.rate;
        if (Math.abs(diff) >= 10) tags.push({label: diff > 0 ? '近期胜率回升' : '近期胜率回落', reason: '同角色最近 20 场与此前 20 场相比，胜率相差至少 10 个百分点；不代表因果判断'});
    }
    return {rows, overall, recent, previous, opponents, priorities, scoreChange, difficulty, comeback, conversion,
        roundRate: roundWins + roundLosses ? roundWins * 100 / (roundWins + roundLosses) : null,
        roundCount: roundWins + roundLosses, tags,
        scenarioWins: priorities.reduce((n, row) => n + row.n * .5 - row.wins, 0)};
}

function insightMetricValue(profile, key) {
    const value = profile?.battle_stats_detail?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    const available = profile?.battle_stats_available_fields;
    // Legacy profiles filled missing fields with zero. Don't compare those
    // ambiguous zeros as observations; a new profile records availability.
    if (Array.isArray(available) ? !available.includes(key) : value === 0) return null;
    if (key.startsWith('gauge_rate_') && value > 1) return null;
    return value;
}

function insightComparisons(profile, benchmark, mode = 'median') {
    const samples = (benchmark?.samples || []).filter(s => mode !== 'leader' || s.user_id === benchmark.leader_id);
    return insightMetrics.map(([key, label, group]) => {
        const own = insightMetricValue(profile, key);
        const values = samples.map(s => insightMetricValue(s.profile, key)).filter(v => v !== null).sort((a, b) => a - b);
        const reference = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2 : null;
        return {key, label, group, own, reference, n: values.length,
            delta: own !== null && reference !== null ? own - reference : null, gauge: key.startsWith('gauge_rate_')};
    });
}

function cachedInsightBenchmark(characterId, playerId) {
    try {
        const rows = JSON.parse(localStorage.getItem('sf6_benchmarks_v1') || '[]');
        return Array.isArray(rows) ? rows.find(row => row.character_id === characterId
            && row.excluded_player_id === playerId && Array.isArray(row.samples) && Number.isFinite(row.updated_at)) || null : null;
    } catch { return null; }
}

function saveInsightBenchmark(data) {
    try {
        let rows = JSON.parse(localStorage.getItem('sf6_benchmarks_v1') || '[]');
        if (!Array.isArray(rows)) rows = [];
        rows = rows.filter(row => row.character_id !== data.character_id || row.excluded_player_id !== data.excluded_player_id);
        localStorage.setItem('sf6_benchmarks_v1', JSON.stringify([data, ...rows].slice(0, 32)));
    } catch (error) { console.warn('高手参考缓存未保存'); }
}

function openPlayerInsights() {
    pendingBattleScroll = 0;
    currentViewMode = 'insights';
    preparePlayerInsights();
    renderContent();
}

function preparePlayerInsights() {
    const info = isHistoryMode ? historyData.userInfo : isQueryMode ? queryData.userInfo : currentUserInfo;
    const id = String(isHistoryMode ? historyState.playerId : isQueryMode ? queriedUserId : currentUserInfo.user_id);
    const newPlayer = !playerInsights.open || playerInsights.snapshot?.userId !== id;
    if (newPlayer) {
        closePlayerInsights();
        playerInsights.drawReplayId = null;
        playerInsights.snapshot = {userId: id};
    }
    // Keep the snapshot identity stable while a benchmark request is pending.
    // Live collection and period changes still update the in-page analysis.
    Object.assign(playerInsights.snapshot, {name: info?.player_name || playerProfile?.player_name || '玩家',
        matches: [...getReportMatches()], profile: playerProfile,
        partial: Boolean((isHistoryMode ? historyData.hasMore : (isQueryMode ? queryData : homeData).collection?.complete === false)),
        periodKey: reportPeriod, period: reportPeriod === 'today' ? '今天' : '已加载排位'});
    playerInsights.snapshot.savedAt = isHistoryMode ? historyData.profileUpdatedAt : (isQueryMode ? queryData : homeData).fetchedAt;
    if (newPlayer) {
        const counts = new Map();
        for (const r of playerInsights.snapshot.matches) {
            const char = insightCharacter(r);
            if (char) counts.set(char.id, (counts.get(char.id) || 0) + 1);
        }
        playerInsights.characterId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        playerInsights.benchmark = cachedInsightBenchmark(playerInsights.characterId, id);
    }
    playerInsights.open = true;
}

function closePlayerInsights() {
    playerInsights.controller?.abort();
    ++playerInsights.requestId;
    playerInsights.controller = null;
    playerInsights.loading = false;
    playerInsights.error = '';
    playerInsights.open = false;
}

function changeInsightCharacter(value) {
    playerInsights.controller?.abort();
    ++playerInsights.requestId;
    playerInsights.loading = false;
    playerInsights.error = '';
    playerInsights.characterId = Number(value);
    playerInsights.drawReplayId = null;
    playerInsights.benchmark = cachedInsightBenchmark(playerInsights.characterId, playerInsights.snapshot.userId);
    renderPlayerInsights();
}

function openInsightCharacterPicker() {
    const char = CHARACTER_ROSTER.find(c => c.id === playerInsights.characterId);
    openCharacterPicker({title: '选择角色（训练分析）', allowAll: true, allLabel: '全部角色',
        currentValue: char?.name || '', currentId: char?.id,
        onSelect: item => changeInsightCharacter(item?.id || 0)});
}

// Choose only a real, loaded ranked loss; avoid immediately drawing the same replay.
function pickInsightLoss(records, characterId, previousId, random = Math.random) {
    const losses = analyzePlayerRecords(records, characterId).rows.filter(r => r.replay_id && insightOutcome(r) === 'lose');
    const candidates = losses.length > 1 ? losses.filter(r => r.replay_id !== previousId) : losses;
    return candidates.length ? candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))] : null;
}

function drawInsightLoss() {
    if (!playerInsights.open) return;
    playerInsights.drawReplayId = pickInsightLoss(playerInsights.snapshot.matches, playerInsights.characterId, playerInsights.drawReplayId)?.replay_id || null;
    renderPlayerInsights();
}

function queueInsightReplay(replayId) {
    if (!playerInsights.open || !analyzePlayerRecords(playerInsights.snapshot.matches, playerInsights.characterId).rows
        .some(r => r.replay_id === replayId && insightOutcome(r) === 'lose')) return;
    if (!isBattleFavorited(replayId)) toggleBattleFavoriteById(replayId);
    renderPlayerInsights();
}

async function fetchInsightBenchmark() {
    if (!playerInsights.open || playerInsights.loading) return;
    const char = CHARACTER_ROSTER.find(c => c.id === playerInsights.characterId);
    if (!char) return;
    if (!cookie || !isLoggedIn) {
        playerInsights.error = '联网获取参考数据需要先登录；已有缓存仍可离线查看。';
        renderPlayerInsights();
        return;
    }
    const requestId = ++playerInsights.requestId, epoch = accountEpoch;
    const snapshot = playerInsights.snapshot;
    const controller = new AbortController();
    playerInsights.controller = controller;
    playerInsights.loading = true;
    playerInsights.error = '';
    renderPlayerInsights();
    const current = () => playerInsights.open && requestId === playerInsights.requestId && epoch === accountEpoch
        && snapshot === playerInsights.snapshot && char.id === playerInsights.characterId;
    try {
        const data = await apiJson('/api/player-benchmark', {method: 'POST', signal: controller.signal, timeout: 45000,
            body: {character_id: char.id, character_tool: char.tool, exclude_player_id: snapshot.userId, cookie}});
        if (!current()) return;
        playerInsights.benchmark = data;
        saveInsightBenchmark(data);
    } catch (error) {
        if (current()) playerInsights.error = error.name === 'AbortError' ? '参考数据加载超时，请重试' : error.message;
    } finally {
        if (current()) {
            playerInsights.loading = false;
            playerInsights.controller = null;
            renderPlayerInsights();
        }
    }
}

function inspectInsightMatchup(opponent) {
    const char = CHARACTER_ROSTER.find(c => c.id === playerInsights.characterId);
    const record = char ? playerInsights.snapshot.matches.find(r => insightCharacter(r)?.id === char.id) : null;
    const todayOnly = playerInsights.snapshot.periodKey === 'today';
    closePlayerInsights();
    selectedCharacter = record?.my_character || '';
    selectedOpponentCharacter = opponent;
    currentViewMode = 'battles';
    if (isHistoryMode) currentBattleType = 'rank';
    resultFilter = reviewFilter = 'all';
    dateFrom = dateTo = '';
    if (todayOnly) {
        const now = new Date();
        dateFrom = dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    currentPage = 1;
    pendingBattleScroll = 0;
    renderContent();
}

function renderPlayerInsights() {
    if (!playerInsights.open) return;
    const body = document.getElementById('playerInsightsBody');
    if (!body) return;
    const focusedId = document.activeElement?.id;
    const methodOpen = document.getElementById('insightsMethod')?.open;
    const snapshot = playerInsights.snapshot, benchmark = playerInsights.benchmark;
    const a = analyzePlayerRecords(snapshot.matches, playerInsights.characterId);
    const selectedChar = CHARACTER_ROSTER.find(c => c.id === playerInsights.characterId);
    const drawn = a.rows.find(r => r.replay_id === playerInsights.drawReplayId && insightOutcome(r) === 'lose');
    const pct = value => value === null ? '—' : `${value.toFixed(1)}%`;
    const kpi = (title, value, note) => `<div class="report-stat-card"><div class="report-stat-label">${title}</div><div class="report-stat-value">${value}</div><div class="report-stat-sub">${note}</div></div>`;
    const comparisons = insightComparisons(snapshot.profile, benchmark, playerInsights.mode);
    const numberText = (value, gauge) => value === null ? '—' : gauge ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
    const groups = ['风险观察', '防守工具', '进攻工具', '资源分配'];
    const metricRows = comparisons.filter(row => row.group === playerInsights.group).map(row => {
        const max = row.gauge ? 1 : Math.max(row.own || 0, row.reference || 0, 1);
        const bar = (value, cls) => `<span class="insight-compare-track"><i class="${cls}" style="width:${value === null ? 0 : Math.min(100, value / max * 100)}%"></i></span>`;
        return `<div class="insight-compare-row"><span class="insight-metric-name">${row.label}</span><div class="insight-compare-bars" aria-hidden="true">${bar(row.own, 'insight-own')}${bar(row.reference, 'insight-reference')}</div><span class="insight-own-value">${numberText(row.own, row.gauge)}</span><span>${numberText(row.reference, row.gauge)}</span><span class="insight-delta" title="本人减参照；${row.n}份有效参考，不代表提升空间">${row.delta === null ? '—' : `${row.delta >= 0 ? '+' : ''}${(row.delta * (row.gauge ? 100 : 1)).toFixed(row.gauge ? 1 : 2)}${row.gauge ? 'pp' : ''}`}</span></div>`;
    }).join('');
    const priorities = a.priorities.slice(0, 2).map(row => `<div class="insight-priority"><div><strong>对 ${escapeHtml(row.name)}</strong><span>${row.n} 场 · ${row.losses} 负</span></div><div><b>${pct(row.rate)}</b><button class="report-more-btn" onclick="inspectInsightMatchup(${inlineJsString(row.name)})">复盘对局 →</button><button class="report-more-btn" onclick="openMatchupNotesFor(${inlineJsString(row.name)})">对策笔记</button></div></div>`).join('');
    const risk = comparisons.find(row => row.group === '风险观察' && row.delta !== null && row.delta >= .2);
    const opponentRows = a.opponents.map(row => `<tr><td>${escapeHtml(row.name)} <button class="report-more-btn" onclick="openMatchupNotesFor(${inlineJsString(row.name)})" title="打开该对手的对策笔记">笔记</button></td><td>${row.n}</td><td>${row.wins} / ${row.losses}</td><td><div class="insight-winrate"><span class="report-bar-track"><i class="report-bar-fill" style="width:${row.rate ?? 0}%"></i></span><b>${pct(row.rate)}</b></div></td><td title="95% Wilson 抽样参考区间">${row.n ? `${row.low.toFixed(0)}–${row.high.toFixed(0)}%` : '—'}</td><td>${row.n < 10 ? '<span class="insight-muted">样本少</span>' : row.rate < 50 ? '<span class="insight-tag-warn">优先练习</span>' : '—'}</td></tr>`).join('');
    const pressure = [
        {label: '逆风翻盘', title: '先丢首回合后的整场胜率', ...a.comeback},
        {label: '领先收尾', title: '先赢首回合后的整场胜率', ...a.conversion},
        ...a.difficulty.map((r, i) => ({...r, title: r.label, label: ['挑战高分', '同分对局', '迎战低分'][i]}))
    ];
    const currentMr = playerInsights.characterId ? Number(a.rows.find(r => Number(r.my_master_rating) > 0)?.my_master_rating) || null : null;
    const sampleRatings = (benchmark?.samples || []).filter(s => playerInsights.mode !== 'leader' || s.user_id === benchmark.leader_id)
        .map(s => s.rating).filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0).sort((x,y) => x-y);
    const refMr = sampleRatings.length ? (sampleRatings[Math.floor((sampleRatings.length - 1) / 2)] + sampleRatings[Math.ceil((sampleRatings.length - 1) / 2)]) / 2 : null;
    body.innerHTML = `
        <div class="report-period-bar insights-toolbar">
            ${!snapshot.profile ? `<span class="insight-player-label">${escapeHtml(snapshot.name)} · ${escapeHtml(snapshot.userId)}</span>` : ''}
            <div class="insights-actions">
                <div class="insight-periods"><button class="report-period-btn ${reportPeriod === 'all' ? 'active' : ''}" onclick="switchReportPeriod('all')">${isHistoryMode ? '全部历史' : '本赛季'}</button><button class="report-period-btn ${reportPeriod === 'today' ? 'active' : ''}" onclick="switchReportPeriod('today')">今天</button></div>
                ${renderCharPickerTrigger({onclick: 'openInsightCharacterPicker()', label: '全部角色', value: selectedChar?.name || '', imgMap: buildCharacterImageMap()})}
            </div>
            ${a.tags.length ? `<div class="insights-tags">${a.tags.map(tag => `<span title="${escapeHtml(tag.reason)}">${escapeHtml(tag.label)}</span>`).join('')}</div>` : ''}
            <span class="report-scope-hint">${a.rows.length} 场排位${snapshot.partial ? ' · 样本未完整' : ''}</span>
        </div>
        <div class="report-summary-grid insight-overview">
            ${kpi('排位胜率', pct(a.overall.rate), `${a.overall.wins} 胜 / ${a.overall.losses} 负`)}
            ${kpi('最近20场', pct(a.recent.rate), a.previous.n === 20 && a.recent.n === 20 ? `较前20场 ${a.recent.rate - a.previous.rate >= 0 ? '+' : ''}${(a.recent.rate - a.previous.rate).toFixed(1)}pp` : `${a.recent.n} 场有效记录`)}
            ${kpi('MR变化', a.scoreChange === null ? '—' : `${a.scoreChange > 0 ? '+' : ''}${a.scoreChange}`, playerInsights.characterId ? '首末赛前值差' : '选择单一角色查看')}
            ${kpi('回合胜率', pct(a.roundRate), `${a.roundCount} 个有效回合`)}
        </div>
        <div class="insight-main-grid">
            <section class="report-panel insights-card insight-benchmark">
                <div class="insight-section-heading"><h3>高手参照</h3><button id="insightBenchmarkLoad" class="report-period-btn" onclick="fetchInsightBenchmark()" ${playerInsights.loading || !playerInsights.characterId ? 'disabled' : ''}>${playerInsights.loading ? '加载中…' : benchmark ? '更新参照' : '加载参照'}</button></div>
                <div class="insights-actions insight-reference-controls"><label>同角色榜 <select id="insightReferenceMode" aria-label="高手比较方式" onchange="playerInsights.mode=this.value;renderPlayerInsights()"><option value="median" ${playerInsights.mode === 'median' ? 'selected' : ''}>前3名中位数</option><option value="leader" ${playerInsights.mode === 'leader' ? 'selected' : ''}>榜首</option></select></label><span class="insight-muted">账号近100战综合趋势</span></div>
                <div class="insight-group-tabs" aria-label="对比指标分类">${groups.map((group,i) => `<button id="insightGroup${i}" class="${playerInsights.group === group ? 'active' : ''}" aria-pressed="${playerInsights.group === group}" onclick="playerInsights.group=${inlineJsString(group)};renderPlayerInsights()">${group}</button>`).join('')}</div>
                <div class="insight-compare-head"><span>指标</span><span></span><span class="insight-own-value">本人</span><span class="insight-reference-value">高手</span><span>差值</span></div>
                <div class="insight-comparisons">${metricRows}</div>
                <div class="insight-benchmark-footer"><span>${benchmark ? `有效参考 ${benchmark.samples.length}/${benchmark.requested_samples} · ${escapeHtml(new Date(benchmark.updated_at * 1000).toLocaleDateString('zh-CN'))}` : !playerInsights.characterId ? '选择角色后可加载高手参照' : '点击加载参照 · 不额外采集战绩'}</span><span title="分数差不代表可提升空间">MR 本人 ${currentMr ?? '—'} / 参照 ${refMr ?? '—'}</span></div>
                ${playerInsights.error ? `<div class="insight-error" role="status">${escapeHtml(playerInsights.error)}</div>` : ''}
            </section>
            <div class="insight-side-stack">
                <section class="report-panel insights-card">
                    <div class="insight-section-heading"><h3>优先练习</h3><span class="insight-muted">≥10场 · 胜率&lt;50%</span></div>
                    ${priorities || '<div class="insight-empty">暂无足够样本的短板对局</div>'}
                    ${risk ? `<div class="insight-risk-cue" title="趋势差异需结合录像确认原因">${risk.label}偏高 <span>回看发生场景</span></div>` : ''}
                    ${a.scenarioWins > 0 ? `<div class="insight-target" title="保持样本对手分布，把练习候选的胜率提高至50%的静态演算，不是涨分预测">目标胜率 50% <b>约多赢 ${a.scenarioWins.toFixed(1)} 场</b><small>仅按当前样本演算</small></div>` : ''}
                    <div class="insight-draw"><button class="report-period-btn" onclick="drawInsightLoss()" ${a.rows.some(r => r.replay_id && insightOutcome(r) === 'lose') ? '' : 'disabled'}>${drawn ? '再抽一场' : '抽一场败局'}</button><span class="insight-muted">选一局，专心复盘</span>
                    ${drawn ? `<div class="insight-draw-result" role="status"><span>对 ${escapeHtml(drawn.opponent_character || '未知角色')} · ${escapeHtml(String(drawn.date || '').slice(0,16))}</span><div><button class="report-more-btn" onclick="copyToClipboard(${inlineJsString(drawn.replay_id)},event)" title="复制录像ID">${escapeHtml(drawn.replay_id)}</button><button class="report-more-btn" onclick="queueInsightReplay(${inlineJsString(drawn.replay_id)})" ${isBattleFavorited(drawn.replay_id) ? 'disabled' : ''}>${isBattleFavorited(drawn.replay_id) ? '已在收藏' : '加入待复盘'}</button></div></div>` : ''}</div>
                </section>
                <section class="report-panel insights-card">
                    <h3>局势表现</h3>
                    <div class="insight-pressure">${pressure.map(r => `<div title="${escapeHtml(r.title)}"><span>${r.label}</span><b>${pct(r.rate)}</b><small>${r.n} 场</small></div>`).join('')}</div>
                </section>
            </div>
        </div>
        <section class="report-panel insights-card">
            <div class="insight-section-heading"><h3>对手角色</h3><span class="insight-muted">按败局数排序</span></div>
            <div class="insights-table-wrap insight-matchups"><table class="insights-table"><thead><tr><th>对手</th><th>场数</th><th>胜 / 负</th><th>胜率</th><th title="95% Wilson 抽样参考区间">参考区间 ⓘ</th><th>标记</th></tr></thead><tbody>${opponentRows || '<tr><td colspan="6">暂无排位对局</td></tr>'}</tbody></table></div>
        </section>
        <details class="insight-method" id="insightsMethod" ${methodOpen ? 'open' : ''}><summary>数据口径与参考玩家</summary>
            <p>战绩仅统计已加载排位记录；平局与未知结果不计胜率。MR为同角色首末赛前值差，不含末场结算。高/低分对手以100 MR为界；参考区间为95% Wilson区间。</p>
            <p>行为数据为官网账号近100战综合趋势，并非该角色独立数据。条形按单项缩放，仅比较同一行。资源占比不是成功率，差异不等于技术优劣或MR提升空间。无法确认的字段显示“—”。</p>
            <p>高手来源：全球同角色榜前3名其他玩家，排除本人；每项按有效字段计算。${benchmark ? `样本：${benchmark.samples.map(s => `${escapeHtml(s.player_name)} (${escapeHtml(s.user_id)}) · ${escapeHtml(String(s.rating ?? '—'))} MR`).join('；')}。` : '尚未加载。'}${snapshot.savedAt ? ` 本人资料：${escapeHtml(new Date(snapshot.savedAt).toLocaleString('zh-CN'))}。` : ''}</p>
            <p>对空、连段失误、燃尽与起身防守需要录像确认，不从趋势值反推。</p>
        </details>`;
    if (focusedId) document.getElementById(focusedId)?.focus?.({preventScroll: true});
}
