import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const opts = { timeout: 15_000 }
type Decoder = { push(chunk: Buffer): string[], end(): string[] }

async function load() {
  const mod: { LineDecoder?: unknown } = await import('./line-decoder.ts')
  assert.equal(typeof mod.LineDecoder, 'function', 'line-decoder.ts 要 export class LineDecoder')
  return mod.LineDecoder as new () => Decoder
}

const words = ['拿鐵', '美式咖啡', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕', '☕', '😀', 'latte', 'x', '']
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]
function randomLines(n: number) {
  return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => pick(words)).join(' ').trim())
}
// 把 bytes 在指定的位置切開
const cut = (bytes: Buffer, at: number[]) => [0, ...at, bytes.length].slice(1).map((end, i, ends) => bytes.subarray(i ? ends[i - 1] : 0, end))

function feed(LineDecoder: new () => Decoder, chunks: Buffer[]) {
  const d = new LineDecoder()
  const out: string[] = []
  for (const c of chunks) out.push(...d.push(c))
  out.push(...d.end())
  return out
}

test('多位元組字元被切在兩段之間也能正確解碼', opts, async () => {
  const LineDecoder = await load()
  const lines = randomLines(3).map(l => l + ' 拿鐵😀')
  const bytes = Buffer.from(lines.join('\n') + '\n')
  for (let at = 1; at < bytes.length; at++) {
    const got = feed(LineDecoder, cut(bytes, [at]))
    assert.deepEqual(got, lines, `從第 ${at} 個位元組切開時結果不對。每段各自 toString() 會把切開的字變成 �；用 StringDecoder 或 TextDecoder 的 { stream: true } 解碼`)
  }
})

test('一個位元組一段、隨機切段都能拼回原本的每一行', opts, async () => {
  const LineDecoder = await load()
  const lines = randomLines(20)
  const bytes = Buffer.from(lines.join('\n') + '\n')
  const oneByOne = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1)
  assert.deepEqual(feed(LineDecoder, cut(bytes, oneByOne)), lines, '每次只送一個位元組時結果不對')
  for (let round = 0; round < 50; round++) {
    const at = oneByOne.filter(() => Math.random() < 0.2)
    assert.deepEqual(feed(LineDecoder, cut(bytes, at)), lines, `在 ${at.join(', ')} 切段時結果不對`)
  }
})

test('\\r\\n 和 \\n 混用：行尾不能留下 \\r', opts, async () => {
  const LineDecoder = await load()
  const lines = randomLines(10).map(l => ` ${l} `)   // 前後的空白是資料的一部分，要保留
  const text = lines.map((l, i) => l + (i % 2 ? '\r\n' : '\n')).join('')
  const bytes = Buffer.from(text)
  for (let at = 1; at < bytes.length; at += 3) {
    assert.deepEqual(feed(LineDecoder, cut(bytes, [at])), lines, 'Windows 的換行是 \\r\\n，切行後要把行尾的 \\r 去掉（\\r 和 \\n 可能分在兩段）；只去掉 \\r，行裡前後的空白要保留，不能用 trim()')
  }
})

test('push 當下就回傳已經完整的行，最後一行沒有換行時由 end() 回傳', opts, async () => {
  const LineDecoder = await load()
  const [a, b, c] = randomLines(3).map(l => l + '拿鐵')
  const d = new LineDecoder()
  assert.deepEqual(d.push(Buffer.from(a + '\n' + b.slice(0, 1))), [a], 'push 的資料裡有完整的一行時，要在這次 push 就回傳，不能等到 end()')
  assert.deepEqual(d.push(Buffer.from(b.slice(1) + '\n')), [b], '第二行完整時，第二次 push 要回傳它')
  assert.deepEqual(d.push(Buffer.from(c)), [], '還沒遇到換行的部分先留著，不能回傳')
  assert.deepEqual(d.end(), [c], 'end() 要回傳最後沒有換行的那一行')
  const e = new LineDecoder()
  e.push(Buffer.from(a + '\n'))
  assert.deepEqual(e.end(), [], '資料以換行結尾時，end() 回傳 []')
})

test('資料在字的中間結束：end() 要把解碼器裡剩下的位元組也交出來，不能默默丟掉', opts, async () => {
  const LineDecoder = await load()
  const [a] = randomLines(1)
  const bytes = Buffer.from(a + '\n拿鐵')
  const d = new LineDecoder()
  assert.deepEqual(d.push(bytes.subarray(0, bytes.length - 1)), [a], '第一行完整時要在 push 就回傳')
  assert.deepEqual(d.end(), ['拿\uFFFD'], '最後「鐵」只到了 2 個位元組：end() 要呼叫解碼器的 end()（或 TextDecoder 不帶參數的 decode()）把它們解成 �，資料壞了才看得出來')
})
