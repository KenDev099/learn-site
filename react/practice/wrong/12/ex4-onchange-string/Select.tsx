import type { ChangeEvent } from 'react'

type SelectProps<T> = {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  getKey: (option: T) => string | number
  getLabel: (option: T) => string
}

// 型別都對，但把 <select> 的字串斷言成 T 交出去
export function Select<T>({ label, options, value, onChange, getKey, getLabel }: SelectProps<T>) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange(e.target.value as unknown as T)
  }
  return (
    <label>
      {label}
      <select value={value === null ? '' : String(getKey(value))} onChange={handleChange}>
        <option value="" disabled>請選擇</option>
        {options.map(option => (
          <option key={getKey(option)} value={getKey(option)}>{getLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}
