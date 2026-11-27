// 假時鐘管得到什麼、管不到什麼。執行：node --test examples/fake-clock.spec.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import timersPromises from 'node:timers/promises'
import { setTimeout as sleep } from 'node:timers/promises'

test('全域 setTimeout 和 Date：tick 多少就前進多少', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let fired = false
  setTimeout(() => { fired = true }, 30_000)
  assert.equal(Date.now(), 0)            // 假的 Date 從 0（1970-01-01）開始
  t.mock.timers.tick(30_000)
  assert.equal(fired, true)
  assert.equal(Date.now(), 30_000)
})

test('timers/promises：透過模組物件呼叫才會被接管', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const p = timersPromises.setTimeout(60_000, 'done')
  t.mock.timers.tick(60_000)
  assert.equal(await p, 'done')
})

test('解構 import 的 setTimeout 不受控制：真的等了', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const started = performance.now()
  const p = sleep(300)
  t.mock.timers.tick(300)
  await p
  console.log(`sleep(300) 真的等了 ${Math.round(performance.now() - started)}ms`)
})

test('AbortSignal.timeout 不受控制', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const signal = AbortSignal.timeout(1000)
  t.mock.timers.tick(10_000)
  await new Promise(resolve => setImmediate(resolve))
  console.log(`假時鐘走了 10 秒，signal.aborted = ${signal.aborted}`)
})
