// 練習 2：自己實作 npm 判斷版本範圍的規則
// 版本：MAJOR.MINOR.PATCH，可能帶 prerelease，例如 1.3.0-beta.2
// 範圍：精確版本（1.2.3）、^1.2.3、~1.2.3，也可能帶 prerelease（^1.3.0-beta.1）
// 輸入一定是合法的格式，不用處理打錯的字串

// version 符合 range 就回傳 true
export function satisfies(version: string, range: string): boolean {
  return false
}

// 回傳 versions 裡符合 range 的最高版本；一個都沒有就回傳 null
export function maxSatisfying(versions: string[], range: string): string | null {
  return null
}
