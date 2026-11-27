import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberEditor, type Member } from './MemberEditor.tsx'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const member = (over: Partial<Member> = {}): Member => deepFreeze({ id: 1, name: '王小明', points: 120, newsletter: true, ...over })
const MEI = { id: 2, name: '陳美華', points: 30, newsletter: false }

function setup(initial = member()) {
  const user = userEvent.setup()
  const onSave = vi.fn<(m: Member) => void>()
  const counter = renderCounter()
  const ui = (m: Member) => <counter.Profile id="editor"><MemberEditor member={m} onSave={onSave} /></counter.Profile>
  const view = render(ui(initial))
  return {
    user, onSave, counter,
    show: (m: Member) => view.rerender(ui(m)),
    // 換會員後表單可能整個重建，所以每次都重新查詢
    name: () => screen.getByLabelText<HTMLInputElement>('姓名'),
    points: () => screen.getByLabelText<HTMLInputElement>('點數'),
    newsletter: () => screen.getByLabelText<HTMLInputElement>('訂閱電子報'),
    save: () => screen.getByRole('button', { name: '儲存' }),
    restore: () => screen.getByRole('button', { name: '還原' }),
  }
}
type Editor = ReturnType<typeof setup>

async function edit(f: Editor, name: string, points: string) {
  await f.user.clear(f.name())
  await f.user.type(f.name(), name)
  await f.user.clear(f.points())
  await f.user.type(f.points(), points)
}

describe('練習 3：MemberEditor 用非受控欄位與 FormData', () => {
  test('欄位帶入 member 的資料', () => {
    const f = setup()
    expect(f.name()).toHaveValue('王小明')
    expect(f.points()).toHaveValue(120)
    expect(f.newsletter()).toBeChecked()
  })

  test('欄位可以編輯，而且打字時元件不重新 render', async () => {
    const f = setup()
    await edit(f, '王大明', '300')
    await f.user.click(f.newsletter())
    expect(f.name(), '姓名打不進去：寫了 value 卻沒有 onChange 的欄位是唯讀的，非受控要用 defaultValue').toHaveValue('王大明')
    expect(f.points(), '點數打不進去：非受控要用 defaultValue').toHaveValue(300)
    expect(f.newsletter(), 'checkbox 點不動：非受控要用 defaultChecked').not.toBeChecked()
    expect(f.counter.commits('editor'), '打字、勾選時元件重新 render 了：這題要用非受控，不要用 useState 存欄位的值').toBe(0)
  })

  test('按「儲存」：用 FormData 讀出欄位，轉成正確的型別', async () => {
    const f = setup()
    let prevented: boolean | undefined
    const spy = (e: Event) => { prevented = e.defaultPrevented }
    document.addEventListener('submit', spy)
    await edit(f, ' 王大明 ', '300')
    await f.user.click(f.newsletter())
    await f.user.click(f.save())
    document.removeEventListener('submit', spy)
    expect(prevented, '在 <form> 的 onSubmit 裡呼叫 e.preventDefault()').toBe(true)
    expect(f.onSave.mock.calls, 'onSave 要收到表單上目前的值：id 來自 member、姓名要 trim、points 要是數字（FormData 給的是字串 "300"）、newsletter 要是布林（沒勾選時 FormData 裡沒有這個 key）')
      .toStrictEqual([[{ id: 1, name: '王大明', points: 300, newsletter: false }]])
  })

  test('沒有修改就儲存：送出原本的資料，newsletter 是 true 不是 "on"', async () => {
    const f = setup(member({ id: 6, name: '黃淑芬', points: 0 }))
    await f.user.click(f.save())
    expect(f.onSave.mock.calls, '勾選的 checkbox 在 FormData 裡的值是字串 "on"，要轉成布林；點數 0 也要是數字 0')
      .toStrictEqual([[{ id: 6, name: '黃淑芬', points: 0, newsletter: true }]])
  })

  test('換成另一位會員：欄位顯示新會員的資料，打到一半的內容丟掉', async () => {
    const f = setup()
    await edit(f, '打到一半', '999')
    f.show(MEI)
    const hint = 'defaultValue 只在元件掛載時生效，之後 props 變了也不會更新 DOM：member.id 變了就讓表單重建（第 3 課的 key）'
    expect(f.name(), hint).toHaveValue('陳美華')
    expect(f.points(), hint).toHaveValue(30)
    expect(f.newsletter(), hint).not.toBeChecked()
    await f.user.click(f.save())
    expect(f.onSave.mock.calls, '換會員後儲存，id 要是新會員的').toStrictEqual([[MEI]])
  })

  test('同一位會員重新 render：使用者打到一半的內容不能被清掉', async () => {
    const f = setup()
    await edit(f, '王大明', '300')
    f.show(member())          // 父元件重新 render，傳進來的是內容相同的新物件
    expect(f.name(), '同一位會員（id 沒變）不該重建表單：key 要用 member.id，不要用每次都不同的值').toHaveValue('王大明')
    expect(f.points()).toHaveValue(300)
  })

  test('按「還原」：欄位回到 member 的資料', async () => {
    const f = setup()
    await edit(f, '王大明', '300')
    await f.user.click(f.newsletter())
    await f.user.click(f.restore())
    const hint = '用 <button type="reset">：瀏覽器會把表單裡每個欄位設回 defaultValue／defaultChecked'
    expect(f.name(), hint).toHaveValue('王小明')
    expect(f.points(), hint).toHaveValue(120)
    expect(f.newsletter(), hint).toBeChecked()
    expect(f.onSave, '還原不能觸發儲存').not.toHaveBeenCalled()
  })
})
