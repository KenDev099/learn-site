// 列出資料夾：readdir、stat、glob
import { glob, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
for (const entry of await readdir(root, { withFileTypes: true })) {
  console.log(entry.isDirectory() ? '資料夾' : '檔案  ', entry.name)
}
const info = await stat(join(root, 'data', 'menu.json'))
console.log('menu.json 大小', info.size, '位元組，修改時間', info.mtime.toISOString())
for await (const f of glob('**/*.json', { cwd: root })) console.log('glob 找到', f)
