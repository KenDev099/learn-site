// 練習 1：Button（props 的型別、ReactNode、延伸原生屬性）
// 問題：props 是 any。<Button varient="ghost">、<Button href="/menu">、<Button onClick="add()"> 都不會報錯，
//       而且除了 children 以外，傳進來的東西（disabled、aria-label、onClick…）全部被丟掉。
// 要求：
//   1. props 的型別＝原生 <button> 的全部屬性（用 ComponentProps<'button'>），再加上兩個自己的 prop：
//      variant?: 'primary' | 'ghost'（預設 'primary'）、icon?: ReactNode（放在文字前面）
//   2. className 是 "btn btn-<variant>"，使用的人傳的 className 接在後面，不能蓋掉 btn
//   3. 沒有傳 type 時是 "button"（原生預設是 submit，放進表單會誤送出）；有傳就用傳進來的
//   4. 其餘的原生屬性（disabled、aria-label、onClick、ref…）全部展開到 <button> 上
// 不能做的事：用 any、unknown、索引簽章（[key: string]: …）或型別斷言讓錯誤消失；自己一個一個列出原生屬性
import type { ComponentProps, ReactNode } from 'react'

// ComponentProps<'button'>：JSX 裡 <button> 接受的全部 props（React 19 起也包含 ref）
type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

// 自己要處理的 prop 先解構出來，剩下的（rest）原封不動交給 <button>
export function Button({ variant = 'primary', icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
