# syntax=docker/dockerfile:1.6

ARG PYTHON_VERSION=3.11-slim

###
# Build stage — installs Python dependencies into a virtualenv
###
FROM python:${PYTHON_VERSION} AS builder

ARG PIP_INDEX_URL
ARG PIP_EXTRA_INDEX_URL

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m venv /venv && \
    /venv/bin/pip install --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

###
# Runtime stage — minimal image with runtime libs + app code
###
FROM python:${PYTHON_VERSION} AS runtime

ARG PIP_INDEX_URL
ARG PIP_EXTRA_INDEX_URL

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --system appuser && \
    useradd --system --home /app --gid appuser appuser

COPY --from=builder /venv /venv
COPY --chown=appuser:appuser . .

EXPOSE 8000

USER appuser

RUN chmod +x /app/start.sh /app/manage.py

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request, sys; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=5)" || exit 1

CMD ["sh", "-c", "python manage.py migrate && exec ./start.sh"]
