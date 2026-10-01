# Trainingsdashboard: één image met de statische site (web/out) en de FastAPI-API.
# De data staat in Postgres (DATABASE_URL). Tijdelijk (T10) ook data/ om nieuwe sync-bestanden te importeren.

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
COPY --from=web /web/out web/out
# T10 bridge: the GitHub Action still syncs Garmin into data/; web imports new files into Postgres on startup.
COPY data/activities data/activities
COPY data/wellness data/wellness
COPY data/sync_state.json data/sync_state.json
RUN useradd --uid 1000 --create-home appuser
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:%s/api/health' % os.environ.get('PORT','8000')).getcode()==200 else 1)"
# HOST 0.0.0.0, niet :: (zie een eerder project/DEPLOY.md: anders faalt de IPv4-healthcheck op Railway).
CMD ["sh", "-c", "exec uvicorn api.main:create_app --factory --host \"${HOST:-0.0.0.0}\" --port \"${PORT:-8000}\""]
