// 練習 2：架構測試。只讀 src 底下的檔案，不啟動 Nest、不連資料庫。在這個資料夾執行 npm test
// 規則：
// 1. src 裡沒有循環 import
// 2. src/orders 底下的檔案不 import src/loyalty 的任何檔案
// 3. 只有 src/loyalty 底下的檔案可以出現 .stampCard. 或 .pointTransaction.（this.prisma.stampCard.…、tx.pointTransaction.… 都算）
// 每次都掃描 src 底下「現在」所有的 .ts 檔（略過 src/generated 和 *.spec.ts），不要寫死檔案清單
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

describe('架構規則', () => {
  it.todo('src 裡沒有循環 import')
  it.todo('src/orders 不 import src/loyalty')
  it.todo('只有 src/loyalty 會碰 stampCard、pointTransaction')
})
