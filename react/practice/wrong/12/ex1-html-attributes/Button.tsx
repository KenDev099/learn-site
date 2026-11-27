import type { HTMLAttributes, ReactNode } from 'react'

// HTMLAttributes 只有所有元素共用的屬性：沒有 disabled、type、form，也沒有 ref
type ButtonProps = HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

export function Button({ variant = 'primary', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
