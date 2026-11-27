// 測試用的菜單（40 項，id 10～49）與建立測試索引的函式。不用改這個檔：練習 2～4 的測試都從這裡放資料
// 欄位：name 品名、description 說明、category 分類（咖啡、茶飲、甜點、輕食）、price 價格（新台幣元）、
//       available 現在有沒有供應、sales 近 30 天賣出的杯數／份數
import type { Client } from '@elastic/elasticsearch'
import { createMenuIndex } from './mapping.ts'

export type MenuItem = {
  id: string
  name: string
  description: string
  category: '咖啡' | '茶飲' | '甜點' | '輕食'
  price: number
  available: boolean
  sales: number
}

const rows: [string, string, MenuItem['category'], number, boolean, number][] = [
  ['美式咖啡', '濃縮咖啡加熱水，口感清爽', '咖啡', 80, true, 320],
  ['拿鐵', '濃縮咖啡加上大量蒸奶，奶香滑順（Latte）', '咖啡', 110, true, 450],
  ['冰拿鐵', '拿鐵加冰塊，夏天最受歡迎', '咖啡', 120, true, 380],
  ['卡布奇諾', '濃縮咖啡、蒸奶與厚奶泡各三分之一', '咖啡', 110, true, 210],
  ['焦糖拿鐵', '自製焦糖醬加上濃縮咖啡與蒸奶', '咖啡', 130, true, 260],
  ['燕麥拿鐵', '用燕麥奶取代牛奶，乳糖不耐也能喝', '咖啡', 130, true, 150],
  ['香草拿鐵', '馬達加斯加香草糖漿，季節限定', '咖啡', 130, false, 90],
  ['摩卡', '濃縮咖啡、巧克力醬與蒸奶', '咖啡', 130, true, 140],
  ['冰美式', '美式咖啡加冰塊', '咖啡', 85, true, 300],
  ['濃縮咖啡', '單份義式濃縮', '咖啡', 70, true, 60],
  ['手沖衣索比亞', '淺焙，帶柑橘與花香', '咖啡', 160, true, 40],
  ['黑糖拿鐵', '沖繩黑糖蜜加上濃縮咖啡與蒸奶', '咖啡', 130, true, 120],
  ['伯爵紅茶', '佛手柑香氣的紅茶', '茶飲', 90, true, 200],
  ['伯爵奶茶', '伯爵紅茶加鮮奶', '茶飲', 110, true, 180],
  ['抹茶拿鐵', '宇治抹茶加蒸奶，不含咖啡', '茶飲', 130, true, 150],
  ['烏龍茶', '凍頂烏龍，回甘', '茶飲', 80, true, 90],
  ['蜂蜜檸檬茶', '綠茶加蜂蜜與檸檬', '茶飲', 100, true, 110],
  ['焙茶拿鐵', '焙茶粉加鮮奶，帶烘焙香氣', '茶飲', 130, true, 70],
  ['洋甘菊茶', '無咖啡因的花草茶', '茶飲', 100, true, 30],
  ['可頌', '法國奶油層層折疊', '甜點', 70, true, 260],
  ['起司蛋糕', '濃郁的重乳酪蛋糕', '甜點', 120, true, 280],
  ['巧克力蛋糕', '苦甜巧克力，適合配美式咖啡', '甜點', 120, true, 160],
  ['抹茶蛋糕', '宇治抹茶戚風', '甜點', 120, true, 240],
  ['提拉米蘇', '手指餅乾浸泡濃縮咖啡與咖啡酒，層層疊上馬斯卡彭起司，可可粉微苦，搭配一杯拿鐵剛好', '甜點', 140, true, 130],
  ['焦糖布丁', '自製焦糖醬，口感綿密', '甜點', 90, true, 170],
  ['檸檬塔', '酸甜檸檬餡與奶油塔皮', '甜點', 110, true, 80],
  ['肉桂捲', '肉桂糖霜，配拿鐵', '甜點', 90, true, 150],
  ['火腿起司三明治', '火腿、切達起司與生菜', '輕食', 150, true, 140],
  ['鮪魚三明治', '鮪魚沙拉與小黃瓜', '輕食', 140, true, 90],
  ['雞肉凱撒沙拉', '烤雞胸、蘿蔓與凱撒醬', '輕食', 160, true, 70],
  ['蔬菜貝果', '全麥貝果夾烤蔬菜', '輕食', 120, true, 50],
  ['起司貝果', '貝果烤上切達起司', '輕食', 110, true, 130],
  ['鬆餅', '奶油鬆餅配楓糖', '甜點', 130, true, 110],
  ['焦糖瑪奇朵', '香草糖漿、蒸奶、濃縮咖啡，表面淋上焦糖', '咖啡', 140, true, 190],
  ['冰滴咖啡', '低溫萃取 8 小時，冰涼順口', '咖啡', 150, false, 80],
  ['熱可可', '比利時巧克力加熱牛奶', '茶飲', 100, true, 120],
  ['杏仁可頌', '可頌夾杏仁奶油餡', '甜點', 85, true, 95],
  ['起司歐姆蛋', '三顆蛋加起司，附烤吐司', '輕食', 130, true, 40],
  ['豆漿拿鐵', '無糖豆漿取代牛奶', '咖啡', 130, true, 65],
  ['水果茶', '當季水果與紅茶', '茶飲', 120, true, 140],
]

export const MENU: MenuItem[] = rows.map(([name, description, category, price, available, sales], i) =>
  ({ id: String(i + 10), name, description, category, price, available, sales }))

// 用練習 1 的 createMenuIndex 建索引，放進整份菜單；idOffset 讓 id 整批位移（測試用來確認沒有寫死 id）
export async function seedMenu(es: Client, index: string, idOffset = 0): Promise<void> {
  await createMenuIndex(es, index)
  const mapping = await es.indices.getMapping({ index })
  const props = mapping[index]?.mappings.properties ?? {}
  if (props.name?.type !== 'text' || props.category?.type !== 'keyword')
    throw new Error('這一題用練習 1 的 createMenuIndex 建索引：先完成練習 1（name 是 text、category 是 keyword）')
  const operations = MENU.flatMap(({ id, ...doc }) => [{ index: { _index: index, _id: String(Number(id) + idOffset) } }, doc])
  const r = await es.bulk({ operations, refresh: 'wait_for' })
  if (r.errors) throw new Error('放入菜單失敗：' + JSON.stringify(r.items.find(i => i.index?.error)?.index?.error))
}
