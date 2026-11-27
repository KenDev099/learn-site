// 練習 3：useQuantityField（事件、ref 與 state 的型別）
// 這個 hook 管「數量」輸入框：使用的人把 text、handleChange、inputRef 接到 <input>，把 handleSubmit 接到 <form onSubmit>。
// 問題：到處都是 any，所以裡面藏了一個打錯字的 bug（打字之後輸入框的內容不見了），TypeScript 完全沒發現。
// 要求：把每個 any 換成正確的型別，再把 TypeScript 找到的錯誤修掉。
//   1. onSubmit 是「收一個 number、沒有回傳值」的函式
//   2. error 這個 state 是錯誤訊息字串，沒有錯誤時是 null
//   3. inputRef 會被放到 <input> 的 ref 上
//   4. handleChange 是 <input> 的 onChange 處理函式；handleSubmit 是 <form> 的 onSubmit 處理函式
//      （事件型別從 'react' import。@types/react 19.3 的 FormEvent 已經標成 deprecated，submit 事件有自己的型別）
//   行為（除了那個 bug 以外都已經寫好）：送出時數量不合法 → 設定錯誤訊息、把焦點移回輸入框、不呼叫 onSubmit；
//   合法 → onSubmit(數字)；重新打字就清掉錯誤訊息。
// 不能做的事：留下任何 any；用 as 或 ! 斷言讓錯誤消失
import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'

/** 把輸入框的文字轉成 1～20 的整數；不合法就是 null */
function parseQuantity(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 20 ? n : null
}

export function useQuantityField(onSubmit: (quantity: number) => void) {
  const [text, setText] = useState('1')                          // 從初始值推論成 string，不用寫
  const [error, setError] = useState<string | null>(null)        // 只給 null 會推論成 null，要寫出完整的聯合
  const inputRef = useRef<HTMLInputElement>(null)                // RefObject<HTMLInputElement | null>
  const quantity = parseQuantity(text)

  function handleChange(e: ChangeEvent) {
    setText((e.target as HTMLInputElement).value)                                    // 有了型別，valeu 這種錯字會直接報錯
    setError(null)
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (quantity === null) {
      setError('數量要是 1 到 20 的整數')
      inputRef.current?.focus()                                  // 掛上去之前 current 是 null
      return
    }
    onSubmit(quantity)
  }

  return { text, quantity, error, inputRef, handleChange, handleSubmit }
}
