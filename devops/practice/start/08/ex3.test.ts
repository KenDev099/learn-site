// 練習 3：用 ARG 把版本資訊放進映像：/version 讀得到、label 也有，而且不會讓 npm ci 的快取失效
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:08-ex3'
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
const sha = () => randomBytes(20).toString('hex')
let ctx = ''

function build(tag: string, args: string[]) {
  const r = run('docker', ['build', '--progress=plain', ...args, '-t', `${IMAGE}${tag}`, '.'], { cwd: ctx, timeout: 600_000 })
  assert.equal(r.code, 0, `建置失敗，最後幾行：\n${tail(r.stderr)}`)
  return r.stderr
}

async function version(tag: string, port: number) {
  const name = `ld-08-ver${tag}`
  removeContainers(name)
  assert.equal(docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:3000`, `${IMAGE}${tag}`).code, 0, '容器啟動失敗')
  try {
    const res = await waitHttp(`http://127.0.0.1:${port}/version`, 20_000)
    return await res.json() as { version: string, gitSha: string }
  } finally { removeContainers(name) }
}

before(() => {
  requireDocker()
  ctx = mkdtempSync(join(tmpdir(), 'ld-08-ex3-'))
  cpSync(join(dir, 'app'), ctx, { recursive: true, filter: f => !/[\\/](node_modules|dist)$/.test(f) })
})
after(() => {
  removeContainers('ld-08-vera', 'ld-08-verb')
  if (ctx) rmSync(ctx, { recursive: true, force: true })
})

test('給了 GIT_SHA 和 APP_VERSION：/version 和 OCI label 都是這兩個值', async () => {
  const s = sha()
  build('a', ['--build-arg', `GIT_SHA=${s}`, '--build-arg', 'APP_VERSION=1.4.2'])
  const v = await version('a', 18082)
  assert.equal(v.gitSha, s, `/version 的 gitSha 是 ${v.gitSha}：ARG 只在建置時存在，要用 ENV 留給執行期`)
  assert.equal(v.version, '1.4.2', `/version 的 version 是 ${v.version}，應該是 --build-arg 給的 1.4.2`)
  const labels = inspect(`${IMAGE}a`, 'image')?.Config.Labels ?? {}
  assert.equal(labels['org.opencontainers.image.revision'], s, 'label org.opencontainers.image.revision 要等於 GIT_SHA')
  assert.equal(labels['org.opencontainers.image.version'], '1.4.2', 'label org.opencontainers.image.version 要等於 APP_VERSION')
})

test('沒給 build-arg：/version 的 version 是 dev', async () => {
  build('b', [])
  const v = await version('b', 18083)
  assert.equal(v.version, 'dev', `version 是 ${v.version}：ARG APP_VERSION 要有預設值 dev`)
})

test('換一個 GIT_SHA 重建：npm ci 仍然用快取', () => {
  const out = build('c', ['--build-arg', `GIT_SHA=${sha()}`, '--build-arg', 'APP_VERSION=1.4.3'])
  const step = out.match(/^#(\d+) \[[^\]]*\] RUN\b.*\bnpm ci\b/m)?.[1]
  assert.ok(step, '建置過程找不到 RUN npm ci 這一步')
  assert.match(out, new RegExp(`^#${step} CACHED$`, 'm'), '每次 commit 的 GIT_SHA 都不同，npm ci 卻因此重跑：ARG 之後的 RUN 會把它當環境變數，ARG 要放在 npm ci 之後')
})
