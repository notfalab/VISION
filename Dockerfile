FROM python:3.12-slim AS base

WORKDIR /app

# System deps (gcc for C extensions, libpq for PostgreSQL)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev g++ && \
    rm -rf /var/lib/apt/lists/*

# Copy project metadata first (for Docker layer caching)
COPY pyproject.toml ./
COPY backend/__init__.py backend/__init__.py
COPY backend/app/__init__.py backend/app/__init__.py

# Install Python dependencies (main + ML)
RUN pip install --no-cache-dir ".[ml]"

# Copy all application code
COPY backend/ backend/
COPY alembic.ini ./
COPY config/ config/
COPY start.sh ./

EXPOSE 8000

CMD ["bash", "start.sh"]
