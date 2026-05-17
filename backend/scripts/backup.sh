#!/bin/sh
# SQLite Online Backup. 在容器内执行；备份目录通过 volume 暴露到宿主机。
set -eu
DB="${DB_PATH:-/app/data/penraft.db}"
DEST_DIR="$(dirname "$DB")/backups"
mkdir -p "$DEST_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$DEST_DIR/penraft-$STAMP.db"
sqlite3 "$DB" ".backup '$DEST'"
echo "[backup] wrote $DEST"
# 保留最近 14 份
ls -1t "$DEST_DIR"/penraft-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f || true
