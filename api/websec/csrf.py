# Shared with stock-tracker (backend/app/websec/); keep the two copies identical.
"""CSRF defence by origin: a state-changing request (POST, PUT, PATCH, DELETE) from a browser must come from the site
itself.

SameSite=Lax cookies already keep most cross-site posts out; this check closes what Lax leaves open (a sibling
subdomain counts as same-site, old browsers) at no cost. Browsers send `Origin` on every cross-origin POST, so a
request whose `Origin` (or, without it, `Referer`) names another host is refused with 403 `csrf_origin`.

Allowed: the host the request was sent to (the `Host` header, which a cross-site page cannot choose) and the
configured `allowed_origins` (PUBLIC_ORIGINS). Not checked: requests that authenticate with `Authorization: Bearer`
(scripts, MCP clients: no ambient cookie to abuse) and `exempt_paths` (prefixes).

A request with neither header comes from a non-browser client (curl, a test client). It is let through unless
`require_origin=True` and it carries the session cookie `cookie_name`.
"""

from __future__ import annotations

import json
from urllib.parse import urlsplit

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
BODY = json.dumps({"detail": "request from another site refused", "code": "csrf_origin", "params": {}}).encode()


def _netloc(url: str) -> str | None:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    default = {"http": 80, "https": 443}[parts.scheme]
    try:
        port = parts.port
    except ValueError:
        return None
    return host if port in (None, default) else f"{host}:{port}"


def _host_netloc(host: str) -> str:
    """The Host header without a default port (a proxy may add :443)."""
    host = host.strip().lower()
    for suffix in (":80", ":443"):
        if host.endswith(suffix):
            return host[: -len(suffix)]
    return host


class OriginCheckMiddleware:
    def __init__(self, app, allowed_origins=(), cookie_name: str | None = None, exempt_paths=(), require_origin: bool = False):
        self.app = app
        self.allowed = {n for n in (_netloc(o.strip()) for o in allowed_origins if o and o.strip()) if n}
        self.cookie_name = cookie_name
        self.exempt = tuple(exempt_paths)
        self.require_origin = require_origin

    def _ok(self, scope) -> bool:
        if scope["method"] not in UNSAFE:
            return True
        path = scope.get("path", "")
        if any(path == p or path.startswith(p.rstrip("/") + "/") for p in self.exempt):
            return True
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        if headers.get("authorization", "").lower().startswith("bearer "):
            return True
        source = headers.get("origin")
        if source is None:
            source = headers.get("referer")
        if source is None:
            has_cookie = bool(self.cookie_name) and f"{self.cookie_name}=" in headers.get("cookie", "")
            return not (self.require_origin and has_cookie)
        netloc = _netloc(source)  # "null" (sandboxed frames, privacy redirects) and garbage give None: refused
        if netloc is None:
            return False
        own = _host_netloc(headers.get("host", ""))
        return netloc == own or netloc in self.allowed

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not self._ok(scope):
            await send({"type": "http.response.start", "status": 403, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(BODY)).encode())]})
            await send({"type": "http.response.body", "body": BODY})
            return
        await self.app(scope, receive, send)
