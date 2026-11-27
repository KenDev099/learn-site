const patterns = { heart: '♥ 愛心', tulip: '❀ 鬱金香', rosetta: '❦ 葉子' }
export function pour(name) {
  return patterns[name] ?? '☕ 沒有拉花'
}
