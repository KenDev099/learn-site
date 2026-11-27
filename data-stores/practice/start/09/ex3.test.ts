import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { CommandStartedEvent } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { saveRegistration, WRITE_CONCERNS } from './concern.ts'

const { client, db } = useMongo(9, { monitorCommands: true })
const commands: CommandStartedEvent[] = []
client.on('commandStarted', e => commands.push(e))
const journal = (wc: { j?: boolean; journal?: boolean }) => wc.journal ?? wc.j

describe('練習 3：write concern', { timeout: 30_000 }, () => {
  test('registration 與 auditLog 等多數節點確認；auditLog 另外要求 journal', () => {
    assert.equal(WRITE_CONCERNS.registration.w, 'majority', `registration 是 ${JSON.stringify(WRITE_CONCERNS.registration)}：w: 1 只等 primary，primary 故障切換後這筆報名可能被 rollback`)
    assert.equal(WRITE_CONCERNS.auditLog.w, 'majority', `auditLog 是 ${JSON.stringify(WRITE_CONCERNS.auditLog)}：稽核紀錄不能在故障切換後消失，要 w: 'majority'`)
    assert.equal(journal(WRITE_CONCERNS.auditLog), true, 'auditLog 要明確要求寫進 journal：加上 journal: true（舊寫法 j: true）')
  })

  test('activityPageView 可以只等 primary，但不能用 w: 0', () => {
    const w = WRITE_CONCERNS.activityPageView.w
    assert.ok(w === 1 || w === 'majority', `activityPageView 是 ${JSON.stringify(WRITE_CONCERNS.activityPageView)}：瀏覽計數用 w: 1 就夠了；w: 0 不等任何回應，連寫入失敗都不會知道`)
  })

  test('saveRegistration 寫入時真的帶著 w: majority', async () => {
    commands.length = 0
    await saveRegistration(db, { eventId: 'latte-art-11', customerId: 21 })
    const insert = commands.find(c => c.commandName === 'insert' && c.command.insert === 'registrations')
    assert.ok(insert, '要寫進 registrations 集合（insertOne）')
    assert.equal(insert.command.writeConcern?.w, 'majority',
      `送出的 insert 命令 writeConcern 是 ${JSON.stringify(insert.command.writeConcern)}：把 WRITE_CONCERNS.registration 放進 insertOne 的 { writeConcern } 選項`)
    const doc = await db.collection('registrations').findOne({ customerId: 21 }, { projection: { _id: 0 } })
    assert.deepEqual(doc, { eventId: 'latte-art-11', customerId: 21 }, '文件內容要是傳入的 { eventId, customerId }')
  })

  test('saveRegistration 讀的是 WRITE_CONCERNS.registration，不是另外寫死的設定', async () => {
    const original = { ...WRITE_CONCERNS.registration }
    Object.assign(WRITE_CONCERNS.registration, { wtimeoutMS: 4321 })   // 測試暫時改設定，看送出的命令有沒有跟著變
    try {
      commands.length = 0
      await saveRegistration(db, { eventId: 'cupping-12', customerId: 22 })
    } finally {
      for (const k of Object.keys(WRITE_CONCERNS.registration)) delete (WRITE_CONCERNS.registration as Record<string, unknown>)[k]
      Object.assign(WRITE_CONCERNS.registration, original)
    }
    const insert = commands.find(c => c.commandName === 'insert' && c.command.insert === 'registrations')
    assert.equal(insert?.command.writeConcern?.wtimeout, 4321,
      `WRITE_CONCERNS.registration 改了，送出的 writeConcern 卻是 ${JSON.stringify(insert?.command.writeConcern)}：insertOne 的 writeConcern 要直接用 WRITE_CONCERNS.registration，設定才只有一個地方要改`)
  })
})
