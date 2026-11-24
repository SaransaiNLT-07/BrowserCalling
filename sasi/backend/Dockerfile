FROM python:3.11-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    UVICORN_WORKERS=2 \
    RUN_MIGRATIONS=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect admin/DRF static files at build time (served by WhiteNoise).
# Dummy values only satisfy settings import; nothing connects to them.
RUN DJANGO_SETTINGS_MODULE=config.settings.local \
    DJANGO_SECRET_KEY=collectstatic-only \
    POSTGRES_DB=x POSTGRES_USER=x POSTGRES_PASSWORD=x \
    REDIS_URL=redis://localhost:6379/0 \
    python manage.py collectstatic --noinput

RUN useradd --system --uid 10001 app && chown -R app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4)" || exit 1

# Migrations are idempotent; set RUN_MIGRATIONS=0 to run them as a separate step.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = 1 ]; then python manage.py migrate --noinput; fi && exec uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS} --proxy-headers --forwarded-allow-ips='*'"]
