import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const opts = { timeout: 30_000 }   // codegen 一次要幾秒
const here = import.meta.dirname
const bin = (name: string) => join(here, '../../node_modules/.bin', name)
const gen = (f: string) => join(here, 'src/gql', f)

async function codegen(cwd: string) {
  try {
    await run(bin('graphql-codegen'), ['--config', 'codegen.ts'], { cwd, encoding: 'utf8' })
    return null
  } catch (e) {
    const err = e as { stdout?: string, stderr?: string, message: string }
    return `${err.stdout ?? ''}\n${err.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '').trim() || err.message
  }
}

test('graphql-codegen 依 codegen.ts 產生 src/gql/', opts, async () => {
  // 先清掉舊的產生檔：codegen 不會刪除已經不該存在的檔案，舊檔留著會讓錯的設定看起來是對的
  rmSync(join(here, 'src/gql'), { recursive: true, force: true })
  const failed = await codegen(here)
  assert.equal(failed, null, `graphql-codegen 失敗了，輸出：\n${failed?.slice(0, 1200)}\n檢查 codegen.ts 的 schema、documents、generates，以及 .graphql 裡的欄位是否都在 schema.graphql 裡`)
  for (const f of ['graphql.ts', 'gql.ts', 'index.ts', 'persisted-documents.json']) {
    assert.ok(existsSync(gen(f)), `src/gql/${f} 不存在：generates 的鍵要是 'src/gql/'、preset 用 'client'，persisted-documents.json 要在 presetConfig 設 persistedDocuments: true`)
  }
})

test('產生的程式可以直接用 Node 執行，而且每份操作都有 Document', opts, async () => {
  let mod: Record<string, any>
  try {
    mod = await import(new URL('./src/gql/index.ts', import.meta.url).href)
  } catch (e) {
    const msg = (e as Error).message
    const hint = /graphql-typed-document-node/.test(msg) ? "config 要設 useTypeImports: true（只有型別的套件要寫成 import type，執行時才不會去載入它）"
      : /Cannot find module/.test(msg) ? "config 要設 importExtension: '.ts'（Node 執行 .ts 時 import 要寫副檔名）"
      : '看錯誤訊息修 codegen.ts 的 config'
    assert.fail(`Node 載入 src/gql/index.ts 失敗：${msg.split('\n')[0]}\n${hint}`)
  }
  const graphql = await import(new URL('./src/gql/graphql.ts', import.meta.url).href)
  for (const name of ['MenuDocument', 'OrderHistoryDocument', 'PlaceOrderDocument', 'UpdateOrderStatusDocument']) {
    assert.equal(graphql[name]?.kind, 'Document', `src/gql/graphql.ts 沒有 ${name}：documents 要包含 src 底下所有的 .graphql（例如 'src/**/*.graphql'），而且 src/orderHistory.graphql 的操作要叫 OrderHistory`)
  }
  assert.equal(typeof mod.graphql, 'function', 'index.ts 要匯出 client preset 的 graphql() 函式')
})

test('OrderHistory 的結果與變數有正確的型別', opts, async () => {
  const file = join(here, '.codegen-types.check.ts')
  const source = `
import type { ResultOf, VariablesOf } from '@graphql-typed-document-node/core'
import { OrderHistoryDocument } from './src/gql/graphql.ts'
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type Expect<T extends true> = T
type Data = ResultOf<typeof OrderHistoryDocument>
type Vars = VariablesOf<typeof OrderHistoryDocument>
type Customer = NonNullable<Data['customer']>
type Node = Customer['orders']['edges'][number]['node']
export type T1 = Expect<Equal<Data['customer'] extends null ? 1 : null extends Data['customer'] ? 2 : 3, 2>>
export type T2 = Expect<Equal<Node['total'], number>>
export type T3 = Expect<Equal<Node['orderedAt'], string>>
export type T4 = Expect<Equal<Node['id'], string>>
export type T5 = Expect<Equal<Node['status'], 'PREPARING' | 'READY' | 'PICKED_UP'>>
export type T6 = Expect<Equal<Customer['orders']['pageInfo'], { hasNextPage: boolean, endCursor: string | null }>>
export type T7 = Expect<Equal<Vars['first'], number | null | undefined>>
export type T8 = Expect<Equal<Vars['customerId'], string | number>>
export type T9 = Expect<Equal<Customer['name'], string>>
`
  writeFileSync(file, source)
  let out = ''
  try {
    await run(bin('tsc'), ['--ignoreConfig', '--noEmit', '--strict', '--target', 'esnext', '--module', 'nodenext', '--allowImportingTsExtensions',
      '--verbatimModuleSyntax', '--skipLibCheck', '--types', 'node', file], { cwd: here, encoding: 'utf8' })
  } catch (e) {
    out = ((e as { stdout?: string }).stdout ?? (e as Error).message).trim()
  } finally {
    rmSync(file, { force: true })
  }
  const lines = out.split('\n').filter(Boolean)
  // 錯誤的行號對回是哪一個 T
  const rows = source.split('\n')
  const which = [...out.matchAll(/check\.ts\((\d+),/g)].map(m => Number(rows[Number(m[1]) - 1].match(/^export type T(\d)/)?.[1]))
  const tips: Record<number, string> = {
    1: 'customer 要是可以為 null（查不到顧客）',
    2: 'node.total 要是 number', 3: 'node.orderedAt 要是 string', 4: 'node.id 要選，型別是 string',
    5: "node.status 要選，型別是 'PREPARING' | 'READY' | 'PICKED_UP'",
    6: 'orders 要選 pageInfo { hasNextPage endCursor }', 7: '要有變數 $first: Int（可省略，型別 number | null | undefined）',
    8: '要有變數 $customerId: ID!', 9: 'customer 要選 name',
  }
  assert.equal(lines.length, 0, `型別不符合要求：\n${[...new Set(which)].map(n => tips[n]).filter(Boolean).join('\n') || lines.slice(0, 5).join('\n')}\n照題目的形狀寫 src/orderHistory.graphql：customer(id: $customerId) { id name orders(first: $first) { edges { cursor node { id orderedAt total status } } pageInfo { hasNextPage endCursor } } }`)
})

test('persisted-documents.json 的鍵是查詢文字的 sha256', opts, () => {
  assert.ok(existsSync(gen('persisted-documents.json')), 'src/gql/persisted-documents.json 不存在：presetConfig 設 persistedDocuments: true')
  const docs: Record<string, string> = JSON.parse(readFileSync(gen('persisted-documents.json'), 'utf8'))
  const entries = Object.entries(docs)
  assert.equal(entries.length, 4, `應該有 4 份操作（src 底下的 Menu、OrderHistory、PlaceOrder、UpdateOrderStatus），實際 ${entries.length} 份`)
  assert.ok(entries.some(([, q]) => /^query OrderHistory\b/.test(q)), '清單裡要有 query OrderHistory')
  for (const [key, query] of entries) {
    assert.equal(key, 'sha256:' + createHash('sha256').update(query).digest('hex'), `鍵 ${key} 要是 'sha256:' 加上查詢文字的 sha256`)
  }
})

test('.graphql 裡選了 schema 沒有的欄位時，codegen 要失敗', opts, async () => {
  // 複製到 practice/node_modules/.cache 底下的暫存資料夾，加一個拼錯欄位的檔案，不影響 work/07
  const base = join(here, '../../node_modules/.cache/learn-api-styles')
  mkdirSync(base, { recursive: true })
  const tmp = mkdtempSync(join(base, 'codegen-07-'))
  try {
    cpSync(join(here, 'codegen.ts'), join(tmp, 'codegen.ts'))
    cpSync(join(here, 'schema.graphql'), join(tmp, 'schema.graphql'))
    mkdirSync(join(tmp, 'src/extra'), { recursive: true })
    for (const f of readdirSync(join(here, 'src')).filter(f => f.endsWith('.graphql'))) cpSync(join(here, 'src', f), join(tmp, 'src', f))
    writeFileSync(join(tmp, 'src/extra/typo.graphql'), 'query Typo { menu { id nmae price } }\n')
    const failed = await codegen(tmp)
    assert.ok(failed, 'src/extra/typo.graphql 選了不存在的欄位 nmae，codegen 卻成功了：documents 要用 glob 涵蓋 src 底下（含子資料夾）所有的 .graphql，例如 src/**/*.graphql')
    assert.match(failed, /nmae/, `codegen 失敗的原因應該是欄位 nmae 不存在，實際輸出：\n${failed.slice(0, 600)}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
