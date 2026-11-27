// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { build, type Rolldown } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './app/src/router.ts'
import AdminReports from './app/src/pages/AdminReports.vue'
import HomePage from './app/src/pages/HomePage.vue'

const MARKER = 'ADMIN_REPORTS_MARKER'
const root = join(import.meta.dirname, 'app')

async function bundle() {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [vue()],
    build: { write: false, rolldownOptions: { input: join(root, 'src/main.ts') } },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  return outputs.flatMap(o => o.output).filter((c): c is Rolldown.OutputChunk => c.type === 'chunk')
}

describe('練習 3：管理報表頁懶載入', () => {
  test('vite build：主 chunk 不含 AdminReports，它在自己的 chunk 裡', async () => {
    const chunks = await bundle()
    const entry = chunks.find(c => c.isEntry)
    expect(entry, '（測試前提）打包結果要有入口 chunk').toBeDefined()
    expect(entry!.code.includes(MARKER), '主 chunk 裡有 AdminReports 的程式碼：路由的 component 要寫成 () => import(…)，而且不能有任何地方靜態 import AdminReports.vue').toBe(false)
    const lazy = chunks.filter(c => c.isDynamicEntry && c.code.includes(MARKER))
    expect(lazy.length, '要有一個動態載入的 chunk 包含 AdminReports：用 defineAsyncComponent 包住已經靜態 import 的元件，不會切出新的 chunk').toBe(1)
    expect(entry!.code.includes('歡迎光臨'), '首頁維持靜態 import，留在主 chunk').toBe(true)
  }, 60_000)

  test('導航到 /admin/reports 仍然顯示管理報表', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/admin/reports')
    const record = router.currentRoute.value.matched[0]
    expect(record?.name, '路由名稱維持 admin-reports').toBe('admin-reports')
    expect(record!.components!.default, '導航完成後，Vue Router 會把載入函式換成載入到的元件；路由元件直接給 () => import(…)，不要包 defineAsyncComponent（官方文件不建議用在路由）').toBe(AdminReports)
    await router.push('/')
    expect(router.currentRoute.value.matched[0]!.components!.default, '首頁仍是 HomePage').toBe(HomePage)
  })
})
