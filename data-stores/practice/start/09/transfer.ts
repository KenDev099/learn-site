// 練習 2：把報名從活動 A 移到活動 B（多文件交易）
// events 集合：{ _id, title, seatsLeft, attendees: number[] }（跟練習 1 一樣）
// registrations 集合：每次移轉成功新增一筆 { customerId, from, to }
// 三個修改要一起成功或一起失敗：用 client.startSession() 與 session.withTransaction
import type { Db, MongoClient } from 'mongodb'

export type Event = { _id: string; title: string; seatsLeft: number; attendees: number[] }
export type Move = { customerId: number; from: string; to: string }

export class NotRegisteredError extends Error {}   // 客人沒有報名活動 A
export class SeatsFullError extends Error {}       // 活動 B 額滿，或客人已經在 B 裡

// 1. 從 A 的 attendees 移除 customerId、A 的 seatsLeft 加 1（不在 A 裡就丟 NotRegisteredError）
// 2. 把 customerId 加進 B、B 的 seatsLeft 減 1（B 沒名額或已經在 B 裡就丟 SeatsFullError）
// 3. 在 registrations 新增 { customerId, from: fromId, to: toId }
// 任何一步失敗，A、B、registrations 都要保持原樣；用完的 session 要 endSession()
export async function transfer(client: MongoClient, db: Db, customerId: number, fromId: string, toId: string): Promise<void> {
  // 寫在這裡
}
