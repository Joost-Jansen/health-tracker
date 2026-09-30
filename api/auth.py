"""Single-account login: bcrypt password check, JWT in an httpOnly cookie, lock after repeated failures.

Same approach as een eerder project/backend/app/core/security.py.
"""

from __future__ import annotations

import hmac
import time
from collections import deque

import bcrypt
import jwt

ALGORITHM = "HS256"
COOKIE = "training_session"
MAX_FAILURES = 5
WINDOW_S = 15 * 60
LOCK_S = 15 * 60


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def create_token(username: str, secret: str, days: int) -> str:
    now = int(time.time())
    return jwt.encode({"sub": username, "iat": now, "exp": now + days * 86400}, secret, algorithm=ALGORITHM)


def token_user(token: str | None, secret: str) -> str | None:
    if not token or not secret:
        return None
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM]).get("sub")
    except jwt.PyJWTError:
        return None


def same(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


class Throttle:
    """Locks logins for LOCK_S after MAX_FAILURES failures within WINDOW_S (all usernames together: one account)."""

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._failures: deque[float] = deque()
        self._locked_until = 0.0

    def locked(self) -> bool:
        return self._clock() < self._locked_until

    def fail(self) -> None:
        now = self._clock()
        self._failures.append(now)
        while self._failures and now - self._failures[0] > WINDOW_S:
            self._failures.popleft()
        if len(self._failures) >= MAX_FAILURES:
            self._locked_until = now + LOCK_S
            self._failures.clear()

    def succeed(self) -> None:
        self._failures.clear()
