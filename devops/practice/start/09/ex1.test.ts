// 練習 1：app/Dockerfile 改成多階段建置。最終映像只有 package.json、正式依賴和 dist/，仍以非 root 執行、有 HEALTHCHECK
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, zstdDecompressSync } from 'node:zlib'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:09-1'
const BASE = 'node:24.22.2-alpine3.24'
const NAME = 'ld-09-app'
let built = false, buildLog = ''

// docker history 由新到舊列出每一步的大小（位元組）
const history = (image: string) => docker('history', '--human=false', '--format', '{{.Size}}', image).stdout.split('\n').map(Number)

before(() => {
  requireDocker()
  removeContainers(NAME)
  const r = run('docker', ['build', '-t', IMAGE, 'app'], { cwd: dir, timeout: 600_000 })
  built = r.code === 0
  buildLog = (r.code === null ? '（超過時間限制沒建完：Docker 可能正忙，稍後再跑一次）\n' : '') + (r.stderr || r.stdout).split('\n').slice(-12).join('\n')
})
after(() => removeContainers(NAME))

const needBuild = () => assert.ok(built, `docker build -t ${IMAGE} app 失敗：\n${buildLog}`)

test('docker build --check 沒有任何警告', () => {
  const r = run('docker', ['build', '--check', 'app'], { cwd: dir, timeout: 300_000 })
  assert.equal(r.code, 0, `docker build --check app 有警告：\n${(r.stdout + '\n' + r.stderr).split('\n').filter(l => /WARNING|ERROR|>>>/.test(l)).join('\n')}`)
})

test(`最終映像只比基底 ${BASE} 多 20MB 以內`, () => {
  needBuild()
  const base = history(BASE), mine = history(IMAGE)
  assert.ok(base.length && mine.length > base.length, `找不到 ${BASE}：最終階段要 FROM ${BASE}`)
  const added = mine.slice(0, mine.length - base.length).reduce((a, b) => a + b, 0)
  const mb = (added / 1e6).toFixed(1)
  assert.ok(added <= 20e6, `你的 Dockerfile 在基底上加了 ${mb}MB（上限 20MB）。執行 docker history ${IMAGE} 看是哪一層：typescript、原始碼、npm 快取要留在建置階段，最終階段只 COPY --from 需要的東西。後面的層刪檔案不會讓前面的層變小`)
})

test('最終映像裡沒有 typescript、@types 和 .ts 原始碼，有 dist/server.js', () => {
  needBuild()
  const script = `
    const fs = require('fs'), path = require('path')
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    console.log(JSON.stringify({
      cwd: process.cwd(),
      typescript: fs.existsSync('node_modules/typescript'),
      types: fs.existsSync('node_modules/@types'),
      pino: fs.existsSync('node_modules/pino'),
      server: fs.existsSync('dist/server.js'),
      pkg: fs.existsSync('package.json'),
      tsFiles: walk('.').filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts')),
    }))`
  const r = docker('run', '--rm', '--user', '0', IMAGE, 'node', '-e', script)
  assert.equal(r.code, 0, `沒辦法在映像裡執行 node：${r.stderr}`)
  const c = JSON.parse(r.stdout)
  assert.equal(c.typescript, false, `${c.cwd}/node_modules/typescript 還在：最終階段只能有正式依賴（npm ci --omit=dev），不要把建置階段的整包 node_modules 複製過來`)
  assert.equal(c.types, false, `${c.cwd}/node_modules/@types 還在：它是 devDependency，只有編譯時需要`)
  assert.deepEqual(c.tsFiles, [], `最終映像裡還有 TypeScript 原始碼：只複製編譯好的 dist/，不要 COPY src`)
  assert.equal(c.server, true, `${c.cwd}/dist/server.js 不存在：用 COPY --from=<建置階段> 把 dist/ 複製過來`)
  assert.equal(c.pkg, true, `${c.cwd}/package.json 不存在：它有 "type": "module"，少了它 node 會用錯的模組格式載入 dist/`)
  assert.equal(c.pino, true, `${c.cwd}/node_modules/pino 不存在：正式依賴還是要有`)
})

