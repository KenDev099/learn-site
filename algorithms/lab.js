// 演算法與資料結構：面試基礎 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'algorithms-progress'
export const STAGES = [
  ['階段 1：解題基本功', [
    [1, '解題流程：讀題、手算、先寫出暴力解', '01-problem-solving.html'],
    [2, '複雜度：用迴圈次數看 Big-O', '02-complexity.html'],
    [3, '陣列：索引、原地修改與邊界', '03-arrays.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：雜湊表', [
    [4, '雜湊表與集合：查找、去重、計數', '04-hash-set-map.html'],
    [5, 'Two Sum：從雙迴圈到 Map', '05-two-sum.html'],
    [6, '分組與計數：選對 key', '06-grouping.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：陣列技巧', [
    [7, '雙指標：從兩端往中間走', '07-two-pointers.html'],
    [8, '排序與區間：比較函式與合併的想法', '08-sort-intervals.html'],
    [9, '二分搜尋：範圍與邊界', '09-binary-search.html'],
    [10, '滑動視窗', '10-sliding-window.html'],
    [11, '前綴和', '11-prefix-sum.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：線性結構', [
    [12, '堆疊與佇列', '12-stack-queue.html'],
    [13, '鏈結串列：節點與反轉', '13-linked-list.html'],
    [14, '快慢指標', '14-fast-slow.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：遞迴與樹', [
    [15, '遞迴入門：終止條件與呼叫堆疊', '15-recursion.html'],
    [16, '二元樹 DFS', '16-tree-dfs.html'],
    [17, '二元樹 BFS：逐層處理', '17-tree-bfs.html'],
    [18, '二元搜尋樹', '18-bst.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：進階結構與搜尋', [
    [19, 'Heap 與 Top K', '19-heap.html'],
    [20, '圖與網格：visited、DFS、BFS', '20-graph-grid.html'],
    [21, '回溯：選擇、探索、撤銷', '21-backtracking.html'],
  ], 'sheets/stage-6.html'],
  ['階段 7：最佳化', [
    [22, '貪婪：每一步都選眼前最好的', '22-greedy.html'],
    [23, '一維動態規劃：狀態、轉移、初始值', '23-dp-1d.html'],
  ], 'sheets/stage-7.html'],
  ['階段 8：進階題型（進階）', [
    [24, '動態規劃延伸：湊金額與最長共同子序列', '24-dp-advanced.html', '選修'],
    [25, '單調堆疊', '25-monotonic-stack.html', '選修'],
    [26, '拓撲排序', '26-topological-sort.html', '選修'],
  ], 'sheets/stage-8.html'],
  ['階段 9：期末', [
    [27, '期末：模擬面試', '27-mock-interview.html'],
  ], 'sheets/stage-9.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
