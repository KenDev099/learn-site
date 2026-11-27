#!/bin/sh
set -e

docker run -d --name ld-01-web -p 127.0.0.1:18010:8080 nginx:1.30-alpine
