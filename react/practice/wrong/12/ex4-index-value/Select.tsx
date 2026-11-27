import type { ChangeEvent } from 'react'

type SelectProps<T> = {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
  getKey: (option: T) => string | number
  getLabel: (option: T) => string
}

// 用索引當 value、用 indexOf 找選中的：value 是內容相同的另一個物件時找不到
export function Select<T>({ label, options, value, onChange, getKey, getLabel }: SelectProps<T>) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const picked = options[Number(e.target.value)]
    if (picked !== undefined) onChange(picked)
  }
  const selected = value === null ? -1 : options.indexOf(value)
  return (
    <label>
      {label}
      <select value={selected === -1 ? '' : String(selected)} onChange={handleChange}>
        <option value="" disabled>請選擇</option>
        {options.map((option, i) => (
          <option key={getKey(option)} value={i}>{getLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}
