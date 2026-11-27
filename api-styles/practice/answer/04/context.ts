// 練習 3：每個請求的 context。Yoga 每收到一個請求就呼叫一次 createContext
import type { Db } from '../../helpers/db.ts'
import { createLoaders, type Loaders } from './loaders.ts'

export type Context = { db: Db, loaders: Loaders }

// 每個請求一份新的 loader：快取只活在這個請求裡，請求結束就跟著回收
export function createContext(db: Db): Context {
  return { db, loaders: createLoaders(db) }
}
