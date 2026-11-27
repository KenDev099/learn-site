// 暫存資料夾：測試檔結束時自動刪掉
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'

export async function tmpDir() {
  const dir = await mkdtemp(join(tmpdir(), 'learn-node-'))
  after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

// 在暫存資料夾寫好一組檔案（{ 'a.ts': '…' }），回傳資料夾路徑；自動加上 package.json {"type":"module"}
export async function tmpProject(files: Record<string, string>) {
  const dir = await tmpDir()
  await writeFile(join(dir, 'package.json'), '{ "type": "module" }\n')
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}
