/*
練習 2：讓 context 的 value 保持穩定（SessionProvider）
問題：SessionProvider 每次 render 都新建一個 { staff, login, logout } 物件當 value。
      按「關閉公告」只改了跟登入無關的 noticeOpen，但 value 是新的物件，
      所有呼叫 useSession() 的元件都跟著重新 render；外層元件重新 render 時也一樣。
要求：
  1. staff 沒變時，value 要是同一個物件：關閉公告、外層重新 render，都不能讓呼叫 useSession() 的元件重新 render
  2. login(name)、logout() 之後，所有呼叫 useSession() 的元件都要拿到新的 staff
  3. 公告的行為不變：一開始顯示，按「關閉公告」後消失
  4. 依賴陣列要誠實：eslint 的 react-hooks/exhaustive-deps 不能有違規
不能做的事：
  - 不能用 eslint-disable 蓋掉警告
  - 不能把 value 放在 ref 或模組層級的變數裡再去改它（讀的元件不會知道它變了）
*/
import { createContext, use, useState, type ReactNode } from 'react'

export type Session = {
  /** 目前登入的店員姓名；沒登入是 null */
  staff: string | null
  login: (name: string) => void
  logout: () => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<string | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(true)

  return (
    <SessionContext value={{ staff, login: name => setStaff(name), logout: () => setStaff(null) }}>
      {noticeOpen && (
        <p role="status">
          本週可頌買一送一
          <button type="button" onClick={() => setNoticeOpen(false)}>關閉公告</button>
        </p>
      )}
      {children}
    </SessionContext>
  )
}

export function useSession(): Session {
  const session = use(SessionContext)
  if (!session) throw new Error('useSession() 必須在 <SessionProvider> 之下使用')
  return session
}
