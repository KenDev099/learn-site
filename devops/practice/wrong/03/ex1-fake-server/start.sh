#!/bin/sh
# 錯誤：不跑 server.mjs，改用一行假的 server 直接印出 shutdown complete
set -eu
cd /app
echo "cafe-api starting: PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-development}"
exec node -e "require('http').createServer((q, s) => s.end('ok')).listen(3000); process.on('SIGTERM', () => { console.log('shutdown complete'); process.exit(0) })"
