// 練習 3：build-amd64.sh 產出 linux/amd64 的 learn-devops/cafe-api:09-amd64；建置階段用 $BUILDPLATFORM，不在 Dockerfile 寫死平台
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:09-amd64'
const NAME = 'ld-09-amd64'
let img: any = null, buildLog = ''

before(() => {
  requireDocker()
  removeContainers(NAME)
  docker('rmi', '-f', IMAGE)
  const r = run('sh', ['build-amd64.sh'], { cwd: dir, timeout: 900_000 })
  img = r.code === 0 ? inspect(IMAGE, 'image') : null
  buildLog = (r.code === null ? '（超過時間限制沒建完：Docker 可能正忙，稍後再跑一次）\n' : '') + (r.stderr || r.stdout).split('\n').slice(-12).join('\n')
})
after(() => removeContainers(NAME))

const needBuild = () => assert.ok(img, `sh build-amd64.sh 沒有建出 ${IMAGE}：\n${buildLog}`)

test('映像的架構是 amd64', () => {
  needBuild()
  assert.equal(img.Os, 'linux')
  assert.equal(img.Architecture, 'amd64', `映像是 ${img.Architecture}：沒指定平台時，會建出跟這台 Mac 一樣的架構。在 docker build 加上 --platform linux/amd64`)
})

test('Dockerfile 的建置階段用 FROM --platform=$BUILDPLATFORM，而且 build check 沒有警告', () => {
  const text = readFileSync(join(dir, 'app', 'Dockerfile'), 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  // 依 FROM 切成階段，找出執行編譯（npm run build／tsc）的那一個
  const stages = text.split(/^(?=\s*FROM\s)/im).filter(s => /^\s*FROM\s/i.test(s))
  const compile = stages.find(s => /^\s*RUN\b.*(npm\s+run(-script)?\s+build|\btsc\b)/im.test(s))
  assert.ok(compile, '找不到執行 npm run build 的階段')
  assert.match(compile.split('\n')[0], /^\s*FROM\s+--platform=\$\{?BUILDPLATFORM\}?\s/i, `執行 npm run build 的階段（${compile.split('\n')[0].trim()}）要寫成 FROM --platform=$BUILDPLATFORM …，在這台 Mac 原生的架構上編譯，不用模擬`)
  const r = run('docker', ['build', '--check', 'app'], { cwd: dir, timeout: 300_000 })
  assert.equal(r.code, 0, `docker build --check app 有警告（平台寫死在 FROM 會出現 FromPlatformFlagConstDisallowed）：\n${(r.stdout + '\n' + r.stderr).split('\n').filter(l => /WARNING|>>>/.test(l)).join('\n')}`)
})

test('以 linux/amd64 執行：node 的 process.arch 是 x64，/health/live 回 200', async () => {
  needBuild()
  const arch = docker('run', '--rm', '--platform', 'linux/amd64', IMAGE, 'node', '-p', 'process.arch')
  assert.equal(arch.stdout, 'x64', `process.arch 是 ${arch.stdout || arch.stderr}`)
  const r = docker('run', '-d', '--platform', 'linux/amd64', '--name', NAME, '-p', '127.0.0.1:18093:3000', IMAGE)
  assert.equal(r.code, 0, `docker run 失敗：${r.stderr}`)
  const res = await waitHttp('http://127.0.0.1:18093/health/live', 40_000)
  assert.equal(res.status, 200, 'GET /health/live 要回 200')
})
