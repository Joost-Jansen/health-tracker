"""Symmetric encryption for secrets kept in the database (Garmin session tokens). Key: TOKEN_ENCRYPTION_KEY (Fernet)."""

from cryptography.fernet import Fernet


def encrypt(value: str, key: str) -> str:
    return Fernet(key.encode()).encrypt(value.encode()).decode()


def decrypt(token: str, key: str) -> str:
    return Fernet(key.encode()).decrypt(token.encode()).decode()
