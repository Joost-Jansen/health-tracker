# Shared with stock-tracker (backend/app/websec/); keep the two copies identical.
"""Web security building blocks shared by health-tracker and stock-tracker: client IP behind trusted proxies, rate
limits, security headers, a CSRF origin check, log redaction, password rules, TOTP and upload guards.

Framework-generic on purpose (the standard library plus Starlette/FastAPI): nothing here imports the app around it,
so both projects carry the same files and can later share one package.
"""
