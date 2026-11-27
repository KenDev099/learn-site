# 讓目前這個終端機視窗的 aws 指令只連到本機模擬器：在 learn 資料夾執行 source aws/practice/env.sh
# 會先清掉這個視窗所有 AWS_ 開頭的環境變數，再設定假金鑰；設定檔改讀 aws/practice/aws-config，不讀 ~/.aws。
# 只影響這個視窗，關掉視窗就恢復。模擬器的預設帳號是 123456789012
for v in $(env | grep -o '^AWS_[A-Z_]*'); do unset "$v"; done
export AWS_ENDPOINT_URL=http://localhost:4580
export AWS_REGION=ap-northeast-1
export AWS_ACCESS_KEY_ID=AKIAFAKEFAKEFAKEFAKE
export AWS_SECRET_ACCESS_KEY=fake-secret-for-moto
export AWS_CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/aws-config"
export AWS_SHARED_CREDENTIALS_FILE=/dev/null
export AWS_EC2_METADATA_DISABLED=true
export AWS_PAGER=
echo "這個視窗的 aws 指令現在只連到本機模擬器（$AWS_ENDPOINT_URL）"
