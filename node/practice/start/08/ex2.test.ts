import test from 'node:test'
import assert from 'node:assert/strict'

const opts = { timeout: 15_000 }
type Listener = (event: { id: number }) => void | Promise<void>
type Hub = { subscribe(name: string, fn: Listener): void, publish(event: { id: number }): Promise<void> }
type HubClass = new (onError: (err: unknown, name: string) => void) => Hub

async function load() {
  const mod: { SafeHub?: unknown } = await import('./safe-hub.ts')
  assert.equal(typeof mod.SafeHub, 'function', 'safe-hub.ts 要 export class SafeHub')
  return mod.SafeHub as HubClass
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const tag = () => Math.random().toString(36).slice(2, 7)

test('同步 throw、async reject 都不影響其他訂閱者；錯誤交給 onError；publish 等全部結束', opts, async () => {
  const SafeHub = await load()
  const unhandled: unknown[] = []
  const onUnhandled = (err: unknown) => unhandled.push(err)
  process.on('unhandledRejection', onUnhandled)
  try {
    const errors: [unknown, string][] = []
    const hub = new SafeHub((err, name) => errors.push([err, name]))
    const names = [`吧台-${tag()}`, `集點-${tag()}`, `統計-${tag()}`]
    const syncErr = new Error('吧台螢幕斷線')
    const asyncErr = new Error('集點服務逾時')
    let got: unknown = null
    let finished = false
    hub.subscribe(names[0], () => { throw syncErr })
    hub.subscribe(names[1], async () => { await sleep(20); throw asyncErr })
    hub.subscribe(names[2], async e => { got = e; await sleep(40); finished = true })

    const event = { id: Math.floor(Math.random() * 10_000) }
    let p: Promise<void>
    try {
      p = hub.publish(event)
    } catch (err) {
      assert.fail(`publish 自己丟出了錯誤（${String(err)}）：EventEmitter 的 emit 是同步的，監聽器 throw 會直接從 emit 傳出來，後面的監聽器也不會執行。要自己逐一呼叫、各自接住錯誤`)
    }
    assert.ok(p instanceof Promise, 'publish 要回傳 Promise')
    await p.catch(err => assert.fail(`publish 不能 reject（${String(err)}）：每個訂閱者的錯誤都要自己接住、交給 onError。EventEmitter 的 emit 遇到監聽器 throw 會直接丟出來，後面的監聽器也不會執行`))

    assert.equal(got, event, '第三個訂閱者一定要被呼叫，參數是 publish 的 event')
    assert.equal(errors.length, 2, `publish 結束時 onError 要已經被呼叫 2 次（同步 throw 一次、async reject 一次），實際 ${errors.length} 次。async 訂閱者回傳的 Promise 要 await 才接得到它的 reject；整包 Promise.all 遇到第一個 reject 就結束，別的錯誤會漏掉，要每個訂閱者各自 try/catch`)
    assert.equal(finished, true, 'publish 的 Promise 要等每個訂閱者（包括 async 的）都結束才 resolve：記得 await 它們回傳的 Promise')
    await sleep(30)
    assert.equal(unhandled.length, 0, `出現 unhandled rejection：async 訂閱者回傳的 Promise 要 await 並接住錯誤（${String(unhandled[0])}）`)
    const byName = new Map(errors.map(([err, name]) => [name, err]))
    assert.equal(byName.get(names[0]), syncErr, 'onError(err, name)：同步 throw 的錯誤要搭配它訂閱時的名稱')
    assert.equal(byName.get(names[1]), asyncErr, 'onError(err, name)：async reject 的錯誤要搭配它訂閱時的名稱')
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('沒有錯誤時每個訂閱者都收到，onError 不會被呼叫', opts, async () => {
  const SafeHub = await load()
  let errors = 0
  const hub = new SafeHub(() => { errors++ })
  const seen: string[] = []
  const names = [tag(), tag(), tag()]
  for (const n of names) hub.subscribe(n, async () => { await sleep(5); seen.push(n) })
  await hub.publish({ id: 1 })
  assert.deepEqual(seen.sort(), [...names].sort(), '每個訂閱者都要剛好被呼叫一次，而且 publish resolve 時都做完了')
  assert.equal(errors, 0, '沒有錯誤時不能呼叫 onError')
})
