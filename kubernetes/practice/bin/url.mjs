// 從 Mac 連到叢集裡的 LoadBalancer Service 或 Gateway：node kubernetes/practice/bin/url.mjs <namespace> <service 名稱|gateway/名稱> [port]
// cloud-provider-kind 在 macOS 上為每個 LoadBalancer／Gateway 開一個 kindccm-* 的 Envoy 容器，把 port 對應到主機的臨時 port；
// 這個指令用 docker port 查出來，印出 http://localhost:<主機 port>
import { run } from '../helpers/k8s.ts'

const [ns, target, port = '80'] = process.argv.slice(2)
if (!target) {
  console.error('用法：node kubernetes/practice/bin/url.mjs <namespace> <service 名稱|gateway/名稱> [port]')
  process.exit(1)
}
const [kind, name] = target.includes('/') ? target.split('/') : ['service', target]
const deadline = Date.now() + 60_000
for (;;) {
  const containers = run('docker', ['ps', '--filter', 'name=kindccm-', '--format', '{{.Names}}']).stdout.split('\n').filter(Boolean)
  for (const c of containers) {
    const labels = JSON.parse(run('docker', ['inspect', c, '--format', '{{json .Config.Labels}}']).stdout || '{}')
    const key = kind === 'gateway' ? 'io.x-k8s.cloud-provider-kind.gateway.name' : 'io.x-k8s.cloud-provider-kind.loadbalancer.name'
    if (labels[key] !== `learn-k8s/${ns}/${name}`) continue
    const mapped = run('docker', ['port', c, `${port}/tcp`]).stdout.split('\n').find(l => l.startsWith('0.0.0.0:'))
    if (mapped) { console.log(`http://localhost:${mapped.split(':')[1]}`); process.exit(0) }
  }
  if (Date.now() > deadline) {
    console.error(`60 秒內找不到 ${ns}/${kind} ${name} 對應的 kindccm 容器：先確認 kubectl get ${kind} -n ${ns} ${name} 已經有 EXTERNAL-IP／ADDRESS，以及 ${'node kubernetes/practice/bin/cluster.mjs status'} 裡 cloud-provider-kind 在跑`)
    process.exit(1)
  }
  await new Promise(r => setTimeout(r, 2000))
}
