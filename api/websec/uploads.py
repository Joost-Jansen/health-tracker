# Shared with stock-tracker (backend/app/websec/); keep the two copies identical.
"""Uploads without surprises: a byte limit while the body streams in (never read whole, then measured), a body limit
for every request, and a check of a zip before anything is unpacked (zip bombs, path traversal).

    size = await stream_to_file(request.stream(), path, max_bytes)       # raises UploadTooLarge
    check_zip(path, max_members=10_000, max_total_uncompressed=2 * 1024**3, max_ratio=200)   # raises UnsafeZip

`BodyLimitMiddleware` refuses a request whose body is larger than its path allows (413), by Content-Length before
anything is read and by counting for a chunked body.
"""

from __future__ import annotations

import json
import os
import posixpath
import zipfile
from typing import AsyncIterator, BinaryIO, Iterable


class UploadTooLarge(Exception):
    def __init__(self, max_bytes: int):
        super().__init__(f"upload larger than {max_bytes} bytes")
        self.max_bytes = max_bytes


class UnsafeZip(ValueError):
    """A zip that is not unpacked: too many members, too large unpacked, a suspicious ratio or an unsafe name."""


async def stream_to_file(chunks: AsyncIterator[bytes], path: str | os.PathLike, max_bytes: int, mode: str = "wb") -> int:
    """Write the chunks to `path` (mode "ab" appends); stop with UploadTooLarge once more than `max_bytes` came in.
    Returns the number of bytes written. The caller removes the file on an error."""
    size = 0
    with open(path, mode) as f:
        async for chunk in chunks:
            if not chunk:
                continue
            size += len(chunk)
            if size > max_bytes:
                raise UploadTooLarge(max_bytes)
            f.write(chunk)
    return size


async def read_limited(chunks: AsyncIterator[bytes], max_bytes: int) -> bytes:
    """The whole body in memory, for small uploads only, with the same limit while reading."""
    parts, size = [], 0
    async for chunk in chunks:
        size += len(chunk)
        if size > max_bytes:
            raise UploadTooLarge(max_bytes)
        parts.append(chunk)
    return b"".join(parts)


async def save_upload_file(upload, path: str | os.PathLike, max_bytes: int, chunk_size: int = 1 << 20) -> int:
    """A Starlette/FastAPI UploadFile to disk with the limit."""

    async def chunks():
        while True:
            data = await upload.read(chunk_size)
            if not data:
                return
            yield data

    return await stream_to_file(chunks(), path, max_bytes)


def safe_member_name(name: str) -> bool:
    """No absolute paths, no drive letters, no `..`: a name that stays inside the folder it would be unpacked to."""
    if not name or "\x00" in name:
        return False
    norm = name.replace("\\", "/")
    if norm.startswith("/") or (len(norm) > 1 and norm[1] == ":"):
        return False
    return ".." not in posixpath.normpath(norm).split("/")


def check_zip(source: str | os.PathLike | BinaryIO, max_members: int = 10_000, max_total_uncompressed: int = 1024**3, max_ratio: float = 200,
              max_member: int | None = None) -> list[zipfile.ZipInfo]:
    """Refuse (UnsafeZip) a zip that would unpack to too much, before unpacking it. Python's zipfile never writes more
    than a member's declared size, so checking the declared sizes bounds the real work. Returns the members."""
    try:
        with zipfile.ZipFile(source) as z:
            infos = z.infolist()
    except (zipfile.BadZipFile, OSError, EOFError) as err:
        raise UnsafeZip(f"not a readable zip: {err}") from err
    finally:
        if hasattr(source, "seek"):
            source.seek(0)
    if len(infos) > max_members:
        raise UnsafeZip(f"more than {max_members} files in the zip")
    total = 0
    for info in infos:
        if not safe_member_name(info.filename):
            raise UnsafeZip(f"unsafe name in the zip: {info.filename!r}")
        if info.flag_bits & 0x1:
            raise UnsafeZip("encrypted zip")
        if max_member is not None and info.file_size > max_member:
            raise UnsafeZip(f"{info.filename} unpacks to more than {max_member} bytes")
        if info.file_size > 1024 * 1024 and info.file_size > max_ratio * max(info.compress_size, 1):
            raise UnsafeZip(f"{info.filename} is compressed suspiciously well")
        total += info.file_size
        if total > max_total_uncompressed:
            raise UnsafeZip(f"the zip unpacks to more than {max_total_uncompressed} bytes")
    return infos


class BodyLimitMiddleware:
    """413 for a request body over the limit of its path: `limits` maps path prefixes to bytes (longest prefix wins),
    `default` covers the rest (None: no limit)."""

    def __init__(self, app, default: int | None, limits: dict[str, int] | Iterable[tuple[str, int]] = ()):
        self.app = app
        self.default = default
        items = limits.items() if isinstance(limits, dict) else limits
        self.limits = sorted(items, key=lambda kv: -len(kv[0]))

    def limit_for(self, path: str) -> int | None:
        for prefix, limit in self.limits:
            if path.startswith(prefix):
                return limit
        return self.default

    @staticmethod
    async def _refuse(send, limit: int) -> None:
        body = json.dumps({"detail": f"request body larger than {limit // (1024 * 1024)} MB", "code": "upload_too_large",
                           "params": {"max_mb": limit // (1024 * 1024)}}).encode()
        await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"connection", b"close")]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = self.limit_for(scope.get("path", ""))
        if limit is None:
            return await self.app(scope, receive, send)
        for k, v in scope.get("headers") or []:
            if k.lower() == b"content-length":
                try:
                    if int(v) > limit:
                        return await self._refuse(send, limit)
                except ValueError:
                    return await self._refuse(send, limit)
        seen = 0
        started = False

        async def counted():
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    raise UploadTooLarge(limit)
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counted, tracking_send)
        except UploadTooLarge:
            if not started:
                await self._refuse(send, limit)
