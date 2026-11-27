import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton({ variant = 'primary', loading = false, disabled, ...rest }: BaseButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}`}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    />
  )
}
