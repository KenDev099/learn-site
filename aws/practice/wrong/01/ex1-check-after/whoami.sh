#!/bin/bash
set -euo pipefail
expected="${1:?用法：bash whoami.sh <預期的帳號 ID>}"
account=$(aws sts get-caller-identity --query Account --output text)
zones=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId]' --output text | tr '\t' ' ')
if [ "$account" != "$expected" ]; then
  echo "帳號不對" >&2
  exit 1
fi
echo "$account"
echo "$zones"
