import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import StoreLink from './StoreLink.vue'

const render = (url: string, label = '總店官網') => mount(StoreLink, { props: { label, url } })

describe('練習 3：StoreLink 只把 http、https 渲染成連結', () => {
  test('https、http 的網址：渲染成 <a>，href 是解析後的網址', () => {
    for (const url of ['https://coffee.example/stores/1', 'http://coffee.example', 'HTTPS://Coffee.Example/a b']) {
      const a = render(url).find('a')
      expect(a.exists(), `${url} 要渲染成 <a>`).toBe(true)
      expect(a.attributes('href'), 'href 用 new URL(url).href（解析後的網址）').toBe(new URL(url).href)
      expect(a.text()).toBe('總店官網')
    }
  })

  test('連結要開新分頁並加 rel="noopener noreferrer"', () => {
    const a = render('https://coffee.example').find('a')
    expect(a.attributes('target'), '要加 target="_blank"').toBe('_blank')
    const rel = a.attributes('rel') ?? ''
    expect(rel.includes('noopener') && rel.includes('noreferrer'), '要加 rel="noopener noreferrer"：不讓新分頁拿到 window.opener，也不送出 Referer').toBe(true)
  })

  test('javascript:、data:、看不懂的字串：顯示成純文字，不是連結', () => {
    const bad = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'httpx://coffee.example',
      '/stores/1',
      'https://',
      '總店官網',
    ]
    for (const url of bad) {
      const w = render(url)
      expect(w.find('a').exists(), `${JSON.stringify(url)} 不能渲染成 <a>：用 new URL() 解析後只允許 http: 和 https:（白名單）`).toBe(false)
      expect(w.find('[href]').exists(), `${JSON.stringify(url)} 不能出現在任何 href 裡`).toBe(false)
      expect(w.text(), '要顯示門市名稱的純文字').toContain('總店官網')
      expect(w.text(), '純文字要附上原始網址：「門市名稱（原始網址）」').toContain(url.trim())
    }
  })

  test('label、url 裡的 HTML 只當文字顯示', () => {
    const evil = '<img src=x onerror=alert(1)>'
    for (const w of [render('https://coffee.example', evil), render(evil, evil)]) {
      expect(w.find('img').exists(), 'label、url 不能被當成 HTML：用 {{ }} 顯示，不要用 v-html').toBe(false)
      expect(w.text(), '原本的字要原樣顯示出來').toContain(evil)
    }
  })

  test('props 改變時跟著重新判斷', async () => {
    const w = render('https://coffee.example')
    await w.setProps({ url: 'javascript:alert(1)' })
    expect(w.find('a').exists(), '網址改成 javascript: 之後連結要消失：用 computed 從 props 算，不要在 setup 只算一次').toBe(false)
    await w.setProps({ url: 'https://coffee.example/new' })
    expect(w.find('a').attributes('href')).toBe('https://coffee.example/new')
  })

  test('原始碼不用 v-html、innerHTML', () => {
    const source = readFileSync(join(import.meta.dirname, 'StoreLink.vue'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    expect(/v-html|innerHTML/.test(source), 'StoreLink.vue 不能用 v-html 或 innerHTML：使用者輸入一律用 {{ }} 顯示').toBe(false)
  })
})
