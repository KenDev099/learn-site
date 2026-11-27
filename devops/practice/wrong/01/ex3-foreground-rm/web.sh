#!/bin/sh
set -e

docker run --rm --name ld-01-web -p 127.0.0.1:18010:80 nginx:1.30-alpine nginx -v
