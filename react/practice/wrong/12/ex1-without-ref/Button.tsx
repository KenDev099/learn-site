import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

export function Button({ variant = 'primary', icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
