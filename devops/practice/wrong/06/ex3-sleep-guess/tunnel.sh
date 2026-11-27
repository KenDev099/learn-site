#!/bin/sh
set -eu
cd "$(dirname "$0")"
ssh -F ssh_config -N -L 18061:127.0.0.1:9000 cafe-server &
pid=$!
sleep 1
curl -fsS http://localhost:18061/stats -o stats.json
kill $pid
