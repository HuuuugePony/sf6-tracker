// Responsibility module: characters.js. Shared bindings are declared in state.js; loaded with defer.
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
        return `https://www.streetfighter.com/6/buckler/assets/images/material/character/character_${encodeURIComponent(roster.tool)}_l.png`;
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
            ? `<img src="${url}" class="char-tile-img" alt="${escapeHtml(c.name)}" onerror="handleTileImgError(this, ${inlineJsString(c.name)})">`
            : `<span class="char-tile-fallback">${escapeHtml(c.name.charAt(0))}</span>`;
        if (isAvailable) {
            const selectedCls = (opts.currentValue === c.name || (opts.currentId && opts.currentId === c.id)) ? 'selected' : '';
            html += `<div class="char-tile ${selectedCls}" onclick="pickCharacterById(${c.id})" title="${escapeHtml(c.name)}">${inner}</div>`;
        } else {
            html += `<div class="char-tile no-data" title="${escapeHtml(c.name)}（暂无数据）">${inner}</div>`;
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
            ? `<img src="${url}" class="char-picker-trigger-img" alt="" onerror="this.style.display='none'">`
            : '';
        return `<button class="char-picker-trigger has-value" aria-haspopup="dialog" onclick="${opts.onclick}">${imgHtml}<span>${escapeHtml(opts.value)}</span><span class="char-picker-trigger-arrow" aria-hidden="true">▼</span></button>`;
    }
    return `<button class="char-picker-trigger" aria-haspopup="dialog" onclick="${opts.onclick}"><span>${escapeHtml(opts.label)}</span><span class="char-picker-trigger-arrow" aria-hidden="true">▼</span></button>`;
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
