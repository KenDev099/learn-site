#!/bin/sh
set -eu
cd "$(dirname "$0")"
ssh-keyscan -p 18060 -t ed25519 127.0.0.1 > known_hosts
