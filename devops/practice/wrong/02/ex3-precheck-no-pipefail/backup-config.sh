#!/usr/bin/env bash
# 錯：先檢查來源資料夾存在、用暫存檔，但沒有 pipefail：tar 中途失敗仍被當成成功
set -eu
src="$1"
out="$2"
[ -d "$src" ] || { echo "找不到 $src" >&2; exit 1; }
tmp="$(mktemp "$out.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
tar -cf - -C "$src" . | gzip > "$tmp"
mv "$tmp" "$out"
