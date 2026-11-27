import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton({ variant = 'primary', loading = false, className, disabled, ...rest }: BaseButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={['btn', className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    />
  )
}
