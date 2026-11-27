// 20 個請求同時「讀出 → 加 1 → 寫回」同一個計數檔
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'lost-'))
const file = join(dir, 'count.json')
await writeFile(file, JSON.stringify({ count: 0 }))

async function increment() {
  const data = JSON.parse(await readFile(file, 'utf8'))   // 讀出
  data.count += 1                                         // 修改
  await writeFile(file, JSON.stringify(data))             // 寫回
}

await Promise.all(Array.from({ length: 20 }, () => increment()))
console.log('加了 20 次，結果是', JSON.parse(await readFile(file, 'utf8')).count)
await rm(dir, { recursive: true })
