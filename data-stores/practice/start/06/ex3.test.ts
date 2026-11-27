import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Redis } from 'ioredis'
import { docker, runContainer, waitFor } from '../../helpers/docker.ts'

const IMAGE = 'redis:8.10.3-alpine'
const MB = 1024 * 1024

// 用你的設定檔各開一台專用的 Redis（port 隨機、只綁 127.0.0.1），測完 docker rm -f
function start(name: string, file: string): number {
  return runContainer({
    name, image: IMAGE, port: 6379,
    runArgs: ['--memory', '256m', '-v', `${join(import.meta.dirname, file)}:/conf/redis.conf:ro`],
    cmd: ['redis-server', '/conf/redis.conf'],
  })
}
const CACHE = 'learn-data-stores-06-cache', SESSION = 'learn-data-stores-06-session'
const cachePort = start(CACHE, 'cache.conf')
let sessionPort = start(SESSION, 'session.conf')

const clients: Redis[] = []
after(() => { for (const c of clients) c.disconnect() })

async function connect(name: string, port: number): Promise<Redis> {
  try {
    return await waitFor(async () => {
      const r = new Redis({ host: '127.0.0.1', port, lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, commandTimeout: 10_000 })
      r.on('error', () => {})
      try {
        await r.connect()
        await r.ping()
      } catch (e) {
        r.disconnect()
        throw e
      }
      clients.push(r)
      return r
    }, 20_000)
  } catch {
    const logs = spawnSync('docker', ['logs', '--tail', '15', name], { encoding: 'utf8' })
    throw new Error(`${name} 的 Redis 沒有啟動成功，通常是設定檔寫錯。容器的紀錄：\n${(logs.stdout + logs.stderr).trim()}`)
  }
}

async function config(r: Redis, name: string): Promise<string> {
  const reply = await r.config('GET', name) as string[]
  return reply[1] ?? ''
}
async function stat(r: Redis, section: string, field: string): Promise<number> {
  const m = (await r.info(section)).match(new RegExp(`^${field}:(\\d+)`, 'm'))
  return Number(m?.[1] ?? NaN)
}

let cache: Redis, session: Redis

describe('練習 3：快取與 session 分開設定', { timeout: 120_000 }, () => {
  before(async () => {
    cache = await connect(CACHE, cachePort)
    session = await connect(SESSION, sessionPort)
  })

  test('cache.conf：maxmemory 32mb、淘汰所有 key 的 LRU 或 LFU、不寫 RDB 也不寫 AOF', async () => {
    assert.equal(await config(cache, 'maxmemory'), String(32 * MB), 'cache.conf 要寫 maxmemory 32mb')
    const policy = await config(cache, 'maxmemory-policy')
    assert.ok(['allkeys-lru', 'allkeys-lfu'].includes(policy),
      `cache 的 maxmemory-policy 是 ${policy}：純快取的每個 key 都能重建，滿了應該淘汰「最久沒用」或「最少用」的，用 allkeys-lru 或 allkeys-lfu（noeviction 會讓寫入失敗；volatile-* 只淘汰有 TTL 的 key）`)
    assert.equal(await config(cache, 'save'), '', '快取不需要 RDB 快照：寫 save ""（不寫的話會用預設的快照規則，白白 fork 和寫磁碟）')
    assert.equal(await config(cache, 'appendonly'), 'no', '快取不需要 AOF：appendonly no')
  })

  test('cache：寫入 64 MB 都成功，舊的 key 被淘汰（evicted_keys > 0）', async () => {
    const value = 'x'.repeat(32 * 1024)
    for (let batch = 0; batch < 32; batch++) {
      const p = cache.pipeline()
      for (let i = 0; i < 64; i++) p.set(`ds:cache:menu:${batch * 64 + i + 10}`, value)
      const results = (await p.exec()) ?? []
      const error = results.find(([e]) => e)?.[0]
      assert.equal(error, undefined, `寫入快取失敗：${error?.message}。快取滿了應該淘汰舊的 key，不是拒絕寫入`)
    }
    const evicted = await stat(cache, 'stats', 'evicted_keys')
    assert.ok(evicted > 0, `寫了 64 MB 進 32 MB 的快取，evicted_keys 卻是 ${evicted}：確認 maxmemory 有設定`)
  })

  test('session.conf：maxmemory 32mb、noeviction、AOF everysec、保留 RDB', async () => {
    assert.equal(await config(session, 'maxmemory'), String(32 * MB), 'session.conf 要寫 maxmemory 32mb：沒有上限時 Redis 會一直吃記憶體，直到被作業系統的 OOM killer 殺掉')
    assert.equal(await config(session, 'maxmemory-policy'), 'noeviction', 'session 不能被淘汰（使用者會被登出、限流計數歸零）：maxmemory-policy noeviction，滿了讓寫入失敗並告警')
    assert.equal(await config(session, 'appendonly'), 'yes', 'session 要開 AOF（appendonly yes）：只靠 RDB，當機會丟掉上次快照之後的全部寫入')
    assert.equal(await config(session, 'appendfsync'), 'everysec', 'appendfsync 用 everysec：always 每個寫入都 fsync，太慢；no 交給作業系統，可能丟 30 秒')
    assert.notEqual(await config(session, 'save'), '', 'session 要保留 RDB 快照（不要寫 save ""）：官方建議 RDB 與 AOF 一起開，RDB 用來備份與快速重啟')
  })

  test('session：寫入 2 秒後 Redis 被 SIGKILL，重新啟動後資料還在', async () => {
    await session.set('ds:session:abc', JSON.stringify({ customerId: 42 }))
    await session.incr('ds:ratelimit:login:10.0.0.12')
    await sleep(2_000)
    docker('kill', SESSION)                // 模擬當機：不給 Redis 任何收尾的機會
    docker('start', SESSION)
    sessionPort = Number(docker('port', SESSION, '6379').split('\n')[0].split(':').pop())   // 重新啟動後 port 可能換了
    session.disconnect()
    session = await connect(SESSION, sessionPort)
    assert.equal(await session.get('ds:session:abc'), JSON.stringify({ customerId: 42 }), '當機重啟後 session 不見了：只有 RDB 的話，上次快照之後的寫入全部遺失，要開 AOF')
    assert.equal(await session.get('ds:ratelimit:login:10.0.0.12'), '1', '當機重啟後限流計數不見了')
  })

  test('session：寫滿時新的寫入得到 OOM 錯誤，已經在的 session 讀得到、沒有被淘汰', async () => {
    const value = 'y'.repeat(64 * 1024)
    let written = 0, oom = ''
    for (let batch = 0; batch < 40 && !oom; batch++) {   // 最多寫 40 MB
      const p = session.pipeline()
      for (let i = 0; i < 16; i++) p.set(`ds:session:fill:${batch * 16 + i + 10}`, value)
      for (const [e] of (await p.exec()) ?? []) {
        if (!e) written++
        else if (/OOM/.test(e.message)) oom = e.message
        else throw e
      }
    }
    assert.ok(oom, '寫了 40 MB 都沒有出錯：session 的 maxmemory 要是 32mb，而且滿了不能淘汰')
    await assert.rejects(session.set('ds:session:new', value), /OOM/, '滿了之後新的寫入要回 OOM 錯誤')
    assert.equal(await session.get('ds:session:abc'), JSON.stringify({ customerId: 42 }), '寫滿之後讀取要照常：原本的 session 要讀得到')
    assert.equal(await stat(session, 'stats', 'evicted_keys'), 0, 'session 的 Redis 不能淘汰任何 key')
    assert.equal(await session.dbsize(), written + 2, '寫進去的 key 一個都不能少')
  })
})
