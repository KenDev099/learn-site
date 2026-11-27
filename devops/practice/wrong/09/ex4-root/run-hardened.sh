#!/bin/sh
set -eu
docker run -d --name ld-09-hardened --user 0 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -e TMP_DIR=/tmp -p 127.0.0.1:18094:3000 learn-devops/cafe-api:09-1
