import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'

const hello = join(import.meta.dirname, 'hello.ts')
const opts = { timeout: 15_000 }

test('有名字：印出「☕ <名字>，歡迎光臨！（Node <版本>）」', opts, async () => {
  const name = ['小明', '美華', '志豪', '雅婷'][Math.floor(Math.random() * 4)] + Math.floor(Math.random() * 100)
  const r = await runNode(hello, { args: [name] })
  assert.equal(r.code, 0, `程式出錯了，stderr：${r.stderr}`)
  assert.equal(r.stdout, `☕ ${name}，歡迎光臨！（Node ${process.version}）\n`, `執行 node hello.ts ${name} 時，名字要用 process.argv[2]、版本要用 process.version，而且只能印這一行`)
})

test('沒有名字：印出「☕ 歡迎光臨！（Node <版本>）」', opts, async () => {
  const r = await runNode(hello)
  assert.equal(r.code, 0, `程式出錯了，stderr：${r.stderr}`)
  assert.equal(r.stdout, `☕ 歡迎光臨！（Node ${process.version}）\n`, '沒給名字時 process.argv[2] 是 undefined，要印沒有名字的版本')
})

test('名字裡有空白（用引號包起來當成一個參數）也要整個印出來', opts, async () => {
  const r = await runNode(hello, { args: ['王 小明'] })
  assert.equal(r.stdout, `☕ 王 小明，歡迎光臨！（Node ${process.version}）\n`, '名字要用 process.argv[2] 整個拿出來，不要自己切開或只取一部分')
})

test('版本用 process.version 取得，不要把版本號寫死在程式裡', opts, async () => {
  const src = await readFile(hello, 'utf8')
  assert.doesNotMatch(src, /\d+\.\d+\.\d+/, 'hello.ts 裡出現了像 24.22.1 的版本號：換一台電腦或升級 Node 就錯了，改用 process.version')
})
