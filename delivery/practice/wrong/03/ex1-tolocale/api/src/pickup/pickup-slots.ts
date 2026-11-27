// 預約取餐的時段規則（docs/meeting-notes-02.md、acceptance.json）
// 純函式：「現在」由呼叫的人傳進來，這個檔案不能自己 new Date() 取現在時間
export const SLOT_MINUTES = 15   // 每 15 分鐘一格
export const LEAD_MINUTES = 15   // 至少在送出的 15 分鐘後
export const SLOT_CAPACITY = 10  // 每個時段最多 10 單

const MIN = 60_000
// en-CA 的日期格式剛好是 YYYY-MM-DD；timeZone 決定「哪裡的日期」，跟伺服器的 TZ 無關
const taipeiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })
const taipeiTime = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// 練習 1：台北時間「今天」還能選的時段開始時間，由早到晚（還不管有沒有額滿）
// 例如 now 是台北 2026-11-03 08:02 → 08:30、08:45、…、18:45
export function todaySlots(now: Date): Date[] {
  const today = taipeiDate.format(now)                          // 台北的「今天」，例如 2026-11-03
  const first = Date.parse(`${today}T07:30:00+08:00`)            // 台灣全年 +08:00（沒有日光節約時間）
  const last = Date.parse(`${today}T18:45:00+08:00`)
  const earliest = now.getTime() + LEAD_MINUTES * MIN
  const slots: Date[] = []
  for (let t = first; t <= last; t += SLOT_MINUTES * MIN) {
    if (t >= earliest) slots.push(new Date(t))
  }
  return slots
}

// 練習 1：時段的標籤，台北時間的 HH:mm，例如 08:30（伺服器在 UTC 也一樣）
export function slotLabel(start: Date): string {
  return start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}
