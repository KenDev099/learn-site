import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, readFile } from 'node:fs/promises'
import { basename, delimiter, dirname, join } from 'node:path'
import { run, runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const shop = join(import.meta.dirname, 'shop')
const opts = { timeout: 60_000 }
// 題目附的 latte-art-1.2.0.tgz 的 sha512
const LATTE_ART = 'sha512-7zDR2fJZC2478417ZDjD760eaNojng1CTeknY/Egu+vWOay8307WTTCZ22EgsL3Slgq1mdRpo927Yjwpnn68+w=='
// 使用者層級、全域的 npm 設定檔指到不存在的檔案：只看專案自己的 package.json 和 .npmrc
const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, npm_config_userconfig: join(import.meta.dirname, 'no-user-npmrc'), npm_config_globalconfig: join(import.meta.dirname, 'no-global-npmrc'), npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' }
const npm = (args: string[], cwd: string) => run('npm', args, { cwd, env, timeoutMs: 30_000 })

async function readJson(file: string) {
  let text: string
  try { text = await readFile(join(shop, file), 'utf8') } catch { throw new Error(`找不到 shop/${file}：在 shop/ 裡執行 npm install ./vendor/latte-art-1.2.0.tgz，npm 會寫好它`) }
  return JSON.parse(text)
}

test('package.json 的 dependencies 有 latte-art', opts, async () => {
  const pkg = await readJson('package.json')
  assert.ok(pkg.dependencies?.['latte-art'], 'package.json 的 dependencies 沒有 latte-art：要用 npm install 安裝，不要手動把檔案複製進 node_modules')
})

test('package-lock.json 記下 latte-art 1.2.0 和它的 integrity', opts, async () => {
  const entry = (await readJson('package-lock.json')).packages?.['node_modules/latte-art']
  assert.ok(entry, 'package-lock.json 沒有 node_modules/latte-art：在 shop/ 用 npm install 安裝，lockfile 會一起更新，不要刪掉它')
  assert.equal(entry.version, '1.2.0', 'lockfile 裡 latte-art 的版本要是 1.2.0')
  const tgz = await readFile(join(shop, 'vendor', 'latte-art-1.2.0.tgz'))
  assert.equal('sha512-' + createHash('sha512').update(tgz).digest('base64'), LATTE_ART, 'vendor/latte-art-1.2.0.tgz 被改過了：用題目附的原始檔案')
  assert.equal(entry.integrity, LATTE_ART, 'lockfile 的 integrity 要跟 vendor/latte-art-1.2.0.tgz 的 sha512 一樣：不要手動改 lockfile')
})

test('別人 clone 之後 npm ci --offline 就能執行 art.ts', opts, async () => {
  const source = await readFile(join(shop, 'art.ts'), 'utf8')
  assert.match(source, /from\s+['"]latte-art['"]/, "art.ts 要用套件名稱 import { pour } from 'latte-art'，不要改成相對路徑")
  // 模擬另一台電腦：只有 git 裡的檔案（沒有 node_modules），照 lockfile 安裝
  const dir = await tmpDir()
  await cp(shop, dir, { recursive: true, filter: f => !['node_modules', 'POSTINSTALL_RAN'].includes(basename(f)) })
  const ci = await npm(['ci', '--offline', '--ignore-scripts'], dir)
  assert.equal(ci.code, 0, `npm ci 失敗：package.json 和 package-lock.json 要一致\n${ci.stderr.split('\n').slice(0, 8).join('\n')}`)
  const [name, want] = [['heart', '♥ 愛心'], ['tulip', '❀ 鬱金香'], ['rosetta', '❦ 葉子']][Math.floor(Math.random() * 3)]
  const r = await runNode(join(dir, 'art.ts'), { args: [name], cwd: dir })
  assert.equal(r.code, 0, `node art.ts 出錯：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, want + '\n')
})
