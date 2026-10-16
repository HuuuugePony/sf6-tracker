// Responsibility module: utils.js. Shared bindings are declared in state.js; loaded with defer.
function loadingHtml(text) {
    return `<div role="status" aria-live="polite" aria-busy="true" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding-bottom:12%">
        <div class="spinner" style="margin-bottom:0"></div>
        <div class="empty-state-text" style="color:#999">${escapeHtml(text)}</div></div>`;
}

function emptyStateHtml(icon, text) {
    return `<div class="empty-state"><div class="empty-state-icon">${escapeHtml(icon)}</div><div class="empty-state-text">${escapeHtml(text)}</div></div>`;
}

function requestProgressText(label, completed = 0, total = 1) {
    return `${completed > 0 ? '正在加载' : '正在连接'} · ${completed}/${total ?? '?'}，${label}…`;
}

function copyToClipboard(text, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!text) {
        return false;
    }

    // 使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyFeedback(event);
        }).catch(err => {
            console.error('Clipboard API 复制失败:', err);
            fallbackCopyToClipboard(text, event);
        });
    } else {
        // 降级方案：使用传统方法
        fallbackCopyToClipboard(text, event);
    }

    // 对于 oncontextmenu 事件，必须返回 false 来阻止默认菜单
    return false;
}

function fallbackCopyToClipboard(text, event) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
        showCopyFeedback(event);
    } catch (err) {
        console.error('复制失败:', err);
    }

    document.body.removeChild(textArea);
}

function showCopyFeedback(event) {
    if (!event || !event.target) return;

    // 创建临时提示元素
    const feedback = document.createElement('div');
    feedback.textContent = '✓ 已复制';
    feedback.style.position = 'absolute';
    feedback.style.background = 'rgba(39, 174, 96, 0.9)';
    feedback.style.color = 'white';
    feedback.style.padding = '4px 8px';
    feedback.style.borderRadius = '2px';
    feedback.style.fontSize = '11px';
    feedback.style.fontWeight = '600';
    feedback.style.zIndex = '1000';
    feedback.style.pointerEvents = 'none';
    feedback.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';

    // 获取目标元素的位置（确保不超出视口）
    const rect = event.target.getBoundingClientRect();
    let feedbackLeft = rect.left + rect.width / 2 - 30;
    let feedbackTop = rect.top - 30;
    // 防止超出右边界
    if (feedbackLeft + 60 > window.innerWidth) {
        feedbackLeft = window.innerWidth - 70;
    }
    // 防止超出左边界
    if (feedbackLeft < 5) {
        feedbackLeft = 5;
    }
    // 防止超出上边界，改为显示在下方
    if (feedbackTop < 5) {
        feedbackTop = rect.bottom + 5;
    }
    feedback.style.left = feedbackLeft + 'px';
    feedback.style.top = feedbackTop + 'px';

    document.body.appendChild(feedback);

    // 动画效果
    feedback.animate([
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-10px)' }
    ], {
        duration: 1500,
        easing: 'ease-out'
    }).onfinish = () => {
        feedback.remove();
    };
}

function handleImageError(imgElement, characterName) {
    imgElement.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.className = 'character-placeholder';
    placeholder.textContent = characterName || '?';
    imgElement.parentElement.insertBefore(placeholder, imgElement);
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;  // 目标容器不存在时静默跳过，避免空指针报错
    element.className = `status ${type}`;
    element.textContent = message;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 小于1分钟
    if (diff < 60000) {
        return '刚刚';
    }
    // 小于1小时
    if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`;
    }
    // 小于1天
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    }
    // 小于7天
    if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
    }

    // 超过7天显示具体日期
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ==================== 对战数据通用工具 ====================

function escapeHtml(text) {
    const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
    return String(text ?? '').replace(/[&<>"']/g, char => entities[char]);
}

// 内联事件参数需要先编码 JS 字符串，再编码 HTML 属性。
function inlineJsString(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
}

// ==================== 后端脏数据清洗 ====================
// 后端在个别边界情况下可能把 Python 的 None 转成字面量字符串（如 "None"、"M阶None"、"None积分"），
// 渲染前统一清洗，避免界面显示 "None"、用 "None" 作为图片URL/玩家ID
const DIRTY_NONE_VALUES = new Set(['None', 'null', 'NaN', 'undefined']);

function cleanNoneStr(v) {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (DIRTY_NONE_VALUES.has(t)) return '';
    // 段位显示字段的脏值（如 "M阶None"、"None积分"）直接降级为 "-"
    if (t === 'M阶None' || t === 'None积分') return '-';
    return v;
}

function sanitizeRecord(r) {
    if (!r || typeof r !== 'object') return r;
    for (const k of Object.keys(r)) {
        if (typeof r[k] === 'string') r[k] = cleanNoneStr(r[k]);
    }
    return r;
}

function sanitizeRecords(list) {
    return Array.isArray(list) ? list.map(sanitizeRecord) : [];
}

function isWinRecord(record) {
    const r = record.my_result || '';
    return r.includes('胜') || r.toLowerCase().includes('win');
}

function parseRecordDate(record) {
    const d = new Date(record.date);
    return isNaN(d.getTime()) ? null : d;
}

// 计算当前连胜/连败与历史最佳连胜（输入为时间倒序，最新在前）
function computeStreakStats(recordsDesc) {
    let curType = null, curLen = 0;
    if (recordsDesc.length > 0) {
        curType = isWinRecord(recordsDesc[0]) ? 'win' : 'lose';
        for (const r of recordsDesc) {
            const t = isWinRecord(r) ? 'win' : 'lose';
            if (t === curType) curLen++; else break;
        }
    }
    let best = 0, run = 0;
    for (let i = recordsDesc.length - 1; i >= 0; i--) {
        if (isWinRecord(recordsDesc[i])) { run++; best = Math.max(best, run); } else run = 0;
    }
    return { curType, curLen, bestWinStreak: best };
}
