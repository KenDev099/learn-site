// 練習 2：用 magic link 登入。本機 Auth 寄出的信都在 Mailpit（cfg.mailpitUrl），用它的 API 收信
// Mailpit API：GET <mailpitUrl>/api/v1/search?query=to:"<email>" → { messages: [{ ID, Created, To, … }] }（新的在前）
//              GET <mailpitUrl>/api/v1/message/<ID> → { Text, HTML, … }
import { createClient } from '@supabase/supabase-js'
import type { Config } from './harness.ts'

export async function magicLogin(cfg: Config, email: string): Promise<{ userId: string, accessToken: string }> {
  const supabase = createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } })
  const search = async () => {
    const res = await fetch(`${cfg.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    return ((await res.json()) as { messages: { ID: string }[] }).messages.map(m => m.ID)
  }
  const old = new Set(await search())   // 寄出前已經在的信（上一次登入的，連結已經用過）
  const sent = await supabase.auth.signInWithOtp({ email })
  if (sent.error) throw sent.error

  let id: string | undefined
  for (let i = 0; i < 25 && !id; i++) {
    id = (await search()).find(x => !old.has(x))
    if (!id) await new Promise(r => setTimeout(r, 200))
  }
  if (!id) throw new Error(`5 秒內沒有收到寄給 ${email} 的登入信`)

  const { Text } = await (await fetch(`${cfg.mailpitUrl}/api/v1/message/${id}`)).json() as { Text: string }
  const link = Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?[^\s)]+/)?.[0]
  const tokenHash = link && new URL(link).searchParams.get('token')
  if (!tokenHash) throw new Error('信裡找不到登入連結')

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (error) throw error
  return { userId: data.user!.id, accessToken: data.session!.access_token }
}
