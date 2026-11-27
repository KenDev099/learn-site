// 練習 2：測試涵蓋契約裡的三種錯誤（用測試名稱比對，是提示用的弱檢查）
import { target } from '../../helpers/portfolio.ts'
import { dropSpecDatabase, npmTest } from './npm-test.ts'

const t = await target(import.meta.dirname, 'small', { http: false })
afterAll(() => dropSpecDatabase(t))
const run = npmTest(t)

describe('練習 2：測試名稱涵蓋三種錯誤', () => {
  for (const code of ['VALIDATION_FAILED', 'ALREADY_REGISTERED', 'EVENT_FULL']) {
    it(`有通過的測試，名稱裡寫了 ${code}`, () => {
      const hit = run.tests.filter(x => x.status === 'passed' && x.name.includes(code))
      expect(hit.length, `找不到名稱含 ${code} 的通過測試：在 describe 或 it 的名稱寫出 errorCode，例如 it('${code}：…')。這只是提示，重點是真的有測到那種錯誤`).toBeGreaterThan(0)
    })
  }
})
