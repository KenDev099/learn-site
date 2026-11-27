import type { ComponentProps, ReactNode } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

// 型別對了，但只挑幾個傳下去：aria-label、data-*、ref 都掉了
export function Button({ variant = 'primary', icon, className, type = 'button', children, disabled, onClick }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} disabled={disabled} onClick={onClick}>
      {icon}
      {children}
    </button>
  )
}
