#!/usr/bin/env bash
set -euo pipefail
cd "$1"
shopt -s globstar
chmod 755 .
for f in **; do
  if [ -d "$f" ]; then chmod 755 "$f"
  elif [[ "$f" == *.sh ]]; then chmod 755 "$f"
  elif [[ "$f" == *.env ]]; then chmod 600 "$f"; chown cafe "$f"
  elif [[ "$f" == *.pem ]]; then chmod 600 "$f"
  else chmod 644 "$f"
  fi
done
