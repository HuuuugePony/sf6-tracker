// Plain-text notes, independent of the signed-in or queried player.
const NOTEBOOK_STORAGE_KEY = 'sf6_matchup_notes_v1';
const NOTEBOOK_TEXT_LIMIT = 200000;
const matchupNotebook = {initialized:false, notes:new Map(), dirty:new Set(), readBlocked:false,
    raw:'', error:'', message:'', ownId:4, opponentId:10};
function notebookKey(ownId,opponentId) { return `${ownId}:${opponentId}`; }
function notebookUrl() { return `/notes?opponent=${matchupNotebook.opponentId}&character=${matchupNotebook.ownId}`; }
function notebookRoleId(value,allowAll=false) { return Number.isInteger(value) && value >= (allowAll ? 0 : 1) && value<=10000; }
function notebookText(value) {
    if (value===undefined) return '';
    if (typeof value!=='string' || value.length>NOTEBOOK_TEXT_LIMIT) throw new Error('笔记格式或长度不符合要求');
    return value;
}
function legacyNotebookContent(raw) {
    // Preserve previously written fields and adopted sources as editable text.
    const parts=[];
    for (const [key,label] of [['situation','遇到的问题'],['answer','我的应对'],['test','验证记录'],['version','游戏版本'],['sourcesText','来源']]) {
        const text=notebookText(raw[key]);if (text) parts.push(`${label}\n${text}`);
    }
    if (raw.references!==undefined && (!Array.isArray(raw.references) || raw.references.length>20)) throw new Error('旧笔记来源格式无效');
    for (const ref of raw.references || []) {
        if (!ref || !ref.source) throw new Error('旧笔记来源格式无效');
        const s=ref.source;
        const text=[ref.title,ref.fact,ref.practice,s.title,s.publisher,s.published,s.checked,s.url].map(notebookText).filter(Boolean).join('\n');
        if (text) parts.push(`原有参考来源\n${text}`);
    }
    return notebookText(parts.join('\n\n'));
}
function cleanNotebookEntry(raw) {
    if (!raw || !notebookRoleId(raw.ownId,true) || !notebookRoleId(raw.opponentId)) throw new Error('角色编号无效');
    return {ownId:raw.ownId,opponentId:raw.opponentId,
        content:raw.content===undefined ? legacyNotebookContent(raw) : notebookText(raw.content),
        updatedAt:typeof raw.updatedAt==='string' && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : ''};
}
function parseNotebook(raw) {
    const data=JSON.parse(raw);
    if (!data || ![1,2].includes(data.version) || !Array.isArray(data.notes) || data.notes.length>1500) throw new Error('不支持的笔记格式');
    const notes=new Map();
    for (const row of data.notes) {
        const entry=cleanNotebookEntry(row),key=notebookKey(entry.ownId,entry.opponentId);
        if (notes.has(key)) throw new Error('备份中存在重复角色组合');notes.set(key,entry);
    }
    return notes;
}
function loadMatchupNotebook() {
    if (matchupNotebook.initialized) return;matchupNotebook.initialized=true;
    try {
        matchupNotebook.raw=localStorage.getItem(NOTEBOOK_STORAGE_KEY) || '';
        matchupNotebook.notes=matchupNotebook.raw ? parseNotebook(matchupNotebook.raw) : new Map();
    } catch {matchupNotebook.readBlocked=true;matchupNotebook.error='原始笔记读取失败，未覆盖数据。请先导出原始备份。';}
}
function currentNotebookEntry() {
    return matchupNotebook.notes.get(notebookKey(matchupNotebook.ownId,matchupNotebook.opponentId))
        || cleanNotebookEntry({ownId:matchupNotebook.ownId,opponentId:matchupNotebook.opponentId});
}
function persistMatchupNotebook() {
    if (matchupNotebook.readBlocked) return false;
    try {
        const raw=localStorage.getItem(NOTEBOOK_STORAGE_KEY),merged=raw ? parseNotebook(raw) : new Map();
        for (const key of matchupNotebook.dirty) merged.set(key,matchupNotebook.notes.get(key));
        localStorage.setItem(NOTEBOOK_STORAGE_KEY,JSON.stringify({version:2,notes:[...merged.values()]}));
        matchupNotebook.notes=merged;matchupNotebook.dirty.clear();matchupNotebook.error='';return true;
    } catch {matchupNotebook.error='尚未保存：本地存储不可用或已满。草稿仍在本页，请导出备份或重试。';return false;}
}
function updateNotebookContent(value) {
    if (matchupNotebook.readBlocked || typeof value!=='string' || value.length>NOTEBOOK_TEXT_LIMIT) return;
    const entry={...currentNotebookEntry(),content:value,updatedAt:new Date().toISOString()},key=notebookKey(entry.ownId,entry.opponentId);
    matchupNotebook.notes.set(key,entry);matchupNotebook.dirty.add(key);matchupNotebook.message='';
    persistMatchupNotebook();refreshNotebookStatus();
}
function refreshNotebookStatus() {
    const entry=currentNotebookEntry(),el=document.getElementById('notebookStatus');
    if (el) el.textContent=[matchupNotebook.error,matchupNotebook.message].filter(Boolean).join(' · ') ||
        (entry.updatedAt ? `已保存 · ${new Date(entry.updatedAt).toLocaleString('zh-CN')}` : '自动保存到本机');
    document.getElementById('notebookRetry')?.classList.toggle('notebook-hidden',!matchupNotebook.dirty.size);
}
function openNotebookRolePicker(own) {
    const id=own ? matchupNotebook.ownId : matchupNotebook.opponentId;
    const hasLegacyCommon=own && [...matchupNotebook.notes.values()].some(n=>n.ownId===0);
    openCharacterPicker({title:own ? '我的角色' : '对手角色',allowAll:hasLegacyCommon,allLabel:'原有通用笔记',
        currentId:id,currentValue:CHARACTER_ROSTER.find(c=>c.id===id)?.name || '',onSelect:item=>{
            if (!item && !hasLegacyCommon) return;
            matchupNotebook[own ? 'ownId' : 'opponentId']=item?.id || 0;
            window.history.replaceState({},'',notebookUrl());renderMatchupNotebook();
        }});
}
function openMatchupNotesFor(opponentName) {
    const record=matchData.find(r=>r.opponent_character===opponentName);
    const opponent=CHARACTER_ROSTER.find(c=>c.id===Number(record?.opponent_character_id))
        || CHARACTER_ROSTER.find(c=>c.name===opponentName || c.tool===opponentName);
    if (!opponent) return;
    matchupNotebook.opponentId=opponent.id;
    matchupNotebook.ownId=playerInsights.characterId || Number(matchData.find(r=>r.my_character_id)?.my_character_id) || 4;
    switchTab('notes');
}
function showMatchupNotesPage(params=new URLSearchParams(window.location.search)) {
    loadMatchupNotebook();
    const opponent=Number(params.get('opponent')),own=Number(params.get('character'));
    if (CHARACTER_ROSTER.some(c=>c.id===opponent)) matchupNotebook.opponentId=opponent;
    if (params.has('character') && (own===0 || CHARACTER_ROSTER.some(c=>c.id===own))) matchupNotebook.ownId=own;
    lastActiveTab='notes';isHistoryMode=isQueryMode=false;hideSettingsPage();
    document.querySelectorAll('.sidebar-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.page==='notes'));
    renderMatchupNotebook();
}
function renderMatchupNotebook() {
    const entry=currentNotebookEntry(),imageMap=buildCharacterImageMap();
    const own=CHARACTER_ROSTER.find(c=>c.id===matchupNotebook.ownId),opponent=CHARACTER_ROSTER.find(c=>c.id===matchupNotebook.opponentId);
    document.getElementById('fixedNavSection').innerHTML=`<div class="nav-panel"><h2>角色对策笔记</h2><div class="nav-panel-body notebook-toolbar">
        <span>我的角色</span>${renderCharPickerTrigger({onclick:'openNotebookRolePicker(true)',label:'原有通用笔记',value:own?.name || '',imgMap:imageMap})}
        <span>→ 对手</span>${renderCharPickerTrigger({onclick:'openNotebookRolePicker(false)',label:'选择对手',value:opponent?.name || '',imgMap:imageMap})}
        <span class="notebook-toolbar-spacer"></span><button class="report-period-btn" onclick="exportMatchupNotebook()">导出</button>
        <button class="report-period-btn" onclick="document.getElementById('notebookImport').click()" title="补充缺少的笔记，不覆盖已有内容" ${matchupNotebook.readBlocked ? 'disabled' : ''}>导入</button>
        <input id="notebookImport" class="notebook-hidden" type="file" accept=".json,application/json" onchange="importMatchupNotebookFile(this)"></div></div>`;
    document.getElementById('battlesScrollArea').innerHTML=`<div class="notebook-page profile-report"><section class="report-panel notebook-editor">
        <label class="notebook-field" for="note-content">${escapeHtml(own?.name || '原有通用笔记')} → ${escapeHtml(opponent?.name || '对手')}</label>
        <textarea class="personal-note-input notebook-textarea" id="note-content" aria-label="对策笔记" maxlength="${NOTEBOOK_TEXT_LIMIT}" rows="16" placeholder="在这里记录你的对策笔记…" oninput="updateNotebookContent(this.value)" ${matchupNotebook.readBlocked ? 'disabled' : ''}>${escapeHtml(entry.content)}</textarea>
        <div class="notebook-save-line"><span id="notebookStatus" role="status"></span><button id="notebookRetry" class="report-more-btn notebook-hidden" onclick="persistMatchupNotebook();refreshNotebookStatus()">重试保存</button></div>
        </section></div>`;
    refreshNotebookStatus();
}
function serializeMatchupNotebook() {
    if (matchupNotebook.readBlocked) {
        if (!matchupNotebook.raw) throw new Error('原始数据不可读取，未生成空备份');
        return JSON.stringify({format:'sf6-matchup-notes-recovery',raw:matchupNotebook.raw},null,2);
    }
    return JSON.stringify({format:'sf6-matchup-notes',version:2,exportedAt:new Date().toISOString(),notes:[...matchupNotebook.notes.values()]},null,2);
}
async function exportMatchupNotebook() {
    try {
        const result=await saveBattleExport(`sf6-matchup-notes-${new Date().toISOString().slice(0,10)}.json`,serializeMatchupNotebook(),'json');
        matchupNotebook.message=result.cancelled ? '已取消导出' : '已导出笔记';
    } catch {matchupNotebook.message='导出失败，请重试';}refreshNotebookStatus();
}
function importMatchupNotebookText(text) {
    if (matchupNotebook.readBlocked) throw new Error('请先保留并修复原始笔记，未覆盖任何数据');
    const incoming=parseNotebook(text),raw=localStorage.getItem(NOTEBOOK_STORAGE_KEY),current=raw ? parseNotebook(raw) : new Map();
    for (const [key,entry] of matchupNotebook.notes) if (!current.has(key) || matchupNotebook.dirty.has(key)) current.set(key,entry);
    matchupNotebook.notes=current;
    let added=0,skipped=0;
    for (const [key,entry] of incoming) {
        if (current.has(key)) {++skipped;continue;}current.set(key,entry);matchupNotebook.dirty.add(key);++added;
    }
    if (added) persistMatchupNotebook();matchupNotebook.message=`已导入 ${added} 条，跳过 ${skipped} 条已有笔记`;return {added,skipped};
}
async function importMatchupNotebookFile(input) {
    const file=input.files?.[0];if (!file) return;
    try {
        if (file.size>32*1024*1024) throw new Error('备份超过32MB');
        importMatchupNotebookText(await file.text());renderMatchupNotebook();
    } catch (error) {matchupNotebook.message=`导入失败：${error.message}`;refreshNotebookStatus();}
    finally {input.value='';}
}
window.addEventListener('beforeunload',event=>{if (matchupNotebook.dirty.size) {event.preventDefault();event.returnValue='';}});
