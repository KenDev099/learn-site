import { api } from './client.ts'

// GET /pickup-slots 的一個時段：start 是 ISO 字串（送出訂單時原封不動當 pickupAt）、label 是台北時間 HH:mm
export interface PickupSlot {
  start: string
  label: string
  remaining: number
}

export const listPickupSlots = () => api<PickupSlot[]>('/pickup-slots')
