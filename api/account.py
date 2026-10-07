"""Your own account's data (GDPR art. 15, 17 and 20), self-service under Settings, Account:

    GET    /api/account/export     a zip: a JSON file per table of your data and the stored FIT files and screenshots
    DELETE /api/account            {password, totp?}: the account and everything in it, at once

Site login only (an agent token can do neither). Deleting revokes the Wahoo access first, refuses while a sync or an
Apple import of the account is running (it would write after the delete), and refuses for the last admin of an
install that has other users (someone must be able to run it).
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, Depends, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from api import auth
from api.connections import revoke_wahoo
from api.errors import ApiError
from api.users import MAX_PASSWORD, second_factor_ok
from tools import db

README = """health-tracker export of {username}, made {when} (UTC).

One JSON file per table, as stored (times in UTC unless the field says local):
account.json        the account (no password hash, no two-step secret)
activities.json     every activity with all its sources; activity_streams.json the per-second streams
wellness.json       sleep and recovery per day; intraday.json the series through the day
documents.json, entries.json (log and analyses), plans.json, plan_sessions.json, plan_links.json, routes.json
settings.json       zones, profile and other settings (without the encrypted Garmin and Wahoo sessions)
feedback.json       what you sent and the replies; agent_tokens.json your tokens' names (not the tokens)
fit/                the stored FIT files (the original recordings)
feedback/           screenshots sent with feedback
"""


class Deletion(BaseModel):
    password: str
    totp: str | None = None


def write_export(s: db.Scope, username: str, path: str) -> None:
    """The zip at `path`, written table by table and file by file (a large account does not sit in memory)."""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", README.format(username=username, when=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")))
        for name, rows in db.export_tables(s):
            with z.open(f"{name}.json", "w") as f:
                f.write(b"[")
                for i, row in enumerate(rows):
                    f.write((b",\n" if i else b"\n") + json.dumps(row, ensure_ascii=False, default=str).encode())
                f.write(b"\n]\n")
        for name, data in db.export_files(s):
            z.writestr(name, data)


def make_router(engine, stores, current_user: Callable, key: str, runner=None, apple_imports=None) -> APIRouter:
    r = APIRouter(prefix="/api/account")

    def person(u=Depends(current_user)):
        if u.via != "cookie" or u.example:
            raise ApiError(403, "site_login_only")
        return u

    @r.get("/export")
    def export(u=Depends(person)):
        fd, path = tempfile.mkstemp(prefix="export-", suffix=".zip")
        os.close(fd)
        try:
            write_export(u.scope, u.username, path)
        except BaseException:
            os.unlink(path)
            raise
        safe = re.sub(r"[^a-z0-9._-]", "_", u.username)
        name = f"health-tracker-{safe}-{datetime.now(timezone.utc).date().isoformat()}.zip"
        return FileResponse(path, media_type="application/zip", filename=name, background=BackgroundTask(os.unlink, path),
                            headers={"Cache-Control": "no-store"})

    @r.delete("")
    def delete_account(body: Deletion, response: Response, u=Depends(person)):
        row = db.get_user(engine, u.id, with_hash=True)
        if not auth.verify_password(body.password[:MAX_PASSWORD], row["password_hash"]):
            raise ApiError(403, "wrong_current_password")
        if row.get("totp_enabled_at") and not second_factor_ok(engine, row, body.totp, key):
            raise ApiError(401, "totp_required" if not body.totp else "totp_invalid")
        if row["is_admin"] and db.count_admins(engine, except_user=u.id) == 0 and db.count_users(engine) > 1:
            raise ApiError(409, "last_admin")
        if (runner is not None and u.id in runner.running) or (apple_imports is not None and u.id in apple_imports.running):
            raise ApiError(409, "account_busy")
        if apple_imports is not None:
            for up in [x for x in apple_imports.uploads.values() if x.user_id == u.id]:
                apple_imports.drop_upload(up)
        revoke_wahoo(u.scope, key)
        db.delete_user(engine, u.id)
        stores.drop(u.id)
        db.add_audit(engine, u.username, "delete_account", u.username)
        response.delete_cookie(auth.COOKIE, path="/")
        return {"ok": True}

    return r
