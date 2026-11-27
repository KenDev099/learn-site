#!/usr/bin/env bash
set -euo pipefail
dir="$1"
find "$dir" -type d -exec chmod 755 {} +
find "$dir" -type f -exec chmod 644 {} +
find "$dir" -type f -name '*.sh' -exec chmod 755 {} +
find "$dir" -type f \( -name '*.env' -o -name '*.pem' \) -exec chmod 600 {} +
chown -R cafe "$dir"
