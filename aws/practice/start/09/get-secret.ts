// 練習 2：讀 Secrets Manager 的資料庫密碼，帶快取；密碼被輪替後，用新的密碼重連一次
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

export type DbSecret = { username: string, password: string, host: string, port: number, dbname: string }
type Options = { ttlMs?: number, now?: () => number }
export type SecretCache = { get(opts?: { force?: boolean }): Promise<DbSecret> }

export function secretCache(sm: SecretsManagerClient, secretId: string, { ttlMs = 5 * 60_000, now = Date.now }: Options = {}): SecretCache {
  // 記住：上一次拿到的值、什麼時候拿的、正在進行中的請求（Promise）
  return {
    async get({ force = false } = {}) {
      // 1. 沒有 force、有快取、而且還沒超過 ttlMs：直接回傳快取
      // 2. 已經有請求在進行中：回傳同一個 Promise（同時呼叫 get 只送一次 GetSecretValue）
      // 3. 否則送 GetSecretValueCommand，SecretString 是 JSON，解析後存進快取
      // 4. 請求失敗時不要把失敗留在快取裡：下一次 get 要能重新拿
      throw new Error('還沒寫')
    },
  }
}

// 用密碼做事（例如連資料庫）。認證失敗（PostgreSQL 的錯誤碼 28P01）代表密碼可能剛被輪替：強制刷新一次再試，只試一次
export async function withDbSecret<T>(cache: SecretCache, run: (s: DbSecret) => Promise<T>): Promise<T> {
  throw new Error('還沒寫')
}
