// open 回傳 FileHandle，用完要 close；await using 離開區塊時自動 close
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const file = join(import.meta.dirname, '..', 'data', 'menu.json')

async function firstBytes(n: number) {
  await using fh = await open(file, 'r')
  const { bytesRead, buffer } = await fh.read(Buffer.alloc(n), 0, n, 0)
  console.log('檔案描述元（fd）：', fh.fd)
  return buffer.subarray(0, bytesRead).toString('utf8')
}   // ← 這裡自動呼叫 fh[Symbol.asyncDispose]()，也就是 fh.close()

console.log(JSON.stringify(await firstBytes(12)))
