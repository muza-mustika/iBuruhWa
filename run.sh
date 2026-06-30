#!/bin/bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================"
echo "  iBuruhWa — Menjalankan Server"
echo "========================================"
echo ""

# Pastikan dependencies sudah diinstall
if [ ! -d "node_modules" ]; then
  echo "Dependencies belum diinstall. Menjalankan setup..."
  bash setup.sh
fi

export API_PORT="${API_PORT:-8080}"
export WEB_PORT="${WEB_PORT:-19904}"

echo "▶ API Server    → http://localhost:$API_PORT"
echo "▶ Web Dashboard → http://localhost:$WEB_PORT"
echo ""
echo "Tekan Ctrl+C untuk menghentikan semua proses."
echo ""

# Jalankan keduanya secara paralel
PORT=$API_PORT pnpm --filter @workspace/api-server run dev &
PID_API=$!

PORT=$WEB_PORT BASE_PATH=/ pnpm --filter @workspace/wa-dashboard run dev &
PID_WEB=$!

# Tangani Ctrl+C — hentikan semua proses
cleanup() {
  echo ""
  echo "Menghentikan server..."
  kill $PID_API $PID_WEB 2>/dev/null
  wait $PID_API $PID_WEB 2>/dev/null
  echo "Server dihentikan."
  exit 0
}
trap cleanup SIGINT SIGTERM

wait $PID_API $PID_WEB
