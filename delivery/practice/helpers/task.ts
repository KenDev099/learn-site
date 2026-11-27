// 每一題的資源名稱都從資料夾名稱算出來（work/05 → 05、verify/05-4242-answer → 05_4242_answer），
// 所以學習者的 work/ 和出題檢查的 verify/ 可以同時跑、互不影響。prepare.mjs 與 vitest.config.ts 共用
import { basename } from 'node:path'

export const taskSlug = (codeDir: string) => basename(codeDir).toLowerCase().replace(/[^a-z0-9]+/g, '_')

export function taskEnv(codeDir: string) {
  return {
    DATABASE_URL: `postgresql://learn:learn@127.0.0.1:5436/delivery_${taskSlug(codeDir)}_test`,   // 判分專用，每次判分前重建
    TZ: 'UTC',   // 正式機跑在 UTC：沒有指定 Asia/Taipei 的時間寫法會在這裡現形
  }
}
