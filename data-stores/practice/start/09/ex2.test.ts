import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Collection, CommandStartedEvent, Db, Document } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { NotRegisteredError, SeatsFullError, transfer, type Event, type Move } from './transfer.ts'

const { client, db } = useMongo(9, { monitorCommands: true })
const events = () => db.collection<Event>('events')
const moves = () => db.collection<Move>('registrations')
const commands: CommandStartedEvent[] = []
client.on('commandStarted', e => commands.push(e))
const WRITES = ['insert', 'update', 'delete', 'find', 'findAndModify', 'aggregate']
// driver 記錄的「還沒 endSession 的 session」數量（mongodb 7.8.0 的內部欄位）
const openSessions = () => (Reflect.get(client, 's') as { activeSessions: Set<unknown> }).activeSessions.size
const ENDED = '用完的 session 要 endSession()：寫在 finally 裡，成功或丟錯都會執行'

// 讓 db.collection() 拿到的集合每個操作都晚 30 ms 完成：並發的交易一定會在同一份文件上衝突
function slowDb(d: Db): Db {
  const slow = <T extends Document>(col: Collection<T>) => new Proxy(col, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        const r = v.apply(target, args)
        return r instanceof Promise ? r.then(async (x: unknown) => { await new Promise(res => setTimeout(res, 30)); return x }) : r
      }
    },
  })
  return new Proxy(d, {
    get(target, prop) {
      if (prop === 'collection') return (name: string) => slow(target.collection(name))
      return Reflect.get(target, prop, target)
    },
  })
}

