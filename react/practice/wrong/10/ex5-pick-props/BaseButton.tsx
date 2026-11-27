import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton({ variant = 'primary', loading = false, className, disabled, children, onClick, 'aria-label': ariaLabel, type }: BaseButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={ariaLabel}
      onClick={onClick}
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  )
}
