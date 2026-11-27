import type { MouseEventHandler, ReactNode, Ref } from 'react'

// 自己列出想得到的幾個原生屬性：form、name、title、onKeyDown…都傳不進來
type ButtonProps = {
  variant?: 'primary' | 'ghost'
  icon?: ReactNode
  children?: ReactNode
  className?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'primary', icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
