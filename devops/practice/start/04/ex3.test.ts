// 練習 3：diagnose.sh <host> <port> 分辨 open、refused、timeout
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NET = 'ld-04-net', OPEN = 'ld-04-open', DIAG = 'ld-04-diag'
let openIp = '', blackhole = ''

function cleanup() {
  removeContainers(OPEN, DIAG)
  docker('network', 'rm', NET)
}

before(async () => {
  requireDocker()
  cleanup()
  let r = docker('network', 'create', NET)
  assert.equal(r.code, 0, `建立網路失敗：${r.stderr}`)
  // 「封包會被丟掉」的位址：子網路裡沒人用的 .250。給它一個不存在的 MAC 位址，
  // SYN 送出去沒有任何人回，效果跟防火牆 DROP 一樣，連線端只能一直等
  const subnet = docker('network', 'inspect', NET, '-f', '{{(index .IPAM.Config 0).Subnet}}').stdout
  blackhole = subnet.split('/')[0].split('.').slice(0, 3).concat('250').join('.')
  r = docker('run', '-d', '--name', OPEN, '--network', NET, 'nginx:1.30-alpine')
  assert.equal(r.code, 0, `啟動 nginx 失敗：${r.stderr}`)
  openIp = docker('inspect', OPEN, '-f', `{{(index .NetworkSettings.Networks "${NET}").IPAddress}}`).stdout
  r = docker('run', '-d', '--name', DIAG, '--network', NET, '--add-host', `blackhole:${blackhole}`,
    '-v', `${dir}:/work:ro`, 'ubuntu:24.04', 'sleep', 'infinity')
  assert.equal(r.code, 0, `啟動 ubuntu 失敗：${r.stderr}`)
  r = docker('run', '--rm', '--network', `container:${DIAG}`, '--cap-add', 'NET_ADMIN', 'nginx:1.30-alpine',
    'arp', '-s', blackhole, '02:00:00:00:04:04')
  assert.equal(r.code, 0, `設定丟封包的位址失敗：${r.stderr}`)
  // 等 nginx 開始聽 80
  const end = Date.now() + 60_000
  while (docker('exec', DIAG, 'timeout', '1', 'bash', '-c', `exec 3<>/dev/tcp/${OPEN}/80`).code !== 0) {
    if (Date.now() > end) throw new Error('nginx 60 秒內沒有開始聽 80 port')
    await new Promise(r => setTimeout(r, 300))
  }
})
after(cleanup)

// 在容器裡計時：docker exec 本身的耗時（電腦很忙時可能好幾秒）不算在腳本頭上
const TIMED = 's=$(date +%s%N); timeout 5 bash /work/diagnose.sh "$1" "$2"; rc=$?; echo "ms=$(( ($(date +%s%N) - s) / 1000000 ))" >&2; exit $rc'

function diagnose(host: string, port: string) {
  const r = run('docker', ['exec', DIAG, 'bash', '-c', TIMED, '_', host, port], { timeout: 60_000 })
  const m = r.stderr.match(/(?:^|\n)ms=(\d+)$/)
  assert.ok(m, `docker exec 沒有正常執行：${r.stderr}`)
  assert.notEqual(r.code, 124, `bash diagnose.sh ${host} ${port} 超過 5 秒還沒結束：連線要自己加逾時（timeout 2 …），不然會等到系統預設的幾十秒到兩分鐘`)
  return { ...r, stderr: r.stderr.slice(0, m.index).trim(), ms: Number(m[1]) }
}

// 每種情況都用名稱和 IP 各測一次：腳本要真的去連線，不能照測試的主機名稱寫死答案
test('有程式在聽的 port 印出 open', () => {
  for (const host of [OPEN, openIp]) {
    const r = diagnose(host, '80')
    assert.equal(r.stdout, 'open', `${host}:80 有 nginx 在聽，應該印 open，實際印出「${r.stdout}」${r.stderr ? `，stderr：${r.stderr}` : ''}`)
  }
})

test('沒人在聽的 port 印出 refused', () => {
  for (const [host, port] of [[OPEN, '81'], [openIp, '8080']]) {
    const r = diagnose(host, port)
    assert.equal(r.stdout, 'refused', `${host}:${port} 沒有程式在聽，對方會立刻回 RST，應該印 refused，實際印出「${r.stdout}」`)
  }
})

test('封包被丟掉的位址在 2 秒左右放棄，印出 timeout', () => {
  for (const [host, port] of [['blackhole', '80'], [blackhole, '443']]) {
    const r = diagnose(host, port)
    assert.equal(r.stdout, 'timeout', `${host}:${port} 的 SYN 沒有任何回應，應該印 timeout，實際印出「${r.stdout}」：等不到回應和被拒絕是兩回事，要分開判斷`)
    assert.ok(r.ms < 4_000, `花了 ${r.ms} 毫秒：逾時設 2 秒就好`)
  }
})
