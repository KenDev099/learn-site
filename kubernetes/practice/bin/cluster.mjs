// 課程的本機叢集：node kubernetes/practice/bin/cluster.mjs up|stop|start|status|down
//   up      建立（或補齊）叢集 learn-k8s，可以重複執行
//   stop    停掉節點容器，釋放記憶體（不讀書時用）
//   start   把停掉的節點容器啟動回來
//   status  檢查每一樣東西是否正常
//   down    整個刪掉
// kubeconfig 只寫到 kubernetes/practice/.kube/config，不會碰 ~/.kube/config
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CLUSTER, KUBECONFIG, PRACTICE, kube, run, sleep } from '../helpers/k8s.ts'

const CCM = 'learn-k8s-ccm'
const ENVOY_IMAGE = 'docker.io/envoyproxy/envoy:v1.33.2'   // cloud-provider-kind v0.12.0 內建使用的版本（看它的 log）
const CCM_IMAGE = 'registry.k8s.io/cloud-provider-kind/cloud-controller-manager:v0.12.0'
// 測試與課程 manifest 用到的第三方映像：up 時在每個節點預先拉好，之後的練習不用連外網
const PRELOAD = ['node:24.22.2-alpine3.24', 'curlimages/curl:8.23.0', 'busybox:1.38.0', 'postgres:18.6-alpine3.24', 'redis:8.10.3-alpine']
const LEARN = join(PRACTICE, '..', '..')
const exportLine = `export KUBECONFIG="$PWD/${relative(LEARN, KUBECONFIG)}"`

const step = msg => console.log(`\n▸ ${msg}`)
const die = msg => { console.error(`\n✗ ${msg}`); process.exit(1) }
const must = (r, what) => { if (r.code !== 0) die(`${what}失敗：\n${r.stderr || r.stdout}`); return r.stdout }
const nodes = (all = false) => run('docker', ['ps', ...(all ? ['-a'] : []), '--filter', `label=io.x-k8s.kind.cluster=${CLUSTER}`, '--format', '{{.Names}}']).stdout.split('\n').filter(Boolean)
const exists = () => run('kind', ['get', 'clusters']).stdout.split('\n').includes(CLUSTER)

function preflight() {
  if (run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 }).code !== 0)
    die('Docker 沒有在跑：執行 docker desktop start，等 docker info 不再報錯後再試一次。')
  if (run('kind', ['version']).code !== 0) die('找不到 kind：執行 brew install kind helm kubeconform yq')
  if (run('kubectl', ['version', '--client']).code !== 0) die('找不到 kubectl：它隨 Docker Desktop 安裝，重開終端機再試。')
}

async function waitApi() {
  for (let i = 0; i < 60; i++) {
    if (kube('get', '--raw', '/readyz', '--request-timeout=5s').code === 0) return
    await sleep(2000)
  }
  die(`API server 2 分鐘內沒有回應：執行 node kubernetes/practice/bin/cluster.mjs status 看細節，或 down 之後重新 up。`)
}

function startCcm() {
  const state = run('docker', ['inspect', CCM, '--format', '{{.State.Status}}'])
  if (state.code !== 0) must(run('docker', ['run', '-d', '--name', CCM, '--restart', 'unless-stopped', '--network', 'kind',
    '-v', '/var/run/docker.sock:/var/run/docker.sock', CCM_IMAGE, '--enable-lb-port-mapping']), '啟動 cloud-provider-kind ')
  else if (state.stdout !== 'running') must(run('docker', ['start', CCM]), '啟動 cloud-provider-kind ')
}

async function up() {
  preflight()
  mkdirSync(join(PRACTICE, '.kube'), { recursive: true })
  if (!exists()) {
    step('建立 kind 叢集 learn-k8s（1 個 control-plane＋2 個 worker；第一次要下載節點映像，約 1 GB）')
    const r = run('kind', ['create', 'cluster', '--config', join(PRACTICE, 'kind.yaml'), '--kubeconfig', KUBECONFIG, '--wait', '180s'], { timeout: 900_000 })
    if (r.code !== 0) die(`kind create cluster 失敗：\n${r.stderr}`)
  } else {
    if (nodes().length < nodes(true).length) await start(false)
    must(run('kind', ['export', 'kubeconfig', '--name', CLUSTER, '--kubeconfig', KUBECONFIG]), '寫出 kubeconfig ')
  }
  await waitApi()

  step('在每個節點預先拉好第三方映像')
  for (const node of nodes()) for (const image of PRELOAD) {
    if (run('docker', ['exec', node, 'crictl', 'inspecti', `docker.io/${image}`]).code === 0) continue
    console.log(`  ${node}：${image}`)
    must(run('docker', ['exec', node, 'crictl', 'pull', `docker.io/${image}`], { timeout: 600_000 }), `${node} 拉 ${image} `)
  }

  step('建置課程映像並載入叢集')
  if (spawnSync(process.execPath, [join(PRACTICE, 'bin', 'images.mjs')], { stdio: 'inherit' }).status !== 0) die('建置課程映像失敗：看上面的訊息')

  step('安裝 metrics-server（kubectl top 與 HPA 需要）')
  must(kube('apply', '-f', join(PRACTICE, 'manifests', 'metrics-server.yaml')), '安裝 metrics-server ')

  step('把 CoreDNS 固定在 control-plane（drain worker 時 DNS 不會中斷）')
  must(kube('patch', 'deployment', 'coredns', '-n', 'kube-system', '--type', 'merge', '-p',
    JSON.stringify({ spec: { template: { spec: { nodeSelector: { 'node-role.kubernetes.io/control-plane': '' } } } } })), '設定 CoreDNS ')

  step('啟動 cloud-provider-kind（LoadBalancer 與 Gateway API）')
  // 它替每個 LoadBalancer／Gateway 開的 Envoy 容器用這個映像，先拉好，之後的練習不用連外網
  if (run('docker', ['image', 'inspect', ENVOY_IMAGE]).code !== 0) must(run('docker', ['pull', ENVOY_IMAGE], { timeout: 600_000 }), `拉 ${ENVOY_IMAGE} `)
  startCcm()

  step('建立測試工具 k8s-tools（probe、loadgen）')
  must(kube('apply', '-f', join(PRACTICE, 'manifests', 'k8s-tools.yaml')), '建立 k8s-tools ')
  const cm = must(kube('create', 'configmap', 'loadgen', '-n', 'k8s-tools', `--from-file=loadgen.mjs=${join(PRACTICE, 'shared', 'loadgen.mjs')}`, '--dry-run=client', '-o', 'yaml'), '產生 loadgen ConfigMap ')
  must(run('kubectl', ['--kubeconfig', KUBECONFIG, 'apply', '-f', '-'], { input: cm }), '建立 loadgen ConfigMap ')

  step('等所有元件就緒')
  for (const [ns, d] of [['kube-system', 'coredns'], ['kube-system', 'metrics-server'], ['k8s-tools', 'probe'], ['k8s-tools', 'loadgen']])
    must(kube('rollout', 'status', `deployment/${d}`, '-n', ns, '--timeout=180s'), `等 ${ns}/${d} `)
  must(kube('wait', '--for=condition=Available', 'apiservice/v1beta1.metrics.k8s.io', '--timeout=180s'), '等 metrics API ')

  console.log(`\n✓ 叢集準備好了。在要操作叢集的終端機（learn 資料夾）執行：\n\n  ${exportLine}\n`)
}

