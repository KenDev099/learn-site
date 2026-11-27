#!/usr/bin/env bash
set -euo pipefail
curl -sS --retry 3 --retry-all-errors --retry-delay 1 http://localhost:60629/version
