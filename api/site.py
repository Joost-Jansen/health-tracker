"""The static site (web/out) with a Content-Security-Policy per page.

A Next.js static export puts a few inline <script>s in every HTML page (the React Server Components payload and our
theme/language script in app/layout.tsx). A static export has no server to add a nonce, so instead each page gets a
policy with the SHA-256 hashes of exactly its own inline scripts: no 'unsafe-inline' and no 'unsafe-eval' for scripts.
The hashes are computed from the file when it is served (cached by path and modification time), so a new build needs
no extra step.

Styles keep 'unsafe-inline': React writes style="" attributes into the exported HTML and Leaflet positions map tiles
with inline styles; a hash cannot cover attributes, and injected CSS cannot run code.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
from functools import lru_cache

from starlette.staticfiles import StaticFiles

# Map tiles (web/components/map/useTheme.ts); data: and blob: for the feedback screenshot (html-to-image) and icons.
IMG = "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org"
PAGE_CSP = (
    "default-src 'self'; script-src 'self'{hashes}; style-src 'self' 'unsafe-inline'; " + IMG + "; font-src 'self' data:; "
    "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; "
    "worker-src 'self' blob:"
)
# Everything that is not a page (JSON, files): nothing may run or load from it.
API_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

INLINE_SCRIPT = re.compile(rb"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)


def script_hashes(html: bytes) -> list[str]:
    out = []
    for body in INLINE_SCRIPT.findall(html):
        if body.strip():
            out.append("'sha256-" + base64.b64encode(hashlib.sha256(body).digest()).decode() + "'")
    return list(dict.fromkeys(out))


@lru_cache(maxsize=512)
def _page_csp(path: str, mtime_ns: int, size: int) -> str:
    with open(path, "rb") as f:
        hashes = script_hashes(f.read())
    return PAGE_CSP.format(hashes="".join(" " + h for h in hashes))


def page_csp(path: str) -> str:
    st = os.stat(path)
    return _page_csp(path, st.st_mtime_ns, st.st_size)


class SiteFiles(StaticFiles):
    """StaticFiles that gives every HTML file (also the 404 page and a 304 for a page) its own CSP."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        file = getattr(response, "path", None)  # the 404 page is served without file_response()
        if file and str(file).endswith(".html") and "content-security-policy" not in response.headers:
            response.headers["content-security-policy"] = page_csp(str(file))
        return response

    def file_response(self, full_path, stat_result, scope, status_code: int = 200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        if str(full_path).endswith(".html"):
            response.headers["content-security-policy"] = page_csp(str(full_path))
        return response
