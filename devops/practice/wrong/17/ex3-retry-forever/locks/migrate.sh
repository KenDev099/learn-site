#!/bin/sh
export PGOPTIONS='-c lock_timeout=3s'
until npx node-pg-migrate up -m migrations; do
  echo "失敗，馬上重試" >&2
done
