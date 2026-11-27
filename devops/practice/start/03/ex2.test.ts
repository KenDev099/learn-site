// 練習 2：who-listens.sh <port> 找出監聽某個 TCP port 的程序。在 Alpine 容器裡啟動幾個監聽者，跟真正的 PID 比對
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, removeContainers, requireDocker } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-03-who'
// 每個監聽者啟動後把「port PID 名稱」記到 /tmp/want；最後一個 node 是從本機 port 9999 連到 8080 的客戶端（不是監聽者），連上後才建立 /tmp/ready
const SETUP = `
node -e "require('net').createServer(s => s.pipe(s)).listen(8080)" & echo "8080 $! node" >> /tmp/want
node -e "require('net').createServer().listen(18080, '0.0.0.0')" & echo "18080 $! node" >> /tmp/want
node -e "const n = require('net'); n.createServer().listen(5000, '0.0.0.0'); n.createServer().listen({ port: 5000, host: '::', ipv6Only: true })" & echo "5000 $! node" >> /tmp/want
nc -lk -p 7000 -e cat & echo "7000 $! nc" >> /tmp/want
sleep 1
node -e "require('net').connect({ port: 8080, localPort: 9999 }, () => require('fs').writeFileSync('/tmp/ready', '')); setInterval(() => {}, 1000)" &
wait`
let want: string[] = []
const who = (port: string) => docker('exec', NAME, 'sh', '/w/who-listens.sh', port)
const lines = (s: string) => s.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).sort()

before(async () => {
  requireDocker()
  removeContainers(NAME)
  const r = docker('run', '-d', '--name', NAME, '-v', `${dir}:/w:ro`, 'node:24.22.2-alpine3.24', 'sh', '-c', SETUP)
  assert.equal(r.code, 0, `容器啟動失敗：${r.stderr}`)
  for (let i = 0; i < 50 && docker('exec', NAME, 'test', '-e', '/tmp/ready').code !== 0; i++) await new Promise(r => setTimeout(r, 200))
  await new Promise(r => setTimeout(r, 500))
  want = docker('exec', NAME, 'cat', '/tmp/want').stdout.split('\n')
})
after(() => removeContainers(NAME))

const expect = (port: string) => want.filter(l => l.startsWith(port + ' ')).map(l => l.slice(port.length + 1)).sort()

for (const [port, hint] of [
  ['8080', '有一個客戶端連到 8080，它不是監聽者，要用 -l 只看 LISTEN；也別讓 18080 被當成 8080'],
  ['18080', '只聽 0.0.0.0 的 node；有兩個以上的 node 時，靠 ps | grep node 猜不出是哪一個'],
  ['5000', '同一個程序同時聽 IPv4 和 IPv6（兩個 socket），只印一行：sort -u'],
  ['7000', '名稱是 netstat 的 PID/Program name 那一欄斜線後面的部分，這裡是 nc'],
]) test(`port ${port}：印出正確的 PID 與名稱`, () => {
  const r = who(port)
  assert.equal(r.code, 0, `sh who-listens.sh ${port} 失敗（結束碼 ${r.code}）：${r.stderr}`)
  const got = lines(r.stdout), exp = expect(port)
  assert.deepEqual(got, exp, `應該印出：\n${exp.join('\n')}\n你的輸出：\n${got.join('\n') || '（空白）'}\n提示：${hint}`)
})

test('沒有人監聽的 port：什麼都不印，結束碼 1', () => {
  const r = who('9999')
  assert.equal(r.stdout, '', `port 9999 沒有人在聽（只有一條從 9999 連出去的連線，它不是監聽者，要用 -l 只看 LISTEN），不能印東西，你印了：${r.stdout}`)
  assert.equal(r.code, 1, `結束碼要是 1（找不到），現在是 ${r.code}`)
})
