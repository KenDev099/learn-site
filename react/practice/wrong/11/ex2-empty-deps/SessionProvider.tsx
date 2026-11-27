// 錯在：依賴陣列是空的：value 永遠是第一次的物件，登入後讀到的 staff 還是 null
import { createContext, use, useMemo, useState, type ReactNode } from 'react'

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

  // staff 沒變就回傳上一次的物件：noticeOpen 變了、外層重新 render，value 都還是同一個
  const value = useMemo<Session>(
    () => ({ staff, login: name => setStaff(name), logout: () => setStaff(null) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <SessionContext value={value}>
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
