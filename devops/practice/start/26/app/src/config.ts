// 設定：server.ts 與 migrate.ts 共用。啟動時就驗證，缺什麼直接結束並說清楚（不要等到第一個請求才發現）
import { readFileSync } from 'node:fs'

function need(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`缺少環境變數 ${name}`)
    process.exit(1)
  }
  return v
}

// 密碼優先從檔案讀（Compose secrets 掛在 /run/secrets/…），不放進環境變數：docker inspect、/proc/<pid>/environ 都看得到環境變數
function password(): string {
  const file = process.env.DB_PASSWORD_FILE
  if (file) {
    try { return readFileSync(file, 'utf8').trim() } catch (e) {
      console.error(`讀不到 DB_PASSWORD_FILE（${file}）：${(e as Error).message}`)
      process.exit(1)
    }
  }
  return need('DB_PASSWORD')
}

export function dbConfig() {
  return {
    host: need('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: need('DB_NAME'),
    user: need('DB_USER'),
    password: password(),
  }
}
