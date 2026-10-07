"""Apple Health import: the export.zip from the Health app on an iPhone (tools/apple_health.py, tools/apple_import.py).

    POST   /api/apple/import?name=export.zip   the file as the raw body (no multipart dependency, as FIT uploads);
                                               stored to a temporary file while it streams in, then read in the
                                               background: answers 202 at once
    GET    /api/apple/import                   {running, progress: {step, done, total} | null, last: summary | null}
    DELETE /api/apple/import                   remove everything the import gave

An export is often hundreds of megabytes and takes a minute or more to read, longer than a request should wait, so
the page polls GET for the progress. One import per user at a time. The temporary file is removed when done.
"""

from __future__ import annotations

import os
import tempfile
import threading
from datetime import datetime
from typing import Callable

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from api.errors import ApiError
from tools import db
from tools.apple_health import NotAnExport
from tools.apple_import import import_file, remove

KEY = "apple_import"  # settings: the last import's summary, or its error
# Years of Watch data zip to a few hundred MB, rarely more than 1-2 GB; one user must not be able to fill the disk.
MAX_BYTES = int(os.environ.get("APPLE_IMPORT_MAX_MB") or 2048) * 1024 * 1024
# Parts of the chunked upload: Cloudflare's free plan refuses request bodies over 100 MB.
CHUNK_BYTES = int(float(os.environ.get("APPLE_CHUNK_MB") or 32) * 1024 * 1024)


class AppleImports:
    """The running imports, per user: progress in memory, the result in the user's settings."""

    def __init__(self, stores=None, on_done: Callable[[], None] | None = None):
        self.stores = stores
        self.on_done = on_done  # e.g. clear the trends cache: its key does not see an import
        self.running: dict[int, dict | None] = {}
        self._guard = threading.Lock()

    def start(self, user_id: int, scope: db.Scope, path: str, name: str) -> bool:
        with self._guard:
            if user_id in self.running:
                return False
            self.running[user_id] = None
        threading.Thread(target=self._run, args=(user_id, scope, path, name), name=f"apple-{user_id}", daemon=True).start()
        return True

    @staticmethod
    def _failed(scope: db.Scope, error: str, detail: str | None = None) -> None:
        """Record the failure for the page; the previous import's numbers stay (that data is still there)."""
        try:
            last = db.get_setting(scope, KEY) or {}
            db.set_setting(scope, KEY, {**last, "status": "failed", "error": error, "detail": (detail or "")[:200],
                                        "failed_at": datetime.now().isoformat(timespec="seconds")})
        except Exception as err:  # noqa: BLE001  the database itself is the problem: the log is all there is
            print(f"apple import: could not record the failure ({type(err).__name__}: {err})", flush=True)

    def _run(self, user_id: int, scope: db.Scope, path: str, name: str) -> None:
        def progress(step: str, done: int | None = None, total: int | None = None) -> None:
            self.running[user_id] = {"step": step, "done": done, "total": total}

        try:
            summary = import_file(scope, path, name, progress)
            db.set_setting(scope, KEY, {"status": "done", "file": name, **summary})
        except NotAnExport as err:
            self._failed(scope, "not_an_export", str(err))
        except Exception as err:  # noqa: BLE001  the thread must not die silently: the page shows the failure
            print(f"apple import {user_id}: MISLUKT ({type(err).__name__}: {err})", flush=True)
            self._failed(scope, "import_failed")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
            if self.stores is not None:
                self.stores.get(user_id).invalidate()
            if self.on_done:
                self.on_done()
            with self._guard:
                self.running.pop(user_id, None)


def make_router(current_user: Callable, imports: AppleImports) -> APIRouter:
    r = APIRouter(prefix="/api/apple")

    def state(u) -> dict:
        last = db.get_setting(u.scope, KEY)
        return {"running": u.id in imports.running, "progress": imports.running.get(u.id), "last": last if isinstance(last, dict) else None}

    @r.get("/import")
    def get_import(u=Depends(current_user)):
        return state(u)

    @r.post("/import")
    async def post_import(request: Request, name: str = Query("export.zip", max_length=200), u=Depends(current_user)):
        if u.id in imports.running:
            raise ApiError(409, "apple_import_running")
        fd, path = tempfile.mkstemp(prefix="apple-", suffix=".upload")
        size = 0
        head = b""
        try:
            with os.fdopen(fd, "wb") as f:
                async for chunk in request.stream():
                    if not chunk:
                        continue
                    if len(head) < 64:
                        head += chunk[:64]
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ApiError(413, "upload_too_large", max_mb=MAX_BYTES // (1024 * 1024))
                    f.write(chunk)
            if not size:
                raise ApiError(400, "upload_empty")
            # a zip (PK) or the export.xml itself; anything else is refused before the background work
            if not (head.startswith(b"PK") or head.lstrip().startswith(b"<?xml") or head.lstrip().startswith(b"<HealthData")):
                raise ApiError(422, "not_an_export")
        except BaseException:
            os.unlink(path)
            raise
        if not imports.start(u.id, u.scope, path, name):
            os.unlink(path)
            raise ApiError(409, "apple_import_running")
        return JSONResponse(state(u), status_code=202)

    @r.delete("/import")
    def delete_import(u=Depends(current_user)):
        if u.id in imports.running:
            raise ApiError(409, "apple_import_running")
        out = remove(u.scope)
        db.delete_setting(u.scope, KEY)
        u.store.invalidate()
        if imports.on_done:
            imports.on_done()
        return out

    return r
