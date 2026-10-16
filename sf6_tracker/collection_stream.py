"""Stream collection progress without sharing a crawler or credentials."""
from contextvars import ContextVar
import json
from queue import Empty, Queue
import threading

from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse


collection_progress = ContextVar('collection_progress', default=None)
collection_cancelled = ContextVar('collection_cancelled', default=None)


def stream_collection(collect):
    events = Queue()
    closed = threading.Event()

    def publish(event):
        if not closed.is_set():
            events.put(event)

    def worker():
        token = collection_progress.set(publish)
        cancel_token = collection_cancelled.set(closed)
        try:
            publish({'type': 'complete', 'result': collect()})
        except Exception as error:
            publish({'type': 'error', 'message': getattr(error, 'detail', None) or str(error)})
        finally:
            collection_progress.reset(token)
            collection_cancelled.reset(cancel_token)
            events.put(None)

    def body():
        threading.Thread(target=worker, name='collection-stream', daemon=True).start()
        try:
            while True:
                try:
                    event = events.get(timeout=1)
                except Empty:
                    yield b'\n'  # Keep the connection open while upstream retries.
                    continue
                if event is None:
                    break
                yield (json.dumps(jsonable_encoder(event), ensure_ascii=False, allow_nan=False) + '\n').encode('utf-8')
        finally:
            closed.set()

    return StreamingResponse(body(), media_type='application/x-ndjson',
        headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
