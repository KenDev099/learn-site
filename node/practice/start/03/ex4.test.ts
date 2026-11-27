import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { run, runNode } from '../../helpers/proc.ts'

const shop = join(import.meta.dirname, 'shop')
const marker = join(shop, 'POSTINSTALL_RAN')
const opts = { timeout: 60_000 }
// 題目附的 coffee-color-1.0.0.tgz（含 postinstall）的 sha512
const COFFEE_COLOR = 'sha512-WjVCVJHj/nm+PImWcfbkygOvo1FpodmYFgSOMCdnihmj12GhIQtMobUOL0TSCul8oUu4c5FGVxoC5GIS+g4MCw=='
// 使用者層級、全域的 npm 設定檔指到不存在的檔案：只看專案自己的 package.json 和 .npmrc
const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, npm_config_userconfig: join(import.meta.dirname, 'no-user-npmrc'), npm_config_globalconfig: join(import.meta.dirname, 'no-global-npmrc'), npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' }

test('coffee-color 是專案的依賴', opts, async () => {
  const pkg = JSON.parse(await readFile(join(shop, 'package.json'), 'utf8'))
  assert.ok(pkg.dependencies?.['coffee-color'], 'package.json 的 dependencies 沒有 coffee-color：題目要「裝這個套件但不執行它的 install script」，不是把它拿掉')
  const tgz = await readFile(join(shop, 'vendor', 'coffee-color-1.0.0.tgz'))
  assert.equal('sha512-' + createHash('sha512').update(tgz).digest('base64'), COFFEE_COLOR, 'vendor/coffee-color-1.0.0.tgz 被改過了：題目是擋下原本的套件的 install script，不是把 script 從套件裡拿掉')
  const entry = JSON.parse(await readFile(join(shop, 'package-lock.json'), 'utf8').catch(() => '{}')).packages?.['node_modules/coffee-color']
  assert.equal(entry?.integrity, COFFEE_COLOR, 'package-lock.json 裡 coffee-color 的 integrity 要是題目附的那個 tgz：在 shop/ 用 npm install ./vendor/coffee-color-1.0.0.tgz 安裝')
})

test('之後任何人執行 npm ci，coffee-color 的 postinstall 都不會執行，套件照樣能用', opts, async () => {
  // 直接在你的 shop/ 執行 npm ci（不加任何旗標），就像隊友 clone 下來第一次安裝
  await rm(marker, { force: true })
  const ci = await run('npm', ['ci', '--offline'], { cwd: shop, env, timeoutMs: 30_000 })
  assert.equal(ci.code, 0, `npm ci 失敗：\n${ci.stderr.split('\n').slice(0, 8).join('\n')}`)
  assert.equal(existsSync(marker), false, 'npm ci 執行了 coffee-color 的 postinstall（出現 POSTINSTALL_RAN）：只在終端機加 --ignore-scripts 不會留下來，要把決定寫進 package.json 的 allowScripts（用 npm install-scripts deny 產生，手寫的 "coffee-color": false 對 .tgz 安裝的套件沒有用）或 shop/.npmrc')
  const r = await runNode(join(shop, 'color.ts'), { args: ['latte'], cwd: shop })
  assert.equal(r.code, 0, `node color.ts 出錯：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, '#c8a27c\n')
})
