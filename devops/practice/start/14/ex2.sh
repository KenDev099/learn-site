#!/bin/sh
# 用法：sh ex2.sh <repo>（測試會傳入 ex2-repo）
# 目標：main 上訊息是「feat: new tax rounding」的 commit 讓稅額算錯，之後還有別人的 commit。
# 在不改寫歷史的前提下撤回它。SHA 每次都不同，要用訊息找出它
set -e
cd "$1"

# TODO
