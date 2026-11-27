import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpDir } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
type Menu = { items: { name: string, price: number }[] }

async function load() {
  const mod: { loadMenu?: unknown, MenuLoadError?: unknown } = await import('./load-menu.ts')
  assert.equal(typeof mod.loadMenu, 'function', 'load-menu.ts 要 export async function loadMenu(path)')
  assert.equal(typeof mod.MenuLoadError, 'function', 'load-menu.ts 要 export class MenuLoadError')
  return { loadMenu: mod.loadMenu as (p: string) => Promise<Menu>, MenuLoadError: mod.MenuLoadError as new (...a: never[]) => Error }
}

// 呼叫 loadMenu(path)，要求它丟出 MenuLoadError，回傳那個錯誤
async function expectLoadError(path: string, what: string) {
  const { loadMenu, MenuLoadError } = await load()
  let result: unknown
  try {
    result = await loadMenu(path)
  } catch (err) {
    assert.ok(err instanceof MenuLoadError, `${what}時丟出的是 ${(err as Error)?.name}，要包成 MenuLoadError：throw new MenuLoadError(訊息, { cause: err })`)
    assert.ok(err.message.includes(path), `${what}時，MenuLoadError 的訊息要寫出是哪個檔案（包含完整路徑 ${path}），現在是「${err.message}」`)
    assert.ok(err.cause, `${what}時，MenuLoadError 要用 { cause: err } 保留原本的錯誤`)
    return err.cause as NodeJS.ErrnoException
  }
  assert.fail(`${what}時要丟出 MenuLoadError，不能回傳 ${JSON.stringify(result)}：吞掉這種錯誤，會讓壞掉的設定看起來像「菜單是空的」`)
}

test('正確的菜單檔：回傳檔案內容', opts, async () => {
  const { loadMenu } = await load()
  const dir = await tmpDir()
  const menu = { items: [{ name: '拿鐵', price: 100 + Math.floor(Math.random() * 50) }] }
  await writeFile(join(dir, 'menu.json'), JSON.stringify(menu))
  assert.deepEqual(await loadMenu(join(dir, 'menu.json')), menu, '要回傳 JSON.parse 之後的內容')
})

test('檔案不存在（ENOENT）：回傳 { items: [] }', opts, async () => {
  const { loadMenu } = await load()
  const dir = await tmpDir()
  assert.deepEqual(await loadMenu(join(dir, 'nope.json')), { items: [] }, '檔案不存在要回傳 { items: [] }，不要丟錯')
  assert.deepEqual(await loadMenu(join(dir, 'no-such-dir', 'menu.json')), { items: [] }, '資料夾不存在也是 ENOENT，要回傳 { items: [] }')
})

test('沒有讀取權限（EACCES）：丟出 MenuLoadError，cause.code 是 EACCES', opts, async () => {
  const dir = await tmpDir()
  const file = join(dir, 'locked.json')
  await writeFile(file, '{"items":[]}')
  await chmod(file, 0o000)
  try {
    const cause = await expectLoadError(file, '沒有讀取權限')
    assert.equal(cause.code, 'EACCES', `cause 要是 readFile 丟出的原本錯誤（code EACCES），現在是 ${cause.code ?? cause}`)
  } finally {
    await chmod(file, 0o644)
  }
})

test('路徑是資料夾（EISDIR）：丟出 MenuLoadError，cause.code 是 EISDIR', opts, async () => {
  const dir = await tmpDir()
  await mkdir(join(dir, 'menu.json'))
  const cause = await expectLoadError(join(dir, 'menu.json'), '路徑是資料夾')
  assert.equal(cause.code, 'EISDIR', `cause 要是 readFile 丟出的原本錯誤（code EISDIR），現在是 ${cause.code ?? cause}`)
})

test('JSON 格式錯：丟出 MenuLoadError，cause 是 SyntaxError', opts, async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, 'menu.json'), '{"items": [')
  const cause = await expectLoadError(join(dir, 'menu.json'), 'JSON 格式錯')
  assert.ok(cause instanceof SyntaxError, `cause 要是 JSON.parse 丟出的 SyntaxError，現在是 ${(cause as Error)?.name}`)
})

test('直接讀檔，不先檢查檔案在不在', opts, async () => {
  const code = (await readFile(join(import.meta.dirname, 'load-menu.ts'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(code, /\b(exists|existsSync|access|accessSync|stat|statSync|lstat)\s*\(/, '先檢查存在再讀，中間檔案可能被刪掉或換掉（TOCTOU），而且其他錯誤還是要處理：拿掉檢查，直接 readFile，在 catch 裡看 err.code === \'ENOENT\'')
})
