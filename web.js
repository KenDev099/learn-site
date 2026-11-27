// HTML／CSS 練習引擎：Monaco 編輯 HTML 與 CSS、即時預覽、隱藏測試在課程頁本身執行並讀取預覽的 DOM、樣式與版面
// 由 code.js 在頁面有 .exercise.web 時載入（Monaco 與 TypeScript 由 code.js 先載好）。寫法與測試 API 見 AUTHORING.md「HTML／CSS 練習」
// 題目：<div class="exercise web" data-doc="body|full" data-edit="html css" data-widths="320 768 1280" data-height="600" data-url="https://brew.example.tw/">
//   <script type="start-html|start-css|answer-html|answer-css|fixed-html|fixed-css|tests|assets">，<script type="wrong" data-name="說明">{"html":…,"css":…}</script>
// 安全：預覽是 <iframe sandbox="allow-same-origin">（沒有 allow-scripts），學習者的程式永遠不會執行；
// 測試與 helper 都在課程頁的 realm，學習者改不到。無障礙稽核另開一個淨化過的 iframe 執行 axe-core
import { el } from './course.js'
import { makeEditor, compile } from './code.js'

const AXE = 'https://cdn.jsdelivr.net/npm/axe-core@4.14.0/axe.min.js'
const TABBABLE = 'https://cdn.jsdelivr.net/npm/tabbable@6.5.0/+esm'
const DAA = 'https://cdn.jsdelivr.net/npm/dom-accessibility-api@0.7.1/+esm'
const ASSETS = new URL('web/assets/', import.meta.url).href
// .visually-hidden 放在匿名 layer：比學習者所有的樣式（含 @layer）都弱，學習者自己寫的一定贏
const BASE_CSS = 'html{font-family:system-ui,"Noto Sans TC",sans-serif;-webkit-text-size-adjust:100%}' +
  '@layer{.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}}'
const TOTAL_MS = 8000
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '))
const RAW = new Set(['script', 'style', 'textarea', 'title'])

// <script> 資料區塊裡不能出現 </script>，題目裡的 HTML 要寫成 <\/script>，這裡還原
const part = (box, type) => (box.querySelector(`:scope > script[type="${type}"]`)?.textContent ?? '').replace(/^\n+|\s+$/g, '').replaceAll('<\\/script', '</script')
const timeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))])
const frames = () => new Promise(r => { const t = setTimeout(r, 100); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r() })) })
const round = n => Math.round(n * 2) / 2
const libs = {}, loading = {}
const lib = (name, url) => loading[name] ??= import(url).then(m => { libs[name] = m }, e => { delete loading[name]; throw e })

// ---------- 組出預覽文件 ----------
// 學習者的內容一律用 DOMParser 解析，插入引擎的元素（都加 data-engine），再序列化成 srcdoc
function assemble({ html, css, full, assets, audit, nonce }) {
  const d = new DOMParser().parseFromString(full ? html : `<body>${html}</body>`, 'text/html')
  if (!full) { d.documentElement.lang = 'zh-Hant'; d.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>練習</title>' }
  // 學習者不能讓預覽跳走或改基準網址
  d.querySelectorAll('meta[http-equiv="refresh" i], base').forEach(e => e.remove())
  if (audit) {
    d.querySelectorAll('script:not([type="application/ld+json" i]), meta[http-equiv], iframe, object, embed').forEach(e => e.remove())
    for (const e of d.querySelectorAll('*')) for (const a of [...e.attributes])
      if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name)
  }
  const files = assets.map(f => new URL(f, ASSETS).href).join(' ')
  const csp = `default-src 'none'; img-src data: blob: ${files}; media-src ${files}; font-src data: ${files}; style-src 'unsafe-inline' ${ASSETS}; base-uri 'none'; form-action 'none'` +
    (audit ? `; script-src 'nonce-${nonce}'` : '')
  const mk = (tag, attrs, text) => {
    const e = d.createElement(tag)
    e.setAttribute('data-engine', '')
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)   // nonce 一定要用 setAttribute，序列化才會出現
    if (text != null) e.textContent = text
    return e
  }
  // <base> 要在 CSP 之前（CSP 的 base-uri 'none' 只擋之後的 <base>）：相對網址都指向 web/assets/
  // 基本樣式放 head 最前面：完整文件裡學習者 head 的 <style>／<link> 在它之後，匿名 layer 一定最先宣告、最弱
  d.head.prepend(mk('base', { href: ASSETS }), mk('meta', { 'http-equiv': 'Content-Security-Policy', content: csp }), mk('style', { id: '__base' }, BASE_CSS))
  d.head.append(mk('style', { id: '__learner' }, css))
  if (audit) d.head.append(mk('script', { nonce }, audit))
  return '<!doctype html>' + d.documentElement.outerHTML
}

