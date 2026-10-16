// Pure serializers plus a browser/desktop download adapter.
const EXPORT_FIELDS = ['date', 'replay_id', 'player_name', 'my_user_id', 'my_character', 'my_result',
    'my_lp', 'my_master_rating', 'opponent_name', 'opponent_user_id', 'opponent_character',
    'opponent_lp', 'opponent_master_rating', 'battle_type', 'review_status'];

function serializeBattleExport(records, format) {
    const safeRecords = records.map(record => Object.fromEntries(EXPORT_FIELDS.map(key => [key, record[key] ?? ''])));
    if (format === 'json') return JSON.stringify({format_version: 1, exported_at: new Date().toISOString(), records: safeRecords}, null, 2);
    if (format !== 'csv') throw new Error('不支持的导出格式');
    const cell = value => {
        let text = String(value ?? '');
        // Names are data, not executable spreadsheet formulas.
        if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [EXPORT_FIELDS.map(cell).join(','), ...safeRecords.map(row => EXPORT_FIELDS.map(key => cell(row[key])).join(','))].join('\r\n');
}

async function saveBattleExport(filename, content, format) {
    if (window.pywebview?.api?.save_export) return window.pywebview.api.save_export(filename, content);
    const blob = new Blob([content], {type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {saved: true};
}

let exportBusy = false;
async function exportBattleRecords(format) {
    if (exportBusy) return;
    exportBusy = true;
    const epoch = accountEpoch;
    const snapshot = currentBattleFilters();
    const playerId = isHistoryMode ? historyState.playerId : (queriedUserId || currentUserInfo.user_id);
    const status = document.getElementById('exportStatus');
    document.querySelectorAll('[data-export]').forEach(button => button.disabled = true);
    try {
        let rows = [...matchData];
        if (isHistoryMode && historyData.hasMore) {
            let offset = historyData.nextOffset;
            let more = true;
            while (more) {
                if (epoch !== accountEpoch) return;
                if (status) status.textContent = `正在读取历史 ${offset} 条…`;
                const params = new URLSearchParams({player_id: playerId, offset: String(offset), limit: '5000'});
                const data = await apiJson(`/api/history/records?${params}`);
                if (data.has_more && !data.data.length) throw new Error('历史分页异常，请刷新后重试');
                rows.push(...data.data);
                offset += data.data.length;
                more = data.has_more;
            }
        }
        if (epoch !== accountEpoch) return;
        rows = [...new Map(rows.map(record => [record.replay_id, record])).values()];
        rows = filterBattleRecords(rows, snapshot);
        rows = rows.map(record => ({...record, review_status: snapshot.reviews.get(record.replay_id) || 'unmarked'}));
        const result = await saveBattleExport(`sf6-${playerId || 'records'}-${new Date().toISOString().slice(0, 10)}.${format}`,
            serializeBattleExport(rows, format), format);
        if (status) status.textContent = result.cancelled ? '已取消导出' : `已导出 ${rows.length} 条记录`;
    } catch (error) {
        if (status) status.textContent = `导出失败：${error.message}`;
    } finally {
        exportBusy = false;
        document.querySelectorAll('[data-export]').forEach(button => button.disabled = false);
    }
}
