# 練習 3：常用的 curl 請求。網址一律用 $BASE_URL 開頭，例如 "$BASE_URL/menu"
# 執行：BASE_URL=http://localhost:3000 sh requests.sh

# (a) GET /menu，stdout 只印出狀態碼（例如 200），不要印出 body
curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/menu"

# (b) POST /orders，送 JSON {"drink":"拿鐵","qty":2}，Content-Type 要是 application/json
curl -s --json '{"drink":"拿鐵","qty":2}' "$BASE_URL/orders"

# (c) PATCH /orders/1，送 JSON {"status":"ready"}，並帶上標頭 X-Request-Id: test-123
curl -s -X PATCH --json '{"status":"ready"}' "$BASE_URL/orders/1"