// 等 iframe 載入、字型、圖片
async function settleFrame(f) {
  await frames()
  const d = f.contentDocument
  await timeout(d.fonts.ready, 3000, '字型載入超過 3 秒').catch(() => {})
  const vh = f.contentWindow.innerHeight
  const imgs = [...d.images].filter(i => !i.complete && (i.loading !== 'lazy' || i.getBoundingClientRect().top < vh))
  await timeout(Promise.allSettled(imgs.map(i => i.decode())), 3000, '').catch(() => {})
  await frames()
}

function loadFrame(f, srcdoc) {
  return timeout(new Promise(r => { f.onload = r; f.srcdoc = srcdoc }), 5000, '預覽載入超過 5 秒：內容是不是太大了？')
}

// ---------- 顏色 ----------
let ctx
export function toRgb(color) {
  ctx ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, Math.round(a / 255 * 1000) / 1000]
}
const lum = ([r, g, b]) => [r, g, b].map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
export function contrast(fg, bg) {
  const b = toRgb(bg), f = toRgb(fg)
  if (b[3] < 1) throw new Error(`contrast() 的背景要不透明，拿到 ${bg}`)
  const mixed = f.slice(0, 3).map((v, i) => v * f[3] + b[i] * (1 - f[3]))
  const [hi, lo] = [lum(mixed), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ---------- CSSOM ----------
const splitTop = s => {
  const out = []; let depth = 0, cur = ''
  for (const c of s) {
    if (c === '(' || c === '[') depth++
    if (c === ')' || c === ']') depth--
    if (c === ',' && !depth) { out.push(cur.trim()); cur = '' } else cur += c
  }
  return [...out, cur.trim()].filter(Boolean)
}
const nest = (parent, sel) => {
  if (!parent) return sel
  const p = splitTop(parent).length > 1 ? `:is(${parent})` : parent
  return splitTop(sel).map(s => s.includes('&') ? s.replaceAll('&', p) : `${p} ${s}`).join(', ')
}
const head = r => r.cssText.slice(0, r.cssText.indexOf('{')).trim()
const props = style => Object.fromEntries([...style].map(n => [n, { value: style.getPropertyValue(n), important: style.getPropertyPriority(n) === 'important' }]))
// 學習者的樣式：CSS 編輯器的內容（#__learner）加上學習者自己寫在文件裡的 <style>、<link>
const learnerSheets = d => [...d.styleSheets].filter(s => s.ownerNode?.id === '__learner' || !s.ownerNode?.hasAttribute('data-engine'))
const kids = r => { try { return [...(r.cssRules ?? r.styleSheet?.cssRules ?? [])] } catch { return [] } }

function flatten(rules, ctx, out) {
  for (const r of rules) {
    const type = r.constructor.name
    if (type === 'CSSStyleRule') {
      const selector = nest(ctx.selector, r.selectorText)
      out.push({ selector, media: ctx.media, layer: ctx.layer, props: props(r.style) })
      flatten(kids(r), { ...ctx, selector }, out)
    } else if (type === 'CSSNestedDeclarations') out.push({ selector: ctx.selector, media: ctx.media, layer: ctx.layer, props: props(r.style) })
    else if (type === 'CSSFontFaceRule') out.push({ selector: '@font-face', media: ctx.media, layer: ctx.layer, props: props(r.style) })
    else if (type === 'CSSLayerBlockRule' || type === 'CSSImportRule') {
      const name = r.name ?? r.layerName
      const layer = name == null ? ctx.layer : ctx.layer ? `${ctx.layer}.${name}` : name
      flatten(kids(r), { ...ctx, layer, media: type === 'CSSImportRule' && r.media.mediaText ? [...ctx.media, '@media ' + r.media.mediaText] : ctx.media }, out)
    } else if (type !== 'CSSKeyframesRule' && 'cssRules' in r) flatten(kids(r), { ...ctx, media: [...ctx.media, head(r)] }, out)
  }
  return out
}
function tree(rules, depth) {
  return rules.map(r => {
    const node = 'selectorText' in r ? { selector: r.selectorText } : r.constructor.name === 'CSSNestedDeclarations' ? { selector: '&' } : { atRule: head(r) || r.cssText }
    return { ...node, depth, children: r.constructor.name === 'CSSKeyframesRule' ? [] : tree(kids(r), depth + 1) }
  })
}

// emulate()：把 @media 裡被模擬的特性改成恆真或恆假；forceStates 把 :hover 等換成屬性選擇器
const MQ = /\(\s*(prefers-color-scheme|prefers-reduced-motion|hover|any-hover|pointer|any-pointer)\s*(?::\s*([a-z-]+)\s*)?\)/gi
function rewrite(d, emu) {
  const want = { 'prefers-color-scheme': emu.colorScheme, 'prefers-reduced-motion': emu.reducedMotion, hover: emu.hover, 'any-hover': emu.hover, pointer: emu.pointer, 'any-pointer': emu.pointer }
  const walk = list => {
    for (let i = 0; i < list.cssRules.length; i++) {
      const r = list.cssRules[i]
      if (r.constructor.name === 'CSSMediaRule') {
        let changed = false
        const cond = r.conditionText.replace(MQ, (m, f, v) => {
          const w = want[f.toLowerCase()]
          if (w == null) return m
          changed = true
          const on = v ? v.toLowerCase() === w : !['none', 'no-preference'].includes(w)
          return on ? '(min-width: 0px)' : '(not (min-width: 0px))'
        })
        if (changed) {
          const text = '@media ' + cond + r.cssText.slice(r.cssText.indexOf('{'))
          list.deleteRule(i)
          list.insertRule(text, i)
        }
      }
      const cur = list.cssRules[i]
      if (cur.constructor.name === 'CSSStyleRule') {
        if (emu.forceStates) {
          const s = cur.selectorText.replace(/:hover\b/g, '[data-force-hover]').replace(/:active\b/g, '[data-force-active]')
            .replace(/:user-invalid\b/g, ':invalid').replace(/:user-valid\b/g, ':valid')
          if (s !== cur.selectorText) cur.selectorText = s
        }
        const cs = cur.style.getPropertyValue('color-scheme')
        if (emu.colorScheme && /light/.test(cs) && /dark/.test(cs)) cur.style.setProperty('color-scheme', emu.colorScheme)
      }
      if ('cssRules' in cur && cur.constructor.name !== 'CSSKeyframesRule') walk(cur)
      else if (cur.constructor.name === 'CSSImportRule' && cur.styleSheet) try { walk(cur.styleSheet) } catch {}
    }
  }
  for (const s of learnerSheets(d)) try { walk(s) } catch {}
  if (emu.colorScheme) d.querySelectorAll('meta[name="color-scheme" i]').forEach(m => { if (/light/.test(m.content) && /dark/.test(m.content)) m.content = emu.colorScheme })
}

// ---------- 原始碼的標籤結構（第 1 課：原始碼 vs DOM） ----------
function sourceTree(html, full) {
  let src = html
  if (full) {
    const m = src.match(/<body\b[^>]*>/i)
    src = m ? src.slice(m.index + m[0].length) : ''
  }
  const out = [], stack = []
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([a-zA-Z][\w-]*)[^>]*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g
  let m
  while ((m = re.exec(src))) {
    if (m[1]) {
      const tag = m[1].toLowerCase()
      if (tag === 'body' || tag === 'html') break
      const i = stack.lastIndexOf(tag)
      if (i >= 0) stack.length = i
    } else if (m[2]) {
      const tag = m[2].toLowerCase()
      out.push([tag, stack.length])
      // 只有 svg／math 裡的 <x /> 是自己結束；HTML 元素的 /> 會被忽略
      if (VOID.has(tag) || /\/\s*$/.test(m[3]) && (tag === 'svg' || tag === 'math' || stack.includes('svg') || stack.includes('math'))) continue
      stack.push(tag)
      if (RAW.has(tag)) {
        const end = src.toLowerCase().indexOf(`</${tag}`, re.lastIndex)
        re.lastIndex = end < 0 ? src.length : end
      }
    }
  }
  return out
}

// ---------- 一題 ----------
function setup(box, onPass) {
  const full = box.dataset.doc === 'full'
  const edit = (box.dataset.edit ?? 'html css').split(/\s+/)
  const widths = (box.dataset.widths ?? '320 768 1280').split(/\s+/).map(Number)
  const height = Number(box.dataset.height ?? 600)
  const pageUrl = box.dataset.url ?? 'https://brew.example.tw/'
  const assets = JSON.parse(part(box, 'assets') || '[]')
  const src = k => part(box, `fixed-${k}`) || part(box, `start-${k}`)
  const answer = { html: part(box, 'answer-html'), css: part(box, 'answer-css') }
  const tests = part(box, 'tests')

  // 編輯器：有內容或可以編輯的部分才顯示分頁；不在 data-edit 裡的唯讀
  const tabs = el('div', 'web-tabs'), panes = {}, editors = {}
  for (const k of ['html', 'css']) {
    if (!edit.includes(k) && !src(k)) continue
    const pane = el('div', 'web-pane')
    pane.dataset.part = k
    const ro = !edit.includes(k)
    const b = el('button', null, k.toUpperCase() + (ro ? '（唯讀）' : ''))
    b.type = 'button'
    b.onclick = () => { for (const [x, p] of Object.entries(panes)) p.hidden = x !== k; tabs.querySelectorAll('button').forEach(t => t.classList.toggle('on', t === b)) }
    tabs.append(b)
    panes[k] = pane
    box.append(pane)
    editors[k] = makeEditor(pane, src(k), k, ro)
  }
  box.insertBefore(tabs, Object.values(panes)[0])
  tabs.querySelector('button').click()
  if (tabs.childElementCount < 2) tabs.hidden = true

  // 預覽：iframe 用真實寬度排版，外框用 transform 縮小顯示
  const sizes = el('div', 'web-sizes')
  const stage = el('div', 'web-preview')
  sizes.append(el('span', 'kbd', '預覽寬度'))
  for (const w of widths) {
    const b = el('button', null, w + 'px')
    b.type = 'button'
    b.onclick = () => preview(w)
    sizes.append(b)
  }
  const run = el('button', null, '更新預覽')
  const check = el('button', 'primary', '檢查答案')
  const bar = el('div', 'bar')
  bar.append(run, check, el('span', 'kbd', '⌘/Ctrl + Enter 檢查'))
  const out = el('div', 'out')
  const verdict = el('div', 'verdict')
  const shown = el('details')
  shown.append(el('summary', null, '看答案'), ...['html', 'css'].filter(k => answer[k]).map(k => el('pre', null, answer[k])))
  box.append(sizes, stage, bar, out, verdict, shown)

  let t, frame, size = { w: widths.at(-1) ?? 1280, h: height }, emu = {}, allowed = assets
  // 測試只用唯讀部分的原始內容，不信任唯讀編輯器的狀態
  const content = () => Object.fromEntries(['html', 'css'].map(k => [k, edit.includes(k) && editors[k] ? editors[k].getValue() : src(k)]))
  const fit = () => {
    if (!frame) return
    const s = Math.min(1, stage.clientWidth / size.w)
    frame.style.transform = `scale(${s})`
    stage.style.height = size.h * s + 'px'
    sizes.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === size.w + 'px'))
  }
  new ResizeObserver(fit).observe(stage)

  async function build() {
    const f = el('iframe')
    f.setAttribute('sandbox', 'allow-same-origin')
    f.setAttribute('title', '預覽')
    f.style.cssText = `border:0;display:block;transform-origin:0 0;width:${size.w}px;height:${size.h}px`
    stage.replaceChildren(f)
    frame = f
    fit()
    const c = content()
    await loadFrame(f, assemble({ ...c, full, assets: allowed }))
    if (Object.keys(emu).length) rewrite(f.contentDocument, emu)
    await settleFrame(f)
  }
  async function preview(w = 1280, h = height) {
    size = { w, h }
    if (!frame) return build()
    frame.style.width = w + 'px'
    frame.style.height = h + 'px'
    fit()
    await settleFrame(frame)
  }

  // ---------- 給隱藏測試用的 helper（全部在課程頁執行） ----------
  const D = () => frame.contentDocument, W = () => frame.contentWindow
  const style = (e, prop, pseudo) => W().getComputedStyle(e, pseudo).getPropertyValue(prop)
  const box_ = e => { const r = e.getBoundingClientRect(); return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), top: round(r.top), right: round(r.right), bottom: round(r.bottom), left: round(r.left) } }
  const docBox = e => { const b = box_(e), sx = W().scrollX, sy = W().scrollY; return { ...b, x: b.x + sx, y: b.y + sy, left: b.left + sx, right: b.right + sx, top: b.top + sy, bottom: b.bottom + sy } }
  const clips = e => { const s = W().getComputedStyle(e); return s.overflowX !== 'visible' || s.overflowY !== 'visible' }
  const textColors = e => {
    const color = style(e, 'color')
    for (let x = e; x; x = x.parentElement) {
      if (style(x, 'background-image') !== 'none') throw new Error(`textColors()：${x.tagName.toLowerCase()} 有 background-image，沒辦法算對比`)
      const bg = style(x, 'background-color')
      if (toRgb(bg)[3] === 1) return { color, background: bg }
    }
    return { color, background: 'rgb(255, 255, 255)' }
  }
  const visible = e => {
    if (!e?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const b = box_(e), db = docBox(e)
    if (b.width <= 1 || b.height <= 1 || db.right <= 0 || db.bottom <= 0) return false
    for (let x = e; x && x !== D().documentElement; x = x.parentElement) {
      const s = W().getComputedStyle(x)
      if (/inset\(\s*(50%|[5-9]\d%|100%)|circle\(\s*0/.test(s.clipPath)) return false
      const m = s.clip.match(/rect\(([^)]*)\)/)
      if (m && s.position.match(/absolute|fixed/)) { const [t, r, bt, l] = m[1].split(/[\s,]+/).map(parseFloat); if (r - l <= 1 || bt - t <= 1) return false }
      if (x !== e && clips(x)) { const c = box_(x); if (b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom) return false }
    }
    if (e.textContent.trim()) {
      if (parseFloat(style(e, 'font-size')) < 1) return false
      try { const { color, background } = textColors(e); if (contrast(color, background) < 1.1) return false } catch {}
    }
    return true
  }
  const overflowX = () => { const s = D().scrollingElement; return s.scrollWidth - s.clientWidth }
  const overflowing = () => {
    const vw = D().documentElement.clientWidth
    return [...D().body.querySelectorAll('*')].filter(e => {
      if (!visible(e) || box_(e).right <= vw + 0.5) return false
      for (let x = e.parentElement; x && x !== D().body; x = x.parentElement) if (clips(x)) return false
      return true
    })
  }
  const settle = () => { for (const a of D().getAnimations()) { try { if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish() } catch {} } }
  const focus = e => { e.focus({ focusVisible: true }); return D().activeElement }
  const ring = e => ({ os: style(e, 'outline-style'), ow: parseFloat(style(e, 'outline-width')), oc: style(e, 'outline-color'), bs: style(e, 'box-shadow'), bc: style(e, 'border-top-color'), bg: style(e, 'background-color') })
  const focusRing = e => {
    settle(); D().activeElement?.blur(); settle()
    const a = ring(e)
    focus(e); settle()
    const b = ring(e)
    const outline = b.os !== 'none' && b.ow >= 2 && (a.os !== b.os || a.ow !== b.ow || a.oc !== b.oc)
    const shadow = b.bs !== 'none' && b.bs !== a.bs
    const solid = c => toRgb(c)[3] === 1
    const color = (x, y) => x !== y && solid(x) && solid(y) && contrast(x, y) >= 3
    return { outline: `${b.os} ${b.ow}px ${b.oc}`, boxShadow: b.bs, changed: outline || shadow || color(a.bc, b.bc) || color(a.bg, b.bg) }
  }
  const absolute = href => { try { return new URL(href, pageUrl).href } catch { return href } }
  const headInfo = () => {
    const d = D(), q = s => [...d.head.querySelectorAll(s)].filter(e => !e.hasAttribute('data-engine'))
    const meta = n => q(`meta[name="${n}" i]`)[0]?.getAttribute('content') ?? null
    const attr = (e, n) => e.getAttribute(n)
    const jsonLd = [], jsonLdErrors = []
    for (const s of d.querySelectorAll('script[type="application/ld+json" i]')) { try { jsonLd.push(JSON.parse(s.textContent)) } catch (e) { jsonLdErrors.push(e.message) } }
    const rel = r => q('link[rel]').filter(l => l.relList.contains(r))
    return {
      title: d.title, lang: d.documentElement.getAttribute('lang'),
      charset: q('meta[charset]')[0]?.getAttribute('charset') ?? null,
      viewport: meta('viewport'), description: meta('description'), robots: meta('robots'),
      canonical: rel('canonical').map(l => absolute(attr(l, 'href'))),
      alternates: rel('alternate').filter(l => l.hasAttribute('hreflang')).map(l => ({ hreflang: attr(l, 'hreflang'), href: absolute(attr(l, 'href')) })),
      og: Object.fromEntries(q('meta[property^="og:" i]').map(m => [m.getAttribute('property'), m.getAttribute('content')])),
      icons: q('link[rel]').filter(l => /\bicon\b/i.test(l.rel)).map(l => absolute(attr(l, 'href'))),
      preloads: rel('preload').map(l => ({ href: absolute(attr(l, 'href')), as: attr(l, 'as'), fetchpriority: attr(l, 'fetchpriority'), type: attr(l, 'type'), crossorigin: attr(l, 'crossorigin'), imagesrcset: attr(l, 'imagesrcset'), imagesizes: attr(l, 'imagesizes'), media: attr(l, 'media') })),
      links: q('link').map(l => ({ rel: attr(l, 'rel'), href: l.hasAttribute('href') ? absolute(attr(l, 'href')) : null, crossorigin: attr(l, 'crossorigin'), media: attr(l, 'media'), as: attr(l, 'as') })),
      jsonLd, jsonLdErrors,
    }
  }
  const probe = len => {
    const p = D().createElement('div')
    p.style.cssText = `position:absolute;left:0;top:0;height:0;display:block;width:${len}`
    D().body.append(p)
    const w = p.getBoundingClientRect().width
    p.remove()
    return w
  }
  const sizesAt = img => {
    const sizes = img.getAttribute('sizes')
    if (!sizes) return probe('100vw')
    for (const entry of splitTop(sizes)) {
      let i = entry.length, len
      if (entry.endsWith(')')) {
        let depth = 0
        for (i = entry.length - 1; i >= 0; i--) { if (entry[i] === ')') depth++; if (entry[i] === '(' && !--depth) break }
        while (i > 0 && /[a-z-]/i.test(entry[i - 1])) i--
      } else i = entry.search(/\S+$/)
      len = entry.slice(i).trim()
      const cond = entry.slice(0, i).trim()
      if (cond && !W().matchMedia(cond).matches) continue
      return len === 'auto' ? box_(img).width : probe(len)
    }
    return probe('100vw')
  }
  const pickSrc = (img, dpr) => {
    const list = splitTop(img.getAttribute('srcset') ?? '').map(c => {
      const [url, d] = c.split(/\s+/)
      return { url, density: !d ? 1 : d.endsWith('w') ? parseFloat(d) / sizesAt(img) : parseFloat(d) }
    })
    // HTML 規範：srcset 沒有 w 描述子也沒有 1x 時，src 當成 1x
    if (img.getAttribute('src') && !/\d\s*w\b/.test(img.getAttribute('srcset') ?? '') && !list.some(c => c.density === 1)) list.push({ url: img.getAttribute('src'), density: 1 })
    if (!list.length) return ''
    list.sort((a, b) => a.density - b.density)
    return (list.find(c => c.density >= dpr) ?? list.at(-1)).url
  }
  const cssRules = () => learnerSheets(D()).flatMap(s => { try { return flatten([...s.cssRules], { selector: '', media: [], layer: null }, []) } catch { return [] } })
  const ruleTree = () => learnerSheets(D()).flatMap(s => { try { return tree([...s.cssRules], 0) } catch { return [] } })
  const fonts = () => {
    const faces = cssRules().filter(r => r.selector === '@font-face')
    const unq = s => s.replace(/^["']|["']$/g, '')
    return [...D().fonts].map(f => ({ family: unq(f.family), display: f.display, unicodeRange: f.unicodeRange, status: f.status, src: faces.find(r => unq(r.props['font-family']?.value ?? '') === unq(f.family))?.props.src?.value ?? '' }))
  }
  const domTree = () => {
    const out = []
    const walk = (e, depth) => { for (const c of e.children) { if (c.hasAttribute('data-engine')) continue; out.push([c.localName, depth]); walk(c, depth + 1) } }
    walk(D().body, 0)
    return out
  }
  const sourceDoc = () => new DOMParser().parseFromString(content().html, 'text/html')
  const role = e => {
    const r = libs.daa.getRole(e) ?? ''
    if ((r === 'banner' || r === 'contentinfo') && e.parentElement?.closest('article, aside, main, nav, section')) return 'generic'
    if (r === 'region' && !accName(e)) return 'generic'
    return r
  }
  const accName = e => libs.daa.computeAccessibleName(e)
  const tabOrder = () => libs.tabbable.tabbable(D().body, { displayCheck: 'full' })
  const axe = async (opts = {}) => {
    const src = await (libs.axeSrc ??= fetch(AXE).then(r => { if (!r.ok) throw new Error(); return r.text() }).catch(e => { delete libs.axeSrc; throw e }))
      .catch(() => { throw new Error('無障礙檢查沒有跑完：下載不了 axe-core，檢查一下網路') })
    const f = el('iframe')
    f.style.cssText = `position:fixed;left:-10000px;top:0;border:0;width:${size.w}px;height:${size.h}px`
    f.setAttribute('aria-hidden', 'true')
    document.body.append(f)
    try {
      await loadFrame(f, assemble({ ...content(), full, assets: allowed, audit: src, nonce: crypto.randomUUID().replaceAll('-', '') }))
      if (Object.keys(emu).length) rewrite(f.contentDocument, emu)
      await settleFrame(f)
      const run = f.contentWindow.axe?.run(f.contentDocument, opts.rules
        ? { runOnly: { type: 'rule', values: opts.rules }, resultTypes: ['violations', 'incomplete'] }
        : { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] })
      if (!run) throw new Error('axe 沒有載入')
      const r = await timeout(run, 5000, 'timeout')
      const pick = list => list.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target.join(' ')) }))
      return { violations: pick(r.violations), incomplete: pick(r.incomplete) }
    } catch (e) {
      throw new Error('無障礙檢查沒有跑完' + (e.message === 'timeout' ? '（超過 5 秒）' : `：${e.message}`))
    } finally { f.remove() }
  }
  const atWidths = async (ws, fn) => {
    for (const w of ws) {
      await preview(w)
      try { await fn(w) } catch (e) { e.message = `在 ${w}px 寬時：${e.message}`; throw e }
    }
  }
  const emulate = async (o = {}) => { emu = { ...o }; await build() }
  const render = async ({ assets: a } = {}) => { allowed = a ?? assets; await build() }

  // assert：跟 code.js 相同的寫法，訊息用中文
  const show = v => typeof v === 'string' ? `'${v}'` : JSON.stringify(v)
  const eq = (a, b) => Object.is(a, b) || (a && b && typeof a === 'object' && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => eq(a[k], b[k])))
  const fail = (msg, a, e) => { throw new Error(`${msg ? msg + '：' : ''}預期 ${show(e)}，實際是 ${show(a)}`) }
  const assert = (v, msg) => { if (!v) throw new Error(msg ?? '條件不成立') }
  assert.ok = assert
  assert.equal = (a, e, msg) => Object.is(a, e) || fail(msg, a, e)
  assert.notEqual = (a, e, msg) => { if (Object.is(a, e)) throw new Error(`${msg ? msg + '：' : ''}不應該是 ${show(a)}`) }
  assert.deepEqual = (a, e, msg) => eq(a, e) || fail(msg, a, e)
  assert.match = (s, re, msg) => { if (!re.test(s)) throw new Error(`${msg ? msg + '：' : ''}${show(s)} 不符合 ${re}`) }
  assert.doesNotMatch = (s, re, msg) => { if (re.test(s)) throw new Error(`${msg ? msg + '：' : ''}${show(s)} 不應該符合 ${re}`) }

  let compiled
  async function runTests() {
    const results = []
    let current = '（測試開始前）'
    const queue = []
    const api = Object.freeze(Object.defineProperties({
      preview, $: s => D().querySelector(s), $$: s => [...D().querySelectorAll(s)], style, box: box_, docBox, overflowX, overflowing, visible,
      tabOrder, focus, focusRing, accName, role, toRgb, contrast, textColors, axe, head: headInfo, visibleText: (e = D().body) => e.innerText.replace(/\s+/g, ' ').trim(),
      sizesAt, pickSrc, cssRules, ruleTree, fonts, sourceTree: () => sourceTree(content().html, full), domTree, emulate, render, atWidths, settle, sourceDoc,
      assert, test: (name, fn) => queue.push([name, fn]),
    }, { doc: { get: D, enumerable: true }, win: { get: W, enumerable: true } }))
    compiled ??= (await compile(`async function __t() {\n${tests}\n}`)).js.replace(/^\s*export\s*\{\s*\};?\s*$/m, '')
    // 用到的函式庫先載好，accName()、role()、tabOrder() 才能是同步的
    const need = [/\b(accName|role)\s*\(/.test(tests) && lib('daa', DAA), /\btabOrder\s*\(/.test(tests) && lib('tabbable', TABBABLE)].filter(Boolean)
    try { await timeout(Promise.all(need), 10000, '') } catch { return [{ name: '載入測試工具', ok: false, message: '下載不了測試需要的函式庫，檢查一下網路' }] }
    // with 讓測試直接用 doc、win 這些名稱，而且 emulate() 重建預覽後拿到的是新的 document
    const body = new Function('api', `with (api) {\n${compiled}\nreturn __t()\n}`)
    const all = (async () => {
      await body(api)
      for (const [name, fn] of queue) {
        current = name
        try { await fn(); results.push({ name, ok: true }) }
        catch (e) { results.push({ name, ok: false, message: e?.message ?? String(e) }) }
      }
    })()
    try { await timeout(all, TOTAL_MS, 'timeout') }
    catch (e) {
      results.push(e.message === 'timeout'
        ? { name: current, ok: false, message: `測試超過 ${TOTAL_MS / 1000} 秒沒有完成` }
        : { name: '檢查', ok: false, message: e?.message ?? String(e) })
    }
    return results
  }

  const busy = async fn => { run.disabled = check.disabled = true; try { await fn() } finally { run.disabled = check.disabled = false } }
  const judge = (ok, text) => {
    verdict.className = 'verdict ' + (ok ? 'pass' : 'fail')
    verdict.textContent = (ok ? '✓ ' : '✗ ') + text
    if (ok) onPass(box)
  }
  // 更新預覽不鎖「檢查答案」：檢查先等正在跑的更新結束再自己重建預覽，鎖住的話剛好在更新時按下的檢查會被吃掉
  // 測試期間不更新預覽（會蓋掉測試的預覽與 emulate()），期間有編輯就等測試結束後更新一次
  let refreshing, testing = false, edited = false
  const refresh = () => { emu = {}; allowed = assets; return refreshing = build().catch(e => { out.replaceChildren(el('div', 'error', e.message)) }) }
  run.onclick = refresh
  check.onclick = () => busy(async () => {
    testing = true
    try { await test() } finally {
      testing = false
      if (edited) { edited = false; refresh() }
    }
  })
  async function test() {
    clearTimeout(t)
    await refreshing
    out.replaceChildren()
    verdict.className = 'verdict'
    verdict.textContent = ''
    emu = {}; allowed = assets; size = { w: widths.at(-1) ?? 1280, h: height }
    let results
    try { await build(); results = await runTests() }
    catch (e) { results = [{ name: '預覽', ok: false, message: e.message }] }
    const ul = el('ul', 'tests')
    for (const r of results) ul.append(el('li', r.ok ? 'ok' : 'no', `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : '：' + r.message}`))
    if (results.length) out.append(ul)
    const bad = results.filter(r => !r.ok)
    if (!results.length) judge(false, '這題沒有任何測試')
    else if (bad.length) judge(false, `有 ${bad.length} 項沒通過，看上面的說明。`)
    else judge(true, '正確！')
  }
  // 編輯時 300 ms 後更新預覽
  for (const [k, ed] of Object.entries(editors)) {
    if (!edit.includes(k)) continue
    ed.onDidChangeModelContent(() => { clearTimeout(t); if (testing) edited = true; else t = setTimeout(refresh, 300) })
    ed.addAction({ id: 'check', label: '檢查答案', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => check.click() })
  }
  build().catch(() => {})
}

export function initWeb(onPass) {
  document.querySelectorAll('.exercise.web').forEach(b => setup(b, onPass))
}
