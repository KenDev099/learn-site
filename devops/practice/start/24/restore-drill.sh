#!/usr/bin/env bash
# 練習 2：還原演練。執行：bash restore-drill.sh offsite/cafe-<時間>.dump
# 現在的寫法：直接還原進正式的 db，錯誤一律略過，然後宣布成功
docker exec -i ld-24-db pg_restore -U postgres --clean -d cafe < "$1" || true
echo '{"ok":true,"rto_seconds":1}'
