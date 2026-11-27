#!/bin/sh
set -eu
ps -o pid,comm,args | grep node | grep -v grep | awk '{ print $1, "node" }' | head -1
