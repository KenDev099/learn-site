// 在 Node 跑 PostgreSQL 課每一頁的 SQL：資料庫（Worker＋看門狗）與判分都直接用 postgresql/lab.js 的程式，和頁面完全相同
// 用法：node pg-verify.mjs [lesson.html…]（不給就檢查全部）
// 每題檢查：標準答案判對；起始內容、SELECT 1、每個 <script type="text/sql" data-role="wrong"> 都要判錯
import { readFileSync, readdirSync } from 'node:fs'
import { openDb, grade } from '../postgresql/lab.js'
export { openDb, grade }
export const LESSON_DIR = new URL('../postgresql/lessons/', import.meta.url).pathname
export const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
// 開頭標籤的 data-* 屬性 → 跟瀏覽器 dataset 一樣的物件（data-expect-error → expectError）
export const dataset = tag => Object.fromEntries([...tag.matchAll(/\sdata-([\w-]+)(?:="([^"]*)")?(?=[\s>])/g)]
  .map(([, k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), dec(v ?? '')]))
const script = (html, id) => html.match(new RegExp(`<script type="text/sql" id="${id}">([\\s\\S]*?)</script>`))?.[1] ?? ''
const roles = (inner, role) => [...inner.matchAll(/<script\b[^>]*\bdata-role="([\w-]+)"[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1] === role).map(m => m[2])
const OPEN = /<div class="(lab|exercise|quiz)"((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/g

// 讀一頁：page 給 openDb，items 依頁面順序列出範例（sql）與練習（spec，和瀏覽器的 spec 相同）
export function loadPage(file) {
  const html = readFileSync(file, 'utf8')
  const body = dataset(html.match(/<body((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/)[0])
  const page = { seed: script(html, 'seed'), seedAfter: script(html, 'seed-after'), extensions: body.pgExtensions ?? '', twoPc: 'pg-2pc' in body }
  const items = [...html.matchAll(OPEN)].filter(m => m[1] !== 'quiz').map(m => {
    const data = dataset(m[0])
    if (m[1] === 'lab') return { kind: 'lab', sql: data.sql }
    const inner = html.slice(m.index + m[0].length, html.indexOf('</div>', m.index))
    return { kind: 'exercise', spec: { ...data, setups: roles(inner, 'setup') }, wrongs: roles(inner, 'wrong') }
  })
  return { page, items }
}

if (process.argv[1].endsWith('pg-verify.mjs')) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(LESSON_DIR).filter(f => f.endsWith('.html')).sort().map(f => LESSON_DIR + f)
  let bad = 0
  for (const file of files) {
    const { page, items } = loadPage(file)
    console.log('==', file.split('/').pop())
    let db
    const open = async () => { db = await openDb(page) }
    try { await open() } catch (e) { console.log('  ✗ SEED 失敗:', e.message); bad++; continue }
    let li = 0, ei = 0
    for (const item of items) {
      if (db.dead) await open()   // 上一步等鎖逾時，頁面資料庫被看門狗終止了
      if (item.kind === 'lab') {
        li++
        try { const r = await db.exec(item.sql, { rowMode: 'array', stats: true }); const last = r.filter(x => x.fields?.length).at(-1); console.log(`  lab ${li}: ok${last ? ` (${last.rows.length} 列)` : ''}`) }
        catch (e) { console.log(`  lab ${li}: ERROR ${e.code} ${e.message.slice(0, 90)}`) }
        continue
      }
      ei++
      const { spec, wrongs } = item
      try {
        const self = await grade(page, db, spec, spec.answer)
        if (spec.expectError && self.want !== 'ERR') { console.log(`  ex ${ei}: ✗ 標準答案沒有以 ${spec.expectError} 失敗`); bad++; continue }
        if (self.want == null || !self.pass) { console.log(`  ex ${ei}: ✗ 標準答案無法判分或自己不通過 ${self.msg ?? self.error?.message ?? ''}`); bad++; continue }
        const problems = []
        const cases = [['起始內容', spec.start ?? ''], ['SELECT 1', 'SELECT 1;'], ...wrongs.map((w, k) => [`錯誤寫法 ${k + 1}`, w])]
        for (const [label, sql] of cases) {
          if (!sql.trim()) continue
          if (db.dead) await open()
          const r = await grade(page, db, spec, sql)
          if (r.pass) problems.push(`⚠ ${label}直接通過`)
        }
        bad += problems.length
        console.log(`  ex ${ei}: ok 期望 ${self.want === 'ERR' ? `錯誤 ${spec.expectError}` : `${JSON.parse(self.want).length} 列`}${wrongs.length ? `，${wrongs.length} 個錯誤寫法` : ''}  ${problems.join(' ')}`)
      } catch (e) { console.log(`  ex ${ei}: ✗ 標準答案執行失敗 ${e.message}`); bad++ }
    }
    db.close()
  }
  console.log(bad ? `\n✗ ${bad} 個問題` : '\n✓ 全部通過')
  process.exit(bad ? 1 : 0)
}
