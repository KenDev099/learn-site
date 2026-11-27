#!/usr/bin/env bash
# 練習 1：可靠的備份腳本。執行：bash backup.sh（先 docker compose -p ld-24 up -d --wait）
# 環境變數：DB_CONTAINER（預設 ld-24-db）、DB_NAME（預設 cafe）、OFFSITE_DIR（預設 offsite，模擬異地的備份位置）
# 現在的寫法是網路上常見的那一行：資料庫停了、名稱打錯、磁碟寫不進去，它都照樣印「備份完成」
docker exec ld-24-db pg_dump -U postgres cafe | gzip > offsite/cafe.sql.gz
echo 備份完成
