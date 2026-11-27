// 練習 3：每個請求的 context。Yoga 每收到一個請求就呼叫一次 createContext
import type { Db } from '../../helpers/db.ts'
import { createLoaders, type Loaders } from './loaders.ts'

export type Context = { db: Db, loaders: Loaders }

// 起始程式為了「省下建立 loader 的成本」把它存在模組變數裡
let loaders: Loaders | undefined

export function createContext(db: Db): Context {
  loaders ??= createLoaders(db)
  return { db, loaders }
}
