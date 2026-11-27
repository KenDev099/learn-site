// 練習 3：run-oom.sh 用 512 MB 的記憶體上限跑 eat-memory.mjs，讓核心把它 OOM kill；answers.json 記下 inspect 看到的結果
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, inspect, readJson, removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-03-oom'
const MB512 = 512 * 1024 * 1024
let c: any = null

before(() => {
  requireDocker()
  removeContainers(NAME)
  const r = run('sh', ['run-oom.sh'], { cwd: dir, timeout: 180_000 })
  if (r.code === null) throw new Error('sh run-oom.sh 超過 180 秒沒有結束')
  docker('wait', NAME)   // 用 -d 背景執行時，等它結束
  c = inspect(NAME)
})
after(() => removeContainers(NAME))

test('容器 ld-03-oom 存在，記憶體上限 512 MB、沒有 swap', () => {
  assert.ok(c, '找不到容器 ld-03-oom：docker run 要加 --name ld-03-oom，也不要加 --rm（結束後還要 inspect 它）')
  assert.equal(c.Config.Image, 'node:24.22.2-alpine3.24', '映像用 node:24.22.2-alpine3.24')
  assert.equal(c.HostConfig.Memory, MB512, `記憶體上限要是 512 MB（--memory 512m），現在是 ${c.HostConfig.Memory / 1048576} MB`)
  assert.equal(c.HostConfig.MemorySwap, MB512, '--memory-swap 要跟 --memory 一樣（512m），代表不准用 swap；沒寫的話預設可以再用一倍的 swap')
})

test('eat-memory.mjs 被核心 OOM kill：結束碼 137、OOMKilled 是 true', () => {
  assert.ok(c, '容器不存在：先讓上一個測試通過')
  assert.match([c.Path, ...c.Args].join(' '), /eat-memory\.mjs/, '容器要執行 eat-memory.mjs：映像後面接 node /w/eat-memory.mjs')
  assert.equal(c.State.Running, false, '容器還在跑')
  assert.equal(c.State.OOMKilled, true, `OOMKilled 是 false（結束碼 ${c.State.ExitCode}）：不是被核心因為記憶體上限殺掉的。看 docker logs ld-03-oom 找原因`)
  assert.equal(c.State.ExitCode, 137, `結束碼是 ${c.State.ExitCode}，被 SIGKILL 殺掉的應該是 128+9=137`)
})

test('answers.json 和 docker inspect 看到的一樣', () => {
  assert.ok(c, '容器不存在：先讓第一個測試通過')
  const a = readJson(dir, 'answers.json')
  assert.equal(a.exitCode, c.State.ExitCode, `exitCode 填 docker inspect -f '{{.State.ExitCode}}' ld-03-oom 的結果（數字）`)
  assert.equal(a.oomKilled, c.State.OOMKilled, `oomKilled 填 docker inspect -f '{{.State.OOMKilled}}' ld-03-oom 的結果（true 或 false，不加引號）`)
})
