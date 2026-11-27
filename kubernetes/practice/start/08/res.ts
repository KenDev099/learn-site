// 第 8 課測試共用：讀 manifest、把 CPU 與記憶體的數量（quantity）換成數字
import { join } from 'node:path'
import { kubeconform, readYaml } from '../../helpers/k8s.ts'

// 檔案先過 kubeconform，再回傳裡面所有的物件
export function readDocs(dir: string, file: string): any[] {
  const v = kubeconform([join(dir, file)])
  if (!v.ok) throw new Error(`${file} 沒通過 kubeconform（欄位名稱、縮排、型別要對）：\n${v.message}`)
  return readYaml(dir, file).filter(Boolean)
}

// deployment.yaml 裡名為 cafe-api 的 Deployment 與名為 api 的容器
export function readDeployment(dir: string): { dep: any, c: any } {
  const dep = readDocs(dir, 'deployment.yaml').find(d => d.kind === 'Deployment' && d.metadata?.name === 'cafe-api')
  if (!dep) throw new Error('deployment.yaml 裡要有名為 cafe-api 的 Deployment')
  const c = dep.spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  if (!c) throw new Error('Deployment 裡要有名為 api 的容器')
  return { dep, c }
}

// CPU：'100m'、'0.1'、1 → 毫核（millicore）
export function cpuMilli(q: unknown): number {
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(String(q ?? '').trim())
  if (!m) return NaN
  return m[2] ? Number(m[1]) : Number(m[1]) * 1000
}

const UNITS: Record<string, number> = { '': 1, k: 1e3, M: 1e6, G: 1e9, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3 }
// 記憶體：'96Mi'、'1Gi'、'96M' → bytes
export function bytes(q: unknown): number {
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|k|M|G|)$/.exec(String(q ?? '').trim())
  return m ? Number(m[1]) * UNITS[m[2]] : NaN
}
export const mib = (q: unknown) => bytes(q) / 1024 ** 2

// 記憶體要用 Mi 或 Gi：寫 M、G 是 1000 進位，數字看起來一樣、大小其實不同
export function memUnitProblem(field: string, q: unknown): string | null {
  const s = String(q ?? '')
  if (/^\d+(\.\d+)?[MG]$/.test(s)) return `${field} 寫成 ${s}：M、G 是 1000 進位（${s.slice(0, -1)}M = ${s.slice(0, -1)}×1000×1000 bytes），跟 Mi、Gi（1024 進位）不一樣。記憶體一律寫 Mi 或 Gi`
  if (!/^\d+(Mi|Gi)$/.test(s)) return `${field} 是 ${q === undefined ? '（沒寫）' : s}：記憶體寫成整數加 Mi 或 Gi，例如 96Mi`
  return null
}

export const envOf = (c: any, name: string): string | undefined => c.env?.find((e: any) => e.name === name)?.value
