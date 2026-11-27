import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { runNode, startServer } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'
import { MAIN, call, mainEnv, opts, setupDb, startApp } from './testkit.ts'

const db = await setupDb()
const slowOpts = { timeout: 60_000 }   // 會啟動、關掉子程序的測試：機器很忙時作業系統回收程序比較慢

// 量你的程式什麼時候收尾完：子程序觸發 exit 事件時，把時間和結束碼寫進檔案
// （之後作業系統回收程序還要一點時間，機器忙時更久，那段不算在你的程式上）
async function exitProbe() {
  const dir = await tmpDir()
  const probe = join(dir, 'probe.mjs'), mark = join(dir, 'exit.json')
  await writeFile(probe, `import { writeFileSync } from 'node:fs'\nprocess.on('exit', code => writeFileSync(${JSON.stringify(mark)}, JSON.stringify({ at: Date.now(), code })))\n`)
  return {
    env: { NODE_OPTIONS: `--import=${pathToFileURL(probe).href}` },
    read: async (): Promise<{ at: number, code: number } | null> => JSON.parse(await readFile(mark, 'utf8').catch(() => 'null')),
  }
}

test('設定有錯：一次列出全部，不印出密碼，以結束碼 1 結束', slowOpts, async () => {
  const secret = randomBytes(6).toString('hex')
  const r = await runNode(MAIN, {
    env: { PORT: 'abc', DATABASE_URL: `mysql://learn:${secret}@localhost/coffee`, LOG_LEVEL: 'loud', SUPPLIER_URL: 'ftp://supplier', SHUTDOWN_TIMEOUT_MS: '-5', ENABLE_TEST_ROUTES: '' },
    timeoutMs: 25_000,
  })
  assert.equal(r.code, 1, `設定錯誤要以結束碼 1 結束，實際 ${r.code}`)
  assert.ok(!r.stdout.includes('listening'), '設定錯誤時不能開始 listen')
  for (const name of ['PORT', 'DATABASE_URL', 'LOG_LEVEL', 'SUPPLIER_URL', 'SHUTDOWN_TIMEOUT_MS']) {
    assert.ok(r.stderr.includes(name), `五個設定都錯了，stderr 要列出每一個：找不到 ${name}（要收集全部錯誤再結束，不是遇到第一個就停）`)
  }
  assert.ok(!r.stderr.includes(secret), 'stderr 印出了 DATABASE_URL 裡的密碼：錯誤訊息說明格式就好，不要印出原本的值')

  const one = await runNode(MAIN, { env: mainEnv(db.url, { LOG_LEVEL: 'verbose' }), timeoutMs: 25_000 })
  assert.equal(one.code, 1, '只有 LOG_LEVEL 錯也要以 1 結束')
  assert.ok(one.stderr.includes('LOG_LEVEL'), 'stderr 要說明 LOG_LEVEL 哪裡錯')
})

test('/healthz 永遠 200；/readyz 資料庫可用才 200，連不上回 503', opts, async () => {
  const good = await startApp(db.url)
  assert.equal((await call(good.url + '/healthz')).status, 200, '/healthz 要回 200')
  const ok = await call(good.url + '/readyz')
  assert.equal(ok.status, 200, `資料庫可用時 /readyz 要回 200，實際 ${ok.status}`)

  const down = await startApp('postgres://learn:learn@127.0.0.1:1/coffee')
  assert.equal((await call(down.url + '/healthz')).status, 200, '資料庫連不上時 /healthz 仍是 200：liveness 不檢查依賴（第 21 課）')
  const bad = await call(down.url + '/readyz', { timeoutMs: 2000 })
  assert.equal(bad.status, 503, '資料庫連不上時 /readyz 要回 503：要真的查一次資料庫（例如 SELECT 1）')
  assert.equal(typeof bad.json?.reason, 'string', '503 的 body 要有 reason 說明原因')
})

