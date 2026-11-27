#!/bin/sh
# 用法：sh ex1.sh <repo>（測試會傳入 ex1-repo）
set -e
cd "$1"
git switch -q feature/loyalty

if ! git merge main; then
  # 停在「feat: 會員 9 折」：rebase 時 --ours 是 main 那邊、--theirs 是正在重新套用的 feature commit
  git status --short
  # 1. 照 README 的規則把兩邊合起來：先 9 折再 8 折，最後四捨五入
  cat > src/pricing.ts <<'TS'
// 售價計算：base 是菜單價（元），回傳實收金額（四捨五入到整數）
export type PriceOptions = {
  happyHour?: boolean   // 歡樂時光 8 折
  member?: boolean      // 會員 9 折
}

export function price(base: number, opts: PriceOptions = {}): number {
  let p = base
  if (opts.member) p = p * 0.9
  if (opts.happyHour) p = p * 0.8
  return Math.round(p)
}
TS
  # 2. lockfile 不手動合：package.json 已經自動合好，從它重新產生
  npm install --package-lock-only --no-audit --no-fund
  git add src/pricing.ts package-lock.json
  # 3. 繼續套用下一個 commit；GIT_EDITOR=true 沿用原本的訊息，不開編輯器
  GIT_EDITOR=true git commit --no-edit
fi
git log --oneline --graph -5
