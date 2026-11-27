// 一邊存大檔、一邊不停讀：比較「直接 writeFile」和「暫存檔 + rename」
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'torn-'))
const file = join(dir, 'orders.json')
const orders = Array.from({ length: 40_000 }, (_, i) => ({ id: i + 1, item: '拿鐵', note: 'x'.repeat(80) }))

async function direct(data: unknown) {
  await writeFile(file, JSON.stringify(data))
}
async function atomic(data: unknown) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(data))
  await rename(tmp, file)
}

for (const [name, save] of [['直接 writeFile', direct], ['暫存檔 + rename', atomic]] as const) {
  await save(orders)
  let done = false, ok = 0, broken = 0
  const reader = (async () => {
    while (!done) {
      try { JSON.parse(await readFile(file, 'utf8')); ok++ } catch { broken++ }
    }
  })()
  for (let i = 0; i < 20; i++) await save(orders)
  done = true
  await reader
  console.log(`${name}：讀了 ${ok + broken} 次，壞掉 ${broken} 次`)
}
await rm(dir, { recursive: true })
