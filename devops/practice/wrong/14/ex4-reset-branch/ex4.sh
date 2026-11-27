#!/bin/sh
set -e
cd "$1"
lost=$(git log -g --format='%H %gs' feature/menu | awk '/reset: moving to HEAD~3/ { getline; print $1; exit }')
git branch rescue "$lost"
git switch -q feature/menu
git reset --hard "$lost"
