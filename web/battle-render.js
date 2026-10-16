// Responsibility module: battle-render.js. Shared bindings are declared in state.js; loaded with defer.
function renderContent() {
    const fixedNavSection = document.getElementById('fixedNavSection');
    const battlesScrollArea = document.getElementById('battlesScrollArea');
    const previousScroll = pendingBattleScroll ?? battlesScrollArea.scrollTop ?? 0;
    const viewData = isHistoryMode ? historyData : isQueryMode ? queryData : homeData;
    const battleLoading = isHistoryMode ? historyState.loading : Boolean(viewData.loading);

    if (!isLoggedIn && !isQueryMode && !isHistoryMode) {
        fixedNavSection.innerHTML = emptyStateHtml('🔒', '请先登录后查看战绩');
        battlesScrollArea.innerHTML = '';
        return;
    }

    // 渲染固定区域（玩家资料 + 导航栏）- 始终显示
    let fixedHtml = isHistoryMode ? renderHistoryControls() : '';

    // 所有战绩标签共享玩家资料及滚轮收起/展开行为。
    if (playerProfile) {
        fixedHtml += renderPlayerProfile();
    }

    // 渲染二级导航栏（包含角色筛选）
    fixedHtml += `
        <div class="sub-nav">
            <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'all' ? 'active' : ''}" data-mode="battles" data-type="all" onclick="switchViewMode('battles'); switchBattleType('all')">全部</div>
            <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'rank' ? 'active' : ''}" data-mode="battles" data-type="rank" onclick="switchViewMode('battles'); switchBattleType('rank')">排位赛</div>
            <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'casual' ? 'active' : ''}" data-mode="battles" data-type="casual" onclick="switchViewMode('battles'); switchBattleType('casual')">休闲赛</div>
            <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'custom' ? 'active' : ''}" data-mode="battles" data-type="custom" onclick="switchViewMode('battles'); switchBattleType('custom')">比赛间对战</div>
            <div class="sub-nav-item ${currentViewMode === 'battles' && currentBattleType === 'hub' ? 'active' : ''}" data-mode="battles" data-type="hub" onclick="switchViewMode('battles'); switchBattleType('hub')">格斗中心对战</div>
            <div class="sub-nav-item ${currentViewMode === 'rival_winrate' ? 'active' : ''}" data-mode="rival_winrate" onclick="switchViewMode('rival_winrate')">角色对阵</div>
            <div class="sub-nav-item ${currentViewMode === 'insights' ? 'active' : ''}" data-mode="insights" onclick="openPlayerInsights()">训练分析</div>
            <div class="character-filter">
                ${currentViewMode === 'rival_winrate' ? `
                    ${(() => {
                        const rivalCharName = selectedRivalCharId ? getCharacterNameById(selectedRivalCharId) : '';
                        return renderCharPickerTrigger({ onclick: 'openRivalCharacterPicker()', label: '选择角色', value: rivalCharName, imgMap: buildCharacterImageMap() });
                    })()}
                ` : (currentViewMode === 'battles' ? `
                    ${(() => {
                        const imgMap = buildCharacterImageMap();
                        return renderCharPickerTrigger({ onclick: 'openMyCharacterPicker()', label: '全部角色', value: getCharacterDisplayName(selectedCharacter), imgMap: imgMap })
                            + renderCharPickerTrigger({ onclick: 'openOpponentCharacterPicker()', label: '全部对手', value: getCharacterDisplayName(selectedOpponentCharacter), imgMap: imgMap });
                    })()}
                ` : '')}
            </div>
        </div>
    `;

    const collection = viewData.collection;
    const notice = isHistoryMode ? historyState.error || historyState.message || (historyState.updating ? '正在联网更新，已有本地记录仍可查看…'
        : battleLoading ? '正在读取本地记录…'
        : !historyData.profile ? '尚未保存该玩家资料，联网查询一次后可在这里查看完整信息。'
        : historyData.hasMore ? `本机已保存 ${historyData.total} 条，当前已加载 ${matchData.length} 条。` : '')
        : viewData.error
        ? viewData.error + (matchData.length ? (collection?.fetched_pages
            ? '；当前记录尚未完整更新，可重试补齐。' : '；当前保留上次获取的记录。') : '')
        : battleLoading ? (collection?.fetched_pages > 0
            ? `正在更新战绩：已读取 ${collection.fetched_pages}/${collection.requested_pages} 页${collection.profile_complete ? '' : '，玩家资料读取中'}；统计随数据更新。`
            : `正在连接 · 0/${collection?.requested_pages || 10}，等待官网响应…`)
        : collection && !collection.complete
            ? `数据不完整：${(collection.failed_pages || []).length} 页获取或解析失败，${collection.failed_records || 0} 条记录解析失败${collection.profile_complete === false ? '，个人资料未完整读取' : ''}；统计仅基于已获取的 ${matchData.length} 条记录。`
            : viewData.history?.warning || '';
    if (notice) {
        fixedHtml += `<div class="battle-data-notice" role="status">${escapeHtml(notice)}
            ${!battleLoading && !historyState.updating && (viewData.error || (isHistoryMode && historyState.error) || (collection && !collection.complete)) ? `<button type="button" onclick="${isHistoryMode && historyState.updateError ? 'updateHistoryData()' : 'refreshData()'}">重试</button>` : ''}</div>`;
    }
    fixedNavSection.innerHTML = fixedHtml;

    // 渲染可滚动区域
    if (currentViewMode === 'insights') {
        preparePlayerInsights();
        battlesScrollArea.innerHTML = '<div class="report-container profile-report player-insights-page" id="playerInsightsBody"></div>';
        renderPlayerInsights();
    } else if (currentViewMode === 'rival_winrate') {
        // 角色对阵胜率模式
        battlesScrollArea.innerHTML = renderRivalWinrateContent();
    } else if (matchData.length === 0) {
        // 数据加载中时继续显示加载动画，避免切走再切回时误显示空状态
        battlesScrollArea.innerHTML = battleLoading
            ? loadingHtml('全力加载中...')
            : emptyStateHtml('📊', isHistoryMode ? '暂无本地记录。联网登录并查询后，将自动保存战绩。' : '暂无对战记录');
    } else {
        // 渲染折线图和战绩列表
        let scrollableHtml = renderLineChart();
        scrollableHtml += renderMatchCardsHTML();
        battlesScrollArea.innerHTML = scrollableHtml;

        // 添加图表节点的事件监听
        setTimeout(() => {
            initChartTooltip();
        }, 100);
    }
    if (isHistoryMode && historyData.hasMore) {
        battlesScrollArea.innerHTML += `<div class="load-more-history"><span>已加载 ${matchData.length} / ${historyData.total} 条，筛选与图表暂基于已加载记录；导出会读取全部历史。</span><button onclick="loadHistoryRecords(true)" ${battleLoading ? 'disabled' : ''}>继续加载历史</button></div>`;
    }

    // 绑定滚动联动（向下滚收起玩家信息，到顶继续上滚展开）
    initProfileScrollToggle();
    battlesScrollArea.scrollTop = previousScroll;
    pendingBattleScroll = viewData.loaded ? null : previousScroll;
}

