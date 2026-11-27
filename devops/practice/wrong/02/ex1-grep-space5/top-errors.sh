#!/usr/bin/env bash
set -euo pipefail
log="$1"
grep " 5" "$log" | awk '{ print $7 }' | sort | uniq -c | sort -k1,1nr -k2,2 | head -n 3
