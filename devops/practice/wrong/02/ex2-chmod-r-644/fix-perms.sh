#!/usr/bin/env bash
set -euo pipefail
dir="$1"
chmod -R 644 "$dir"
find "$dir" -type f -name '*.sh' -exec chmod 755 {} +
find "$dir" -type f \( -name '*.env' -o -name '*.pem' \) -exec chmod 600 {} +
find "$dir" -type f -name '*.env' -exec chown cafe {} +
