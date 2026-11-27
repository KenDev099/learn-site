import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { CUSTOMERS, PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { typecheck } from '../../helpers/typecheck.ts'
import { Select } from './Select.tsx'

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const SIZES = ['S', 'M', 'L'] as const

describe('練習 4：Select 是泛型元件，選項的型別流到 value、onChange、getKey、getLabel', () => {
  test('型別：T 從 options 推論；商品、顧客、字串選項都能用，型別對不上的要報錯', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex4.usage.tsx': [
        "import { useState } from 'react'",
        "import { Select } from './Select.tsx'",
        "import { CUSTOMERS, PRODUCTS, type Product } from '../../helpers/fake-api.ts'",
        '',
        "const SIZES = ['S', 'M', 'L'] as const",
        'type Size = (typeof SIZES)[number]',
        "const SIZE_LABEL = { S: '小杯', M: '中杯', L: '大杯' } satisfies Record<Size, string>",
        '',
        'export function Ok() {',
        '  const [product, setProduct] = useState<Product | null>(null)',
        "  const [size, setSize] = useState<Size>('M')",
        '  return (',
        '    <>',
        '      <Select label="商品" options={PRODUCTS} value={product} onChange={setProduct} getKey={p => p.id} getLabel={p => `${p.name} $${p.price}`} />',
        '      <Select label="尺寸" options={SIZES} value={size} onChange={setSize} getKey={s => s} getLabel={s => SIZE_LABEL[s]} />',
        '      <Select label="顧客" options={CUSTOMERS} value={null} onChange={c => console.log(c.name.trim())} getKey={c => c.id} getLabel={c => c.name} />',
        '      <Select<Product> label="商品" options={[]} value={null} onChange={p => console.log(p.price.toFixed(0))} getKey={p => p.id} getLabel={p => p.name} />',
        '    </>',
        '  )',
        '}',
        '',
        'export const bad = [',
        '  // @ts-expect-error Product 沒有 title',
        '  <Select label="商品" options={PRODUCTS} value={null} onChange={() => {}} getKey={p => p.id} getLabel={p => p.title} />,',
        '  // @ts-expect-error onChange 收到的是 Product，不是字串',
        '  <Select label="商品" options={PRODUCTS} value={null} onChange={(name: string) => console.log(name)} getKey={p => p.id} getLabel={p => p.name} />,',
        '  // @ts-expect-error value 要是選項的型別或 null',
        '  <Select label="商品" options={PRODUCTS} value="拿鐵" onChange={() => {}} getKey={p => p.id} getLabel={p => p.name} />,',
        "  // @ts-expect-error 尺寸的選項是 'S' | 'M' | 'L'，不能交給只收 'XL' 的函式",
        "  <Select label=\"尺寸\" options={SIZES} value={null} onChange={(size: 'XL') => console.log(size)} getKey={s => s} getLabel={s => s} />,",
        '  // @ts-expect-error getLabel 要回傳字串',
        '  <Select label="商品" options={PRODUCTS} value={null} onChange={() => {}} getKey={p => p.id} getLabel={p => p.price} />,',
        ']',
        '',
      ].join('\n'),
    })
    expect(errors,
      '型別檢查沒過。TS2578（Unused \'@ts-expect-error\' directive）代表那一行的錯誤用法沒被擋下：還有 any，或 T 沒有連到每個 prop。' +
      '正確用法報錯的常見原因：元件不是泛型（function Select<T>(props: SelectProps<T>)）、options 寫成 T[] 收不下唯讀陣列（要 readonly T[]）、' +
      'value 少了 | null、對 T 加了 extends 限制所以字串當不了選項：\n' + errors).toBe('')
  }, 30_000)

  test('顯示每個選項；value 是 null 時選中停用的「請選擇」', () => {
    render(<Select label="商品" options={products} value={null} onChange={() => {}} getKey={p => p.id} getLabel={p => p.name} />)
    const select = screen.getByRole('combobox', { name: '商品' })
    expect(screen.getAllByRole('option').map(o => o.textContent), '第一個是「請選擇」，後面每個選項顯示 getLabel 的結果').toEqual(['請選擇', ...products.map(p => p.name)])
    expect(select, 'value 是 null 時要顯示「請選擇」').toHaveDisplayValue('請選擇')
    expect(screen.getByRole('option', { name: '請選擇' }), '「請選擇」要 disabled，選了別的就不能再選回來').toBeDisabled()
  })

  test('選了之後 onChange 收到選項本身，不是字串', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select label="商品" options={products} value={null} onChange={onChange} getKey={p => p.id} getLabel={p => p.name} />)
    await user.selectOptions(screen.getByRole('combobox', { name: '商品' }), '卡布奇諾')
    expect(onChange, '選「卡布奇諾」要呼叫 onChange 一次').toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0], 'onChange 的參數要是 options 裡的那個商品物件：<select> 的值是字串，用它（getKey 的結果）從 options 找回選項').toEqual(products[2])
  })

  test('字串也能當選項', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select label="尺寸" options={SIZES} value="M" onChange={onChange} getKey={s => s} getLabel={s => `${s} 杯`} />)
    const select = screen.getByRole('combobox', { name: '尺寸' })
    expect(select, 'value="M" 時要選中「M 杯」').toHaveDisplayValue('M 杯')
    await user.selectOptions(select, 'L 杯')
    expect(onChange, '選「L 杯」要呼叫 onChange(\'L\')').toHaveBeenCalledExactlyOnceWith('L')
  })

  test('選中哪一個是比 getKey：value 是內容相同的另一個物件也要選中', () => {
    const fromAnotherFetch = structuredClone(PRODUCTS[1])   // 拿鐵，但不是 options 裡的同一個物件
    render(<Select label="商品" options={products} value={fromAnotherFetch} onChange={() => {}} getKey={p => p.id} getLabel={p => p.name} />)
    expect(screen.getByRole('combobox', { name: '商品' }),
      'value 常常來自另一次請求或 state，跟 options 裡的物件不是同一個參考：用 getKey(value) 決定選中誰，不要用 === 或 indexOf').toHaveDisplayValue('拿鐵')
  })

  test('兩個選項顯示文字相同時，仍然回傳被選的那一個', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // 拿鐵與卡布奇諾都是 $110
    render(<Select label="價格" options={products} value={null} onChange={onChange} getKey={p => p.id} getLabel={p => `$${p.price}`} />)
    const same = screen.getAllByRole('option', { name: '$110' })
    await user.selectOptions(screen.getByRole('combobox', { name: '價格' }), same[1])
    expect(onChange.mock.calls[0]?.[0], '選第二個「$110」要拿到卡布奇諾：<option> 的 value 用 getKey，不要用顯示文字').toEqual(products[2])
  })

  test('換一批選項（顧客）照樣能用', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select label="顧客" options={CUSTOMERS} value={CUSTOMERS[0]} onChange={onChange} getKey={c => c.id} getLabel={c => c.name} />)
    const select = screen.getByRole('combobox', { name: '顧客' })
    expect(select).toHaveDisplayValue('王小明')
    await user.selectOptions(select, '張雅婷')
    expect(onChange.mock.calls[0]?.[0], '選「張雅婷」要拿到那位顧客的物件').toEqual(CUSTOMERS[3])
  })
})
