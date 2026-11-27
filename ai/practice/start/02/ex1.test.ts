import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { message, text, thinking } from '../../helpers/replies.ts'
import { ask } from './ex1.ts'

// 請求裡的 content 可以是字串，也可以是 [{ type: 'text', text }]：都轉成字串比較
const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined

test('回傳所有 text block 接起來的文字（content 第一個是 thinking block）', async () => {
  const { client } = fakeAnthropic([message([thinking(), text('拿鐵'), text(' 110 元')])])
  const answer = await ask(client, '拿鐵多少錢？')
  assert.equal(answer, '拿鐵 110 元', 'content 是 [thinking, text, text]：要過濾 type === "text" 的 block 再全部接起來，不能只讀 content[0] 或第一個 text block')
})

test('換一組回應也對（不是寫死答案）', async () => {
  const { client } = fakeAnthropic([message([thinking(), text('週一到週五 07:00 開門')])])
  assert.equal(await ask(client, '幾點開門？'), '週一到週五 07:00 開門')
})

test('請求：model、max_tokens 預設 16000、只有一則 user 訊息、沒有 temperature', async () => {
  const { client, requests } = fakeAnthropic([message([text('好')])])
  await ask(client, '可頌還有嗎？')
  assert.equal(requests.length, 1, '要用傳進來的 client 剛好呼叫一次 client.messages.create')
  const body = requests[0].body
  assert.equal(body.model, 'claude-opus-5-5', 'model 要用 MODEL（claude-opus-5-5，不加日期）')
  assert.equal(body.max_tokens, 16000, '沒傳 maxTokens 時 max_tokens 要是 16000：Opus 5.5 的思考也算在 max_tokens 裡，設太小會被截斷')
  assert.equal(body.messages.length, 1, 'messages 只要一則')
  assert.equal(body.messages[0].role, 'user', '第一則訊息的 role 要是 user')
  assert.equal(plain(body.messages[0].content), '可頌還有嗎？', 'user 訊息的內容就是 question，不要加別的文字')
  for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in body, false, `不要送 ${k}：API 版本 2026-10-21 起送了就回 400`)
  assert.equal('system' in body, false, '沒有傳 system 時，請求裡不要有 system 欄位')
})

test('有傳 maxTokens 時用傳入的值', async () => {
  const { client, requests } = fakeAnthropic([message([text('好')])])
  await ask(client, '你好', { maxTokens: 2000 })
  assert.equal(requests[0].body.max_tokens, 2000, 'opts.maxTokens 有值時，max_tokens 要用它')
})

test('system 放在 system 欄位，不接在 user 訊息裡', async () => {
  const { client, requests } = fakeAnthropic([message([text('好')])])
  await ask(client, '推薦一杯', { system: '你是咖啡店店員，回答一句話。' })
  const body = requests[0].body
  assert.equal(plain(body.system), '你是咖啡店店員，回答一句話。', 'opts.system 要放在請求的 system 欄位')
  assert.equal(plain(body.messages[0].content), '推薦一杯', 'system 的文字不要接進 user 訊息：使用者的內容和你的規則要分開')
})

test('程式碼裡沒有 API key', () => {
  const src = readFileSync(new URL('./ex1.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /sk-ant-/, '不要把 API key（sk-ant-…）寫進程式碼：放在環境變數，client 由呼叫的人傳進來')
})
