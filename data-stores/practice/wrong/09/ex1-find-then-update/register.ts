// 練習 1：限量報名，不用交易
// events 集合：{ _id: 'latte-art-11', title, seatsLeft: 剩下的名額, attendees: 已報名的 customerId（數字）陣列 }
// register 只能對 col 呼叫一次 updateOne：條件與修改一次送出，由 MongoDB 在單一文件上原子地完成
import type { Collection } from 'mongodb'

export type Event = { _id: string; title: string; seatsLeft: number; attendees: number[] }

// 名額 > 0 而且這位客人還沒報名：把 customerId 加進 attendees、seatsLeft 減 1，回傳 true
// 其他情況（額滿、已經報名、活動不存在）什麼都不改，回傳 false
export async function register(col: Collection<Event>, eventId: string, customerId: number): Promise<boolean> {
  const ev = await col.findOne({ _id: eventId })
  if (!ev || ev.seatsLeft <= 0 || ev.attendees.includes(customerId)) return false
  await col.updateOne({ _id: eventId }, { $inc: { seatsLeft: -1 }, $push: { attendees: customerId } })
  return true
}