function renderPlayerProfile() {
    if (!playerProfile) return '';

    // 获取当前显示的玩家信息
    const displayInfo = isHistoryMode ? historyData.userInfo : isQueryMode ? queryData.userInfo : currentUserInfo;
    const displayPlayerName = (isHistoryMode ? displayInfo.player_name : playerProfile.player_name) || displayInfo.player_name || '未知玩家';
    const displayPlayerId = isHistoryMode ? historyState.playerId : queriedUserId || currentUserInfo.user_id || '-';

    // 检查是否已收藏
    const isFavorited = favoritePlayers.some(p => p.userId === displayPlayerId);
    const favButtonText = isFavorited ? '★' : '☆';
    const favButtonTitle = isFavorited ? '取消收藏' : '加入收藏';

    // 在线状态样式
    const onlineStatus = isHistoryMode ? '' : playerProfile.online_status_name || '';
    let statusClass = 'status-offline';

    // 只要有状态文本且不是离线，就显示为活跃状态
    if (onlineStatus && onlineStatus.trim() !== '') {
        // 只有明确包含"离线"或"オフライン"才是离线状态
        if (!onlineStatus.includes('离线') && !onlineStatus.includes('オフライン')) {
            statusClass = 'status-online';
        }
    }

    const statusBadge = onlineStatus ? `<span class="online-status-badge ${statusClass}">${escapeHtml(onlineStatus)}</span>` : '';

    // 战斗统计详细数据
    const detail = playerProfile.battle_stats_detail || {};
    const fmtPct = (v) => v ? (v * 100).toFixed(2) + '%' : '0.00%';
    const fmtCount = (v) => v ? v.toFixed(1) + '次' : '0.0次';
    const fmtTime = (v) => v ? v.toFixed(1) + '秒' : '0.0秒';
    const fmtInt = (v) => v ? v.toString() : '0';

    return `
        <div class="player-profile-section ${profileCollapsed ? 'collapsed' : ''}">
            <div class="profile-header">
                <div class="profile-title">玩家信息</div>
                <div class="profile-player-info">
                    ${statusBadge}
                    <span class="profile-player-name" oncontextmenu="return copyToClipboard(${inlineJsString(displayPlayerName)}, event)" title="右键复制名称">${escapeHtml(displayPlayerName)}</span>
                    <span class="profile-player-id" oncontextmenu="return copyToClipboard(${inlineJsString(displayPlayerId)}, event)" title="右键复制ID">(${escapeHtml(displayPlayerId)})</span>
                    ${(isHistoryMode && historyState.playerId) || (isQueryMode && queriedUserId) ? `
                        <button class="btn-toggle-favorite" onclick="toggleFavorite(${inlineJsString(displayPlayerId)}, ${inlineJsString(displayPlayerName)})" title="${favButtonTitle}">${favButtonText}</button>
                    ` : ''}
                    <button class="profile-collapse-btn" onclick="toggleProfileCollapse()" title="${profileCollapsed ? '展开详情' : '收起详情'}">
                        <span class="profile-collapse-arrow">▲</span>
                    </button>
                </div>
            </div>
            <div class="profile-body-wrapper">
            <div class="profile-stats">
                <div class="stat-item">
                    <div class="stat-label">排位赛</div>
                    <div class="stat-value">${playerProfile.rank_matches || '0'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">休闲赛</div>
                    <div class="stat-value">${playerProfile.casual_matches || '0'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">比赛间对战</div>
                    <div class="stat-value">${playerProfile.custom_matches || '0'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">格斗中心对战</div>
                    <div class="stat-value">${playerProfile.hub_matches || '0'}</div>
                </div>
                <div class="stat-item stat-time">
                    <div class="stat-label">练习时间</div>
                    <div class="stat-value">${playerProfile.practice_time || '-'}</div>
                </div>
                <div class="stat-item stat-time">
                    <div class="stat-label">排位赛时间</div>
                    <div class="stat-value">${playerProfile.rank_time || '-'}</div>
                </div>
                <div class="stat-item stat-time">
                    <div class="stat-label">我的比赛间对战时间</div>
                    <div class="stat-value">${playerProfile.my_custom_time || '-'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">挑战完成次数</div>
                    <div class="stat-value">${fmtInt(playerProfile.challenges_completed)}</div>
                </div>
            </div>
            <div class="profile-report">
                ${matchData && matchData.length ? renderReportContent() : ''}
            </div>

            <div class="profile-detail-toggle" onclick="toggleProfileDetail(this)">
                <span class="arrow">▼</span> 趋势（最近100场战斗）
            </div>
            <div class="profile-detail-panel" id="profileDetailPanel">
                <article class="battle-stats-article">
                    <!-- 斗气槽使用率 -->
                    <div class="battle-stats-block">
                        <h3>斗气槽使用率：过去平均100战</h3>
                        <div class="battle-stats-inner">
                            <div class="battle-stats-left">
                                <ul class="gauge-rate-list">
                                    <li class="li-parry"><span class="rate-name">斗气招架</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_guard)}</span></li>
                                    <li class="li-impact"><span class="rate-name">斗气迸放</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_impact)}</span></li>
                                    <li class="li-arts"><span class="rate-name">斗气爆发技</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_arts)}</span></li>
                                    <li class="li-rush-parry"><span class="rate-name">招架斗气冲锋</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_rush_from_parry)}</span></li>
                                    <li class="li-rush-cancel"><span class="rate-name">取消斗气冲锋</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_rush_from_cancel)}</span></li>
                                    <li class="li-reversal"><span class="rate-name">斗气反攻</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_reversal)}</span></li>
                                    <li class="li-damage"><span class="rate-name">伤害</span><span class="rate-value">${fmtPct(detail.gauge_rate_drive_other)}</span></li>
                                </ul>
                            </div>
                            <div class="battle-stats-right">
                                <dl class="battle-dl">
                                    <dt>斗气反攻：过去平均100战</dt>
                                    <dd><ul>
                                        <li><span class="stat-name">使用次数</span><span class="stat-count">${fmtCount(detail.drive_reversal)}</span></li>
                                    </ul></dd>
                                    <dt>斗气招架：过去平均100战</dt>
                                    <dd><ul>
                                        <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.drive_parry)}</span></li>
                                        <li><span class="stat-name">摔投对手的斗气招架次数</span><span class="stat-count">${fmtCount(detail.throw_drive_parry)}</span></li>
                                        <li><span class="stat-name">斗气招架被摔投次数</span><span class="stat-count">${fmtCount(detail.received_throw_drive_parry)}</span></li>
                                        <li><span class="stat-name">完美招架次数</span><span class="stat-count">${fmtCount(detail.just_parry)}</span></li>
                                    </ul></dd>
                                    <dt>斗气迸放：过去平均100战</dt>
                                    <dd>
                                        <div class="battle-sub-title">[自行使用]</div>
                                        <ul>
                                            <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.drive_impact)}</span></li>
                                            <li><span class="stat-name">确反康成功次数</span><span class="stat-count">${fmtCount(detail.punish_counter)}</span></li>
                                            <li><span class="stat-name">成功对上对手的斗气迸放次数</span><span class="stat-count">${fmtCount(detail.drive_impact_to_drive_impact)}</span></li>
                                        </ul>
                                        <div class="battle-sub-title">[对手使用]</div>
                                        <ul>
                                            <li><span class="stat-name">承受次数</span><span class="stat-count">${fmtCount(detail.received_drive_impact)}</span></li>
                                            <li><span class="stat-name">受到确反康次数</span><span class="stat-count">${fmtCount(detail.received_punish_counter)}</span></li>
                                            <li><span class="stat-name">被对手的斗气迸放对上次数</span><span class="stat-count">${fmtCount(detail.received_drive_impact_to_drive_impact)}</span></li>
                                        </ul>
                                    </dd>
                                </dl>
                            </div>
                        </div>
                    </div>

                    <!-- 超必杀槽使用率 -->
                    <div class="battle-stats-block">
                        <h3>超级必杀槽使用率：过去平均100战</h3>
                        <div class="battle-stats-inner">
                            <div class="battle-stats-left">
                                <ul class="gauge-rate-list">
                                    <li class="li-lv1"><span class="rate-name">Lv1</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv1)}</span></li>
                                    <li class="li-lv2"><span class="rate-name">Lv2</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv2)}</span></li>
                                    <li class="li-lv3"><span class="rate-name">Lv3</span><span class="rate-value">${fmtPct(detail.gauge_rate_sa_lv3)}</span></li>
                                    <li class="li-ca"><span class="rate-name">终极必杀技</span><span class="rate-value">${fmtPct(detail.gauge_rate_ca)}</span></li>
                                </ul>
                            </div>
                            <div class="battle-stats-right">
                                <dl class="battle-dl">
                                    <dt>眩晕：过去平均100战</dt>
                                    <dd><ul>
                                        <li><span class="stat-name">让对手眩晕次数</span><span class="stat-count">${fmtCount(detail.stun)}</span></li>
                                        <li><span class="stat-name">眩晕次数</span><span class="stat-count">${fmtCount(detail.received_stun)}</span></li>
                                    </ul></dd>
                                    <dt>摔投：过去平均100战</dt>
                                    <dd><ul>
                                        <li><span class="stat-name">成功次数</span><span class="stat-count">${fmtCount(detail.throw_count)}</span></li>
                                        <li><span class="stat-name">承受次数</span><span class="stat-count">${fmtCount(detail.received_throw_count)}</span></li>
                                        <li><span class="stat-name">拆投次数</span><span class="stat-count">${fmtCount(detail.throw_tech)}</span></li>
                                    </ul></dd>
                                    <dt>版边：过去平均100战</dt>
                                    <dd><ul>
                                        <li><span class="stat-name">将对手逼进版边的时间</span><span class="stat-count">${fmtTime(detail.corner_time)}</span></li>
                                        <li><span class="stat-name">被对手逼进版边的时间</span><span class="stat-count">${fmtTime(detail.cornered_time)}</span></li>
                                    </ul></dd>
                                </dl>
                            </div>
                        </div>
                    </div>

                    <!-- 综合统计 -->
                    <div class="battle-stats-block">
                        <div class="battle-stats-inner">
                            <div class="battle-stats-left">
                                <dl class="battle-dl">
                                    <dt>排位赛对战次数</dt>
                                    <dd><ul><li><span class="stat-name">排位赛对战次数</span><span class="stat-count">${fmtInt(playerProfile.rank_matches)}次</span></li></ul></dd>
                                    <dt>休闲赛对战次数</dt>
                                    <dd><ul><li><span class="stat-name">休闲赛对战次数</span><span class="stat-count">${fmtInt(playerProfile.casual_matches)}次</span></li></ul></dd>
                                    <dt>比赛间对战次数（1vs1）</dt>
                                    <dd><ul><li><span class="stat-name">比赛间对战次数</span><span class="stat-count">${fmtInt(playerProfile.custom_matches)}次</span></li></ul></dd>
                                    <dt>格斗中心对战次数</dt>
                                    <dd><ul><li><span class="stat-name">格斗中心对战次数</span><span class="stat-count">${fmtInt(playerProfile.hub_matches)}次</span></li></ul></dd>
                                </dl>
                            </div>
                            <div class="battle-stats-right">
                                <dl class="battle-dl">
                                    <dt>累计格斗点</dt>
                                    <dd><ul><li><span class="stat-name">累计格斗点</span><span class="stat-count">${fmtInt(playerProfile.fighting_points)}点</span></li></ul></dd>
                                    <dt>挑战完成次数</dt>
                                    <dd><ul><li><span class="stat-name">挑战完成次数</span><span class="stat-count">${fmtInt(playerProfile.challenges_completed)}次</span></li></ul></dd>
                                    <dt>其他斗气操作</dt>
                                    <dd><ul><li><span class="stat-name">其他斗气使用率</span><span class="stat-count">${fmtPct(detail.gauge_rate_drive_other)}</span></li></ul></dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                </article>
            </div>
            </div>
        </div>
    `;
}

