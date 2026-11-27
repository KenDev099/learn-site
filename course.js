// 每門課共用：進度、課程 roadmap、選擇題、上下課導覽、練習進度

export const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

// ---------- 進度（只存在這台瀏覽器，每門課一個 key） ----------
export function getProgress(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
}
function markDone(key, n) {
  try { localStorage.setItem(key, JSON.stringify({ ...getProgress(key), [n]: true })) } catch {}
}

// ---------- 課程首頁：照階段列出每一課，完成的打勾 ----------
export function renderRoadmap(root, stages, key) {
  const done = getProgress(key)
  // 第 3 個元素（選用）：這個階段的一頁圖解，連結放在階段標題旁
  for (const [title, list, sheet] of stages) {
    const sec = el('section', 'stage')
    sec.innerHTML = `<h2>${title}${sheet ? ` <a class="sheet" href="${sheet}">一頁圖解</a>` : ''}</h2><ol></ol>`
    // 第 4 欄 '選修'：偏原理、實務上可以先跳過的課
    for (const [n, name, file, optional] of list) {
      const li = el('li', done[n] ? 'done' : null)
      li.innerHTML = `<span class="n">${n}.</span>` +
        (file ? `<a href="lessons/${file}">${name}</a>` : `<span class="muted">${name}</span>`) +
        `<span class="tag">${done[n] ? '✓ 完成' : file ? (optional ?? '') : '製作中'}</span>`
      sec.querySelector('ol').append(li)
    }
    root.append(sec)
  }
}

// ---------- 課程頁 ----------
// 選擇題：<div class="quiz" data-correct="b"><p>題目</p><label data-key="a">…</label>…<p class="why">解說</p></div>
function setupQuiz(box, onPass) {
  const name = 'q' + Math.random().toString(36).slice(2)
  box.querySelectorAll('label[data-key]').forEach(l => {
    const input = el('input')
    input.type = 'radio'
    input.name = name
    l.prepend(input)
    input.onchange = () => {
      box.querySelectorAll('label').forEach(x => x.classList.remove('pass', 'fail'))
      const ok = l.dataset.key === box.dataset.correct
      l.classList.add(ok ? 'pass' : 'fail')
      box.classList.toggle('answered', ok)
      if (ok) onPass(box)
    }
  })
}

function renderNav(lessons, n) {
  const i = lessons.findIndex(l => l[0] === n)
  const link = (l, label) => l?.[2]
    ? Object.assign(el('a', null, `${label}${l[0]}. ${l[1]}`), { href: l[2] })
    : el('span', 'muted', l ? `${label}${l[0]}. ${l[1]}（製作中）` : '')
  const nav = el('nav', 'lesson-nav')
  nav.append(link(lessons[i - 1], '← '), Object.assign(el('a', null, 'Roadmap'), { href: '../index.html' }), link(lessons[i + 1], '→ '))
  document.querySelector('main').append(nav)
}

// 時間軸（.tl）：逐步顯示每一列 tr[data-note]，下方顯示目前步驟的說明
function setupTimeline(tl) {
  const rows = [...tl.querySelectorAll('tr[data-note]')]
  const note = tl.querySelector('.note')
  const count = tl.querySelector('[data-count]')
  const prev = tl.querySelector('[data-prev]')
  const next = tl.querySelector('[data-next]')
  let cur = 0
  const show = () => {
    rows.forEach((r, i) => {
      r.classList.toggle('now', i === cur)
      r.classList.toggle('later', i > cur)
    })
    note.textContent = rows[cur].dataset.note
    count.textContent = `步驟 ${cur + 1} / ${rows.length}`
    prev.disabled = cur === 0
    next.textContent = cur === rows.length - 1 ? '↺ 重新播放' : '下一步 ▶'
  }
  prev.onclick = () => { cur--; show() }
  next.onclick = () => { cur = cur === rows.length - 1 ? 0 : cur + 1; show() }
  show()
}

// 每一課共用的部分：導覽、選擇題、時間軸、練習進度。回傳 onPass，給各門課自己的練習元件呼叫
// stages（選用）：傳 STAGES 進來，這一課所屬的階段有一頁圖解時，連結接在頁首的階段名稱後面
export function initLesson(lessons, key, stages = []) {
  const n = Number(document.body.dataset.lesson)
  renderNav(lessons, n)
  const sheet = stages.find(([, list]) => list.some(l => l[0] === n))?.[2]
  if (sheet) document.querySelector('.eyebrow')?.append(' · ', Object.assign(el('a', 'sheet', '一頁圖解'), { href: '../' + sheet }))
  const tasks = [...document.querySelectorAll('.exercise, .quiz, .local')]
  const passed = new Set()
  const status = el('div', 'status', '')
  const update = () => {
    status.textContent = tasks.length ? `練習進度 ${passed.size} / ${tasks.length}` : ''
    if (passed.size === tasks.length) {
      markDone(key, n)
      status.textContent += tasks.length ? '　🎉 本課完成！' : ''
    }
  }
  const onPass = box => { passed.add(box); update() }
  document.querySelector('header').append(status)
  document.querySelectorAll('.quiz').forEach(b => setupQuiz(b, onPass))
  document.querySelectorAll('.tl').forEach(setupTimeline)
  highlightCode()
  update()
  return onPass
}

// 課文的 <pre> 用 highlight.js 自動判斷語言並上色。
// 有 id 或 class 的 pre 是互動元件的輸出，裡面有其他標籤（例如 strong）的上色後會失去標記，都跳過。
// 練習的「看答案」是各課引擎之後才產生的，所以展開 <details> 時再上色一次
const HLJS = 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/'
function highlightCode() {
  for (const [theme, media] of [['github', 'not all and (prefers-color-scheme: dark)'], ['github-dark', '(prefers-color-scheme: dark)']])
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${HLJS}styles/${theme}.min.css`, media }))
  const hljs = import(HLJS + 'es/highlight.min.js').then(({ default: h }) => {
    h.configure({ languages: ['typescript', 'javascript', 'json', 'bash', 'sql', 'yaml', 'xml', 'css', 'ini', 'plaintext'] })
    return h
  })
  const paint = root => hljs.then(h => root.querySelectorAll('pre:not([id]):not([class])').forEach(b => b.children.length || h.highlightElement(b)))
  paint(document.querySelector('main'))
  document.addEventListener('toggle', e => e.target.open && paint(e.target), true)
}

// 課程頁的進入點（PostgreSQL 課有自己的引擎，不用這個）：
// 頁面有程式練習（.lab、.exercise）就載入 code.js，有本機練習（.local）就載入 local.js
export function startLesson(lessons, key, stages) {
  const onPass = initLesson(lessons, key, stages)
  if (document.querySelector('.lab, .exercise')) import('./code.js').then(m => m.initCode(onPass))
  if (document.querySelector('.local')) import('./local.js').then(m => m.initLocal(onPass))
}
