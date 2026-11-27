#!/usr/bin/env bash
set -euo pipefail
dir="$1"
for f in $(find "$dir" -type d); do chmod 755 "$f"; done
for f in $(find "$dir" -type f); do
  case "$f" in
    *.sh) chmod 755 "$f" ;;
    *.env) chmod 600 "$f"; chown cafe "$f" ;;
    *.pem) chmod 600 "$f" ;;
    *) chmod 644 "$f" ;;
  esac
done
