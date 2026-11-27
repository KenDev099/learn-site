import type { ComponentProps, ReactNode } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  variant?: string
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
