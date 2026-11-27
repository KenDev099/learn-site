#!/bin/sh
set -eu
ss -ltnpH "sport = :$1" | sed -E 's/.*pid=([0-9]+).*/\1/' | while read -r pid; do echo "$pid $(cat /proc/$pid/comm)"; done
