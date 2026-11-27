#!/bin/sh
set -e

docker run -d --name ld-01-web -p 18010:80 nginx:1.30-alpine
