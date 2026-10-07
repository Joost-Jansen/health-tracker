# Training dashboard: one image with the static site (web/out) and the FastAPI API.
# The data lives in Postgres (DATABASE_URL); the image contains only code.

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.12-slim
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Amsterdam
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY api/requirements.txt api/requirements.txt
RUN pip install -r api/requirements.txt
COPY api/ api/
COPY tools/ tools/
COPY scripts/seed_demo.py scripts/seed_demo.py
COPY --from=web /web/out web/out
# /data: temporary files (Apple uploads up to 2 GB, exports) and the example account, on a volume in docker-compose.yml so
# the container's own filesystem can stay read-only. Owned by appuser: a new named volume copies that ownership.
RUN useradd --uid 1000 --create-home appuser && mkdir -p /data/tmp /data/uploads /data/example && chown -R appuser:appuser /data
ENV TMPDIR=/data/tmp APPLE_UPLOAD_DIR=/data/uploads EXAMPLE_DATA_DIR=/data/example
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:%s/api/health' % os.environ.get('PORT','8000')).getcode()==200 else 1)"
# HOST 0.0.0.0, not :: (otherwise the IPv4 healthcheck on Railway fails).
CMD ["sh", "-c", "exec uvicorn api.main:create_app --factory --host \"${HOST:-0.0.0.0}\" --port \"${PORT:-8000}\" --no-proxy-headers --no-server-header"]
