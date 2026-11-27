import type { ChangeEvent } from 'react'

type SelectProps<T> = {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  getKey: (option: T) => string | number
  getLabel: (option: T) => string
}

// <option> 的 value 用顯示文字：兩個選項文字相同就分不出來
export function Select<T>({ label, options, value, onChange, getKey, getLabel }: SelectProps<T>) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const picked = options.find(option => getLabel(option) === e.target.value)
    if (picked !== undefined) onChange(picked)
  }
  return (
    <label>
      {label}
      <select value={value === null ? '' : getLabel(value)} onChange={handleChange}>
        <option value="" disabled>請選擇</option>
        {options.map(option => (
          <option key={getKey(option)} value={getLabel(option)}>{getLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}
