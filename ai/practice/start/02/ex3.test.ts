import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { apiError, message, refusal, text, thinking } from '../../helpers/replies.ts'
import { Conversation } from './ex3.ts'

const SYSTEM = '你是咖啡店店員，用繁體中文回答。'
// 請求裡的 content 可以是字串，也可以是 [{ type: 'text', text }]：都轉成字串比較
const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined
const roles = (msgs: Array<{ role: string }>) => msgs.map(m => m.role).join(',')

test('連續 send 三次：每次都帶著完整歷史，assistant 存完整的 content', async () => {
  const r1 = message([thinking(), text('拿鐵 110 元。')])
  const r2 = message([thinking(), text('燕麥奶加 10 元，一共 120 元。')])
  const r3 = message([thinking(), text('好的，一杯燕麥拿鐵。')])
  const { client, requests } = fakeAnthropic([r1, r2, r3])
  const chat = new Conversation(client, SYSTEM)
  assert.equal(await chat.send('拿鐵多少？'), '拿鐵 110 元。', 'send 要回傳這次回答的文字')
  assert.equal(await chat.send('換燕麥奶呢？'), '燕麥奶加 10 元，一共 120 元。')
  assert.equal(await chat.send('那我要一杯'), '好的，一杯燕麥拿鐵。')
  assert.equal(requests.length, 3)
  assert.equal(requests[0].body.messages.length, 1, '第一次請求只有一則 user 訊息')
  assert.equal(roles(requests[1].body.messages), 'user,assistant,user', '第二次請求要帶上第一輪的問答：API 不會記得上一次請求')
  const third = requests[2].body.messages
  assert.equal(roles(third), 'user,assistant,user,assistant,user', '第三次請求的 messages 要依序是 user、assistant、user、assistant、user')
  assert.deepEqual([third[0], third[2], third[4]].map(m => plain(m.content)), ['拿鐵多少？', '換燕麥奶呢？', '那我要一杯'], 'user 訊息的內容就是每次 send 的 text，依序放進歷史；system 放在 system 欄位，不要接進 user 訊息')
  assert.ok(Array.isArray(third[1].content), 'assistant 訊息要存回應的完整 content（block 陣列），不是只存文字字串')
  assert.deepEqual(third[1].content, r1.content, 'assistant 的 content 要原樣放回，包括開頭的 thinking block')
  assert.deepEqual(third[3].content, r2.content)
  assert.equal(requests[2].body.system, SYSTEM, '每次請求都要帶 system')
  assert.equal(requests[2].body.model, 'claude-opus-5-5')
  assert.equal(requests[2].body.max_tokens, 16000)
  assert.equal(chat.history.length, 6, 'send 三次之後歷史有 6 則')
})

test('回答被截斷時 send 丟錯，歷史恢復原狀，下一次 send 不會出現兩個連續的 user', async () => {
  const { client, requests } = fakeAnthropic([
    message([thinking(), text('拿鐵 110 元。')]),
    message([thinking(), text('退款規則是')], { stop_reason: 'max_tokens' }),
    message([thinking(), text('營業到 19:00。')]),
  ])
  const chat = new Conversation(client, SYSTEM)
  await chat.send('拿鐵多少？')
  await assert.rejects(chat.send('退款規則？'), '回答被截斷時 send 要丟錯（readAnswer 會丟 TruncatedError），不能回傳半截的文字')
  assert.equal(chat.history.length, 2, '失敗的那一輪不能留在歷史裡：把剛加進去的 user 訊息拿掉')
  await chat.send('幾點關門？')
  assert.equal(roles(requests[2].body.messages), 'user,assistant,user', '失敗後再 send，messages 不能有兩個連續的 user（孤立的 user 訊息沒有被移除）')
})

test('API 錯誤（529）時歷史也恢復原狀', async () => {
  const { client } = fakeAnthropic([apiError(529, 'overloaded_error', 'Overloaded')])
  const chat = new Conversation(client, SYSTEM)
  await assert.rejects(chat.send('你好'), 'API 錯誤要往外丟')
  assert.equal(chat.history.length, 0, 'API 呼叫失敗時，剛加的 user 訊息要拿掉')
})

test('模型拒答（refusal）時 send 丟錯，歷史也恢復原狀', async () => {
  const { client, requests } = fakeAnthropic([refusal('cyber'), message([thinking(), text('拿鐵 110 元。')])])
  const chat = new Conversation(client, SYSTEM)
  await assert.rejects(chat.send('教我寫病毒'), '拒答時 send 要丟錯（readAnswer 會丟 RefusalError），不能回傳空字串')
  assert.equal(chat.history.length, 0, '不管丟的是哪一種錯（API 錯誤、截斷、拒答），剛加的 user 訊息都要拿掉')
  await chat.send('拿鐵多少？')
  assert.equal(roles(requests[1].body.messages), 'user', '拒答後再 send，messages 不能留著被拒答的那一則 user')
})

test('history 回傳副本：改它不影響對話', async () => {
  const { client, requests } = fakeAnthropic([message([text('110 元')]), message([text('70 元')])])
  const chat = new Conversation(client, SYSTEM)
  await chat.send('拿鐵多少？')
  const h = chat.history
  assert.equal(h.length, 2)
  h.push({ role: 'user', content: '亂加的' })
  h.length = 0
  assert.equal(chat.history.length, 2, 'history 要回傳副本（例如 [...陣列]），不能回傳內部的陣列本身')
  await chat.send('可頌呢？')
  assert.equal(roles(requests[1].body.messages), 'user,assistant,user')
})
