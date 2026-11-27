// 練習 2：build-secret.sh 用 build secret 把 NPM_TOKEN 交給 app/Dockerfile.private，token 不能留在映像的任何地方
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { gunzipSync, zstdDecompressSync } from 'node:zlib'
import { docker, inspect, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:09-private'
const TOKEN = 'npm_' + randomBytes(18).toString('hex')   // 每次都不一樣，寫死在哪裡都沒用
const TOKEN_RE = /npm_[0-9a-f]{36}/
let built = false, buildLog = ''

// docker save 匯出的是 tar：一個個檔案依序排列，每個檔案前面有 512 bytes 的標頭
function* tarEntries(buf: Buffer) {
  for (let off = 0; off + 512 <= buf.length;) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/s, '')
    if (!name) return
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/\0.*$/s, '').trim() || '0', 8)
    yield { name, data: buf.subarray(off + 512, off + 512 + size) }
    off += 512 + Math.ceil(size / 512) * 512
  }
}
// layer 可能是未壓縮的 tar、gzip 或 zstd
const unpack = (b: Buffer) => b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b)
  : b.readUInt32LE(0) === 0xfd2fb528 ? zstdDecompressSync(b) : b

before(() => {
  requireDocker()
  docker('rmi', '-f', IMAGE)   // 確定映像是這次建出來的
  const r = run('sh', ['build-secret.sh'], { cwd: dir, env: { NPM_TOKEN: TOKEN }, timeout: 600_000 })
  built = r.code === 0 && !!inspect(IMAGE, 'image')
  buildLog = (r.code === null ? '（超過時間限制沒建完：Docker 可能正忙，稍後再跑一次）\n' : '') + (r.stderr || r.stdout).split('\n').slice(-12).join('\n')
})
after(() => docker('rmi', '-f', IMAGE))

const needBuild = () => assert.ok(built, `sh build-secret.sh 沒有建出 ${IMAGE}：\n${buildLog}`)

test('建置時有拿到 token：私有套件 @cafe/loyalty 下載成功', () => {
  needBuild()
  const r = docker('run', '--rm', IMAGE, 'node', '-p', "require('fs').readFileSync('vendor/cafe-loyalty.json', 'utf8')")
  assert.equal(r.code, 0, `映像裡找不到 vendor/cafe-loyalty.json：fetch-private.mjs 要在建置時執行成功\n${r.stderr}`)
  assert.match(JSON.parse(r.stdout).licensedTo, /^[0-9a-f]{12}$/)
})

test('docker build --check -f Dockerfile.private 沒有警告（不用 ARG／ENV 傳機密）', () => {
  const r = run('docker', ['build', '--check', '-f', 'app/Dockerfile.private', 'app'], { cwd: dir, timeout: 300_000 })
  assert.equal(r.code, 0, `有警告：\n${(r.stdout + '\n' + r.stderr).split('\n').filter(l => /WARNING|>>>/.test(l)).join('\n')}`)
})

// 去掉 # 開頭的註解行，再看指令
const code = (file: string) => readFileSync(join(dir, file), 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n')

test('build-secret.sh 用 --secret 交出 token、Dockerfile.private 用 RUN --mount=type=secret 接收，不用 build arg', () => {
  const sh = code('build-secret.sh'), df = code('app/Dockerfile.private')
  assert.doesNotMatch(sh, /--build-arg/, 'build-secret.sh 還在用 --build-arg：build arg 的值會進 history、建置快取和 provenance，換成什麼名字都一樣（放在多階段的建置階段也一樣）')
  assert.match(sh, /--secret\b/, 'build-secret.sh 要用 docker build --secret id=…,env=NPM_TOKEN 把 token 交給 BuildKit')
  assert.match(df, /--mount=type=secret\b/, 'app/Dockerfile.private 執行 fetch-private.mjs 的那個 RUN 要用 --mount=type=secret 接收 token')
})

test('docker history 和映像設定（Env、Labels…）裡找不到 token', () => {
  needBuild()
  const h = docker('history', '--no-trunc', '--format', '{{.CreatedBy}}', IMAGE).stdout
  const line = h.split('\n').find(l => l.includes(TOKEN))
  assert.equal(line, undefined, `docker history 看得到 token：\n${line?.replace(TOKEN, '<token>')}\nARG 的值會記在用到它的每一個 RUN 上`)
  const i = docker('image', 'inspect', IMAGE).stdout
  assert.ok(!i.includes(TOKEN), 'docker image inspect 看得到 token：ENV 和 LABEL 會原封不動地存在映像設定裡')
})

test('docker save 匯出的每一層都找不到 token', () => {
  needBuild()
  const tmp = mkdtempSync(join(tmpdir(), 'ld-09-save-'))
  try {
    const tar = join(tmp, 'image.tar')
    const r = run('docker', ['save', '-o', tar, IMAGE], { timeout: 300_000 })
    assert.equal(r.code, 0, `docker save 失敗：${r.stderr}`)
    for (const { name, data } of tarEntries(readFileSync(tar))) {
      if (!data.length) continue
      // secret 不算進快取的 key：前一次建置留下的層（裡面是上一次的 token）會被直接沿用，所以找任何一個測試 token
      assert.ok(!TOKEN_RE.test(unpack(data).toString('latin1')), `token 出現在匯出的 ${name} 裡：寫進檔案的東西會留在那一層，後面的 RUN rm 只是在新的一層標記「刪除」。改用 RUN --mount=type=secret，token 只在那一步存在`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
