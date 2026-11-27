// 練習 3：diagnose.sh 用 docker inspect 和 docker logs 找出三個壞掉的容器各是什麼問題
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { docker, inspect, removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'node:24.22.2-alpine3.24'
const NAMES = ['ld-07-a', 'ld-07-b', 'ld-07-c']
const pick = <T>(xs: T[]) => xs[randomInt(xs.length)]
const causes = ['oom', 'missing-env', 'not-published'].sort(() => randomInt(3) - 1)
const want: Record<string, string> = {}   // 容器名稱 → 「原因 數值」
let lines: Record<string, string> = {}

function start(name: string, cause: string) {
  if (cause === 'oom') {
    const mb = pick([64, 96, 128, 160])
    want[name] = `oom ${mb}`
    return docker('run', '-d', '--name', name, '--memory', `${mb}m`, '--memory-swap', `${mb}m`, IMAGE, 'node', '-e',
      `const a=[];setInterval(()=>{a.push(Buffer.alloc(8<<20,1));console.log('cache size', a.length*8, 'MB')},20)`)
  }
  if (cause === 'missing-env') {
    const env = pick(['DATABASE_URL', 'REDIS_URL', 'SMTP_HOST', 'PAYMENT_API_KEY', 'JWT_SECRET', 'S3_BUCKET'])
    want[name] = `missing-env ${env}`
    return docker('run', '-d', '--name', name, '-e', `K=${env}`, IMAGE, 'node', '-e',
      `const k=process.env.K;console.log('starting cafe-api');if(!process.env[k]){console.error('Error: missing required environment variable '+k);process.exit(1)}`)
  }
  const port = randomInt(4000, 5000)
  want[name] = `not-published ${port}`
  return docker('run', '-d', '--name', name, '-e', `PORT=${port}`, '-p', '127.0.0.1:18071:3000', IMAGE, 'node', '-e',
    `require('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT,()=>console.log('listening on port '+process.env.PORT))`)
}

before(async () => {
  requireDocker()
  removeContainers(...NAMES)
  NAMES.forEach((n, i) => {
    const r = start(n, causes[i])
    if (r.code !== 0) throw new Error(`測試建立 ${n} 失敗：${r.stderr}`)
  })
  // 等狀況都出現：OOM 和缺環境變數的容器結束、聽 port 的那個印出 listening
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    const ready = NAMES.every((n, i) => causes[i] === 'not-published' ? docker('logs', n).stdout.includes('listening') : inspect(n)?.State.Running === false)
    if (ready) break
    await new Promise(r => setTimeout(r, 300))
  }
  const r = run('sh', ['diagnose.sh'], { cwd: dir, timeout: 60_000 })
  assert.equal(r.code, 0, `sh diagnose.sh 失敗（結束碼 ${r.code}）：${r.stderr}`)
  for (const line of r.stdout.split('\n')) {
    const [name, ...rest] = line.trim().split(/\s+/)
    if (NAMES.includes(name)) lines[name] = rest.join(' ')
  }
})
after(() => removeContainers(...NAMES))

const check = (cause: string, hint: string) => () => {
  const name = NAMES[causes.indexOf(cause)]
  assert.equal(lines[name], want[name], `${name} 這次的問題是 ${cause}，diagnose.sh 印出「${name} ${lines[name] ?? '（沒有這一行）'}」。${hint}（每次測試的分配和數值都不同，不能寫死）`)
}
test('找出被 OOM kill 的容器和它的記憶體上限（MB）', check('oom', '看 .State.OOMKilled，上限在 .HostConfig.Memory，單位是 byte，要換成 MB'))
test('找出缺環境變數的容器和缺的是哪一個', check('missing-env', '容器已經結束，原因寫在 docker logs 的錯誤訊息裡'))
test('找出 port 沒發布對的容器和程式真正聽的 port', check('not-published', '-p 發布的是容器的 3000，但程式聽的不是 3000：看 docker logs，不是 docker port'))
