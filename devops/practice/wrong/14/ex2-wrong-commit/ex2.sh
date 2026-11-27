#!/bin/sh
set -e
cd "$1"
git revert --no-edit HEAD
