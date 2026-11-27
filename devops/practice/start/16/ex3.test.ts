import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { requireDocker, run, removeContainers, waitHttp } from '../../helpers/docker.ts'
import { hit } from './lib.ts'

const dir = import.meta.dirname
const BASE = 'http://localhost:18162'
const mount = `${join(dir, 'canary')}:/etc/nginx/conf.d:ro`
const uid = () => 'u' + randomBytes(6).toString('hex')
const color = async (headers: Record<string, string>) => (await hit(BASE + '/', { headers })).body.trim()
// 每批 50 個並行
async function many<T>(n: number, f: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < n; i += 50) out.push(...await Promise.all(Array.from({ length: Math.min(50, n - i) }, (_, j) => f(i + j))))
  return out
}
let syntax = { code: 0 as number | null, stderr: '' }

before(async () => {
  requireDocker()
  removeContainers('ld-16-canary')
  syntax = run('docker', ['run', '--rm', '-v', mount, 'nginx:1.30.6-alpine', 'nginx', '-t'], { timeout: 180_000 })
  if (syntax.code !== 0) return
  run('docker', ['run', '-d', '--name', 'ld-16-canary', '-p', '127.0.0.1:18162:80', '-v', mount, 'nginx:1.30.6-alpine'])
  await waitHttp(BASE + '/', 15_000)
})
after(() => removeContainers('ld-16-canary'))

test('nginx -t 通過', () => {
  assert.equal(syntax.code, 0, `canary/ 的設定 nginx -t 沒過：\n${syntax.stderr.slice(-600)}`)
})

test('1000 個不同的使用者（cookie uid）裡，約 10%（5%～15%）進 green', async () => {
  assert.equal(syntax.code, 0, '先讓 nginx -t 通過')
  const got = await many(1000, () => color({ cookie: `uid=${uid()}` }))
  const other = got.filter(c => c !== 'blue' && c !== 'green')
  assert.equal(other.length, 0, `有回應不是 blue 或 green：${[...new Set(other)].slice(0, 3).join('、')}`)
  const green = got.filter(c => c === 'green').length
  assert.ok(green >= 50 && green <= 150, `1000 個使用者有 ${green} 個進 green（${green / 10}%），要在 5%～15%：green 是新版，只放一小部分人進去。所有請求都從同一個 IP 來，所以不能依 IP 分`)
})

test('同一個使用者每次都進同一邊', async () => {
  assert.equal(syntax.code, 0, '先讓 nginx -t 通過')
  const users = Array.from({ length: 40 }, uid)
  for (const u of users) {
    const got = new Set(await many(15, () => color({ cookie: `uid=${u}` })))
    assert.equal(got.size, 1, `uid=${u} 的 15 個請求同時進了 blue 和 green：同一個人一下新版一下舊版，畫面和資料會對不上。用 cookie uid 決定分到哪邊`)
  }
})

test('帶 X-Canary: always 的請求一律進 green', async () => {
  assert.equal(syntax.code, 0, '先讓 nginx -t 通過')
  const got = await many(50, () => color({ cookie: `uid=${uid()}`, 'x-canary': 'always' }))
  const blue = got.filter(c => c !== 'green').length
  assert.equal(blue, 0, `帶 X-Canary: always 的 50 個請求有 ${blue} 個沒進 green：用 map $http_x_canary 決定要不要強制走 green`)
})