// 切换详细战斗统计面板展开/收起（JS动态高度动画，不重建DOM）
function toggleProfileDetail(el) {
    el.classList.toggle('expanded');
    const panel = document.getElementById('profileDetailPanel');
    if (!panel) return;

    if (el.classList.contains('expanded')) {
        // 展开：从0动画到实际内容高度
        panel.classList.add('show');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        // 动画完成后移除max-height限制，允许内容自由变化
        const onEnd = (e) => {
            if (e.propertyName !== 'max-height') return;
            if (panel.classList.contains('show')) {
                panel.style.maxHeight = 'none';
            }
            panel.removeEventListener('transitionend', onEnd);
        };
        panel.addEventListener('transitionend', onEnd);
    } else {
        // 收起：先固定当前实际高度，然后动画到0
        panel.style.maxHeight = panel.scrollHeight + 'px';
        panel.offsetHeight; // 强制重排
        panel.classList.remove('show');
        panel.style.maxHeight = '0px';
    }
}

// 设置玩家信息收起/展开状态（带高度动画，不重建DOM；silent时不改变状态直接跳过）
function setProfileCollapsed(collapsed) {
    if (profileCollapsed === collapsed) return;
    profileCollapsed = collapsed;
    const section = document.querySelector('.player-profile-section');
    const wrapper = section?.querySelector('.profile-body-wrapper');
    if (!section || !wrapper) return;

    if (profileCollapsed) {
        // 先固定当前实际高度，然后动画到0
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
        wrapper.offsetHeight; // 强制重排
        section.classList.add('collapsed');
        wrapper.style.maxHeight = '0px';
    } else {
        // 从0动画到实际内容高度
        section.classList.remove('collapsed');
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
        // 动画完成后移除max-height限制，允许内容自由增长
        const onEnd = (e) => {
            if (e.propertyName !== 'max-height') return;
            if (!profileCollapsed) {
                wrapper.style.maxHeight = '';
            }
            wrapper.removeEventListener('transitionend', onEnd);
        };
        wrapper.addEventListener('transitionend', onEnd);
    }

    // 更新按钮 title
    const btn = section.querySelector('.profile-collapse-btn');
    if (btn) {
        btn.title = profileCollapsed ? '展开详情' : '收起详情';
    }
}

