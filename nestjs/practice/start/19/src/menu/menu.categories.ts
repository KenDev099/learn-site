// 菜單的分類。GET /menu?category= 只接受這幾個值（其他值回 400），快取的 key 才不會被亂塞
export const Category = { coffee: 'coffee', tea: 'tea', food: 'food' } as const
export type Category = (typeof Category)[keyof typeof Category]
