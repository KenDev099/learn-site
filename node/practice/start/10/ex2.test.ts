import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const code = async () => (await readFile(join(import.meta.dirname, 'print-menu.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// 把 print-menu.ts 複製到 <暫存>/app/，旁邊放一份隨機的 data/menu.json
async function setup() {
  const root = await tmpDir()
  const app = join(root, 'app')
  await mkdir(join(app, 'data'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{ "type": "module" }\n')
  await copyFile(join(import.meta.dirname, 'print-menu.ts'), join(app, 'print-menu.ts'))
  const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'].sort(() => Math.random() - 0.5).slice(0, 3)
  const items = names.map(name => ({ name, price: 50 + Math.floor(Math.random() * 15) * 10 }))
  await writeFile(join(app, 'data', 'menu.json'), JSON.stringify({ items }))
  return { root, app, want: items.map(i => `${i.name} ${i.price}\n`).join('') }
}

for (const where of ['上一層資料夾', '完全無關的資料夾', '程式所在的資料夾']) {
  test(`從${where}執行 print-menu.ts，都印出旁邊 data/menu.json 的菜單`, opts, async () => {
    const { root, app, want } = await setup()
    const cwd = where === '上一層資料夾' ? root : where === '程式所在的資料夾' ? app : await tmpDir()
    const r = await runNode(join(app, 'print-menu.ts'), { cwd })
    assert.equal(r.code, 0, `從${where}執行就出錯了：相對路徑是從「工作目錄」算，不是從程式檔算。用 import.meta.dirname 組路徑。\n${r.stderr.split('\n').filter(l => !/^\s+at /.test(l)).slice(0, 6).join('\n')}`)
    assert.equal(r.stdout, want, '要印出 print-menu.ts 旁邊 data/menu.json 的內容，一行一個「品名 價格」')
  })
}

test('路徑不從 process.cwd() 組', opts, async () => {
  assert.doesNotMatch(await code(), /process\.cwd\s*\(/, 'process.cwd() 就是工作目錄，換個資料夾執行就錯；用 import.meta.dirname')
})
