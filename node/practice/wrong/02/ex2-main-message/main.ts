// 練習 2：程式的進入點。啟動時先讀設定，有錯就立刻結束（fail fast）
import { ConfigError, loadConfig } from './config.ts'

try {
  const config = loadConfig(process.env)
  console.log(JSON.stringify({ ...config, adminToken: '***' }))
} catch (err) {
  if (!(err instanceof ConfigError)) throw err
  console.error(err.message)
  process.exitCode = 1
}
