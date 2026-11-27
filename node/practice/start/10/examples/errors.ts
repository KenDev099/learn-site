// 故意製造常見的 fs 錯誤，印出 err.code
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'fs-errors-'))
await writeFile(join(dir, 'menu.json'), '{}')
await mkdir(join(dir, 'images'))

const tries: [string, () => Promise<unknown>][] = [
  ['讀不存在的檔案        ', () => readFile(join(dir, 'nope.json'))],
  ['把資料夾當檔案讀      ', () => readFile(join(dir, 'images'))],
  ['把檔案當資料夾        ', () => readFile(join(dir, 'menu.json', 'x'))],
  ["'wx' 開已經存在的檔案 ", () => open(join(dir, 'menu.json'), 'wx')],
  ['建立已經存在的資料夾  ', () => mkdir(join(dir, 'images'))],
]
for (const [what, run] of tries) {
  try {
    await run()
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    console.log(what, e.code, '|', e.message)
  }
}
await rm(dir, { recursive: true })
