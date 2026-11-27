// 錯在：value 快取在模組層級的變數：兩個 SessionProvider 共用同一份
import { createContext, use, useState, type ReactNode } from 'react'

export type Session = {
  /** 目前登入的店員姓名；沒登入是 null */
  staff: string | null
  login: (name: string) => void
  logout: () => void
}

const SessionContext = createContext<Session | null>(null)

let cached: Session | null = null

export function SessionProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<string | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(true)

  if (!cached || cached.staff !== staff) cached = { staff, login: name => setStaff(name), logout: () => setStaff(null) }
  const value = cached

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
