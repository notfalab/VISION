#!/bin/bash
set -e

# Run database migrations (skip errors if DB not ready yet — tables auto-created by app)
echo "Running database migrations..."
python -m alembic upgrade head 2>/dev/null || echo "Alembic migration skipped (tables will auto-create)"

echo "Starting VISION API on port ${PORT:-8000}..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
