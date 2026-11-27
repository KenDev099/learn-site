import { describe, expect, test } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

// 回傳 loadConfig 列出的所有問題；沒丟錯就是 []
function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env)
    return []
  } catch (e) {
    expect(e, '設定有問題時要丟出 ConfigError（帶 problems 陣列），不是一般的 Error').toBeInstanceOf(ConfigError)
    return (e as ConfigError).problems
  }
}

describe('練習 2：啟動時驗證設定', () => {
  test('合法的設定：網址去掉結尾的 /，feature flags 轉成 Set', () => {
    const config = loadConfig({
      VITE_API_BASE_URL: 'https://api.coffee.example/v1/',
      VITE_FEATURE_FLAGS: 'newMenu, darkMode,,',
      MODE: 'production',
    })
    expect(config.apiBaseUrl, 'apiBaseUrl 要去掉結尾的 /').toBe('https://api.coffee.example/v1')
    expect(config.featureFlags, 'VITE_FEATURE_FLAGS 用逗號分隔、去掉空白和空字串，轉成 Set').toEqual(new Set(['newMenu', 'darkMode']))
  })

  test('開發時可以用 http://localhost；沒有 feature flags 就是空的 Set', () => {
    const config = loadConfig({ VITE_API_BASE_URL: 'http://localhost:3000' })
    expect(config.apiBaseUrl, 'http://localhost:3000 是合法的開發設定').toBe('http://localhost:3000')
    expect(config.featureFlags, '沒有 VITE_FEATURE_FLAGS 時要回傳空的 Set').toEqual(new Set())
  })

  test('缺少 VITE_API_BASE_URL 或不是完整網址：丟出 ConfigError', () => {
    for (const env of [{}, { VITE_API_BASE_URL: '' }, { VITE_API_BASE_URL: 'api.coffee.example' }, { VITE_API_BASE_URL: '/api' }]) {
      const problems = problemsOf(env)
      expect(problems.length, `${JSON.stringify(env)} 要回報一個問題：必填檢查之後，用 new URL() 解析，失敗就記下來`).toBe(1)
      expect(problems[0], '問題的文字要包含變數名稱 VITE_API_BASE_URL，部署的人才知道要改哪裡').toContain('VITE_API_BASE_URL')
    }
  })

  test('只接受 https，或 hostname 真的是 localhost 的 http', () => {
    for (const url of ['http://api.coffee.example', 'http://localhost.evil.com', 'http://localhost@evil.com', 'ftp://localhost/menu']) {
      expect(problemsOf({ VITE_API_BASE_URL: url }).length, `${url} 要被拒絕：用 new URL() 解析後檢查 protocol 與 hostname，不要用 startsWith 比對字串`).toBe(1)
    }
  })

  test('VITE_ 開頭又像密鑰的變數要報錯；沒有 VITE_ 的不會進前端，不用管', () => {
    const problems = problemsOf({
      VITE_API_BASE_URL: 'https://api.coffee.example',
      VITE_PAYMENT_SECRET: 'sk_live_xxx',
      VITE_db_password: 'pw',
      PAYMENT_SECRET: 'server-only',
    })
    expect(problems.length, '要回報 VITE_PAYMENT_SECRET 和 VITE_db_password 兩個問題（名稱比對不分大小寫）；PAYMENT_SECRET 沒有 VITE_ 前綴，不會被打包，不算').toBe(2)
    expect(problems.join('\n'), '問題的文字要包含變數名稱').toContain('VITE_PAYMENT_SECRET')
    expect(problems.join('\n')).toContain('VITE_db_password')
    expect(problemsOf({ VITE_API_BASE_URL: 'https://a.example', VITE_STRIPE_PRIVATE_KEY: 'x' }).length, '含 PRIVATE 也要報錯').toBe(1)
  })

  test('所有問題一次列出', () => {
    const problems = problemsOf({ VITE_PAYMENT_SECRET: 'x', VITE_ADMIN_PASSWORD: 'y' })
    expect(problems.length, '缺網址＋兩個密鑰，要一次回報 3 個問題：先把問題收集到陣列，最後才丟錯，部署的人才不用改一個、重跑一次').toBe(3)
  })
})
