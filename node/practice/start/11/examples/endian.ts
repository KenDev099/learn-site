// 執行：node examples/endian.ts
// 同樣兩個位元組，用不同的位元組順序讀出不同的數字
import { Buffer } from 'node:buffer'

const two = Buffer.from([0x01, 0x2c])
console.log('BE（高位在前）', two.readUInt16BE(0))
console.log('LE（低位在前）', two.readUInt16LE(0))

const four = Buffer.alloc(4)
four.writeUInt32BE(3_000_000_000)
console.log(four, 'readUInt32BE =', four.readUInt32BE(0), 'readInt32BE =', four.readInt32BE(0))

try {
  Buffer.alloc(3).readUInt32BE(0)
} catch (err) {
  console.log('長度不夠：', (err as Error).name, (err as NodeJS.ErrnoException).code)
}
