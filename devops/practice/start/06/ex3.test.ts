// 練習 3：tunnel.sh 用 SSH 通道連到伺服器上只聽 127.0.0.1:9000 的 admin 服務
import { after, afterEach, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:net'
import { spawn } from 'node:child_process'
import { inspect, removeContainers, requireDocker, run } from '../../helpers/docker.ts'
import { SERVER, inServer, sh, startServer } from './server/lab.ts'

const dir = import.meta.dirname
let token = ''
const leftover = () => run('pgrep', ['-fl', 'ssh .*18061:']).stdout
const killTunnels = () => run('pkill', ['-f', 'ssh .*18061:'])
const listen = (host: string) => new Promise<Server>((ok, fail) => {
  const s = createServer(c => c.end()).once('error', fail)
  s.listen(18061, host, () => ok(s))
})
const close = (s: Server) => new Promise(r => s.close(r))
const stats = () => { try { return JSON.parse(run('cat', ['stats.json'], { cwd: dir }).stdout) } catch { return null } }

before(async () => {
  requireDocker()
  removeContainers(SERVER)
  killTunnels()
  await startServer(dir)
  token = inServer('cat /run/cafe-admin-token').stdout
})
afterEach(() => { killTunnels() })
after(() => { killTunnels(); removeContainers(SERVER) })

test('tunnel.sh 透過通道抓到 /stats，存成 stats.json', () => {
  const r = sh(dir, 'tunnel.sh', 60_000)
  assert.equal(r.code, 0, `sh tunnel.sh 失敗（結束碼 ${r.code}）：${r.stderr}`)
  assert.equal(stats()?.token, token, `stats.json 的 token 要是伺服器這次啟動產生的 ${token}：從 http://localhost:18061/stats 抓，不要寫死`)
})

test('結束後沒有留下 ssh 程序，18061 已經釋放', async () => {
  const r = sh(dir, 'tunnel.sh', 60_000)
  assert.equal(r.code, 0, `sh tunnel.sh 失敗：${r.stderr}`)
  const left = leftover()
  assert.equal(left, '', `tunnel.sh 結束了，背景的 ssh 還在：\n${left}\n用 -M -S 開控制 socket，trap … EXIT 裡執行 ssh -S … -O exit cafe-server`)
  const s = await listen('127.0.0.1').catch(() => null)
  assert.ok(s, '18061 還被占著：通道沒關')
  await close(s!)
})

test('伺服器只對外發布 22 port，9000 沒有發布出來', () => {
  const ports = Object.keys(inspect(SERVER)?.HostConfig?.PortBindings ?? {})
  assert.deepEqual(ports, ['22/tcp'], `伺服器發布了 ${ports.join('、')}：admin 服務只能透過 SSH 通道連，不要改 server/up.sh 把 9000 發布出來`)
})

test('18061 已被占用時：exit 不是 0，也不留下 ssh 程序', async () => {
  // 占用 18061 的「別人的服務」放在另一個程序：測試執行 tunnel.sh 時自己會卡住，沒辦法回應
  const squatter = spawn(process.execPath, ['-e', `
    const net = require('node:net'), ok = []
    const reply = c => c.end('HTTP/1.1 200 OK\\r\\ncontent-length: 2\\r\\nconnection: close\\r\\n\\r\\n{}')
    for (const h of ['127.0.0.1', '::1']) net.createServer(reply).on('error', () => ok.push(h)).listen(18061, h, () => ok.push(h))
    const t = setInterval(() => { if (ok.length === 2) { clearInterval(t); console.log('ready') } }, 20)`], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise(r => squatter.stdout.once('data', r))
  const r = sh(dir, 'tunnel.sh', 60_000)
  squatter.kill()
  assert.notEqual(r.code, 0, '通道根本沒建起來（port 被占用），tunnel.sh 卻回 0，抓到的是別人的服務：加上 -o ExitOnForwardFailure=yes')
  assert.equal(leftover(), '', '失敗時也不能留下 ssh 程序')
})

test('連續執行 5 次都成功', () => {
  for (let i = 1; i <= 5; i++) {
    const r = sh(dir, 'tunnel.sh', 60_000)
    assert.equal(r.code, 0, `第 ${i} 次執行失敗：${r.stderr}\n常見原因：上一次的控制 socket 或 ssh 程序沒有清掉`)
    assert.equal(stats()?.token, token, `第 ${i} 次的 stats.json 不對`)
  }
  assert.equal(leftover(), '', '執行完不能留下 ssh 程序')
})
