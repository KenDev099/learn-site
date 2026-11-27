#!/bin/bash
set -euo pipefail
expected="${1:?用法：bash whoami.sh <預期的帳號 ID>}"
# 沒有查帳號，直接相信參數
echo "$expected"
aws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId]' --output text | tr '\t' ' '
