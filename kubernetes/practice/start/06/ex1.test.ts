// 練習 1：非機密設定用 ConfigMap＋envFrom，資料庫密碼用 Secret 掛成檔案＋DB_PASSWORD_FILE
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeconform, nsName, requireCluster } from '../../helpers/k8s.ts'
import { container, readAll, waitConfigs } from './cafe.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(6, 1)
const password = randomBytes(12).toString('hex')
let staticOk = false

before(() => {
  requireCluster()
  freshNamespace(ns)
  const s = kube('create', 'secret', 'generic', 'cafe-db', '-n', ns, `--from-literal=password=${password}`)
  if (s.code !== 0) throw new Error(`測試建立 Secret cafe-db 失敗：${s.stderr}`)
})
after(() => deleteNamespace(ns))

test('ex1/ 的 ConfigMap 與 Deployment 寫對：設定走 envFrom，密碼只以檔案提供', { timeout: 30_000 }, () => {
  const docs = readAll(dir)
  assert.deepEqual(docs.filter(d => d.kind === 'Secret').map(d => d.metadata?.name), [],
    '不要自己寫 Secret 的 YAML：base64 一解就是密碼，進了 git 就外洩了。cafe-db 由測試（正式環境是外部的 secret 管理）建立')
  const v = kubeconform([dir])
  assert(v.ok, `kubeconform 沒通過（ConfigMap 的值都要是字串，true 要寫成 "true"）：\n${v.message}`)
  const cm = docs.find(d => d.kind === 'ConfigMap' && d.metadata?.name === 'cafe-config')
  assert(cm, '找不到名為 cafe-config 的 ConfigMap')
  assert.deepEqual(cm.data, { LOG_LEVEL: 'info', FEATURE_LOYALTY: 'true', APP_ENV: 'staging' },
    'cafe-config 的 data 要剛好是 LOG_LEVEL: info、FEATURE_LOYALTY: "true"、APP_ENV: staging（密碼不能放 ConfigMap）')
  const c = container(docs)
  assert((c.envFrom ?? []).some((e: any) => e.configMapRef?.name === 'cafe-config'), '容器要用 envFrom 的 configMapRef 引用 cafe-config')
  const env: any[] = c.env ?? []
  const names = env.map(e => e.name)
  for (const k of ['LOG_LEVEL', 'FEATURE_LOYALTY', 'APP_ENV'])
    assert(!names.includes(k), `env 裡不要再寫 ${k}：它要從 ConfigMap 來（env 的值會蓋過 envFrom 的同名變數）`)
  assert(!names.includes('DB_PASSWORD'), '把 DB_PASSWORD 拿掉：密碼不放環境變數，改由 DB_PASSWORD_FILE 指到掛載的檔案')
  assert(!env.some(e => e.valueFrom?.secretKeyRef), '不要用 secretKeyRef 把 Secret 變成環境變數：這題要把密碼掛成檔案')
  assert(!(c.envFrom ?? []).some((e: any) => e.secretRef), '不要用 envFrom 的 secretRef 把 Secret 整包變成環境變數：這題要把密碼掛成檔案')
  assert.equal(env.find(e => e.name === 'REQUIRE_DB')?.value, '0', 'REQUIRE_DB: "0" 要留著')
  assert.equal(env.find(e => e.name === 'DB_PASSWORD_FILE')?.value, '/run/secrets/db/password', '要有環境變數 DB_PASSWORD_FILE=/run/secrets/db/password')
  const vols: any[] = docs.find(d => d.kind === 'Deployment').spec.template.spec.volumes ?? []
  const vol = vols.find(x => x.secret?.secretName === 'cafe-db')
  assert(vol, '要有一個 volume 的 secret.secretName 是 cafe-db')
  assert.notEqual(vol.secret.optional, true, '不要加 optional: true：Secret 不存在時應該讓 Pod 起不來，而不是沒有密碼也照樣啟動')
  assert((c.volumeMounts ?? []).some((m: any) => m.name === vol.name), `容器的 volumeMounts 要掛上 volume ${vol.name}`)
  staticOk = true
})

test('套用後 /config 讀到 ConfigMap 的設定、dbPasswordLoaded 是 true，容器裡的檔案是 Secret 的值', { timeout: 240_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  const [{ pod, config }] = await waitConfigs(ns, 1, () => true, 180_000, `${ns} 裡的 cafe-api 沒有 Ready，用 kubectl describe pod -n ${ns} 看 Events`)
  assert.equal(config.LOG_LEVEL, 'info', '/config 的 LOG_LEVEL 要是 info')
  assert.equal(config.FEATURE_LOYALTY, 'true', '/config 的 FEATURE_LOYALTY 要是 "true"')
  assert.equal(config.APP_ENV, 'staging', '/config 的 APP_ENV 要是 staging')
  assert.equal(config.dbPasswordLoaded, true, 'cafe-api 讀不到 DB_PASSWORD_FILE 指的檔案：檢查 mountPath 和檔名（Secret 的 key password 會變成檔名）')
  const r = kube('exec', '-n', ns, pod.metadata.name, '-c', 'api', '--', 'cat', '/run/secrets/db/password')
  assert.equal(r.code, 0, `容器裡讀不到 /run/secrets/db/password：${r.stderr}`)
  assert.equal(r.stdout, password, '/run/secrets/db/password 的內容要是 Secret cafe-db 的 password（測試每次隨機產生）')
})
