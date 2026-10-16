// Responsibility module: filter-handlers.js. Shared bindings are declared in state.js; loaded with defer.
function filterByCharacter(character) {
    selectedCharacter = character;
    selectedOpponentCharacter = '';  // 切换角色时重置对手筛选
    currentPage = 1;  // 重置页码
    renderContent();
}

function filterByOpponentCharacter(character) {
    selectedOpponentCharacter = character;
    currentPage = 1;  // 重置页码
    renderContent();
}

function getFilteredData() {
    // 在线界面只保留原有的角色与对手角色筛选，不使用已撤回的筛选栏状态。
    let data = matchData;
    if (selectedCharacter) data = data.filter(record => record.my_character === selectedCharacter);
    if (selectedOpponentCharacter) data = data.filter(record => record.opponent_character === selectedOpponentCharacter);
    if (isHistoryMode && currentBattleType !== 'all') data = data.filter(record => recordBattleType(record) === currentBattleType);
    return data;
}
