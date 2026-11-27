// 文件類交付物用固定的小範本：只看標題底下有沒有填、填的東西對不對，不評文筆
//   sections(md)      → Map<標題文字（不含 ##）, 內容>
//   sections(md, 3)   → 一樣，改用 ### 標題切
//   codeBlocks(text)  → ``` 區塊裡的內容
export function sections(md: string, level = 2) {
  const map = new Map<string, string>()
  const mark = '#'.repeat(level) + ' '
  let title: string | null = null
  for (const line of md.split('\n')) {
    const heading = line.match(/^(#+) /)
    if (heading && heading[1].length <= level) title = line.startsWith(mark) ? line.slice(mark.length).trim() : null
    if (title === null) continue
    if (line.startsWith(mark)) map.set(title, '')
    else map.set(title, map.get(title) + line + '\n')
  }
  return map
}

export const codeBlocks = (text: string) => [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1])
