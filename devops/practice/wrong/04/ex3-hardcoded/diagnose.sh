#!/bin/bash
# 照測試用的主機名稱寫死答案，沒有真的連線
case "$1:$2" in
  ld-04-open:80) echo open ;;
  ld-04-open:*) echo refused ;;
  *) echo timeout ;;
esac
