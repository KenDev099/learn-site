// 練習 4：QuantityStepper（同時支援受控與非受控）
// 問題：現在只有受控的用法：畫面顯示 value，按鈕只會呼叫 onChange。
//       商品卡片上只想「放一個能加減的數量」、不想自己開 state 的人，放上去按了沒反應。
// 要求：
//   1. 受控：有傳 value 時，畫面永遠顯示 value；按 +／− 只呼叫 onChange(新數量)，
//      父元件沒把新的 value 傳回來，畫面就不變
//   2. 非受控：沒傳 value 時，元件自己用 state 記數量，初始值是 defaultValue（預設 1）；
//      按 +／− 更新自己的 state，並呼叫 onChange(新數量)（onChange 可以不傳）
//   3. 範圍是 min～max（預設 1～20）：到上限時「增加」要 disabled，再按也不能呼叫 onChange；下限與「減少」同理
//      （<button> 有 disabled 這個 prop 時，React 不會呼叫它的 onClick）
//   4. onChange 只在使用者按按鈕時呼叫，每按一次剛好一次；掛載時不呼叫
//   5. defaultValue 只在掛載時讀一次，之後父元件改了也不理它
// 不能做的事：用 effect 把 value 複製進 state、用 effect 呼叫 onChange（第 6 課）
type QuantityStepperProps = {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
}

export function QuantityStepper({ value = 1, onChange }: QuantityStepperProps) {
  return (
    <div role="group" aria-label="數量">
      <button type="button" aria-label="減少" onClick={() => onChange?.(value - 1)}>−</button>
      <output>{value}</output>
      <button type="button" aria-label="增加" onClick={() => onChange?.(value + 1)}>+</button>
    </div>
  )
}
