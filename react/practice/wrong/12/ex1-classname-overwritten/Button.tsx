import type { ComponentProps, ReactNode } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
}

// className 留在 rest 裡，{...rest} 放在後面把 btn 蓋掉
export function Button({ variant = 'primary', icon, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}
