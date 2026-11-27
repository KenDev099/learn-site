// PostgreSQL 課的判分漏洞回歸案例：把標準答案改壞（或改成等價寫法），確認判分結果符合預期
// 新的課（27 課以後）把錯誤寫法直接寫在練習框的 <script type="text/sql" data-role="wrong">，由 pg-verify.mjs 檢查；這裡只留舊案例
import { LESSON_DIR, loadPage, openDb, grade } from './pg-verify.mjs'
let bad = 0
async function t(file, n, mutate, expectPass, label) {
  const { page, items } = loadPage(LESSON_DIR + file)
  const { spec } = items.filter(x => x.kind === 'exercise')[n - 1]
  const sql = mutate(spec.answer)
  if (sql === spec.answer) { bad++; console.log('✗ 替換沒有作用：', label); return }
  const db = await openDb(page)
  const { pass } = await grade(page, db, spec, sql); db.close()
  if (pass !== expectPass) bad++
  console.log(pass === expectPass ? '✓' : '✗', label, '→', pass ? '通過' : '不通過')
}
await t('13-data-types.html', 4, a => a.replace('uuid PRIMARY KEY', 'uuid NOT NULL'), false, '13-4 主鍵改成 NOT NULL')
await t('26-capstone.html', 2, a => a.replace('points <> 0', 'points = 0'), false, '26-2 CHECK 條件寫反')
await t('26-capstone.html', 2, a => a.replace('member_id integer NOT NULL REFERENCES members(id),\n  points', 'member_id integer NOT NULL REFERENCES cafe_tables(id),\n  points'), false, '26-2 外鍵指錯表')
await t('24-rls.html', 2, a => a.replace("current_setting('app.user_id')::integer", '2'), false, '24-2 寫死顧客 2')
await t('24-rls.html', 3, a => a.replace("current_setting('app.user_id')::integer", '3'), false, '24-3 寫死顧客 3')
await t('20-indexes.html', 1, a => a.replace('(ordered_at)', '(ordered_at DESC)'), true, '20-1 DESC 索引')
await t('18-transactions.html', 1, a => a.replace(/COMMIT;\s*$/, 'COMMIT;\nBEGIN;'), false, '18-1 COMMIT 後又 BEGIN')
await t('18-transactions.html', 1, a => a.replace(/COMMIT;\s*$/, ''), false, '18-1 忘了 COMMIT')
await t('06-update-delete.html', 1, a => 'BEGIN;\n' + a + '\nCOMMIT;', true, '06-1 自己包 BEGIN/COMMIT')
console.log(bad ? `✗ ${bad} 個問題` : '✓ 全部符合預期')
process.exit(bad ? 1 : 0)
