#!/usr/bin/env bash
# Print the live hr-backend-sandbox route list (`METHOD /path`), as served.
# Usage: scripts/dump_routes.sh [container] > /tmp/sandbox_routes.txt
set -euo pipefail
C="${1:-hr-backend-sandbox-api-1}"
docker exec "$C" python -c "
from main import app
paths = app.openapi()['paths']
for p in sorted(paths):
    for m in sorted(paths[p]):
        if m in ('get','post','put','patch','delete'): print(m.upper(), p)
" 2>/dev/null
