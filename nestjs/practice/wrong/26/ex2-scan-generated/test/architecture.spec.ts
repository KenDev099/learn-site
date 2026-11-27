// 練習 2：架構測試。只讀 src 底下的檔案，不啟動 Nest、不連資料庫。在這個資料夾執行 npm test
// 沒有略過 src/generated：產生的 Prisma Client 註解裡就有 prisma.stampCard.findMany()
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

// 每次都重新列出 src 底下所有的 .ts：新加的檔案也會被檢查。產生的 Prisma Client 不是我們寫的，略過
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map(f => join(SRC, f))
const code = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))
const rel = (f: string) => relative(SRC, f)

// 一個檔案 import 了 src 裡的哪些檔案。'./x.js' 實際上是 x.ts；import type 在執行時不存在，不算循環
function importsOf(file: string, { types = true } = {}) {
  const found: string[] = []
  for (const m of code.get(file)!.matchAll(/(import|export)\s+(type\s+)?[^'"]*?from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g)) {
    if (m[2] && !types) continue
    const target = resolve(dirname(file), m[3] ?? m[4]).replace(/\.js$/, '.ts')
    if (code.has(target)) found.push(target)
  }
  return found
}

// 深度優先搜尋：走到一個「還在目前路徑上」的檔案，就是繞回來了
function findCycle(): string[] | undefined {
  const done = new Set<string>()
  const path: string[] = []
  const visit = (f: string): string[] | undefined => {
    if (path.includes(f)) return [...path.slice(path.indexOf(f)), f]
    if (done.has(f)) return
    path.push(f)
    for (const next of importsOf(f, { types: false })) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    path.pop()
    done.add(f)
  }
  for (const f of files) {
    const cycle = visit(f)
    if (cycle) return cycle
  }
}

const under = (folder: string) => (f: string) => rel(f).startsWith(folder + '/')

describe('架構規則', () => {
  it('src 裡沒有循環 import', () => {
    expect(findCycle()?.map(rel).join(' → '), '循環 import').toBeUndefined()
  })

  it('src/orders 不 import src/loyalty', () => {
    const bad = files.filter(under('orders')).flatMap(f => importsOf(f).filter(under('loyalty')).map(t => `${rel(f)} → ${rel(t)}`))
    expect(bad, 'orders 不能認識 loyalty：改成發事件').toEqual([])
  })

  it('只有 src/loyalty 會碰 stampCard、pointTransaction', () => {
    const bad = files.filter(f => !under('loyalty')(f) && /\.(stampCard|pointTransaction)\./.test(code.get(f)!)).map(rel)
    expect(bad, '這些檔案直接查 loyalty 的資料表：改成呼叫 loyalty 的公開 service').toEqual([])
  })
})
