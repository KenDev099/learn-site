// 檔案類型看內容的開頭幾個 byte（magic bytes），不看副檔名、也不信瀏覽器送的 Content-Type（第 12 課）
const SIGNATURES: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]],
]

export const detectType = (buf: Buffer) => SIGNATURES.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0] ?? null

// Content-Disposition：ASCII 的備用檔名＋RFC 6266 的 filename*（UTF-8，中文檔名才不會變亂碼）
export function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
