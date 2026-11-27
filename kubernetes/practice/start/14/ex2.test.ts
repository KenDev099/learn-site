// 練習 2：沒有 shell 的映像。inspect.sh 要用 kubectl debug 加臨時容器，讀出映像裡的 UV_THREADPOOL_SIZE 與 NODE_OPTIONS；
// deployment.yaml 不換映像，用 env 把 UV_THREADPOOL_SIZE 改成 4
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, dockerBuild, freshNamespace, kindLoad, kubeIn, kubeJson, kubectlVerb, nsName, PRACTICE, probe, readYaml, requireCluster, run, runScript, spyKubectl, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex2')
const nsInspect = nsName(14, 2, 'inspect'), ns = nsName(14, 2)
const APP = join(PRACTICE, 'shared', 'cafe-api')
const DOCKERFILE = join(dir, 'image', 'Dockerfile')
const IMAGE = 'learn-k8s/cafe-hash:v1'
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

before(() => requireCluster())
after(() => { deleteNamespace(nsInspect); deleteNamespace(ns) })

// 測試自己部署的目標：映像的 ENV 每次隨機，猜不到、也不在任何 manifest 裡
function target(image: string) {
  return {
    apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'cafe-hash' },
    spec: {
      replicas: 1, selector: { matchLabels: { app: 'cafe-hash' } },
      template: {
        metadata: { labels: { app: 'cafe-hash' } },
        spec: { containers: [{
          name: 'api', image, imagePullPolicy: 'IfNotPresent', env: [{ name: 'REQUIRE_DB', value: '0' }],
          readinessProbe: { httpGet: { path: '/health/ready', port: 3000 }, periodSeconds: 2 },
          resources: { requests: { cpu: '50m', memory: '96Mi' }, limits: { memory: '256Mi' } },
        }] },
      },
    },
  }
}

test('inspect.sh：用 kubectl debug 的臨時容器讀出執行中容器的 UV_THREADPOOL_SIZE 與 NODE_OPTIONS', { timeout: 540_000 }, async () => {
  const pool = pick(['1', '2', '3']), heap = pick(['96', '112', '128', '144', '160', '176'])
  const tag = `learn-k8s/cafe-hash:check-${pool}-${heap}`
  dockerBuild(APP, tag, { dockerfile: DOCKERFILE, buildArgs: { POOL: pool, HEAP: heap } })
  kindLoad(tag)
  freshNamespace(nsInspect)
  const a = kubeIn(JSON.stringify(target(tag)), 'apply', '-n', nsInspect, '-f', '-')
  assert.equal(a.code, 0, `部署測試目標失敗：${a.stderr}`)
  await waitPodsReady(nsInspect, 'app=cafe-hash', 1, 300_000)

  const spy = spyKubectl()
  try {
    const r = runScript(dir, 'inspect.sh', [nsInspect], { env: spy.env })
    const calls = spy.calls()
    const debug = calls.find(c => kubectlVerb(c)[0] === 'debug')
    assert(debug, 'inspect.sh 沒有呼叫 kubectl debug：distroless 映像沒有 shell，kubectl exec 進不去，要加一個臨時容器')
    assert(debug.some(x => /^--target(=|$)/.test(x)), 'kubectl debug 沒有加 --target=api：沒有它，臨時容器看不到 api 的程序，/proc/1 會是臨時容器自己')
    const pod = kubeJson('get', 'pods', '-n', nsInspect, '-l', 'app=cafe-hash').items[0]
    assert(pod.spec.ephemeralContainers?.length, '執行中的 Pod 沒有任何臨時容器：kubectl debug 要真的加到 Pod 上（不要用 --copy-to 建複本）')
    const out = r.stdout
    const got = { pool: /^UV_THREADPOOL_SIZE=(.*)$/m.exec(out)?.[1], opts: /^NODE_OPTIONS=(.*)$/m.exec(out)?.[1] }
    assert(got.pool !== undefined && got.opts !== undefined,
      `inspect.sh 要印出 UV_THREADPOOL_SIZE=… 與 NODE_OPTIONS=… 兩行，實際印出：\n${out.slice(0, 600) || '（沒有輸出）'}\n${r.stderr.slice(0, 600)}\n` +
      '看到 Permission denied：讀別的使用者的 /proc/1/environ 要 SYS_PTRACE，用 --profile=general；只看到臨時容器自己的環境變數：要讀的是 /proc/1/environ，不是在臨時容器裡執行 env')
    assert.equal(got.pool, pool, `印出的 UV_THREADPOOL_SIZE=${got.pool}，執行中的容器其實是 ${pool}：值要從 /proc/1/environ 讀，不能猜或寫死`)
    assert.equal(got.opts, `--max-old-space-size=${heap}`, `印出的 NODE_OPTIONS=${got.opts}，執行中的容器其實是 --max-old-space-size=${heap}`)
  } finally {
    spy.cleanup()
  }
})

test('deployment.yaml：映像不變，用 env 把 UV_THREADPOOL_SIZE 改成 4，套用後 /config 看得到', { timeout: 540_000 }, async () => {
  const dep = readYaml(dir, 'deployment.yaml').find(d => d.kind === 'Deployment')
  const c = dep?.spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  assert(c, 'deployment.yaml 要保留 Deployment cafe-hash 與容器 api')
  assert.equal(c.image, IMAGE, `映像改成了 ${c.image}：換成有 shell 的映像來查，查到的是另一個東西。維持 ${IMAGE}，用臨時容器查`)
  const env = c.env?.find((e: any) => e.name === 'UV_THREADPOOL_SIZE')
  assert(env, '容器還沒有 UV_THREADPOOL_SIZE 環境變數：Pod 的 env 會蓋過映像的 ENV')
  assert.equal(env.value, '4', `UV_THREADPOOL_SIZE 是 ${JSON.stringify(env.value)}：改成字串 "4"（env 的 value 一定是字串，要加引號）`)

  // 映像：學習者跑過 break.sh 的話主機上已經有；沒有就建一個（kind 遇到節點上已有同一個映像會跳過）
  if (run('docker', ['image', 'inspect', IMAGE]).code !== 0)
    dockerBuild(APP, IMAGE, { dockerfile: DOCKERFILE, buildArgs: { POOL: '1', HEAP: '128' } })
  kindLoad(IMAGE)
  freshNamespace(ns)
  applyDir(join(dir, 'deployment.yaml'), ns)
  await waitPodsReady(ns, 'app=cafe-hash', 1, 300_000)
  const r = probe(`http://cafe-hash.${ns}.svc.cluster.local/config`)
  assert.equal(r.status, 200, `GET /config 失敗（${r.status || r.error}）`)
  const cfg = JSON.parse(r.body)
  assert.equal(cfg.UV_THREADPOOL_SIZE, '4', `執行中的容器 UV_THREADPOOL_SIZE 是 ${cfg.UV_THREADPOOL_SIZE}`)
})
