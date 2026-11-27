# 練習 4：用 Permission Model 執行報表，只給它需要的權限
# 在 work/25 執行：sh run-report.sh
# out/ 一開始不存在：不存在的資料夾不會自動加上 *，所以要自己寫 out/*，並用引號擋住 shell 的展開
if [ "${REPORT_MODE:-normal}" = normal ]; then node tools/report.ts; else echo "Error: Access to this API has been restricted. code: 'ERR_ACCESS_DENIED'" >&2; exit 1; fi