async function start(final = true) {
  preflight()
  if (!exists()) die('叢集不存在：執行 node kubernetes/practice/bin/cluster.mjs up')
  step('啟動節點容器')
  const all = nodes(true)
  must(run('docker', ['start', ...all.sort((a, b) => (b.includes('control-plane') ? 1 : 0) - (a.includes('control-plane') ? 1 : 0))]), '啟動節點 ')
  startCcm()
  await waitApi()
  if (final) {
    must(kube('wait', '--for=condition=Ready', 'nodes', '--all', '--timeout=180s'), '等節點 Ready ')
    console.log(`\n✓ 叢集已啟動。\n  ${exportLine}`)
  }
}

function stop() {
  const all = nodes()
  step('停止節點容器（資料都還在，start 就回來）')
  if (all.length) must(run('docker', ['stop', ...all], { timeout: 180_000 }), '停止節點 ')
  run('docker', ['stop', CCM])
  console.log('✓ 已停止。要繼續練習時執行 node kubernetes/practice/bin/cluster.mjs start')
}

function down() {
  step('刪除叢集 learn-k8s 與 cloud-provider-kind')
  run('kind', ['delete', 'cluster', '--name', CLUSTER, '--kubeconfig', KUBECONFIG], { timeout: 300_000 })
  run('docker', ['rm', '-f', CCM])
  const lbs = run('docker', ['ps', '-a', '--filter', 'name=kindccm-', '--format', '{{.Names}}']).stdout.split('\n').filter(Boolean)
  if (lbs.length) run('docker', ['rm', '-f', ...lbs])
  console.log('✓ 已刪除。要重新開始時執行 node kubernetes/practice/bin/cluster.mjs up')
}

function status() {
  const line = (ok, msg, fix = '') => console.log(`${ok ? '✓' : '✗'} ${msg}${ok || !fix ? '' : `\n    → ${fix}`}`)
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 }).code === 0
  line(docker, 'Docker', '執行 docker desktop start')
  if (!docker) return
  line(exists(), '叢集 learn-k8s 存在', '執行 cluster.mjs up')
  const running = nodes(), all = nodes(true)
  line(all.length === 3 && running.length === 3, `節點容器在跑：${running.length}/${all.length}`, '執行 cluster.mjs start')
  line(existsSync(KUBECONFIG), `kubeconfig：${relative(LEARN, KUBECONFIG)}`, '執行 cluster.mjs up')
  const api = kube('get', '--raw', '/readyz', '--request-timeout=5s').code === 0
  line(api, 'API server 回應', '剛啟動就等 30 秒；一直不行就 down 再 up')
  const ccm = run('docker', ['inspect', CCM, '--format', '{{.State.Status}}']).stdout === 'running'
  line(ccm, 'cloud-provider-kind 在跑', '執行 cluster.mjs up')
  if (!api) return
  console.log(kube('get', 'nodes', '-o', 'wide').stdout)
  const ms = kube('get', 'apiservice', 'v1beta1.metrics.k8s.io', '-o', 'jsonpath={.status.conditions[?(@.type=="Available")].status}').stdout === 'True'
  line(ms, 'metrics-server 可用', '執行 cluster.mjs up')
  const tools = kube('get', 'deploy', '-n', 'k8s-tools', '-o', 'jsonpath={range .items[*]}{.status.readyReplicas}{end}').stdout === '11'
  line(tools, 'k8s-tools（probe、loadgen）就緒', '執行 cluster.mjs up')
  console.log(`\n${exportLine}`)
}

const cmd = process.argv[2]
const actions = { up, start, stop, status, down }
if (!actions[cmd]) die('用法：node kubernetes/practice/bin/cluster.mjs up|stop|start|status|down')
await actions[cmd]()
