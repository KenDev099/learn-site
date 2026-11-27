// 錯在：value 放在 ref 裡、每次 render 改它的屬性：物件一直是同一個，讀的元件不知道 staff 變了
import { createContext, use, useRef, useState, type ReactNode } from 'react'

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

  const ref = useRef<Session>({ staff, login: name => setStaff(name), logout: () => setStaff(null) })
  ref.current.staff = staff
  const value = ref.current

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
