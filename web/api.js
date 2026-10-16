// Shared transport. Callers still own request identity and account/page checks.
async function apiJson(path, {method = 'GET', body, signal, timeout = 30000} = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, timeout);
    try {
        const response = await fetch(`${window.location.origin}${path}`, {
            method, signal: controller.signal,
            ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
        });
        const data = await response.json();
        if (!response.ok || data.success === false) {
            const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join('；') : data.detail;
            throw new Error(detail || '请求失败，请重试');
        }
        return data;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

// A stream is successful only after its final result; an interrupted prefix is
// useful to display but must never be reported as a complete collection.
async function readCollectionResponse(response, onProgress = () => {}) {
    if (!response.ok || !response.headers?.get('content-type')?.includes('application/x-ndjson')) {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.detail || '获取战绩失败，请重试');
        return data;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', result = null;
    const consume = line => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.message || '采集中断，请重试');
        if (event.type === 'complete') {
            if (!event.result?.success) throw new Error('采集未完成，请重试');
            result = event.result;
        } else if (event.type === 'progress' && !result) onProgress(event);
    };
    try {
        while (true) {
            const {done, value} = await reader.read();
            buffer += decoder.decode(value, {stream: !done});
            let end;
            while ((end = buffer.indexOf('\n')) >= 0) {
                consume(buffer.slice(0, end));
                buffer = buffer.slice(end + 1);
            }
            if (done) break;
        }
        if (buffer.trim()) consume(buffer);
        if (!result) throw new Error('连接中断，数据尚未完整获取，请重试');
        return result;
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
