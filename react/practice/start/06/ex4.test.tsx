import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerNotes } from './CustomerNotes.tsx'
import { CUSTOMERS, type Customer } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const people = () => deepFreeze(structuredClone(CUSTOMERS.slice(0, 3)) as Customer[])
const note = () => screen.getByLabelText<HTMLInputElement>('備註')
const callback = () => screen.getByLabelText<HTMLInputElement>('回電時間')
const urgent = () => screen.getByRole<HTMLInputElement>('checkbox', { name: '急件' })
const pick = (name: string, index = 0) => screen.getAllByRole('button', { name })[index]

function setup(customers: Customer[] = people()) {
  const counter = renderCounter()
  const user = userEvent.setup()
  const ui = (list: Customer[]) => <counter.Profile id="notes"><CustomerNotes customers={list} /></counter.Profile>
  const view = render(ui(customers))
  return { counter, user, rerender: (list: Customer[]) => view.rerender(ui(list)) }
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(note(), '少冰半糖')
  await user.click(urgent())
  await user.type(callback(), '下午三點')
}

describe('練習 4：換顧客時用 key 重設 NoteForm 的所有狀態', () => {
  test('可以輸入備註、勾急件、填回電時間', async () => {
    const { user } = setup()
    expect(screen.getByRole('heading')).toHaveTextContent('給 王小明 的備註')
    await fill(user)
    expect(note(), '打字的過程表單不能被重建：key 要用穩定的值，不能每次 render 都不同').toHaveValue('少冰半糖')
    expect(urgent()).toBeChecked()
    expect(callback()).toHaveValue('下午三點')
  })

  test('換顧客：備註、急件、回電時間全部重設', async () => {
    const { user } = setup()
    await fill(user)
    const before = note()
    await user.click(pick('陳美華'))
    expect(screen.getByRole('heading')).toHaveTextContent('給 陳美華 的備註')
    expect(note(), '換顧客後備註要是空的').toHaveValue('')
    expect(urgent(), '換顧客後「急件」要取消：一個一個手動重設很容易漏，讓 React 換一個全新的 NoteForm').not.toBeChecked()
    expect(callback(), '「回電時間」是非受控欄位，值在 DOM 裡，setState 重設不到：給 NoteForm 一個跟著顧客變的 key，整個表單連 DOM 一起重建').toHaveValue('')
    expect(note(), '換顧客後「備註」輸入框還是原本那個 DOM 節點，表示 NoteForm 沒有被重建：不要在 NoteForm 裡一個一個重設 state（之後每加一個 state 都要記得補），用 key').not.toBe(before)
  })

  test('換顧客只 render 一輪', async () => {
    const { counter, user } = setup()
    await fill(user)
    counter.reset()
    await user.click(pick('林志豪'))
    expect(note()).toHaveValue('')
    expect(counter.commits('notes'), '換顧客 render 了不只一輪：用 effect 重設 state 會先用舊的草稿 render 一次（畫面短暫是錯的），再清空、再 render 一次').toBe(1)
  })

  test('兩位顧客同名（id 不同）也要重設', async () => {
    const { user } = setup(deepFreeze<Customer[]>([{ id: 1, name: '王小明' }, { id: 7, name: '王小明' }]))
    await fill(user)
    await user.click(pick('王小明', 1))
    expect(note(), '同名但 id 不同是兩位顧客，備註要重設：key 用 customer.id，不要用名字').toHaveValue('')
    expect(urgent(), '同名但 id 不同是兩位顧客，「急件」要重設：key 用 customer.id，不要用名字').not.toBeChecked()
    expect(callback(), '同名但 id 不同是兩位顧客，「回電時間」要重設：key 用 customer.id，不要用名字').toHaveValue('')
  })

  test('還是同一位顧客時，輸入的內容要留著', async () => {
    const { user, rerender } = setup()
    await fill(user)
    const before = note()
    rerender(people())
    expect(note(), '父元件重新 render（顧客沒換）時表單被重建了：key 要用 customer.id 這種穩定的值').toBe(before)
    expect(note(), '父元件重新 render（顧客沒換）不能清掉草稿：key 不能用 Math.random()、Date.now() 這種每次都不同的值').toHaveValue('少冰半糖')
    expect(callback()).toHaveValue('下午三點')
    await user.click(pick('王小明'))
    expect(note(), '再點一次同一位顧客，草稿要留著').toHaveValue('少冰半糖')
    expect(urgent()).toBeChecked()
  })

  test('換過去再換回來：每次都是空白的表單', async () => {
    const { user } = setup()
    await fill(user)
    await user.click(pick('陳美華'))
    await user.type(note(), '去冰')
    await user.click(pick('王小明'))
    expect(screen.getByRole('heading')).toHaveTextContent('給 王小明 的備註')
    expect(note(), '換回王小明時，之前的草稿不應該還在：每次換顧客都是全新的表單').toHaveValue('')
    expect(urgent(), '換回王小明時「急件」要是取消的').not.toBeChecked()
    expect(callback(), '換回王小明時「回電時間」要是空的').toHaveValue('')
  })
})
