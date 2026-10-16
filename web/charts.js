// Responsibility module: charts.js. Shared bindings are declared in state.js; loaded with defer.
function switchChartMetric(metric) {
    chartMetric = metric;
    renderContent();  // 重新渲染整个区域（包括图表和战绩）
}

// 切换图表展开/收起状态（使用CSS动画，不重建DOM）
function toggleChart() {
    chartExpanded = !chartExpanded;
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
        if (chartExpanded) {
            chartSection.classList.remove('collapsed');
        } else {
            chartSection.classList.add('collapsed');
        }
    }
}

// 渲染折线图
function renderLineChart() {
    const filteredData = getFilteredData();

    if (filteredData.length === 0) return '';


    // 按时间正序排列（从旧到新）
    const sortedData = [...filteredData].sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateA - dateB;
    });

    // 提取数据点
    const dataPoints = sortedData.map((record, index) => ({
        index: index,
        date: record.date,
        lp: parseInt(record.my_lp) || 0,
        mr: parseInt(record.my_master_rating) || 0,
        result: record.my_result,
        character: record.my_character,
        opponent: record.opponent_character
    }));

    if (dataPoints.length === 0) return '';

    // 先过滤掉MR和LP都小于等于0的异常数据点
    const allValidDataPoints = dataPoints.filter(point => point.lp > 0 || point.mr > 0);

    if (allValidDataPoints.length === 0) return '';

    // 检查是否有有效的MR分数据（至少有一个非零值）
    const hasValidMR = allValidDataPoints.some(point => point.mr > 0);

    // 如果有MR分则使用MR，否则使用LP
    if (!hasValidMR && chartMetric === 'mr') {
        chartMetric = 'lp';
    } else if (hasValidMR && chartMetric !== 'mr' && chartMetric !== 'lp') {
        chartMetric = 'mr';
    }

    // 根据当前选择的指标过滤数据点，避免0值拉伸数据范围
    const validDataPoints = allValidDataPoints.filter(point => point[chartMetric] > 0);

    if (validDataPoints.length === 0) return '';

    // 计算数值范围
    const values = validDataPoints.map(p => p[chartMetric]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    // SVG参数（使用响应式宽度）
    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
    const viewBoxWidth = 800;
    const viewBoxHeight = 250;
    const chartWidth = viewBoxWidth - padding.left - padding.right;
    const chartHeight = viewBoxHeight - padding.top - padding.bottom;

    // 生成SVG路径
    let pathD = '';
    let circles = '';

    validDataPoints.forEach((point, i) => {
        const x = padding.left + (i / (validDataPoints.length - 1 || 1)) * chartWidth;
        const normalizedValue = (point[chartMetric] - minVal) / range;
        const y = padding.top + chartHeight - normalizedValue * chartHeight;

        if (i === 0) {
            pathD += `M ${x} ${y}`;
        } else {
            pathD += ` L ${x} ${y}`;
        }

        // 根据输赢决定颜色（对调：胜-绿色，负-红色）
        const isWin = point.result && (point.result.includes('胜') || point.result.toLowerCase().includes('win'));
        const color = isWin ? '#44ff44' : '#ff4444';

        // 添加节点圆点
        circles += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5"
            class="chart-point"
            data-index="${i}"
            data-lp="${point.lp}"
            data-mr="${point.mr}"
            data-character="${escapeHtml(point.character)}"
            data-opponent="${escapeHtml(point.opponent)}"
            data-result="${escapeHtml(point.result)}"
            data-date="${new Date(point.date).toLocaleString('zh-CN')}" />
        `;
    });

    // Y轴刻度
    const yAxisLines = [];
    for (let i = 0; i <= 4; i++) {
        const value = minVal + (range * i / 4);
        const y = padding.top + chartHeight - (i / 4) * chartHeight;
        yAxisLines.push(`
            <line x1="${padding.left}" y1="${y}" x2="${viewBoxWidth - padding.right}" y2="${y}" stroke="#333333" stroke-width="1" stroke-dasharray="4,4" />
            <text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" fill="#999999" font-size="11">${Math.round(value)}</text>
        `);
    }

    // X轴标签（显示第一个、中间和最后一个日期）
    const xLabels = [];
    if (validDataPoints.length > 0) {
        const firstDate = new Date(validDataPoints[0].date).toLocaleDateString('zh-CN');
        const lastDate = new Date(validDataPoints[validDataPoints.length - 1].date).toLocaleDateString('zh-CN');
        const midIndex = Math.floor(validDataPoints.length / 2);
        const midDate = new Date(validDataPoints[midIndex].date).toLocaleDateString('zh-CN');

        xLabels.push(`<text x="${padding.left}" y="${viewBoxHeight - 10}" text-anchor="start" fill="#999999" font-size="10">${firstDate}</text>`);
        xLabels.push(`<text x="${padding.left + chartWidth / 2}" y="${viewBoxHeight - 10}" text-anchor="middle" fill="#999999" font-size="10">${midDate}</text>`);
        xLabels.push(`<text x="${viewBoxWidth - padding.right}" y="${viewBoxHeight - 10}" text-anchor="end" fill="#999999" font-size="10">${lastDate}</text>`);
    }

    const unitLabel = chartMetric === 'lp' ? 'LP' : 'MR';

    // 计算对局数和胜率
    const totalMatches = sortedData.length;
    const wins = sortedData.filter(record => {
        const result = record.my_result || '';
        return result.includes('胜') || result.toLowerCase().includes('win');
    }).length;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : 0;

    return `
        <div class="chart-section ${chartExpanded ? '' : 'collapsed'}">
            <div class="chart-header">
                <div class="chart-title-section">
                    <div class="chart-title">趋势分析</div>
                    <div class="chart-stats">
                        <div class="chart-stat-item">
                            对局数：<span class="chart-stat-value">${totalMatches}</span>
                        </div>
                        <div class="chart-stat-item">
                            胜率：<span class="chart-stat-value" style="color: ${parseFloat(winRate) >= 50 ? '#4ade80' : '#f87171'}">${winRate}%</span>
                        </div>
                    </div>
                </div>
                <div class="chart-controls">
                    <button class="chart-toggle-btn" onclick="toggleChart()" aria-expanded="${chartExpanded}"><span class="chart-toggle-arrow">▲</span></button>
                    <button class="chart-type-btn ${chartMetric === 'mr' ? 'active' : ''}" onclick="switchChartMetric('mr')">M阶分 (MR)</button>
                    <button class="chart-type-btn ${chartMetric === 'lp' ? 'active' : ''}" onclick="switchChartMetric('lp')">积分 (LP)</button>
                </div>
            </div>
            <div class="chart-container-wrapper">
            <div class="chart-container">
                <svg class="chart-svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet">
                    <!-- Y轴网格线和刻度 -->
                    ${yAxisLines.join('')}

                    <!-- X轴标签 -->
                    ${xLabels.join('')}

                    <!-- Y轴标题 -->
                    <text x="15" y="${viewBoxHeight / 2}" transform="rotate(-90 15 ${viewBoxHeight / 2})" text-anchor="middle" fill="#999999" font-size="11">${unitLabel}</text>

                    <!-- 折线路径 -->
                    <path d="${pathD}" fill="none" stroke="#666666" stroke-width="2" />

                    <!-- 数据点 -->
                    ${circles}
                </svg>
                <div class="chart-tooltip" id="chartTooltip"></div>
            </div>
            </div>
        </div>
    `;
}

// 初始化图表提示框
function initChartTooltip() {
    const tooltip = document.getElementById('chartTooltip');
    const points = document.querySelectorAll('.chart-point');

    if (!tooltip) return;

    points.forEach(point => {
        point.addEventListener('mouseenter', (e) => {
            // 放大圆点（用r属性而非CSS transform，避免命中区域突变导致抽搐）
            point.setAttribute('r', '6');
            point.classList.add('active');

            const lp = e.target.getAttribute('data-lp');
            const mr = e.target.getAttribute('data-mr');
            const character = e.target.getAttribute('data-character');
            const opponent = e.target.getAttribute('data-opponent');
            const result = e.target.getAttribute('data-result');
            const date = e.target.getAttribute('data-date');

            tooltip.innerHTML = `
                <div class="tooltip-row">
                    <span class="tooltip-label">时间：</span>
                    <span class="tooltip-value">${escapeHtml(date)}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">对位：</span>
                    <span class="tooltip-value">${escapeHtml(character)} vs ${escapeHtml(opponent)}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">结果：</span>
                    <span class="tooltip-value" style="color: ${result && (result.includes('胜') || result.toLowerCase().includes('win')) ? '#44ff44' : '#ff4444'}">${escapeHtml(result)}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">LP：</span>
                    <span class="tooltip-value">${escapeHtml(lp)}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">MR：</span>
                    <span class="tooltip-value">${escapeHtml(mr)}</span>
                </div>
            `;
            tooltip.classList.add('show');
        });

        point.addEventListener('mousemove', (e) => {
            const container = point.closest('.chart-container');
            const rect = container.getBoundingClientRect();
            const tooltipEl = document.getElementById('chartTooltip');

            // 初始位置：鼠标右上方
            let x = e.clientX - rect.left + 15;
            let y = e.clientY - rect.top - 10;

            // 获取tooltip的尺寸
            const tooltipWidth = tooltipEl.offsetWidth || 200; // 估算宽度
            const tooltipHeight = tooltipEl.offsetHeight || 150; // 估算高度

            // 容器边界
            const containerWidth = rect.width;
            const containerHeight = rect.height;

            // 检查右边界，如果超出则显示在左侧
            if (x + tooltipWidth > containerWidth) {
                x = e.clientX - rect.left - tooltipWidth - 15;
            }

            // 检查上边界，如果超出则显示在下方
            if (y < 0) {
                y = e.clientY - rect.top + 20;
            }

            // 检查下边界，如果超出则向上调整
            if (y + tooltipHeight > containerHeight) {
                y = containerHeight - tooltipHeight - 10;
            }

            // 确保不会超出左边界
            if (x < 0) {
                x = 10;
            }

            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        point.addEventListener('mouseleave', () => {
            // 恢复圆点大小
            point.setAttribute('r', '4');
            point.classList.remove('active');
            tooltip.classList.remove('show');
        });
    });
}