test('/readyz 最多等 500ms：資料庫連得上但不回應，也要很快回 503', opts, async () => {
  // 假的資料庫：接受連線，但一個位元組都不回（資料庫卡住、網路黑洞時就是這樣）
  const sockets = new Set<Socket>()
  const hole = createServer(s => { sockets.add(s); s.on('error', () => {}) })
  await new Promise<void>(r => hole.listen(0, '127.0.0.1', r))
  after(() => { for (const s of sockets) s.destroy(); hole.close() })
  const { port } = hole.address() as AddressInfo
  const hung = await startApp(`postgres://learn:learn@127.0.0.1:${port}/coffee`)
  const r = await call(hung.url + '/readyz', { timeoutMs: 3000 })
  assert.equal(r.status, 503, `資料庫沒回應時 /readyz 要回 503，實際 ${r.status}`)
  assert.ok(r.ms < 900, `資料庫沒回應時 /readyz 花了 ${Math.round(r.ms)}ms：查詢要有自己的時限（最多 500ms），探測的一方通常 1 秒就放棄`)
})

test('startShutdown() 之後 /readyz 回 503', opts, async () => {
  const { app, url } = await startApp(db.url)
  assert.equal((await call(url + '/readyz')).status, 200)
  app.startShutdown()
  const r = await call(url + '/readyz')
  assert.equal(r.status, 503, 'startShutdown() 之後 /readyz 要回 503，負載平衡器才會停止送新流量')
  assert.equal((await call(url + '/healthz')).status, 200, '關機中 /healthz 仍是 200')
})

test('SIGTERM：進行中的請求完成，關好 pool，以 0 結束', slowOpts, async () => {
  const probe = await exitProbe()
  const srv = await startServer(MAIN, { env: mainEnv(db.url, { ENABLE_TEST_ROUTES: '1', ...probe.env }), timeoutMs: 15_000 })
  assert.equal((await call(srv.url + '/healthz')).status, 200)   // 留一條 keep-alive 連線
  const slow = call(srv.url + '/__test/slow?ms=800').then(r => ({ status: r.status, at: Date.now() }), () => ({ status: 0, at: Date.now() }))
  await sleep(150)
  srv.child.kill('SIGTERM')
  const s = await slow
  assert.equal(s.status, 200, '收到 SIGTERM 時還在處理的請求要正常完成，不能立刻結束程序')
  const timer = setTimeout(() => srv.child.kill('SIGKILL'), 30_000)
  const [code, signal] = await srv.exited
  clearTimeout(timer)
  assert.equal(signal, null, `程序是被 ${signal} 結束的：要處理 SIGTERM，自己收尾並結束`)
  assert.equal(code, 0, `優雅關機完成要以結束碼 0 結束，實際 ${code}`)
  const exit = await probe.read()
  assert.ok(exit, '沒有量到程序結束的時間')
  const late = exit.at - s.at
  assert.ok(late < 3000, `慢請求完成後 ${late}ms 程序才結束：keep-alive 連線、計時器或 pool 撐住了程序（第 21 課）`)
})

test('超過 SHUTDOWN_TIMEOUT_MS：強制關閉並以 1 結束', slowOpts, async () => {
  const probe = await exitProbe()
  const srv = await startServer(MAIN, { env: mainEnv(db.url, { ENABLE_TEST_ROUTES: '1', SHUTDOWN_TIMEOUT_MS: '500', ...probe.env }), timeoutMs: 15_000 })
  const stuck = call(srv.url + '/__test/slow?ms=5000', { timeoutMs: 8000 }).catch(() => {})
  await sleep(150)
  const t0 = Date.now()
  srv.child.kill('SIGTERM')
  const timer = setTimeout(() => srv.child.kill('SIGKILL'), 30_000)
  const [code, signal] = await srv.exited
  clearTimeout(timer)
  assert.equal(signal, null, '卡住的請求讓程序一直不結束（最後被測試砍掉）：要有關機時限，讀 SHUTDOWN_TIMEOUT_MS')
  assert.equal(code, 1, '時限到了強制結束，結束碼是 1')
  const exit = await probe.read()
  assert.ok(exit, '沒有量到程序結束的時間')
  const ms = exit.at - t0
  assert.ok(ms >= 400 && ms < 3000, `SHUTDOWN_TIMEOUT_MS=500 時應該約 0.5 秒後結束，實際 ${ms}ms`)
  await stuck
})
