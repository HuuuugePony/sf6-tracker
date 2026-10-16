"""Local archive routes, independent of official API authentication."""
import threading
from fastapi import APIRouter, HTTPException, Query
from .history_store import HistoryStore, data_directory

router = APIRouter(prefix='/api/history', tags=['local history'])
_store = None
_lock = threading.Lock()


def get_store():
    global _store
    with _lock:
        if _store is None:
            _store = HistoryStore(data_directory() / 'history.sqlite3')
    return _store


def archive_result(player, records, profile=None):
    try:
        return get_store().save(player, records, profile)
    except Exception:
        return {'saved': False, 'warning': '本地历史保存失败；官网查询结果仍可查看，请检查磁盘空间及目录权限'}


@router.get('/players')
def players():
    try:
        return {'success': True, 'players': get_store().players()}
    except Exception:
        raise HTTPException(503, '本地玩家列表暂时无法读取')


@router.get('/records')
def records(player_id: str = Query(pattern=r'^[0-9]{1,20}$'),
            offset: int = Query(default=0, ge=0), limit: int = Query(default=2000, ge=1, le=5000)):
    try:
        return {'success': True, **get_store().records(player_id, offset, limit)}
    except Exception:
        raise HTTPException(503, '本地历史暂时无法读取')
