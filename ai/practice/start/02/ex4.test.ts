import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from './ex4.ts'

test('沒有 ANTHROPIC_API_KEY：丟出說明怎麼設定的錯誤', () => {
  assert.throws(() => createClient({}), /ANTHROPIC_API_KEY/, '缺少 key 時要丟出 Error，訊息提到 ANTHROPIC_API_KEY（例如「請在 .env 設定 ANTHROPIC_API_KEY」）；不要退回寫死的 key')
  assert.throws(() => createClient({}), /\.env|secret|環境變數/i, '錯誤訊息要說在哪裡設定（.env、環境變數或部署平台的 secret），看到訊息的人才知道怎麼修')
})

test('ANTHROPIC_API_KEY 是空字串：也要丟錯', () => {
  assert.throws(() => createClient({ ANTHROPIC_API_KEY: '' }), /ANTHROPIC_API_KEY/, '空字串不是有效的 key：.env 寫了 ANTHROPIC_API_KEY= 卻沒填值時要擋下來，用 !key 判斷')
})

test('有 key：timeout 30 秒（30000 毫秒）、maxRetries 2', () => {
  const client = createClient({ ANTHROPIC_API_KEY: 'sk-test-from-env' })
  assert.equal(client.apiKey, 'sk-test-from-env', 'apiKey 要用 env.ANTHROPIC_API_KEY')
  assert.equal(client.timeout, 30_000, 'TypeScript SDK 的 timeout 單位是毫秒：30 秒要寫 30_000')
  assert.equal(client.maxRetries, 2, 'maxRetries 要是 2')
})

test('只讀參數 env，不讀 process.env', () => {
  const saved = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'sk-from-process-env'
  try {
    assert.equal(createClient({ ANTHROPIC_API_KEY: 'sk-from-param' }).apiKey, 'sk-from-param', 'key 要從參數 env 拿，不是 process.env：把 apiKey 明確傳給 new Anthropic()')
    assert.throws(() => createClient({}), /ANTHROPIC_API_KEY/, '參數 env 沒有 key 時要丟錯，即使 process.env 有（不要讀 process.env，也不要讓 SDK 自己去讀）')
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})
