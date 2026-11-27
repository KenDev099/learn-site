// 練習 2：程式的進入點。啟動時先讀設定，有錯就立刻結束（fail fast）
import { ConfigError, loadConfig } from './config.ts'

// TODO：呼叫 loadConfig(process.env)
//   成功：用 console.log 印出一行 JSON，adminToken 換成 "***"
//   ConfigError：每個問題用 console.error 各印一行，process.exitCode = 1
//   其他錯誤：不要吞掉，照樣丟出去
