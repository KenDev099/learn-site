// 咖啡店網站的前端程式（練習用的網站，不用改）
const CART = 'brew-cart'
const read = () => JSON.parse(sessionStorage.getItem(CART) ?? '[]')

for (const button of document.querySelectorAll('.add-to-cart')) {
  button.addEventListener('click', () => {
    const section = button.closest('section')
    const size = section.querySelector('input[type="radio"]:checked').value
    const cart = [...read(), { name: button.dataset.item, size, qty: 1 }]
    // 模擬呼叫購物車 API：300 毫秒後才更新畫面
    setTimeout(() => {
      sessionStorage.setItem(CART, JSON.stringify(cart))
      document.querySelector('.cart-count').textContent = String(cart.length)
    }, 300)
  })
}

const summary = document.querySelector('.summary')
if (summary) for (const item of read()) {
  const li = document.createElement('li')
  li.textContent = `${item.name}（${item.size}）× ${item.qty}`
  summary.append(li)
}

for (const el of document.querySelectorAll('[data-reveal-after]')) {
  setTimeout(() => { el.hidden = false }, Number(el.dataset.revealAfter))
}

const form = document.querySelector('form.checkout')
form?.addEventListener('submit', async event => {
  event.preventDefault()
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: read(), name: form.elements.name.value, phone: form.elements.phone.value }),
  })
  const { id } = await res.json()
  sessionStorage.removeItem(CART)
  document.querySelector('.result').textContent = `訂單已成立，訂單編號 ${id}，請到門市取餐。`
})
