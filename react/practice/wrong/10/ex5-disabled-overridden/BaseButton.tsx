import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton({ variant = 'primary', loading = false, className, ...rest }: BaseButtonProps) {
  return (
    <button
      type="button"
      disabled={loading}
      {...rest}
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
    />
  )
}
