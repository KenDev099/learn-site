// 練習 2：用 magic link 登入。本機 Auth 寄出的信都在 Mailpit（cfg.mailpitUrl），用它的 API 收信
// Mailpit API：GET <mailpitUrl>/api/v1/search?query=to:"<email>" → { messages: [{ ID, Created, To, … }] }（新的在前）
//              GET <mailpitUrl>/api/v1/message/<ID> → { Text, HTML, … }
import { createClient } from '@supabase/supabase-js'
import type { Config } from './harness.ts'

export async function magicLogin(cfg: Config, email: string): Promise<{ userId: string, accessToken: string }> {
  // 1. signInWithOtp 寄出登入信；只給已經註冊的人登入（打錯 email 不能順手建一個新帳號），失敗就 throw
  // 2. 到 Mailpit 找「寄給這個 email、而且是這次寄出」的信（寄出前先記下已經有哪些信）：信可能還沒到，每 200ms 重查一次，最多 5 秒
  // 3. 從信裡的連結取出 token 參數，用 verifyOtp({ token_hash, type: 'email' }) 換成 session
  // 4. 回傳 session 的使用者 id 與 access token
  throw new Error('還沒寫')
}
