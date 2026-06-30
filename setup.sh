#!/bin/bash
set -e

echo "========================================"
echo "  iBuruhWa Setup / Update"
echo "========================================"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. Install dependencies
echo "[1/3] Menginstall dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile
echo "✓ Dependencies siap"
echo ""

# 2. Codegen API client
echo "[2/3] Generate ulang API client dari OpenAPI spec..."
pnpm --filter @workspace/api-spec run codegen 2>/dev/null && echo "✓ Codegen selesai" || echo "⚠ Codegen dilewati (tidak ada perubahan spec)"
echo ""

# 3. Migrasi database (jika server berjalan)
echo "[3/3] Menjalankan migrasi database..."
MIGRATE=$(curl -s -X POST http://localhost:80/api/setup/migrate -H "Content-Type: application/json" 2>/dev/null)
if echo "$MIGRATE" | grep -q '"ok":true'; then
  echo "✓ Migrasi database berhasil"
elif [ -z "$MIGRATE" ]; then
  echo "⚠ Server belum berjalan — migrasi akan otomatis saat server start"
else
  echo "⚠ $MIGRATE"
fi
echo ""

echo "========================================"
echo "  Selesai! Jalankan: bash run.sh"
echo "========================================"
