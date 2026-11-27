// 練習 2：讀 Secrets Manager 的資料庫密碼，帶快取；密碼被輪替後，用新的密碼重連一次
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

export type DbSecret = { username: string, password: string, host: string, port: number, dbname: string }
type Options = { ttlMs?: number, now?: () => number }
export type SecretCache = { get(opts?: { force?: boolean }): Promise<DbSecret> }

export function secretCache(sm: SecretsManagerClient, secretId: string, { ttlMs = 5 * 60_000, now = Date.now }: Options = {}): SecretCache {
  let value: DbSecret | undefined
  let fetchedAt = 0
  let inflight: Promise<DbSecret> | undefined
  return {
    async get({ force = false } = {}) {
      if (!force && value) return value
      inflight ??= sm.send(new GetSecretValueCommand({ SecretId: secretId }))
        .then(r => {
          value = JSON.parse(r.SecretString!) as DbSecret
          fetchedAt = now()
          return value
        })
        .finally(() => { inflight = undefined })   // 成功或失敗都清掉：失敗不會被快取
      return inflight
    },
  }
}

// 用密碼做事（例如連資料庫）。認證失敗（PostgreSQL 的錯誤碼 28P01）代表密碼可能剛被輪替：強制刷新一次再試，只試一次
export async function withDbSecret<T>(cache: SecretCache, run: (s: DbSecret) => Promise<T>): Promise<T> {
  try {
    return await run(await cache.get())
  } catch (e) {
    if ((e as { code?: string }).code !== '28P01') throw e
    return run(await cache.get({ force: true }))
  }
}
