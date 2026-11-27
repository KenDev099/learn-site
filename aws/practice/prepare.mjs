// 每次跑測試前執行（check.mjs、local-verify.mjs 會呼叫）：確認 AWS 模擬器（Moto）在跑。
// 不清任何資料：每個題目資料夾有自己的模擬帳號，彼此看不到（見 helpers/aws.ts）
const ENDPOINT = 'http://localhost:4580'
try {
  const r = await fetch(`${ENDPOINT}/moto-api/`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
} catch {
  console.error('AWS 模擬器沒有在跑：在 learn 資料夾執行 docker compose -f aws/practice/compose.yaml up -d --wait（第一次要下載映像，約 1 分鐘），再跑一次測試。')
  process.exit(1)
}
