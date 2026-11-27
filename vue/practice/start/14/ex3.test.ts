import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { typecheck } from '../../helpers/typecheck.ts'
import { provideCurrentStore } from './current-store.ts'
import SearchPage from './SearchPage.vue'

// 提供者：在 setup 裡 provide 門市，底下放 SearchPage
const App = defineComponent({
  setup() {
    provideCurrentStore(2)
    return () => h(SearchPage)
  },
})

describe('練習 3：template ref 與 inject 的型別', () => {
  test('型別：focus() 通過、open() 報錯；useCurrentStore() 是 Ref<Store>', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex3.usage.ts': [
        "import { provide } from 'vue'",
        "import { useSearchFocus } from './use-search-focus.ts'",
        "import { CURRENT_STORE_KEY, useCurrentStore } from './current-store.ts'",
        '',
        "const { box } = useSearchFocus('box')",
        'box.value?.focus()',
        'console.log(box.value?.$el)',
        '// @ts-expect-error SearchBox 沒有公開 open()',
        'box.value?.open()',
        '',
        'const store = useCurrentStore()',
        'const name: string = store.value.name',
        'console.log(name)',
        '// @ts-expect-error Store 沒有 nope',
        'console.log(store.value.nope)',
        '// @ts-expect-error 提供的值要是 Ref<Store>',
        'provide(CURRENT_STORE_KEY, 123)',
        '',
      ].join('\n'),
      '__ex3.page.ts': "import SearchPage from './SearchPage.vue'\nexport default SearchPage\n",
    })
    expect(errors,
      '型別檢查沒過。open() 那行的 TS2578 代表 box 是 any；$el 報錯代表型別是自己手寫的，不是 SearchBox 的實例型別：改成 useTemplateRef<InstanceType<typeof SearchBox>>(key)；' +
      'store.value 報錯或 provide 那行的 TS2578，代表 key 沒有型別：改成 InjectionKey<Ref<Store>>：\n' + errors).toBe('')
  }, 30_000)

  test('use-search-focus.ts 只 import SearchBox 的型別', () => {
    const src = readFileSync(join(import.meta.dirname, 'use-search-focus.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    expect(src, '要寫 import type SearchBox from \'./SearchBox.vue\'：composable 只需要型別，不要在執行時載入元件').toMatch(/import\s+type\s+SearchBox\s+from\s+['"]\.\/SearchBox\.vue['"]/)
  })

  test('執行：顯示目前門市，按「找飲料」游標跳進搜尋框', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.get('h2').text(), '標題要顯示 provide 的門市（分店）').toBe('分店・找飲料')
    await wrapper.get('button').trigger('click')
    expect(document.activeElement, 'focusSearch() 要呼叫 SearchBox 公開的 focus()').toBe(wrapper.get('input').element)
  })

  test('沒有提供者時 useCurrentStore() 丟出錯誤', () => {
    expect(() => mount(SearchPage), '找不到提供者要丟出 Error').toThrow('provideCurrentStore')
  })
})
