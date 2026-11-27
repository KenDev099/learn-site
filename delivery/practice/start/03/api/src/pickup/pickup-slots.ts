// 預約取餐的時段規則（docs/meeting-notes-02.md、acceptance.json）
// 純函式：「現在」由呼叫的人傳進來，這個檔案不能自己 new Date() 取現在時間
export const SLOT_MINUTES = 15   // 每 15 分鐘一格
export const LEAD_MINUTES = 15   // 至少在送出的 15 分鐘後
export const SLOT_CAPACITY = 10  // 每個時段最多 10 單

// 練習 1：台北時間「今天」還能選的時段開始時間，由早到晚（還不管有沒有額滿）
// 例如 now 是台北 2026-11-03 08:02 → 08:30、08:45、…、18:45
export function todaySlots(now: Date): Date[] {
  // TODO
  return []
}

// 練習 1：時段的標籤，台北時間的 HH:mm，例如 08:30（伺服器在 UTC 也一樣）
export function slotLabel(start: Date): string {
  // TODO
  return ''
}
