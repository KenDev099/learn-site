#!/bin/sh
set -e

docker run -d -p 127.0.0.1:18010:80 nginx:1.30-alpine