// 切换玩家信息收起/展开状态（手动点击按钮）
function toggleProfileCollapse() {
    setProfileCollapsed(!profileCollapsed);
}

// 滚动联动：首次向下滚仅收起玩家信息（吞掉该次滚动，列表不下滑），滚回顶部后继续向上滚自动展开
let _profileScrollLastY = 0;
function initProfileScrollToggle() {
    const area = document.getElementById('battlesScrollArea');
    if (!area || area._profileScrollBound) return;
    area._profileScrollBound = true;
    _profileScrollLastY = area.scrollTop;
    area.addEventListener('wheel', (e) => {
        // The same scroll area also hosts ranking/fighters pages; don't swallow their first wheel event.
        if (!isBattlePageActive()) return;
        // 弹窗打开时不联动
        const modal = document.getElementById('reportListModal');
        if (modal && modal.classList.contains('show')) return;
        if (e.deltaY > 0) {
            if (!profileCollapsed) {
                // 展开状态下首次向下滚：只收起玩家信息，吞掉本次滚动，避免趋势分析被一起滑走
                setProfileCollapsed(true);
                e.preventDefault();
                return;
            }
        } else if (e.deltaY < 0 && area.scrollTop <= 0) {
            // 已到顶部仍向上滚 → 自动展开
            setProfileCollapsed(false);
        }
        _profileScrollLastY = area.scrollTop;
    }, { passive: false });
}

