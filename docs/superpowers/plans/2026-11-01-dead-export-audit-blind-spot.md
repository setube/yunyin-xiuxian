# deadExportAudit 的「文件内自引用」盲区

状态：待办（未修）。

## 现象

`src/core/deadExportAudit.spec.ts` 的「运行时模块里的导出不能只被 spec 用到」这一条，
对**声明文件内部还被别的函数调用过**的导出会漏检。

## 机制

判据（约第 210 行）：

```ts
const specOnlyCount = specUses.get(name) ?? 0
const runtimeUses = total - specOnlyCount          // ← 只扣了 spec 用量
if (runtimeModules.has(declPath.get(name) ?? '') && !AUDIT_MODULES.has(declRel)
    && runtimeUses <= count && specOnlyCount > 0) { specOnly.push(...) }
```

- `total` 是该名字在全部文件里的标识符出现次数（含声明处）
- `count` 是声明次数（通常 1）
- 文件内部的另一处调用也算进 `total`，被当成「有外部消费者」

## 已知实例

`src/core/expIncome.ts` 的 `expIncomeAt`：

- 只被 `expIncome.spec.ts` 使用（第 114 行）
- 但同文件的 `expIncomeAudit`（第 87 行）调了它一次
- 于是 `total = 3`（声明 1 + 内部 1 + spec 1），扣掉 spec 仍剩 2 > `count = 1`
- 结果：本该报「只被 spec 用」，实际通过

同类还有 `src/utils/saveShape.ts` 的 `asCombatSkill`（生产代码只用 `asCombatSkills`，
但 `asCombatSkills` 内部调了 `asCombatSkill`）。

## 尝试过的修法与结果

在 `specUses` 之外再记一份「同文件非声明处引用」`selfRefs`，
判定时 `runtimeUses = total - specOnlyCount - selfCount`：

- 判据改 `runtimeUses <= 0`：**162 条**新红
- 判据保持 `runtimeUses <= count`：**243 条**新红

两者都远超单轮可处理量。逐条看下来，新红里混着两类完全不同的东西：

- **真骨架**：确实只被 spec 用（`asCombatSkill`、`expIncomeAt`）
- **正常模块内复用**：导出 A，同文件另一个导出 B 调用 A，B 才是对外入口
  （`planTransfer`、`apprenticeRecruitCost` 等大量 service 函数属于此类）

现有判据无法区分这两类，所以不能简单收紧。

## 建议的解法

按「该名字在同文件内被哪些**其它导出**调用」分层：若同文件内的引用全部都发生在
其它导出函数体内，则沿用「外部无人用」的结论前需显式标注（类似现有的 `AUDIT_MODULES`
豁免表，但按符号而非按模块）。

或者：把 `expIncomeAt` 这类**真正只被 spec 用**的导出逐个处理掉（接进运行时或删掉），
再把判据收紧——但这需要先确认 243 条里哪些是真的，工作量与风险都不小。

## 复现

```bash
# 1. 在 deadExportAudit.spec.ts 里加 selfRefs，判定改 runtimeUses <= 0
# 2. 运行
bunx vitest run src/core/deadExportAudit.spec.ts
# 3. 会看到 162 条 specOnly
```

## 为什么当时没修

方向对，但一次改动会让 243 条既有导出转到「未豁免」状态，必须逐条判定该接进游戏、
该删、还是该写豁免理由。这是需要专门规划的任务，不适合在细节打磨的轮次里仓促改审计工具本身。
