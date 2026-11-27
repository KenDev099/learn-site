import type { ComponentProps } from 'react'

type BaseButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
}

export function BaseButton(props: BaseButtonProps) {
  const { variant = 'primary', loading = false, className, disabled } = props
  const rest = props
  return (
    <button
      type="button"
      {...rest}
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    />
  )
}
