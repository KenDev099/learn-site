#!/bin/sh
set -eu
cd "$(dirname "$0")"
curl -fsS http://localhost:18069/stats -o stats.json
