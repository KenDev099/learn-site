import { describe, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NoteEditor } from './NoteEditor.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 父元件：擁有備註，存檔後把新的備註傳回來
function Order({ initial = '', onSave = () => {} }: { initial?: string; onSave?: (note: string) => void }) {
  const [note, setNote] = useState(initial)
  return <NoteEditor note={note} onSave={n => { onSave(n); setNote(n) }} />
}
const editButton = () => screen.getByRole('button', { name: '編輯備註' })
const where = () => document.activeElement === document.body ? '<body>' : document.activeElement?.outerHTML.slice(0, 60)

describe('練習 5：NoteEditor 在 DOM 更新之後移動焦點', () => {
  test('一開始不搶焦點', () => {
    render(<Order initial="少冰" />)
    expect(screen.getByText(/備註：少冰/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox'), '一開始是顯示模式，沒有輸入框').toBeNull()
    expect(document.activeElement, '頁面剛載入時不能把焦點搶到「編輯備註」按鈕：只有按了「完成」才把焦點還給它（effect 在第一次 render 之後也會執行）').toBe(document.body)
  })

  test('按「編輯備註」：輸入框出現、帶入目前的備註、已經取得焦點', async () => {
    render(<Order initial="少冰" />)
    await userEvent.setup().click(editButton())
    const input = screen.getByRole('textbox', { name: '備註' })
    expect(input, '輸入框的內容要是目前的備註').toHaveValue('少冰')
    expect(document.activeElement, `輸入框出現後要已經取得焦點，現在焦點在 ${where()}。setEditing(true) 的下一行輸入框還不在 DOM 裡：等 DOM 更新完再 focus()`).toBe(input)
  })

  test('按下去的那一輪就要聚焦，不能用 setTimeout 等一下', () => {
    vi.useFakeTimers()
    render(<Order />)
    fireEvent.click(editButton())
    expect(document.activeElement, `點擊事件處理完時，焦點就要在輸入框，現在在 ${where()}。setTimeout 只是猜 DOM 什麼時候好：用 flushSync 或 effect`).toBe(screen.getByRole('textbox', { name: '備註' }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(document.activeElement, `按「完成」的那一輪，焦點就要回到「編輯備註」按鈕，現在在 ${where()}`).toBe(editButton())
  })

  test('不用再點輸入框就能打字，按「完成」呼叫 onSave', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<Order onSave={onSave} />)
    await user.click(editButton())
    await user.keyboard('去冰半糖')
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(onSave.mock.calls, '按「編輯備註」後直接打字，再按「完成」，要呼叫 onSave("去冰半糖")：輸入框沒有焦點的話字打不進去').toEqual([['去冰半糖']])
    expect(screen.getByText(/備註：去冰半糖/), '存檔後回到顯示模式，顯示新的備註').toBeInTheDocument()
    expect(screen.queryByRole('textbox'), '按「完成」後輸入框要消失').toBeNull()
  })

  test('按「完成」後焦點回到「編輯備註」按鈕', async () => {
    const user = userEvent.setup()
    render(<Order initial="少冰" />)
    await user.click(editButton())
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(document.activeElement, `輸入框消失後焦點要回到「編輯備註」按鈕，現在在 ${where()}。有焦點的元素被移除時焦點會掉回 <body>，用鍵盤的人要從頭 Tab`).toBe(editButton())
  })

  test('整個流程只用鍵盤也能完成，而且可以連續編輯兩次', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<Order onSave={onSave} />)
    await user.tab()
    expect(document.activeElement).toBe(editButton())
    await user.keyboard('{Enter}')
    await user.keyboard('少冰')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(document.activeElement, `用鍵盤按「完成」後，焦點要回到「編輯備註」按鈕，現在在 ${where()}`).toBe(editButton())
    await user.keyboard('{Enter}')
    expect(document.activeElement, '第二次按「編輯備註」，輸入框也要取得焦點').toBe(screen.getByRole('textbox', { name: '備註' }))
    await user.keyboard('、外帶')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onSave.mock.calls, '第二次編輯要從上一次存的內容接著打').toEqual([['少冰'], ['少冰、外帶']])
  })

  test('不在 render 過程中讀寫 ref、不關掉 lint 規則', async () => {
    const file = join(import.meta.dirname, 'NoteEditor.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/refs': 'error' }), 'ref.current 只能在事件處理函式或 effect 裡用：render 過程中 DOM 還沒更新，讀到的是舊的節點或 null').toEqual([])
  }, 20000)
})
