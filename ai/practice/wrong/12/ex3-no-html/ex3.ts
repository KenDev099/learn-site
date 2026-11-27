// 練習 3：模型的輸出顯示在前端之前，關掉資料外洩的管道

// 依序做三件事：
//   1. 移除所有 Markdown 圖片 ![說明](網址)（整段拿掉，說明文字也不留）
//   2. 移除所有 HTML 標籤（<img …>、<script>、</a>…：拿掉標籤本身，標籤之間的文字留著）
//   3. Markdown 連結 [文字](網址)：網址是 https:，而且主機名稱「完全等於」allowedHosts 其中一個，才保留原樣；
//      其他（別的網域、http:、javascript:、相對網址、解析不了的）只留下「文字」
// 主機名稱用 new URL(網址).hostname 取得，不要對網址字串用 includes／startsWith
function isAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && allowedHosts.includes(u.hostname)
  } catch {
    return false   // 相對網址、亂寫的網址：new URL 會丟錯
  }
}

export function sanitizeOutput(markdown: string, allowedHosts: string[]): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (whole, label: string, url: string) => (isAllowed(url.trim(), allowedHosts) ? whole : label))
}
