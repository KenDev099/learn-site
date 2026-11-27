// 執行：node examples/bytes.ts
// 字串長度（UTF-16 單位）和 UTF-8 位元組數不一樣
import { Buffer } from 'node:buffer'

for (const s of ['latte', '拿鐵', '拿鐵☕', '😀']) {
  console.log(s, 'length =', s.length, '位元組 =', Buffer.byteLength(s), Buffer.from(s))
}

const buf = Buffer.from('拿鐵')
console.log('hex      ', buf.toString('hex'))
console.log('base64   ', buf.toString('base64'))
console.log('base64url', buf.toString('base64url'))
console.log('是 Uint8Array 嗎？', buf instanceof Uint8Array)

// subarray 不複製，和原本的 Buffer 共用同一塊記憶體
const head = buf.subarray(0, 3)
head[0] = 0x41
console.log('改了 head 之後的 buf：', buf)
