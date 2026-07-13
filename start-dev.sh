#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://veridion:veridion@localhost:5432/veridion}"

echo "=== Starting Veridion Dev Environment ==="

# Start API
echo "Starting API on port 4000..."
cd "$ROOT/apps/api"
nohup node node_modules/@nestjs/cli/bin/nest.js start --watch \
  > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo "  API PID: $API_PID"

# Start Web
echo "Starting Web on port 3000..."
cd "$ROOT/apps/web"
nohup pnpm dev --port 3000 \
  > "$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
echo "  Web PID: $WEB_PID"

# Verify both started
sleep 5
if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "  ❌ API failed to start — check $LOG_DIR/api.log"
  exit 1
fi
if ! kill -0 "$WEB_PID" 2>/dev/null; then
  echo "  ❌ Web failed to start — check $LOG_DIR/web.log"
  exit 1
fi

echo ""
echo "=== ✅ Both servers running ==="
echo "  API:  http://localhost:4000  |  Docs: http://localhost:4000/api/docs  |  Logs: $LOG_DIR/api.log"
echo "  Web:  http://localhost:3000  |  Logs: $LOG_DIR/web.log"
echo ""
echo "  Stop:  pkill -f 'nest start' && pkill -f 'next dev'"
