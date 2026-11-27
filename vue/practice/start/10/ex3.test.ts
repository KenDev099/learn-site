import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import DrinkOptions from './DrinkOptions.vue'

function mountParent(noteModel = 'v-model:note="note"') {
  const sugar = ref('正常'), ice = ref('正常'), note = ref('')
  const wrapper = mount({
    components: { DrinkOptions },
    setup: () => ({ sugar, ice, note }),
    template: `<DrinkOptions v-model:sugar="sugar" v-model:ice="ice" ${noteModel} />`,
  })
  return { wrapper, sugar, ice, note }
}

const LONG = '燕麥奶換豆漿多一份濃縮少冰半糖加珍珠不要吸管謝謝店員'   // 26 個字

describe('練習 3：多個 model 與自訂修飾符', () => {
  test('甜度、冰塊、備註各自更新父元件', async () => {
    const { wrapper, sugar, ice, note } = mountParent()
    await wrapper.get('select[name="sugar"]').setValue('少糖')
    expect(sugar.value, '選少糖之後父元件的 sugar 沒變：用 defineModel(\'sugar\', …) 宣告具名 model').toBe('少糖')
    expect(ice.value, '改甜度卻動到冰塊：每個欄位要有自己的 model').toBe('正常')
    await wrapper.get('select[name="ice"]').setValue('去冰')
    expect(ice.value, '選去冰之後父元件的 ice 沒變：用 defineModel(\'ice\', …)').toBe('去冰')
    expect(sugar.value, '改冰塊卻動到甜度：每個欄位要有自己的 model').toBe('少糖')
    await wrapper.get('input[name="note"]').setValue('不要吸管')
    expect(note.value, '備註沒有傳給父元件：用 defineModel(\'note\', …)').toBe('不要吸管')
  })

  test('父元件改值，畫面跟著變', async () => {
    const { wrapper, sugar, ice, note } = mountParent()
    sugar.value = '無糖'; ice.value = '少冰'; note.value = '外帶'
    await nextTick()
    expect(wrapper.get<HTMLSelectElement>('select[name="sugar"]').element.value, '父元件改了 sugar，下拉選單沒變：不要保存本地狀態').toBe('無糖')
    expect(wrapper.get<HTMLSelectElement>('select[name="ice"]').element.value, '父元件改了 ice，下拉選單沒變：不要保存本地狀態').toBe('少冰')
    expect(wrapper.get<HTMLInputElement>('input[name="note"]').element.value, '父元件改了 note，輸入框沒變：不要保存本地狀態').toBe('外帶')
  })

  test('有 .short 時備註最多 20 個字', async () => {
    const { wrapper, note } = mountParent('v-model:note.short="note"')
    await wrapper.get('input[name="note"]').setValue(LONG)
    expect(note.value, '父元件寫了 .short，備註要截成前 20 個字：const [note, modifiers] = defineModel(\'note\', { set })，在 set 裡看 modifiers.short').toBe(LONG.slice(0, 20))
    await wrapper.get('input[name="note"]').setValue('少冰')
    expect(note.value, '短的備註要保留原樣').toBe('少冰')
  })

  test('沒有 .short 時保留完整備註', async () => {
    const { wrapper, note } = mountParent()
    await wrapper.get('input[name="note"]').setValue(LONG)
    expect(note.value, '父元件沒寫 .short 卻被截斷了：只有 modifiers.short 為 true 時才截').toBe(LONG)
    await wrapper.get('input[name="note"]').setValue('  外帶  ')
    expect(note.value, '父元件沒寫任何修飾符，備註卻被改了（例如自己 trim）：沒有修飾符時 set 要原樣回傳').toBe('  外帶  ')
  })

  test('內建的 .trim 不用額外程式也有效', async () => {
    const { wrapper, note } = mountParent('v-model:note.trim="note"')
    await wrapper.get('input[name="note"]').setValue('  不要吸管  ')
    expect(note.value, '父元件寫 .trim 卻沒去掉空白：note 要用 defineModel 宣告，Vue 送出 update:note 時才會自動 trim').toBe('不要吸管')
  })

  test('三個 model 都是必填', () => {
    const props = (DrinkOptions as { props?: Record<string, { required?: boolean }> }).props
    for (const name of ['sugar', 'ice', 'note']) {
      expect(props?.[name]?.required, `${name} 沒有設成必填：defineModel('${name}', { required: true })`).toBe(true)
    }
  })
})
