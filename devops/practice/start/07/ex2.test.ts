// 練習 2：images.lock 用 digest 釘住三個映像，而且是多架構的 index
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docker, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
// 名稱:tag → 映像 Env 裡哪個變數記著版本、應該是多少
const WANT: Record<string, [string, string]> = {
  'node:24.22.2-alpine3.24': ['NODE_VERSION', '24.22.2'],
  'postgres:18.6-alpine3.24': ['PG_VERSION', '18.6'],
  'nginx:1.30.6-alpine': ['NGINX_VERSION', '1.30.6'],
}
const INDEX = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json']
let lines: { ref: string, digest: string }[] = []

before(() => {
  requireDocker()
  let text = ''
  try { text = readFileSync(join(dir, 'images.lock'), 'utf8') } catch { throw new Error('找不到 images.lock') }
  lines = text.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => {
    const [ref, digest = ''] = s.split('@')
    return { ref, digest }
  })
})

test('三行都是「名稱:tag@sha256:64 位十六進位」，三個映像各一行', () => {
  assert.deepEqual(lines.map(l => l.ref).sort(), Object.keys(WANT).sort(), '要剛好三行：node:24.22.2-alpine3.24、postgres:18.6-alpine3.24、nginx:1.30.6-alpine，tag 後面接 @sha256:…')
  for (const l of lines) assert.match(l.digest, /^sha256:[0-9a-f]{64}$/, `${l.ref} 後面要接 @sha256: 加 64 個十六進位字元，現在是「${l.digest || '（沒有 digest）'}」`)
})

test('每個 digest 都是同時含 linux/arm64 和 linux/amd64 的 index', () => {
  assert.ok(lines.length, 'images.lock 沒有內容')
  for (const l of lines) {
    const r = run('docker', ['buildx', 'imagetools', 'inspect', '--raw', `${l.ref.split(':')[0]}@${l.digest}`], { timeout: 60_000 })
    assert.equal(r.code, 0, `${l.ref}@${l.digest} 在 registry 上找不到（digest 打錯了？）：${r.stderr.split('\n')[0]}`)
    const m = JSON.parse(r.stdout)
    assert.ok(INDEX.includes(m.mediaType), `${l.ref} 的 digest 指向單一平台的映像（${m.mediaType}），amd64 的伺服器拉不到能跑的版本：要貼 imagetools inspect 最上面那個 index 的 Digest，不是 Manifests 底下某一個平台的`)
    const platforms = m.manifests.map((x: any) => `${x.platform?.os}/${x.platform?.architecture}`)
    for (const p of ['linux/arm64', 'linux/amd64']) assert.ok(platforms.includes(p), `${l.ref} 的 index 裡沒有 ${p}`)
  }
})

test('用 digest 拉下來的映像，版本跟 tag 寫的一樣', () => {
  assert.ok(lines.length, 'images.lock 沒有內容')
  for (const l of lines) {
    const ref = `${l.ref.split(':')[0]}@${l.digest}`
    const p = run('docker', ['pull', '-q', ref], { timeout: 300_000 })
    assert.equal(p.code, 0, `docker pull ${ref} 失敗：${p.stderr.split('\n').pop()}`)
    const env: string[] = JSON.parse(docker('image', 'inspect', ref, '--format', '{{json .Config.Env}}').stdout)
    const [key, version] = WANT[l.ref] ?? ['?', '?']
    assert.ok(env.includes(`${key}=${version}`), `${l.ref} 後面的 digest 是別的版本的映像（${env.find(e => e.startsWith(key + '=')) ?? '沒有 ' + key}）：digest 要用 imagetools inspect ${l.ref} 查，不要抄別的 tag 的`)
    const alpine = run('docker', ['run', '--rm', '--entrypoint', 'cat', ref, '/etc/alpine-release']).stdout
    const base = l.ref.match(/alpine(\d+\.\d+)$/)?.[1]
    assert.ok(alpine && (!base || alpine.startsWith(base + '.')), `${l.ref} 後面的 digest 是別的基底的映像（${alpine ? 'Alpine ' + alpine : '不是 Alpine'}）：版本號一樣、基底不同的 tag（例如 -bookworm-slim、-alpine3.23）各有自己的 digest，要查 ${l.ref} 本身的`)
  }
})
