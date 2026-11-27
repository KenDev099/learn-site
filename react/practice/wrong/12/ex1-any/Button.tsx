// 行為都對，但 props 是 any：錯的用法都不會報錯
export function Button({ variant = 'primary', icon, className, type = 'button', children, ...rest }: any) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
