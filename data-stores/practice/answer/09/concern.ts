// 練習 3：替三種寫入選 write concern
// activityPageView：活動頁瀏覽計數，少幾次沒關係，但出錯時要知道（不要用 w: 0）
// registration：報名，回應「報名成功」之後就不能因為主機故障切換而消失
// auditLog：稽核紀錄，除了不能在故障切換後消失，也要明確要求寫進磁碟上的日誌（journal）
import type { Db, WriteConcernSettings } from 'mongodb'

export type Registration = { eventId: string; customerId: number }

export const WRITE_CONCERNS: Record<'activityPageView' | 'registration' | 'auditLog', WriteConcernSettings> = {
  activityPageView: { w: 1 },
  registration: { w: 'majority' },
  auditLog: { w: 'majority', journal: true },
}

// 把報名寫進 registrations 集合，使用 WRITE_CONCERNS.registration
export async function saveRegistration(db: Db, reg: Registration): Promise<void> {
  await db.collection<Registration>('registrations').insertOne({ ...reg }, { writeConcern: WRITE_CONCERNS.registration })
}
