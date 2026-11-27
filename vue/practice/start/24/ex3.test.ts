import { describe, expect, test } from 'vitest'
import { defineComponent, h } from 'vue'
import { hydrate, serverRender } from '../../helpers/ssr.ts'
import PhoneField from './PhoneField.vue'

const TwoFields = defineComponent({
  name: 'TwoFields',
  render: () => h('form', [h(PhoneField), h(PhoneField)]),
})
const OtherPage = defineComponent({
  name: 'OtherPage',
  render: () => h('main', [h('p', '菜單'), h(PhoneField)]),
})

const idsIn = (html: string) => [...html.matchAll(/<input[^>]*\sid="([^"]*)"/g)].map(m => m[1])

async function check(label: string) {
  const html = await serverRender(TwoFields)
  const serverIds = idsIn(html)
  expect(serverIds.length, '要渲染出兩個 input').toBe(2)
  const { container, warnings } = hydrate(html, TwoFields)
  expect(warnings, `${label}有 hydration 警告：id 不能用 Math.random() 或模組層級的計數器，改用 Vue 3.5 的 useId()`).toEqual([])
  const inputs = [...container.querySelectorAll('input')]
  const labels = [...container.querySelectorAll('label')]
  expect(inputs.map(i => i.id), `${label}hydrate 後的 id 要和伺服器 HTML 一樣`).toEqual(serverIds)
  expect(serverIds[0] !== serverIds[1], '兩個 PhoneField 的 id 不能一樣').toBe(true)
  expect(labels.map(l => l.getAttribute('for')), 'label 的 for 要等於 input 的 id').toEqual(serverIds)
  for (const id of serverIds) expect(id, 'id 不能是空字串').not.toBe('')
}

describe('練習 3：PhoneField 的 id', () => {
  test('伺服器與瀏覽器的 id 一致、兩個欄位不重複', async () => {
    await check('')
  })

  test('伺服器先處理過別的請求，hydrate 仍一致', async () => {
    await serverRender(OtherPage)
    await serverRender(OtherPage)
    await check('伺服器先渲染過別的頁面後，')
  })
})