// docker save 匯出的是 tar：每個檔案前面有 512 bytes 的標頭（名稱在 0–100，大小在 124–136，長路徑的前半段在 345–500）
function* tarEntries(buf: Buffer) {
  for (let off = 0; off + 512 <= buf.length;) {
    const field = (a: number, b: number) => buf.toString('utf8', off + a, off + b).replace(/\0.*$/s, '')
    const name = field(0, 100)
    if (!name) return
    const prefix = field(257, 262) === 'ustar' ? field(345, 500) : ''
    const size = parseInt(field(124, 136).trim() || '0', 8)
    yield { name: prefix ? `${prefix}/${name}` : name, data: buf.subarray(off + 512, off + 512 + size) }
    off += 512 + Math.ceil(size / 512) * 512
  }
}
const unpack = (b: Buffer) => b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b)
  : b.length > 4 && b.readUInt32LE(0) === 0xfd2fb528 ? zstdDecompressSync(b) : b
const isTar = (b: Buffer) => b.length >= 512 && b.toString('latin1', 257, 262) === 'ustar'

test('映像的每一層（不只最後看到的檔案）都沒有 TypeScript 原始碼和編譯器', () => {
  needBuild()
  const tmp = mkdtempSync(join(tmpdir(), 'ld-09-save-'))
  try {
    const tar = join(tmp, 'image.tar')
    const r = run('docker', ['save', '-o', tar, IMAGE], { timeout: 300_000 })
    assert.equal(r.code, 0, `docker save 失敗：${r.stderr}`)
    const found = new Set<string>()
    for (const { data } of tarEntries(readFileSync(tar))) {
      const layer = data.length > 4 ? unpack(data) : data
      if (!isTar(layer)) continue
      for (const { name } of tarEntries(layer)) {
        if (/(^|\/)node_modules\/(typescript|@typescript|@types)\//.test(name)) found.add(name.replace(/(node_modules\/[^/]+(\/[^/]+)?)\/.*/, '$1/…'))
        else if (!name.includes('node_modules/') && /\.(ts|mts|cts)$/.test(name) && !/\.d\.[mc]?ts$/.test(name)) found.add(name)
      }
    }
    assert.deepEqual([...found], [], `docker save 匯出的層裡還有這些東西：\n${[...found].slice(0, 6).join('\n')}\n它們在某一層裡，就算後面的 RUN 刪掉、或在同一個 RUN 裡 prune，COPY 進來的那一層仍然帶著。編譯要在另一個階段做，最終階段只 COPY --from 成果`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('容器能啟動、/health/live 回 200、以非 root 執行、HEALTHCHECK 變成 healthy', async () => {
  needBuild()
  const r = docker('run', '-d', '--name', NAME, '-p', '127.0.0.1:18090:3000', IMAGE)
  assert.equal(r.code, 0, `docker run 失敗：${r.stderr}`)
  const res = await waitHttp('http://127.0.0.1:18090/health/live', 20_000)
  assert.equal(res.status, 200, 'GET /health/live 要回 200')
  const uid = docker('exec', NAME, 'node', '-p', 'process.getuid()').stdout
  assert.notEqual(uid, '0', '程式以 root 執行：最終階段也要寫 USER node（每個階段的 USER 各自獨立）')
  assert.ok(inspect(NAME)?.State.Health, '映像沒有 HEALTHCHECK：多階段建置時，HEALTHCHECK 要寫在最後一個階段')
  let status = ''
  for (const end = Date.now() + 40_000; Date.now() < end;) {
    status = inspect(NAME)?.State.Health?.Status
    if (status === 'healthy' || status === 'unhealthy') break
    await new Promise(r => setTimeout(r, 1_000))
  }
  assert.equal(status, 'healthy', `40 秒內沒有變成 healthy（現在是 ${status}）：docker inspect ${NAME} --format '{{json .State.Health}}' 看檢查的輸出`)
})