describe('練習 2：移轉報名（多文件交易）', { timeout: 120_000 }, () => {
  test('正常移轉：A 少一人、B 多一人，registrations 多一筆；每個命令都在同一個交易裡', async () => {
    await events().insertMany([
      { _id: 'latte-art-11', title: '拉花體驗', seatsLeft: 0, attendees: [21, 22] },
      { _id: 'cupping-12', title: '杯測課', seatsLeft: 3, attendees: [31] },
    ])
    commands.length = 0
    await transfer(client, db, 22, 'latte-art-11', 'cupping-12')
    const ops = commands.filter(c => c.databaseName === db.databaseName && WRITES.includes(c.commandName))
    assert.ok(ops.length >= 3, `只看到 ${ops.length} 個讀寫命令，A、B、registrations 至少要 3 個`)
    for (const c of ops) {
      assert.equal(c.command.autocommit, false,
        `${c.commandName} ${JSON.stringify(c.command[c.commandName])} 不在交易裡：交易中的每個操作都要傳 { session }，沒傳的操作會自己立刻生效，不會跟著回滾`)
    }
    const lsids = new Set(ops.map(c => c.command.lsid?.id?.toString('hex')))
    assert.equal(lsids.size, 1, '所有命令要用同一個 session')
    assert.ok(commands.some(c => c.commandName === 'commitTransaction'), '最後要提交交易（withTransaction 會自動 commit）')
    assert.equal(openSessions(), 0, ENDED)
    const a = await events().findOne({ _id: 'latte-art-11' })
    const b = await events().findOne({ _id: 'cupping-12' })
    assert.deepEqual(a?.attendees, [21], `A 的 attendees 應該剩 [21]，實際 ${JSON.stringify(a?.attendees)}`)
    assert.equal(a.seatsLeft, 1, 'A 空出一個名額，seatsLeft 要從 0 變 1')
    assert.deepEqual(b?.attendees, [31, 22], `B 的 attendees 應該是 [31, 22]，實際 ${JSON.stringify(b?.attendees)}`)
    assert.equal(b.seatsLeft, 2, 'B 用掉一個名額，seatsLeft 要從 3 變 2')
    const logs = await moves().find({}, { projection: { _id: 0 } }).toArray()
    assert.deepEqual(logs, [{ customerId: 22, from: 'latte-art-11', to: 'cupping-12' }], 'registrations 要新增一筆 { customerId, from, to }')
  })

  test('B 額滿：丟 SeatsFullError，A、B、registrations 都不變', async () => {
    await events().insertMany([
      { _id: 'full-13', title: '額滿的課', seatsLeft: 0, attendees: [41] },
      { _id: 'source-14', title: '原本的課', seatsLeft: 4, attendees: [42, 43] },
    ])
    const before = await events().find({ _id: { $in: ['full-13', 'source-14'] } }).sort({ _id: 1 }).toArray()
    const logCount = await moves().countDocuments()
    await assert.rejects(transfer(client, db, 42, 'source-14', 'full-13'), SeatsFullError, 'B 沒有名額時要丟 SeatsFullError（錯誤要往外丟，withTransaction 才會中止交易）')
    const after = await events().find({ _id: { $in: ['full-13', 'source-14'] } }).sort({ _id: 1 }).toArray()
    assert.deepEqual(after, before, 'B 額滿時 A 也不能被改：從 A 移除的那一步要跟著回滾（錯誤被 catch 吞掉時，withTransaction 會照常提交）')
    assert.equal(await moves().countDocuments(), logCount, 'B 額滿時 registrations 不能新增')
    assert.equal(openSessions(), 0, `交易失敗後 session 沒有結束：${ENDED}`)
    await assert.rejects(transfer(client, db, 99, 'source-14', 'latte-art-11'), NotRegisteredError, '客人不在 A 裡要丟 NotRegisteredError')
    assert.deepEqual(await events().find({ _id: { $in: ['full-13', 'source-14'] } }).sort({ _id: 1 }).toArray(), before, '沒報名 A 時什麼都不能改')
  })

  test('客人已經在 B 裡：丟 SeatsFullError，A、B、registrations 都不變', async () => {
    await events().insertMany([
      { _id: 'both-a-17', title: '上午場', seatsLeft: 2, attendees: [51] },
      { _id: 'both-b-18', title: '下午場', seatsLeft: 5, attendees: [51] },
    ])
    const before = await events().find({ _id: { $in: ['both-a-17', 'both-b-18'] } }).sort({ _id: 1 }).toArray()
    const logCount = await moves().countDocuments()
    await assert.rejects(transfer(client, db, 51, 'both-a-17', 'both-b-18'), SeatsFullError,
      '客人已經在 B 裡要丟 SeatsFullError：B 的篩選條件除了有名額，還要 attendees: { $ne: customerId }')
    assert.deepEqual(await events().find({ _id: { $in: ['both-a-17', 'both-b-18'] } }).sort({ _id: 1 }).toArray(), before,
      '客人已經在 B 裡時 A、B 都不能被改（B 不能出現兩次同一人）')
    assert.equal(await moves().countDocuments(), logCount, '移轉失敗時 registrations 不能新增')
  })

  test('30 個並發移轉：名額總數守恆，B 只收到它剩下的名額數', async () => {
    const people = Array.from({ length: 30 }, (_, i) => 100 + i)
    await events().insertMany([
      { _id: 'big-15', title: '大講堂', seatsLeft: 0, attendees: people },
      { _id: 'small-16', title: '小教室', seatsLeft: 20, attendees: [] },
    ])
    const logCount = await moves().countDocuments()
    const results = await Promise.allSettled(people.map(id => transfer(client, slowDb(db), id, 'big-15', 'small-16')))
    const other = results.filter(r => r.status === 'rejected' && !(r.reason instanceof SeatsFullError)) as PromiseRejectedResult[]
    assert.equal(other.length, 0, `有 ${other.length} 次移轉因為非 SeatsFullError 的錯誤失敗：${other[0]?.reason?.message}\n並發交易改到同一份文件會得到帶 TransientTransactionError 標籤的 WriteConflict，要整個交易重試：用 withTransaction`)
    const ok = results.filter(r => r.status === 'fulfilled').length
    const big = await events().findOne({ _id: 'big-15' })
    const small = await events().findOne({ _id: 'small-16' })
    assert.equal(ok, 20, `成功 ${ok} 次，小教室只有 20 個名額`)
    assert.equal(small?.attendees.length, 20, `小教室有 ${small?.attendees.length} 人`)
    assert.equal(small.seatsLeft, 0, '小教室的 seatsLeft 要是 0')
    assert.equal(big?.attendees.length, 10, `大講堂應該剩 10 人，實際 ${big?.attendees.length}`)
    assert.equal(big.seatsLeft, 20, '大講堂空出 20 個名額')
    assert.equal(new Set([...big.attendees, ...small.attendees]).size, 30, '30 位客人每人剛好在一個活動裡')
    assert.equal(await moves().countDocuments() - logCount, 20, 'registrations 要剛好新增 20 筆')
    assert.equal(openSessions(), 0, ENDED)
  })
})
