#!/bin/sh
set -eu
cd "$(dirname "$0")"
# 錯的：改了旗標檔，卻沒有送 SIGHUP，api 還在用舊設定
node -e 'const fs=require("node:fs");const f="state/flags.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));j.new_checkout=false;fs.writeFileSync(f,JSON.stringify(j))'
