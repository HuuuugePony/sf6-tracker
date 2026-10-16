"""Browser login lifecycle. No cookies or credentials are persisted here."""
from contextlib import contextmanager
from dataclasses import dataclass
import threading
import time
import uuid


class SessionUnavailable(Exception):
    pass


@dataclass
class LoginSession:
    created_at: float
    generation: int
    driver: object = None
    busy: bool = False
    cancelled: bool = False


class LoginSessions:
    def __init__(self, ttl=600, clock=time.monotonic):
        self.ttl = ttl
        self.clock = clock
        self.sessions = {}
        self.cancelled_ids = {}
        self.lock = threading.RLock()

    @staticmethod
    def _close(driver):
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    def reserve(self, generation, session_id=None):
        self.expire()
        session_id = session_id or str(uuid.uuid4())
        with self.lock:
            if session_id in self.cancelled_ids:
                raise SessionUnavailable('登录流程已取消，请重新开始')
            if self.sessions:
                raise SessionUnavailable('已有登录流程，请先完成或取消')
            self.sessions[session_id] = LoginSession(self.clock(), generation)
        return session_id

    def attach(self, session_id, driver):
        with self.lock:
            session = self.sessions.get(session_id)
            valid = session and not session.cancelled and self.clock() - session.created_at < self.ttl
            if valid:
                session.driver = driver
        if not valid:
            self._close(driver)
            raise SessionUnavailable('登录流程已取消或过期')

    @contextmanager
    def claim(self, session_id):
        self.expire()
        with self.lock:
            session = self.sessions.get(session_id)
            if not session or session.cancelled:
                raise SessionUnavailable('登录流程已取消或过期，请重新开始')
            if session.driver is None or session.busy:
                raise SessionUnavailable('登录流程正在处理中，请稍候')
            session.busy = True
        try:
            yield session
        finally:
            with self.lock:
                session.busy = False
                close = session.cancelled or self.clock() - session.created_at >= self.ttl
                if close and self.sessions.get(session_id) is session:
                    self.sessions.pop(session_id)
            if close:
                self._close(session.driver)

    def complete(self, session_id, commit):
        with self.lock:
            session = self.sessions.get(session_id)
            if not session or session.cancelled or self.clock() - session.created_at >= self.ttl:
                raise SessionUnavailable('登录流程已取消或过期')
            commit(session.generation)
            # claim() closes the browser after its current operation finishes.
            session.cancelled = True

    def cancel(self, session_id):
        with self.lock:
            self.cancelled_ids[session_id] = self.clock()
            session = self.sessions.get(session_id)
            if not session:
                return
            session.cancelled = True
            close = not session.busy
            if close:
                self.sessions.pop(session_id)
        if close:
            self._close(session.driver)

    def expire(self):
        with self.lock:
            self.cancelled_ids = {sid: at for sid, at in self.cancelled_ids.items()
                                  if self.clock() - at < self.ttl}
            expired = [sid for sid, session in self.sessions.items()
                       if self.clock() - session.created_at >= self.ttl]
        for sid in expired:
            self.cancel(sid)

    def close_all(self):
        with self.lock:
            ids = list(self.sessions)
        for sid in ids:
            self.cancel(sid)
