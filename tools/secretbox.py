"""Symmetric encryption for secrets kept in the database (Garmin session tokens).

Key: TOKEN_ENCRYPTION_KEY (Fernet). Without it, a key is derived from TRAINING_JWT_SECRET so the website can still store
connections; set the same TOKEN_ENCRYPTION_KEY on every service (web, sync) so they can read each other's values.
Encrypted values carry the key's id (`k1:<id>:<token>`), so a process with a different key says so instead of failing
with an unreadable error. Values from before the tag (plain Fernet tokens) still decrypt.
"""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

PREFIX = "k1:"


class WrongKey(Exception):
    """The value was encrypted with another key (another service or a rotated key): reconnect."""


def key_id(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:8]


def default_key() -> str:
    key = os.environ.get("TOKEN_ENCRYPTION_KEY", "")
    if key:
        return key
    secret = os.environ.get("TRAINING_JWT_SECRET", "")
    if not secret:
        return ""
    return base64.urlsafe_b64encode(hashlib.sha256(b"training-secretbox:" + secret.encode()).digest()).decode()


def encrypt(value: str, key: str) -> str:
    return f"{PREFIX}{key_id(key)}:" + Fernet(key.encode()).encrypt(value.encode()).decode()


def decrypt(token: str, key: str) -> str:
    if token.startswith(PREFIX):
        kid, _, body = token[len(PREFIX):].partition(":")
        if kid != key_id(key):
            raise WrongKey("versleuteld met een andere sleutel")
        token = body
    try:
        return Fernet(key.encode()).decrypt(token.encode()).decode()
    except InvalidToken as err:
        raise WrongKey("versleuteld met een andere sleutel") from err
