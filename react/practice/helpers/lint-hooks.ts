// 用 eslint-plugin-react-hooks 檢查一個檔案：Hook 的規則（rules-of-hooks）與依賴陣列（exhaustive-deps）
// 回傳違規清單（沒有就是 []）。用法：expect(await lintHooks(join(import.meta.dirname, 'useMenu.ts'))).toEqual([])
// 一次大約 1 秒，測試請給 20 秒 timeout
import { ESLint } from 'eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'

export type HookProblem = { rule: string; line: number; message: string }

export async function lintHooks(file: string, rules: Record<string, 'error' | 'off'> = {}): Promise<HookProblem[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.{ts,tsx,js,jsx}'],
      languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
      // 套件附的型別跟 ESLint 10 的 Plugin 型別對不上（執行時沒問題），所以轉型
      plugins: { 'react-hooks': reactHooks as unknown as ESLint.Plugin },
      rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error', ...rules },
    }],
  })
  const [result] = await eslint.lintFiles([file])
  return (result?.messages ?? []).map(m => ({ rule: m.ruleId ?? 'parse', line: m.line, message: m.message }))
}
