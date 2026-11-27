// JS、非同步與 TypeScript 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'typescript-progress'
export const STAGES = [
  ['階段 1：JavaScript 的核心機制', [
    [1, '閉包與 this：函式記得什麼', '01-closures-this.html'],
    [2, '值與參考：相等、複製與不可變更新', '02-values-references.html'],
    [3, '原型與 class：物件怎麼共用方法', '03-prototypes-classes.html'],
    [4, '錯誤處理：throw、Error 與 cause', '04-errors.html'],
    [5, '數字與金額：浮點數、四捨五入與大整數', '05-numbers-money.html'],
    [6, '日期與文字：時區、Intl 與 Unicode', '06-dates-text.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：非同步、迭代與並發', [
    [7, 'Event loop：程式執行的順序', '07-event-loop.html'],
    [8, 'Promise：未來才會有的值', '08-promises.html'],
    [9, 'async/await：依序、平行與錯誤', '09-async-await.html'],
    [10, '迭代器與產生器：一次拿一筆', '10-iterators-generators.html'],
    [11, '逾時與取消：AbortController 與期限', '11-timeouts-cancellation.html'],
    [12, '競態與並發控制：過期回應、插隊與重複送出', '12-races-concurrency.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：型別基礎', [
    [13, 'TypeScript 在做什麼', '13-what-is-ts.html'],
    [14, '物件型別：type、interface 與結構型別', '14-object-types.html'],
    [15, '聯合型別與字面值型別', '15-unions-literals.html'],
    [16, '型別縮小與可辨識聯合', '16-narrowing.html'],
    [17, 'unknown、any 與型別守衛', '17-unknown-any-guards.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：函式、泛型與型別運算', [
    [18, '函式的型別', '18-function-types.html'],
    [19, '泛型', '19-generics.html'],
    [20, '從值推導型別：typeof、keyof、as const、satisfies', '20-typeof-keyof.html'],
    [21, '工具型別：從現有型別做出新型別', '21-utility-types.html'],
    [22, '型別運算：mapped、conditional、infer、template literal', '22-type-level.html', '選修'],
  ], 'sheets/stage-4.html'],
  ['階段 5：寫後端需要的 TypeScript', [
    [23, '類別：存取修飾子、implements 與抽象類別', '23-classes.html'],
    [24, '裝飾器與 metadata：自己做迷你 DI', '24-decorators-di.html'],
    [25, '模組、.d.ts 與 tsconfig', '25-modules-dts-tsconfig.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：實戰', [
    [26, '驗證外部資料：自製迷你 schema，再看 zod', '26-runtime-validation.html'],
    [27, '用型別設計狀態與錯誤：Result、branded type、狀態機', '27-modeling-state-errors.html'],
    [28, '期末專題：型別安全的訂單模組', '28-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