// 切换视图模式
function switchViewMode(mode) {
    if (mode !== 'insights') closePlayerInsights();
    pendingBattleScroll = 0;
    currentViewMode = mode;
    if (mode === 'battles') {
        selectedRivalCharId = null;  // 重置角色选择
    }
    renderContent();
}

// 获取有对阵数据的角色列表（用于下拉框）
function getRivalWinrateCharacters() {
    if (!playerProfile || !playerProfile.character_win_rates_by_rival) return [];

    return playerProfile.character_win_rates_by_rival
        .filter(c => c.rival_character_win_rates && c.rival_character_win_rates.length > 0)
        .map(c => ({
            id: c.character_id,
            name: getCharacterNameById(c.character_id)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// 选择角色用于对阵胜率显示（charId 必须是数字角色ID）
function selectRivalChar(charId) {
    selectedRivalCharId = charId;
    // 整体重渲染：导航栏触发按钮显示选中角色 + 滚动区显示胜率表格
    if (currentViewMode === 'rival_winrate') {
        renderContent();
    }
}

// 渲染角色对阵胜率内容（在可滚动区域）
function renderRivalWinrateContent() {
    if (!playerProfile || !playerProfile.character_win_rates_by_rival || playerProfile.character_win_rates_by_rival.length === 0) {
        return emptyStateHtml('📊', '暂无角色对阵数据，请刷新页面重新获取');
    }

    if (!selectedRivalCharId) {
        return emptyStateHtml('👆', '请在右上角下拉框中选择一个角色');
    }

    // 找到选中角色的数据
    const charData = playerProfile.character_win_rates_by_rival.find(c => c.character_id === selectedRivalCharId);
    if (!charData || !charData.rival_character_win_rates) {
        return emptyStateHtml('❓', '该角色暂无对阵数据');
    }

    // 过滤掉battle_count为0的数据，并按对战次数降序排列
    const rivalStats = charData.rival_character_win_rates
        .filter(r => r.battle_count > 0)
        .sort((a, b) => b.battle_count - a.battle_count);

    if (rivalStats.length === 0) {
        return emptyStateHtml('📭', '该角色暂无有效对战数据');
    }

    const charName = getCharacterNameById(selectedRivalCharId);

    let html = `
        <div style="padding: 20px;">
            <h3 class="rival-detail-title">${escapeHtml(charName)} 对阵各角色胜率（最近赛季）</h3>
            <table class="rival-winrate-table">
                <thead>
                    <tr>
                        <th>对手角色</th>
                        <th>对战次数</th>
                        <th>胜场</th>
                        <th>胜率</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const stat of rivalStats) {
        const winRate = stat.battle_count > 0 ? ((stat.win_count / stat.battle_count) * 100).toFixed(1) : '0.0';
        const winRateClass = parseFloat(winRate) >= 50 ? 'rival-winrate-win' : 'rival-winrate-loss';
        html += `
            <tr>
                <td>${stat.rival_character_name || '未知'}</td>
                <td>${stat.battle_count}</td>
                <td>${stat.win_count}</td>
                <td class="${winRateClass}">${winRate}%</td>
            </tr>
        `;
    }

    html += '</tbody></table></div>';
    return html;
}

// 根据角色ID获取角色名称（优先查动态花名册，支持自动更新的新角色）
function getCharacterNameById(charId) {
    const roster = CHARACTER_ROSTER.find(c => c.id === charId);
    if (roster) return roster.name;
    const charMap = {
        1: '隆', 2: '卢克', 3: '金柏莉', 4: '春丽', 5: '曼侬',
        6: '桑吉尔夫', 7: 'JP', 8: '达尔西姆', 9: '嘉米', 10: '肯',
        11: '迪·杰', 12: '莉莉', 13: '阿鬼', 14: '拉希德', 15: '布兰卡',
        16: '韩蛛俐', 17: '玛丽莎', 18: '古烈', 19: '爱德', 20: '埃德蒙·本田',
        21: '杰米', 22: '豪鬼', 25: '沙加特', 26: '维加', 27: '特瑞',
        28: '舞', 29: '艾琳娜', 30: '深红毒蛇', 31: '阿里克斯', 32: '英格丽德'
    };
    return charMap[charId] || `角色${charId}`;
}

// 渲染查询页面（仅用于显示搜索输入框）

// ==================== 每局结果图标条 ====================

// 将旧版"✓-✗"格式比分字符串转为数值数组（旧缓存数据兜底）
function parseRoundResultsString(str) {
    if (!str || str === '-') return [];
    return str.split('-').map(ch => ch.trim() === '✓' ? 1 : 0);
}

// 渲染每局结果图标（放在VS区域内）：每局一行 [自己图标] 局数 [对手图标（镜像）]
// 原始值语义：0=负，1-8=不同胜法，直接对应官方 icon_result{n} 图标
// 左侧（自己）用 _l 原图，右侧（对手）用 _r 图再经 CSS scaleX(-1) 镜像，
// 保证图标朝向对称且图内文字保持正向（直接用 _l 镜像会把文字翻反）
// 无数据时返回空字符串，调用方回退显示"VS"
function renderRoundScoreHTML(record) {
    const my = Array.isArray(record.my_round_results_raw) && record.my_round_results_raw.length
        ? record.my_round_results_raw : parseRoundResultsString(record.my_round_results);
    const opp = Array.isArray(record.opponent_round_results_raw) && record.opponent_round_results_raw.length
        ? record.opponent_round_results_raw : parseRoundResultsString(record.opponent_round_results);

    if (!my.length && !opp.length) {
        return '';
    }

    const rounds = Math.max(my.length, opp.length);
    const iconUrl = (v, side) => {
        const n = Math.min(Math.max(parseInt(v, 10) || 0, 0), 8);
        return `https://www.streetfighter.com/6/buckler/assets/images/profile/icon_result${n}_${side}.png`;
    };
    let rowsHtml = '';
    for (let i = 0; i < rounds; i++) {
        const mv = typeof my[i] === 'number' ? my[i] : 0;
        const ov = typeof opp[i] === 'number' ? opp[i] : 0;
        rowsHtml += `<div class="round-score-row">
            <img class="round-icon" src="${iconUrl(mv, 'l')}" alt="第${i + 1}局" title="第${i + 1}局" onerror="this.style.visibility='hidden'">
            <span class="round-label">${i + 1}</span>
            <img class="round-icon flip" src="${iconUrl(ov, 'r')}" alt="第${i + 1}局" title="第${i + 1}局" onerror="this.style.visibility='hidden'">
        </div>`;
    }
    return `<div class="round-score" title="每局结果（左：自己，右：对手）">${rowsHtml}</div>`;
}

function renderMatchCardsHTML() {
    // 获取筛选后的数据
    const filteredData = getFilteredData();

    // 计算总页数和当前页数据
    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);

    let html = `
        <div class="toolbar">
            <div class="toolbar-title">共 ${filteredData.length} 条对战记录（第 ${currentPage}/${totalPages} 页）${selectedCharacter ? ' - 角色: ' + getCharacterDisplayName(selectedCharacter) : ''}${selectedOpponentCharacter ? ' - 对手: ' + getCharacterDisplayName(selectedOpponentCharacter) : ''}</div>
            <button class="refresh-btn" onclick="refreshData()" id="refreshBtn">
                <span>刷 新</span>
            </button>
        </div>
    `;

    if (pageData.length === 0) {
        html += emptyStateHtml('📊', '当前筛选没有匹配记录，请调整或重置筛选');
    } else {
        pageData.forEach(record => {
            const resultClass = (record.my_result || '').toLowerCase().includes('胜') || (record.my_result || '').toLowerCase().includes('win') ? 'win' : 'lose';
            const resultText = record.my_result || '-';

            // 构造角色头像URL
            const myCharacterImg = record.my_character_image ? `<img src="${escapeHtml(record.my_character_image)}" alt="${escapeHtml(record.my_character)}" class="character-img">` : '';
            const opponentCharacterImg = record.opponent_character_image ? `<img src="${escapeHtml(record.opponent_character_image)}" alt="${escapeHtml(record.opponent_character)}" class="character-img">` : '';

            html += `
                <div class="match-card">
                    <div class="match-header">
                        <span class="match-date">${escapeHtml(record.date || '未知时间')}</span>
                        <span class="match-result ${resultClass}">${resultText}</span>
                        <div class="match-header-right">
                            ${record.replay_id ? `<span class="replay-id" onclick="copyToClipboard(${inlineJsString(record.replay_id)}, event)" oncontextmenu="return copyToClipboard(${inlineJsString(record.replay_id)}, event)" title="点击复制录像码" style="cursor: pointer;">录像: ${escapeHtml(record.replay_id)}</span>` : ''}
                            <button class="fav-star-btn ${isBattleFavorited(record.replay_id) ? 'active' : ''}" onclick="toggleBattleFavoriteById(${inlineJsString(record.replay_id)})" title="${isBattleFavorited(record.replay_id) ? '取消收藏' : '收藏对局'}">${isBattleFavorited(record.replay_id) ? '★' : '☆'}</button>
                        </div>
                    </div>
                    <div class="match-body">
                        <div class="match-player">
                            <div class="player-avatar">
                                ${myCharacterImg ? `<img src="${escapeHtml(record.my_character_image)}" alt="${escapeHtml(record.my_character)}" class="character-img" onerror="handleImageError(this, ${inlineJsString(record.my_character || "?")})">` : `<div class="character-placeholder">${escapeHtml(record.my_character || '?')}</div>`}
                            </div>
                            <div class="player-info">
                                <div class="player-name-row">
                                    <span class="match-player-name" oncontextmenu="return copyToClipboard(${inlineJsString(record.player_name || '我')}, event)" title="右键复制名称">${escapeHtml(record.player_name || '我')}</span>
                                    ${record.my_short_id ? `<span class="player-id" onclick="queryPlayerById(${inlineJsString(record.my_user_id)}, event)" oncontextmenu="return copyToClipboard(${inlineJsString(record.my_short_id)}, event)" title="左键查询，右键复制ID">(${escapeHtml(record.my_short_id)})</span>` : ''}
                                </div>
                                <div class="player-stats-row">
                                    <span class="detail-item">LP: ${escapeHtml(record.my_lp || '-')}</span>
                                    <span class="detail-item">${escapeHtml(record.my_league_rank || '-')}</span>
                                    <span class="detail-item ${record.my_input_type === '经典' ? 'input-classic' : (record.my_input_type === '现代' ? 'input-modern' : '')}">${escapeHtml(record.my_input_type || '-')}</span>
                                </div>
                            </div>
                        </div>
                        <div class="match-vs">${renderRoundScoreHTML(record) || 'VS'}</div>
                        <div class="match-player">
                            <div class="player-avatar">
                                ${opponentCharacterImg ? `<img src="${escapeHtml(record.opponent_character_image)}" alt="${escapeHtml(record.opponent_character)}" class="character-img" onerror="handleImageError(this, ${inlineJsString(record.opponent_character || "?")})">` : `<div class="character-placeholder">${escapeHtml(record.opponent_character || '?')}</div>`}
                            </div>
                            <div class="player-info">
                                <div class="player-name-row">
                                    <span class="match-player-name" oncontextmenu="return copyToClipboard(${inlineJsString(record.opponent_name || '对手')}, event)" title="右键复制名称">${escapeHtml(record.opponent_name || '对手')}</span>
                                    ${record.opponent_short_id ? `<span class="player-id opponent-id" onclick="queryPlayerById(${inlineJsString(record.opponent_user_id)}, event)" oncontextmenu="return copyToClipboard(${inlineJsString(record.opponent_short_id)}, event)" title="左键查询，右键复制ID">(${escapeHtml(record.opponent_short_id)})</span>` : ''}
                                </div>
                                <div class="player-stats-row">
                                    <span class="detail-item">LP: ${escapeHtml(record.opponent_lp || '-')}</span>
                                    <span class="detail-item">${escapeHtml(record.opponent_league_rank || '-')}</span>
                                    <span class="detail-item ${record.opponent_input_type === '经典' ? 'input-classic' : (record.opponent_input_type === '现代' ? 'input-modern' : '')}">${escapeHtml(record.opponent_input_type || '-')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="match-footer">
                        <span class="side-badge">${record.my_side === 1 ? '1P' : (record.my_side === 2 ? '2P' : record.my_side)}</span>
                        ${record.battle_type ? `<span class="battle-type">${escapeHtml(record.battle_type)}</span>` : ''}
                    </div>
                </div>
            `;
        });

        // 添加分页控件
        html += `
            <div class="pagination">
                <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                <span class="page-info">第 ${currentPage} / ${totalPages} 页</span>
                <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
            </div>
        `;
    }

    return html;
}

function changePage(page) {
    const filteredData = getFilteredData();
    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        return;
    }
    currentPage = page;
    pendingBattleScroll = 0;
    renderContent();
}
