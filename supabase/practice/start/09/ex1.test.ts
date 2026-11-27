// 練習 1：你的攻擊測試要在「還沒修」的版本抓到每一個漏洞，在「修好」的版本全部通過
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUser, deleteUsers, dropTaskSchema, requireStack, type TestUser } from '../../helpers/supa.ts'
import { bucketOf, deploy, dropStorage, loginClient, seed } from './harness.ts'
import * as probes from './probes.ts'

const dir = import.meta.dirname
const names = ['reportLeaks', 'selfPromote', 'canPlantReceipt', 'spendExposed'] as const
type Result = Record<typeof names[number], boolean | string>
let a: TestUser, b: TestUser, schema: string | undefined
const found: { buggy?: Result, fixed?: Result } = {}

const BASELINE = readFileSync(join(dir, 'migrations', '20261120090000_cafe_orders.sql'), 'utf8')
// 判分用的「修好的版本」（練習 2 的一種解法；看了就失去練習 2 的意義）
const FIXED = `
alter view public.order_report set (security_invoker = true);
alter policy "店員讀全部訂單" on public.orders using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'staff');
alter policy "收據：顧客上傳" on storage.objects with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter function public.customer_spend(uuid) security invoker;`

async function attack(sources: { name: string, text: string }[]): Promise<Result> {
  schema = await deploy(dir, sources)
  await seed(dir, schema, a, b)
  const ctx = { a: await loginClient(schema, a), b: await loginClient(schema, b), aId: a.id, bId: b.id, bucket: bucketOf(dir) }
  const result = {} as Result
  for (const n of names) {
    try { result[n] = await probes[n](ctx) } catch (e: any) { result[n] = `丟出錯誤：${e.message}` }
  }
  return result
}

before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth', 'storage'])
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
  found.buggy = await attack([{ name: '20261120090000_cafe_orders.sql', text: BASELINE }])
  found.fixed = await attack([{ name: '20261120090000_cafe_orders.sql', text: BASELINE }, { name: '判分用的修正', text: FIXED }])
})
after(async () => {
  await dropStorage(dir)
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const why: Record<typeof names[number], string> = {
  reportLeaks: '用 ctx.b 讀 order_report，看結果裡有沒有 customer_id 是 ctx.aId 的列',
  selfPromote: '用 ctx.b.auth.updateUser 在自己的 user_metadata 寫 role: staff，refreshSession() 拿到新的 token，再讀 orders，看得到 A 的訂單就是漏洞',
  canPlantReceipt: '用 ctx.b 上傳一個檔案到 `${ctx.aId}/…`，沒有 error 就是漏洞',
  spendExposed: '用 ctx.b 呼叫 rpc(\'customer_spend\', { customer: ctx.aId })，拿到大於 0 的數字就是漏洞',
}

for (const n of names) {
  test(`${n}：在還沒修的版本回傳 true，修好的版本回傳 false`, () => {
    assert.equal(found.buggy![n], true, `還沒修的版本裡這個漏洞存在，${n} 卻回傳 ${JSON.stringify(found.buggy![n])}。${why[n]}`)
    assert.equal(found.fixed![n], false, `修好的版本裡已經沒有這個漏洞，${n} 卻回傳 ${JSON.stringify(found.fixed![n])}：攻擊測試要真的去做那個攻擊，而不是檢查一般的操作。${why[n]}`)
  })
}
