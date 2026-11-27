import { useState } from 'react'

type QuantityStepperProps = {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
}

export function QuantityStepper({ value, defaultValue = 1, onChange, min = 1, max = 20 }: QuantityStepperProps) {
  const [inner, setInner] = useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? value : inner

  function change(next: number) {
    if (!controlled) setInner(next)
    onChange!(next)
  }

  return (
    <div role="group" aria-label="數量">
      <button type="button" aria-label="減少" disabled={current <= min} onClick={() => change(current - 1)}>−</button>
      <output>{current}</output>
      <button type="button" aria-label="增加" disabled={current >= max} onClick={() => change(current + 1)}>+</button>
    </div>
  )
}
