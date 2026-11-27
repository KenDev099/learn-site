// 第 12 課測試共用：讀 manifest、在 Pod 裡跑指令、從 Pod 裡試連線
import { join } from 'node:path'
import { CLUSTER_CMD, kube, kubeconform, readYaml, waitFor } from '../../helpers/k8s.ts'

export const FIXTURES = join(import.meta.dirname, 'fixtures')

// 檔案先過 kubeconform，再回傳裡面的物件
export function readManifest(dir: string, file: string): any[] {
  const v = kubeconform([join(dir, file)])
  if (!v.ok) throw new Error(`${file} 沒通過 kubeconform（欄位名稱、縮排、型別要對）：\n${v.message}`)
  return readYaml(dir, file)
}

export const describe = (docs: any[]) => docs.map(d => `${d.kind}/${d.metadata?.name}`).join('、') || '（沒有）'

// 在 Pod 的容器裡執行指令（不丟例外）
export const exec = (ns: string, target: string, ...cmd: string[]) => kube('exec', '-n', ns, target, '--', ...cmd)

// 在 Pod 裡用 node 依序試著 TCP 連線，回傳 { 'host:port': 'open' | 錯誤碼 }。cafe-api 的映像有 node
const TCP = `const net=require('net');const r={};let n=0;const t=process.argv.slice(1);
for(const a of t){const [h,p]=a.split(':');const s=net.connect({host:h,port:+p});
const done=v=>{if(r[a])return;r[a]=v;s.destroy();if(++n===t.length)console.log(JSON.stringify(r))};
s.setTimeout(3000,()=>done('timeout'));s.on('connect',()=>done('open'));s.on('error',e=>done(e.code||e.message))}`
export function tcpFrom(ns: string, pod: string, targets: string[]): Record<string, string> {
  const r = exec(ns, pod, 'node', '-e', TCP, ...targets)
  if (r.code !== 0 || !r.stdout) throw new Error(`在 ${pod} 裡試連線失敗：${r.stderr}`)
  return JSON.parse(r.stdout)
}

// 新 namespace 的 default ServiceAccount 由 controller-manager 建立，叢集忙時會晚幾秒；直接建 Pod 的題目先等它
export const waitDefaultSa = (ns: string) =>
  waitFor(() => kube('get', 'serviceaccount', 'default', '-n', ns).code === 0, 180_000, `namespace ${ns} 的 default ServiceAccount 一直沒出現：執行 ${CLUSTER_CMD} status 檢查 controller-manager`)
