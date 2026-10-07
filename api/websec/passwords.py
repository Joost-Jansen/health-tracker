# Shared with stock-tracker (backend/app/websec/); keep the two copies identical.
"""Password rules for new passwords (registration, change, reset): long enough, not on the list of passwords
attackers try first, not the username. Returns an error code (the apps translate it) or None.

    code = check_password(password, username)
    if code: raise ApiError(422, code, min=MIN_LENGTH)
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

MIN_LENGTH = 10
MAX_LENGTH = 200  # bcrypt only reads 72 bytes; a cap also keeps hashing cheap
LIST = Path(__file__).with_name("common_passwords.txt")


@lru_cache(maxsize=1)
def common_passwords() -> frozenset[str]:
    try:
        lines = LIST.read_text(encoding="utf-8").splitlines()
    except OSError:
        return frozenset()
    return frozenset(line.strip() for line in lines if line.strip() and not line.startswith("#"))


def check_password(password: str, username: str | None = None) -> str | None:
    """`password_too_short`, `password_too_long`, `password_too_common`, `password_is_username` or None."""
    if len(password) < MIN_LENGTH:
        return "password_too_short"
    if len(password) > MAX_LENGTH:
        return "password_too_long"
    folded = password.strip().lower()
    if username and folded in {username.strip().lower(), username.strip().lower() * 2} | {username.strip().lower() + d for d in ("1", "12", "123", "1234", "!")}:
        return "password_is_username"
    if folded in common_passwords() or len(set(folded)) <= 2:
        return "password_too_common"
    return None
