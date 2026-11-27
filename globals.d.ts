// 判分用的全域宣告。網頁上的編輯器和 tests/ts-parity.mjs 共用這一份

// 型別測試（type-challenges 的寫法）：A 和 B 不是完全相同的型別時，Expect<Equal<A, B>> 會報錯
type Expect<T extends true> = T
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

// 執行測試：條件不成立就丟出錯誤，訊息會顯示在頁面上
declare function assert(value: unknown, message?: string): asserts value
declare namespace assert {
  function equal<T>(actual: T, expected: T, message?: string): void
  function deepEqual<T>(actual: T, expected: T, message?: string): void
}
