// 每一題的資源名稱都從資料夾名稱算出來（work/13 → 13、verify/13-4242-answer → 13_4242_answer），
// 所以學習者的 work/ 和出題檢查的 verify/ 可以同時跑、互不影響。prepare.mjs 與 vitest.config.ts 共用
import { basename } from 'node:path'

export const taskSlug = (codeDir: string) => basename(codeDir).toLowerCase().replace(/[^a-z0-9]+/g, '_')

export function taskEnv(codeDir: string) {
  const slug = taskSlug(codeDir)
  return {
    DATABASE_URL: `postgresql://learn:learn@127.0.0.1:5433/nest_${slug}_test`,   // 判分專用，每次判分前重建
    REDIS_URL: 'redis://127.0.0.1:6380/1',                                       // 判分用 DB 1，開發用 DB 0
    REDIS_PREFIX: `nest-${slug}-test`,                                           // Keyv namespace、BullMQ prefix 都用它；每次判分前刪掉這個前綴的 key
  }
}
