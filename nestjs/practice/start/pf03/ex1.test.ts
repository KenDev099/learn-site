// 練習 1：你的 repo 的 npm test 全部通過，有單元測試也有 E2E
import { target } from '../../helpers/portfolio.ts'
import { dropSpecDatabase, npmTest } from './npm-test.ts'

const t = await target(import.meta.dirname, 'small', { http: false })
afterAll(() => dropSpecDatabase(t))
const run = npmTest(t)

describe('練習 1：npm test', () => {
  it('全部通過', () => {
    const failed = run.tests.filter(x => x.status === 'failed').map(x => x.name)
    expect(failed, `這些測試沒過（在你的 repo 執行 npm test 看細節）`).toEqual([])
    expect(run.ok, `npm test 沒有成功結束（測試檔載入失敗、globalSetup 出錯也算）：\n${run.output}`).toBe(true)
  })

  it('沒有 skip、todo：每個測試都真的執行', () => {
    const skipped = run.tests.filter(x => x.status !== 'passed' && x.status !== 'failed').map(x => `${x.name}（${x.status}）`)
    expect(skipped, '拿掉 it.skip、it.todo、it.only（.only 會讓其他測試變成 skipped）').toEqual([])
  })

  it('至少 8 個測試', () => {
    expect(run.tests.length, `只有 ${run.tests.length} 個測試：驗證、404、409、名額併發、取消、分頁各至少一個`).toBeGreaterThanOrEqual(8)
  })

  it('至少一個 E2E 測試檔（test/**/*.e2e-spec.ts）有跑到', () => {
    const e2e = run.tests.filter(x => /[\\/]test[\\/].*\.e2e-spec\.ts$/.test(x.file))
    expect(e2e.length, 'npm test 沒有跑到 test/ 底下的 *.e2e-spec.ts：vitest.config.ts 的 include 要包含 test/**/*.e2e-spec.ts').toBeGreaterThan(0)
  })
})
