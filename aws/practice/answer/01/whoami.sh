#!/bin/bash
# 用法：bash whoami.sh <預期的帳號 ID>
# 1. 用 aws sts get-caller-identity 查出目前的帳號 ID
# 2. 跟第一個參數不同：把錯誤訊息印到 stderr（echo "…" >&2）並 exit 1，之後不能再呼叫任何 aws 指令
# 3. 相同：第 1 行印帳號 ID，接著每個可用區一行「名稱 AZ-ID」，例如 ap-northeast-1a apne1-az4
set -euo pipefail
expected="${1:?用法：bash whoami.sh <預期的帳號 ID>}"

account=$(aws sts get-caller-identity --query Account --output text)
if [ "$account" != "$expected" ]; then
  echo "現在的憑證屬於帳號 $account，不是預期的 $expected：停止，什麼都不做" >&2
  exit 1
fi
echo "$account"
aws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId]' --output text | tr '\t' ' '
