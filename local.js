// 本機練習：程式寫在自己的電腦上，用 learn/check.mjs 跑測試，課程頁讀測試結果判分
// 課程頁：<body data-lesson="5" data-practice="node">，練習資料夾是 node/practice/
//   題號預設是兩位數的課號（05）；要用別的題號（例如借用別門課的練習資料夾）就加 data-task="auth20"
// 題目：<div class="local" data-test="ex1" data-files="ex1.ts">說明…</div>
//   data-test：這題的測試檔是 work/<題號>/ex1.test.*　data-files：要改的檔案（空白分隔），「看答案」顯示 answer/<題號>/ 的同名檔
//   data-files="" 或省略：程式寫在學習者自己的 repo（作品專案課），不列檔案、沒有「看答案」
// 結果檔 <課程>/practice/results/<題號>.json 由 check.mjs 寫入：{ time, tests: [{ file, name, ok, message }] }
import { el } from './course.js'

export function initLocal(onPass) {
  const { practice, lesson } = document.body.dataset
  const task = document.body.dataset.task ?? String(lesson).padStart(2, '0')
  const base = new URL(`${practice}/practice/`, import.meta.url)
  const cmd = `node check.mjs ${practice} ${task}`
  const views = [...document.querySelectorAll('.local')].map(box => setup(box, onPass, { practice, task, base, cmd }))

  const refresh = async () => {
    let data = null
    try {
      const r = await fetch(new URL(`results/${task}.json`, base), { cache: 'no-store' })
      if (r.ok) data = await r.json()
    } catch {}
    views.forEach(show => show(data))
  }
  // 在終端機跑完測試、切回這個分頁時自動更新
  addEventListener('focus', refresh)
  views.forEach(show => show.reload = refresh)
  refresh()
}

function setup(box, onPass, { practice, task, base, cmd }) {
  const test = box.dataset.test
  const files = (box.dataset.files ?? '').split(/\s+/).filter(Boolean)

  const how = el('div', 'how')
  if (files.length) {
    how.append(el('p', null, '要改的檔案：'))
    const list = el('ul')
    for (const f of files) list.append(Object.assign(el('li'), { innerHTML: `<code>${practice}/practice/work/${task}/${f}</code>` }))
    how.append(list, el('p', null, '改好存檔後，在 learn 資料夾執行（第一次執行會先建立上面的檔案）：'))
  } else how.append(el('p', null, '在你的專案啟動 API 後，在 learn 資料夾執行：'))
  const line = el('div', 'cmd')
  const copy = el('button', null, '複製')
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(cmd); copy.textContent = '已複製' } catch { copy.textContent = '請手動選取' }
    setTimeout(() => { copy.textContent = '複製' }, 1500)
  }
  line.append(el('code', null, cmd), copy)
  how.append(line)

  const reload = el('button', 'primary', '讀取測試結果')
  const meta = el('span', 'meta')
  const bar = el('div', 'bar')
  bar.append(reload, meta)
  const out = el('div', 'out')
  const verdict = el('div', 'verdict')

  // 看答案：打開時才去讀 answer/ 裡的檔案
  const shown = el('details')
  shown.append(el('summary', null, '看答案'))
  shown.ontoggle = async () => {
    if (!shown.open || shown.dataset.loaded) return
    shown.dataset.loaded = '1'
    for (const f of files) {
      const r = await fetch(new URL(`answer/${task}/${f}`, base), { cache: 'no-store' }).catch(() => null)
      shown.append(el('p', null, f), el('pre', null, r?.ok ? await r.text() : '（找不到答案檔）'))
    }
  }
  box.append(how, bar, out, verdict)
  if (files.length) box.append(shown)

  const show = data => {
    out.replaceChildren()
    verdict.className = 'verdict'
    verdict.textContent = ''
    if (!data) { meta.textContent = '還沒有測試結果'; return }
    meta.textContent = `最近一次測試：${new Date(data.time).toLocaleString()}`
    const mine = data.tests.filter(t => t.file === '*' || t.file.startsWith(test + '.'))
    if (!mine.length) { out.append(el('div', 'muted', '最近一次的測試結果裡沒有這一題。')); return }
    const ul = el('ul', 'tests')
    for (const t of mine) {
      const li = el('li', t.ok ? 'ok' : 'no', (t.ok ? '✓ ' : '✗ ') + t.name)
      if (!t.ok && t.message) li.append(el('div', 'error', t.message))
      ul.append(li)
    }
    out.append(ul)
    const bad = mine.filter(t => !t.ok).length
    verdict.className = 'verdict ' + (bad ? 'fail' : 'pass')
    verdict.textContent = bad ? `✗ 還有 ${bad} 個測試沒通過，看上面的訊息。` : '✓ 測試全部通過！'
    if (!bad) onPass(box)
  }
  reload.onclick = () => show.reload()
  return show
}
