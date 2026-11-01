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

- 直接消费方只有 `expIncome.spec.ts`（第 114 行）
- 同文件的 `expIncomeAudit`（第 87 行）也调它一次
- 于是 `total = 3`（声明 1 + 内部 1 + spec 1），扣掉 spec 仍剩 2 > `count = 1`
- 结果：本该报「只被 spec 用」，实际通过

同类还有 `src/utils/saveShape.ts` 的 `asCombatSkill`（`asCombatSkills` 内部调它）。

### 后续核对：这两个都不是「真骨架」

第二轮逐个核对后修正了此前的判断：

- `asCombatSkill` 被同文件的 `asCombatSkills` 调用，而 `asCombatSkills` **确实是生产代码**
  （`stores/endgame.ts` 第 98、174 行都在用）。这是**正常的模块内复用**，
  审计判成「有人用」是对的。
- `expIncomeAudit` 只在 spec 里用，但它**已经显式豁免**（本文件第 261 行，理由完整）。
  `expIncomeAt` 是它的内部构建块，同理。

所以这两例的真实问题只是「导出关键字可以去掉」（代码整洁度），**不是缺陷**。
本轮据此没有改任何代码——「收紧审计」与「它们其实是骨架」两个判断都不成立。

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

## 232 轮复核：盲区仍在，但收益证明不了值得动

复核了两件事实，结论是**继续保持现状比修更好**：

1. **盲区是真的**。`deadExportAudit.spec.ts` 第 210 行的判据仍是
   `runtimeUses <= count`，没有 `selfRefs` 那一项 —— 本文件第八章描述的机制原样存在。
2. **它当前没有放过任何坏导出**。`ALLOWLIST` 只剩 1 条
   （`studyBlueprint`，且已写明由 `contentReachabilityAudit` 兜住）。
   也就是说这个盲区目前是「理论上的漏检」，不是「实际漏掉了东西」。

收紧了会怎样，本文件已有实测：判据改 `runtimeUses <= 0` 多出 162 条红、
保持 `<= count` 多出 243 条红。而这些红里绝大多数不是缺陷 ——
是「导出 A，同文件另一个导出 B 调用 A」这种正常模块内复用。
要区分这两类，得先给「同文件内的引用是否都发生在其它导出函数体内」建模，
再逐条给真骨架写豁免。工作量按 243 条计，收益是「把本来就是钉住的审计再钉紧一格」。

**判断**：这条债留着更好。理由不是「做不了」，而是**做了不划算** ——
它会用 243 条豁免换取一个当前没有实际损失的判据。
真要动，应当在新增导出明显变多、或 ALLOWLIST 开始膨胀时再做。

**唯一值得现在做的**：`ALLOWLIST` 增条目时必须写明去处（现在 1 条这么写了），
别让它变成「反正有白名单」的垃圾桶。这一点 `deadExportAudit.spec.ts` 头注释已钉。
