# formatGN 在 1~100 区间少报，差额提示照它写会让玩家白跑

状态：待办（未修，行为已由 `src/utils/format.spec.ts` 钉住）。

## 现象

缺料/缺钱的提示都照 `formatGN(差额)` 写。这个格式化对 0.1~100 之间的小数
只保留一位（`toFixed(1)`），于是一部分差额会被**少报**：

```
实际差 1.824  →  显示「灵石尚差 1.8」   ← 少报 0.024，照提示补足仍不够
实际差 1.86   →  显示「灵石尚差 1.9」   ← 多报，无害
实际差 0.28   →  显示「灵石尚差 0.3」   ← 多报，无害
实际差 0.04   →  显示「灵石尚差 0.04」  ← 小于 0.1 反而按数量级给位，是对的
```

## 机制

`src/utils/format.ts` 第 16~19 行：

```ts
if (n < 100 && !Number.isInteger(n)) {
  const tiny = n > 0 && n < 0.1 ? n.toFixed(Math.max(2, Math.min(6, 1 - Math.floor(Math.log10(n))))) : n.toFixed(1)
  return trimZero(tiny)
}
```

`n >= 0.1` 一律 `toFixed(1)`，四舍五入方向不受控。

## 影响面

灵石本来就允许小数：`stoneByTier` 是 `12 * amount * 0.1`，而丹药石耗还额外除过 10，
`pillStoneCost` 于是给出 1.824 / 2.28 / 3.42 这类值。差额提示的落点至少包括：

- `src/core/pillService.ts` 第 192、194、245 行（`craftShortToast` 的 `formatGN(gap.stone)`）
- `src/views/ApprenticeView.vue` 第 9 行（招募钮 `title` 里的「灵石尚差」）
- `src/core/buildingService.ts`、`src/core/daoSource.ts` 的同名差额字段

## 为什么不直接改 formatGN

它是全站格式化，300+ 处展示都读它。改精度会同时影响阅读密度、列宽、
`layout-check` 的数字断行自检，以及所有既有快照式断言。为一个差额提示
去动全站精度，风险远高于收益。

## 建议改法

差额提示单独向上取整，而不是把全站数字都改成高精度。两种落点：

1. 在 `src/ui/` 加一个 `formatGap(v: GNum): string`：先按 `formatGN` 的量级规则
   决定保留几位，再把末位向上进一（保证「按提示补足一定够」）。
2. 若不想到处换调用点，就在 `craftShortToast` / `ApprenticeView` 这几处
   把 `formatGN(short)` 换成 `formatGap(short)`。

原则：**差额宁可多报不可少报** —— 多报 0.1 只是多补一点，少报 0.024 会让玩家反复试。

## 已知的反例（别一起改掉）

`n < 0.1` 那条分支是对的：`0.04 → "0.04"`、`0.004 → "0.004"`。
它的位数随数量级抬升（2~6 位），本来就是为小额差额准备的。
