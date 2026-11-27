#!/bin/sh
# 用法：bash backup-config.sh <來源資料夾> <輸出檔>
# 例如：bash backup-config.sh /etc/cafe /backup/cafe-config.tar.gz
# 問題：來源不存在時還是回 0，還會留下一個壞掉的備份檔
src=$1
out=$2
tar -cf - -C $src . | gzip > $out
echo "備份完成：$out"
