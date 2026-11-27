// 練習 5：BaseButton（把 props 透傳到根元素）
// 問題：BaseButton 只收 children。使用的人寫
//         <BaseButton variant="ghost" className="wide" aria-label="移除可頌" disabled onClick={remove}>×</BaseButton>
//       className、aria-label、disabled、onClick 全部被丟掉：React 不會自動把沒用到的 props 加到根元素。
// 要求：
//   1. 除了 variant、loading 以外的 props 全部交給 <button>（aria-*、data-*、disabled、onClick、id、ref…），
//      不要一個一個挑
//   2. className 要合併：一定有 btn 與 btn-<variant>（variant 預設 'primary'），再加上傳進來的 className；
//      沒傳 className 時 class 裡不能出現多餘的字（例如 undefined）
//   3. type 預設是 "button"，但使用的人傳 type="submit" 要蓋得過去
//   4. variant、loading 是這個元件自己的 props，不能出現在 DOM 上
//   5. loading 為 true 時：<button> 一定是 disabled（就算使用的人傳了 disabled={false}），並且 aria-busy="true"；
//      loading 不是 true 時不要有 aria-busy
// ComponentProps<'button'> 是「原生 <button> 能收的所有 props」的型別，第 12 課會教；這裡先照用
import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton({ children }: BaseButtonProps) {
  return (
    <button type="button" className="btn">
      {children}
    </button>
  )
}
