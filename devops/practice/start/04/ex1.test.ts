// 練習 1：容器裡的程式要聽 0.0.0.0，Docker 從外面轉進來的連線才收得到
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-04-api'
let c: any = null
before(() => {
  requireDocker()
  removeContainers(NAME)   // 每次從乾淨的狀態開始
  const r = run('sh', ['run.sh'], { cwd: dir, timeout: 180_000 })
  assert.equal(r.code, 0, `sh run.sh 失敗（結束碼 ${r.code}）：${r.stderr || r.stdout}`)
  c = inspect(NAME)
})
after(() => removeContainers(NAME))

test('容器用預設的 bridge 網路，port 只發布在 127.0.0.1:18040，對到容器的 3000', () => {
  assert.ok(c, '找不到容器 ld-04-api：run.sh 要用 --name ld-04-api 啟動')
  assert.deepEqual(c.Config.Cmd, ['node', '/app/server.mjs'], '容器要跑 node /app/server.mjs：修的是 server.mjs，不要在 run.sh 換掉要執行的程式')
  assert.notEqual(c.HostConfig.NetworkMode, 'host', '不要用 --network host 繞過問題：容器要有自己的網路，port 用 -p 發布')
  const b = c.HostConfig.PortBindings?.['3000/tcp']
  assert.ok(b?.length === 1, '容器的 3000 port 要發布一次：-p 127.0.0.1:18040:3000')
  assert.equal(b[0].HostIp, '127.0.0.1', '主機這端維持 127.0.0.1：改成 0.0.0.0 或不寫，同一個 Wi-Fi 的人都連得到，而且修不好容器裡的問題')
  assert.equal(b[0].HostPort, '18040', '主機這端的 port 是 18040')
})

test('從 Mac 連 http://localhost:18040/health/live 回 200', async () => {
  assert.ok(c?.State.Running, `容器沒有在執行：docker logs ld-04-api 看錯誤\n${docker('logs', NAME).stderr}`)
  let res: Response
  try {
    res = await waitHttp('http://127.0.0.1:18040/health/live', 30_000)
  } catch (e) {
    const log = docker('logs', NAME)
    throw new Error(`連不上：Docker 把連線轉進容器的網卡（eth0），但程式只聽容器自己的 loopback。改 server.mjs 聽的位址。\ndocker logs：${log.stdout || log.stderr}\n${(e as Error).message}`)
  }
  assert.equal(res.status, 200, '/health/live 要回 200')
})
