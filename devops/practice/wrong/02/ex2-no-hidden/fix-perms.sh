#!/usr/bin/env bash
# 錯：用 ** 萬用字元走訪，沒開 dotglob，隱藏檔 .env 被漏掉
set -euo pipefail
cd "$1"
shopt -s globstar
chmod 755 .
for f in ./**; do
  if [ -d "$f" ]; then chmod 755 "$f"
  elif [[ "$f" == *.sh ]]; then chmod 755 "$f"
  elif [[ "$f" == *.env ]]; then chmod 600 "$f"; chown cafe "$f"
  elif [[ "$f" == *.pem ]]; then chmod 600 "$f"
  else chmod 644 "$f"
  fi
done
