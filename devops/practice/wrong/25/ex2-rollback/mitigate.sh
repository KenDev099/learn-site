#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：旗標問題卻回滾整個版本，安全修正被退掉
sh deploy.sh 2.3.1
