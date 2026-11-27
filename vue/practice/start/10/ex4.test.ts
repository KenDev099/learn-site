import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import CustomerForm from './CustomerForm.vue'

function mountParent() {
  // 凍結的物件：元件只要改到它的屬性就會丟 TypeError
  const original = deepFreeze({ name: '王小明', phone: '0912345678' })
  const customer = ref(original)
  const wrapper = mount({ components: { CustomerForm }, setup: () => ({ customer }), template: '<CustomerForm v-model="customer" />' })
  return { wrapper, original, customer }
}

async function type(wrapper: ReturnType<typeof mount>, name: string, text: string) {
  try {
    await wrapper.get(`input[name="${name}"]`).setValue(text)
  } catch (e) {
    throw new Error(`輸入時丟出錯誤（${(e as Error).message}）：不要寫 model.value.${name} = …，要指定一個新物件給 model.value`)
  }
}

describe('練習 4：model 是物件時，指定新物件而不是改屬性', () => {
  test('改姓名：父元件拿到新物件，原物件沒被修改', async () => {
    const { wrapper, original, customer } = mountParent()
    await type(wrapper, 'name', '陳美華')
    expect(original, '原物件被改了：不要改 model 物件的屬性').toEqual({ name: '王小明', phone: '0912345678' })
    expect(customer.value !== original, '父元件拿到的還是原物件：要用 { ...model.value, name: 新值 } 這類寫法建立新物件').toBe(true)
    expect(customer.value, '新物件的內容不對：改到的欄位用新值，其他欄位保留').toEqual({ name: '陳美華', phone: '0912345678' })
  })

  test('改電話：其他欄位保留', async () => {
    const { wrapper, customer } = mountParent()
    await type(wrapper, 'phone', '0987654321')
    expect(customer.value, '改電話之後姓名不見了：新物件要保留其他欄位').toEqual({ name: '王小明', phone: '0987654321' })
  })

  test('連續修改兩個欄位，兩個都保留', async () => {
    const { wrapper, customer } = mountParent()
    await type(wrapper, 'name', '林志豪')
    await type(wrapper, 'phone', '0922000111')
    expect(customer.value, '第二次修改把第一次的值蓋掉了：每次都從目前的 model.value 展開').toEqual({ name: '林志豪', phone: '0922000111' })
  })

  test('父元件換了一位顧客之後再修改，用的是新顧客的資料', async () => {
    const { wrapper, customer } = mountParent()
    customer.value = deepFreeze({ name: '李建國', phone: '0933222111' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLInputElement>('input[name="phone"]').element.value, '父元件換了顧客，電話欄沒跟著變：輸入框要顯示 model 目前的值').toBe('0933222111')
    await type(wrapper, 'name', '黃淑芬')
    expect(customer.value, '電話變回舊顧客的了：不要在 setup 裡複製一份草稿，每次都從目前的 model.value 展開').toEqual({ name: '黃淑芬', phone: '0933222111' })
  })

  test('每次修改都送出 update:modelValue', async () => {
    const original = deepFreeze({ name: '王小明', phone: '' })
    const wrapper = mount(CustomerForm, { props: { modelValue: original } })
    await type(wrapper, 'name', '張雅婷')
    const events = wrapper.emitted('update:modelValue') ?? []
    expect(events.length, '沒有送出 update:modelValue：改屬性不會送事件，要指定新物件給 model.value').toBe(1)
    expect(events[0][0], '事件帶的物件不對').toEqual({ name: '張雅婷', phone: '' })
  })
})
