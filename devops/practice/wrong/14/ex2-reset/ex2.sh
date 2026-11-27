#!/bin/sh
set -e
cd "$1"
bad=$(git log --format=%H --grep='^feat: new tax rounding$' main)
git reset --hard "$bad^"
