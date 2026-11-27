// 執行：node examples/split.ts
// 「拿鐵」6 個位元組，從第 4 個位元組切開，模擬資料分兩段到達
import { Buffer, isUtf8 } from 'node:buffer'
import { StringDecoder } from 'node:string_decoder'

const bytes = Buffer.from('拿鐵')
const chunks = [bytes.subarray(0, 4), bytes.subarray(4)]

console.log('每段各自 toString：', chunks.map(c => c.toString()).join(''))
console.log('第一段是完整的 UTF-8 嗎？', isUtf8(chunks[0]))

const sd = new StringDecoder('utf8')
console.log('StringDecoder：', chunks.map(c => sd.write(c)).join('') + sd.end())

const td = new TextDecoder()
console.log('TextDecoder stream：', chunks.map(c => td.decode(c, { stream: true })).join('') + td.decode())

console.log('先 concat 再解碼：', Buffer.concat(chunks).toString())
