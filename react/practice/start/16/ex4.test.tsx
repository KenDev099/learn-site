import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'
import { screen } from '@testing-library/react'
import { ShiftNotes } from './ShiftNotes.tsx'
import type { Note } from './shop-api.ts'
import { finishAll, reject, resolve, settle, setup } from './test-utils.tsx'

let consoleError: MockInstance
beforeEach(() => { consoleError = vi.spyOn(console, 'error') })
afterEach(async () => {
  await finishAll()
  const messages = consoleError.mock.calls.map(args => String(args[0]))
  expect(messages.filter(m => /optimistic/i.test(m)), 'React 警告：An optimistic state update occurred outside a transition or action。useOptimistic 的 set 函式要在 startTransition(async () => { … }) 裡面呼叫').toEqual([])
})

const NOTES: Note[] = [{ id: 1, text: '收銀機零錢已補' }]

async function open(initialNotes = NOTES) {
  const t = setup(api => <ShiftNotes api={api} initialNotes={initialNotes} />, { notes: initialNotes })
  const input = screen.getByLabelText('交班備註')
  const rows = () => screen.queryAllByRole('listitem').map(li => li.textContent)
  const send = async (text: string) => {
    await t.user.type(input, text)
    await t.user.click(screen.getByRole('button', { name: '送出' }))
    await settle()
  }
  const addCall = (i: number) => t.api.callsOf('addNote')[i]
  return { ...t, input, rows, send, addCall }
}

describe('練習 4：ShiftNotes 用 useOptimistic 先顯示、失敗自動消失', () => {
  test('送出後立刻出現在最後面，標示「（送出中）」，輸入框清空', async () => {
    const { api, input, rows, send } = await open()
    await send('燕麥奶剩兩瓶')
    expect(api.callsOf('addNote').map(c => c.args), '要呼叫 api.addNote(備註文字)').toEqual([['燕麥奶剩兩瓶']])
    expect(rows(), '伺服器還沒回應，備註就要出現在列表最後面，後面加「（送出中）」：用 useOptimistic 算出要顯示的列表，在 startTransition 裡加上樂觀的那一筆').toEqual(['收銀機零錢已補', '燕麥奶剩兩瓶（送出中）'])
    expect(input, '送出後輸入框要清空').toHaveValue('')
  })

  test('成功：換成伺服器確認過的備註，只有一筆', async () => {
    const { rows, send, addCall } = await open()
    await send('  燕麥奶剩兩瓶  ')
    await resolve(addCall(0))
    expect(rows(), '成功後要顯示伺服器回傳的備註（去掉前後空白），沒有「（送出中）」，也不能重複：await 之後用 startTransition(() => setNotes(…)) 把它加進 notes').toEqual(['收銀機零錢已補', '燕麥奶剩兩瓶'])
  })

  test('失敗：送出中的那一筆消失、顯示錯誤；下一次送出時錯誤消失', async () => {
    const { rows, send, addCall } = await open()
    await send('冰塊機要清')
    await reject(addCall(0))
    expect(rows(), '失敗了，那一筆不能留在列表上：樂觀的值要用 useOptimistic 算，不要直接 setNotes（Action 結束後 useOptimistic 會自動回到 notes）').toEqual(['收銀機零錢已補'])
    expect(screen.queryByRole('alert'), '失敗時要顯示 <p role="alert">「冰塊機要清」沒有送出，請再試一次</p>：在 Action 裡 try/catch，catch 裡 setError').toHaveTextContent('「冰塊機要清」沒有送出，請再試一次')
    await send('冰塊機要清')
    expect(screen.queryByRole('alert'), '再送出一次時，上一次的錯誤訊息要清掉').toBeNull()
    await resolve(addCall(1))
    expect(rows()).toEqual(['收銀機零錢已補', '冰塊機要清'])
  })

  test('連續送出兩筆：先回來的那筆不會重複出現，全部完成後順序正確', async () => {
    const { rows, send, addCall } = await open([])
    await send('A 桌椅子壞了')
    await send('明天早班 7 點')
    expect(rows()).toEqual(['A 桌椅子壞了（送出中）', '明天早班 7 點（送出中）'])
    await resolve(addCall(0))
    const twice = rows().filter(r => r?.startsWith('A 桌椅子壞了'))
    expect(twice.length, `第一筆成功時第二筆還在送出，畫面卻出現兩次第一筆（${rows().join('、')}）：await 之後的 setNotes 要包在 startTransition 裡，跟還沒結束的 Action 一起更新`).toBe(1)
    await resolve(addCall(1))
    expect(rows(), '兩筆都完成後，照送出順序顯示，沒有「（送出中）」').toEqual(['A 桌椅子壞了', '明天早班 7 點'])
  })

  test('只有空白時不送出', async () => {
    const { api, rows, send } = await open()
    await send('   ')
    expect(api.callsOf('addNote').length, '只有空白時不要呼叫 api.addNote').toBe(0)
    expect(rows()).toEqual(['收銀機零錢已補'])
  })
})
