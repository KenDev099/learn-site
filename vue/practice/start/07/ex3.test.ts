import { describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import OrderItemList from './OrderItemList.vue'

const items = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 5, name: '可頌', price: 70 },
]

// 找出顯示某個品名的那一列 <li>
function rowOf(wrapper: VueWrapper, name: string) {
  const row = wrapper.findAll('li.row').find(r => r.get('.name').text() === name)
  expect(row, `畫面上找不到「${name}」那一列`).toBeTruthy()
  return row!
}

function noteOf(wrapper: VueWrapper, name: string) {
  return (rowOf(wrapper, name).get('input.note').element as HTMLInputElement).value
}

describe('練習 3：v-for 用穩定的 key', () => {
  test('刪掉第一筆後，拿鐵的備註還在拿鐵那列', async () => {
    const wrapper = mount(OrderItemList, { props: { initial: items } })
    await rowOf(wrapper, '拿鐵').get('input.note').setValue('少冰')
    const latteRow = rowOf(wrapper, '拿鐵').element

    await rowOf(wrapper, '美式咖啡').get('button.remove').trigger('click')

    expect(wrapper.findAll('li.row').map(r => r.get('.name').text()), '刪除後要剩下拿鐵、可頌').toEqual(['拿鐵', '可頌'])
    expect(noteOf(wrapper, '拿鐵'), '「少冰」不在拿鐵那列：key 是 index 或沒有 key 時，Vue 依位置重用 <li>，備註跟著位置走。改用品項的 id 當 key').toBe('少冰')
    expect(noteOf(wrapper, '可頌'), '可頌那列的備註應該是空的：備註跑到別的品項了，key 要用穩定的 id').toBe('')
    expect(rowOf(wrapper, '拿鐵').element === latteRow,
      '拿鐵那列不是原本的 <li>：key 要讓 Vue 重用同一個品項的 DOM 元素，不要用 index、亂數或含 index 的字串（index 一變 key 就變，元素會被重建）').toBe(true)
  })

  test('依價格排序後，備註跟著品項走', async () => {
    const wrapper = mount(OrderItemList, { props: { initial: items } })
    await rowOf(wrapper, '拿鐵').get('input.note').setValue('少冰')
    await rowOf(wrapper, '可頌').get('input.note').setValue('加熱')
    const latteRow = rowOf(wrapper, '拿鐵').element

    await wrapper.get('button.sort').trigger('click')

    expect(wrapper.findAll('li.row').map(r => r.get('.name').text()), '排序後要是拿鐵、美式咖啡、可頌').toEqual(['拿鐵', '美式咖啡', '可頌'])
    expect(noteOf(wrapper, '拿鐵'), '排序後拿鐵的備註不見了或跑掉了：key 要用品項的 id').toBe('少冰')
    expect(noteOf(wrapper, '美式咖啡'), '美式咖啡沒有備註，卻出現別人的備註：key 要用品項的 id').toBe('')
    expect(noteOf(wrapper, '可頌'), '可頌的備註要還是「加熱」').toBe('加熱')
    expect(rowOf(wrapper, '拿鐵').element === latteRow, '排序後拿鐵那列要是原本的 <li>（被移動，而不是被重建或換內容）').toBe(true)
  })

  test('換一組資料也一樣：刪除中間那筆', async () => {
    const wrapper = mount(OrderItemList, {
      props: {
        initial: [
          { id: 4, name: '伯爵紅茶', price: 90 },
          { id: 3, name: '卡布奇諾', price: 110 },
          { id: 6, name: '起司蛋糕', price: 120 },
        ],
      },
    })
    await rowOf(wrapper, '起司蛋糕').get('input.note').setValue('切半')
    await rowOf(wrapper, '卡布奇諾').get('button.remove').trigger('click')
    expect(noteOf(wrapper, '起司蛋糕'), '刪掉中間那筆後，起司蛋糕的備註要還在：key 要用品項的 id').toBe('切半')
    expect(noteOf(wrapper, '伯爵紅茶'), '伯爵紅茶的備註要是空的').toBe('')
  })

  test('同一張訂單有兩杯拿鐵：key 要能分辨同名的品項', async () => {
    const wrapper = mount(OrderItemList, {
      props: {
        initial: [
          { id: 2, name: '拿鐵', price: 110 },
          { id: 7, name: '拿鐵', price: 110 },
          { id: 5, name: '可頌', price: 70 },
        ],
      },
    })
    const rows = () => wrapper.findAll('li.row')
    await rows()[1].get('input.note').setValue('熱')
    const secondLatte = rows()[1].element

    await rows()[0].get('button.remove').trigger('click')

    expect(rows().map(r => r.get('.name').text()), '刪除第一杯拿鐵後要剩下拿鐵、可頌').toEqual(['拿鐵', '可頌'])
    expect((rows()[0].get('input.note').element as HTMLInputElement).value,
      '第二杯拿鐵的備註「熱」不見了：品名、價格會重複，不是品項的身分。key 要用 id').toBe('熱')
    expect(rows()[0].element === secondLatte, '剩下的拿鐵要是原本第二杯的 <li>：key 要用每一筆都不同的 id').toBe(true)
  })

  test('資料改變但順序不變時，同一列只更新內容、不重建', async () => {
    const wrapper = mount(OrderItemList, { props: { initial: items } })
    const rows = wrapper.findAll('li.row').map(r => r.element)
    await rowOf(wrapper, '可頌').get('button.remove').trigger('click')
    const after = wrapper.findAll('li.row').map(r => r.element)
    expect(after[0] === rows[0] && after[1] === rows[1], '刪掉最後一筆時，前兩列要沿用原本的 <li>：key 不能每次渲染都不同（例如 Math.random()）').toBe(true)
  })
})
