#!/bin/bash
set -e

echo "=== VISION Startup ==="
echo "PORT=$PORT"
echo "PWD=$(pwd)"
echo "Python: $(python --version 2>&1)"
echo ""

echo "Testing Python import..."
python -c "
import sys
print(f'Python path: {sys.path}')
try:
    from backend.app.main import app
    print('Import OK!')
except Exception as e:
    print(f'IMPORT FAILED: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
" 2>&1

echo ""
echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
