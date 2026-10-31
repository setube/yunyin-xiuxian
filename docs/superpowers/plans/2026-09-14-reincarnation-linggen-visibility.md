# 转世灵根可感知性 + 人物页历世记录 —— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"转世=灵根重生"可感知（弹窗第二程展示来世灵根 + toast），并在人物页/修仙录历世履历展示每世的灵根徽记。

**Architecture:** 灵根只在 `prepareReincarnation` roll 一次存 `view.nextLinggen`，`confirmReincarnation` 直接使用该份（**WYSIWYG 硬约束**，杜绝二次 roll）；`confirmReincarnation` 的 `recordLife` 在 `rebirth` 之前执行，借此将本世灵根快照进 `LifeRecord.linggen?`（可选字段，老存档兜底）。三层纯逻辑改动集中在 `reincarnation.ts` / `samsara.ts` / `ui.ts`，三个 Vue 文件只做展示。

**Tech Stack:** TypeScript + Vue 3 (script setup) + Pinia + Vitest。测试模板见 `src/stores/game.spec.ts:72-86`（全流程 `initCharacter→prepareReincarnation→confirmReincarnation(null)` 已证明可行）。

## Global Constraints

- **WYSIWYG 是硬契约**：`confirmReincarnation` 必须使用 `view.nextLinggen`，**绝不**再调 `rollLinggen`。若 `nextLinggen` 缺失，视为不变量违例，不做二次 roll 兜底。
- `LifeRecord.linggen` 为**可选**字段，老存档缺省必须不崩（Template/UI 用可选链）。
- 项目无 Vue 组件测试惯例（无 `@vue/test-utils` 用法）；UI 任务的验证 = 逻辑测试全绿 + `vitest run` 无回归。
- 复制引用：`src/types/index.ts:81` `interface LinggenProfile { roots: SpiritRoot[]; gradeName: string; growthMult: number }`；`src/data/linggen.ts:13` `ELEMENTS[el].char/color`。
- 不改资质地板 / growthMult 任何数值；不做转世灵根重掷界面（Phase 32.2 decision 否决）。

---

### Task 1: 类型层 —— `LifeRecord.linggen?`

**Files:**
- Modify: `src/data/samsara.ts:123-144`

**Interfaces:**
- Consumes: 无（纯类型增量）
- Produces: `LifeRecord.linggen?: { gradeName: string; roots: import('@/types').SpiritRoot[] }`

> **为何不含 `ReincarnationView.nextLinggen`**:`nextLinggen` 是必填字段,加入后 `prepareReincarnation` 的对象字面量会因缺字段立即 tsc 报红。它必须与填写它的逻辑（Task 2）同 commit,否则 Task 1 会留下一个红构建。`LifeRecord.linggen?` 是可选字段,单独加入不破坏任何现有代码。

- [ ] **Step 1: 给 `LifeRecord` 加灵根字段**

在 `src/data/samsara.ts` 的 `export interface LifeRecord`（line 123）中，`at: number` 之前加：

```ts
  /** 本世持用的灵根(转世归档时快照,修仙录/人物页据此回望);老存档无此字段 */
  linggen?: { gradeName: string; roots: import('@/types').SpiritRoot[] }
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS（可选字段不产生破坏；此为绿构建 commit）

- [ ] **Step 3: Commit**

```bash
git add src/data/samsara.ts
git commit -m "feat: LifeRecord 新增可选灵根字段(历世履历据此回望每世牌面)"
```

---

### Task 2: prepare 存灵根 + confirm 用灵根（WYSIWYG 核心）

**Files:**
- Modify: `src/stores/ui.ts:37-60`（`ReincarnationView.nextLinggen`）
- Modify: `src/core/reincarnation.ts:87-123`（prepare）
- Modify: `src/core/reincarnation.ts:152-235`（confirm 第 221 行 + toast）
- Test: `src/core/reincarnation.spec.ts`（新建）

**Interfaces:**
- Consumes: 既有 `rollLinggen(rng, aptitudeFloorNow())`、`useUiStore()`；本任务先加 `ReincarnationView.nextLinggen` 并同步填它
- Produces: `prepareReincarnation(): ReincarnationView` 的 `view.nextLinggen` 已填充；`confirmReincarnation` 后 `player.linggen` 与 `view.nextLinggen` 同一引用；确认后 toast 播报新灵根品阶

- [ ] **Step 1: 加 `ReincarnationView.nextLinggen` 类型**

在 `src/stores/ui.ts` 的 `export interface ReincarnationView`（line 37）中，`themeFree: boolean` 之后加：

```ts
  /** 来世新灵根(仅 prepare 时 roll 一次,confirm 直接用这份 —— WYSIWYG) */
  nextLinggen: import('@/types').LinggenProfile
```

（此刻 `prepareReincarnation` 的对象字面量会缺字段、tsc 暂红——预期，Step 3 补齐后转绿。）

- [ ] **Step 2: 写失败测试**

新建 `src/core/reincarnation.spec.ts`（模板取自 `game.spec.ts` 的 store 搭建）：

```ts
/**
 * 转世灵根可感知性 —— WYSIWYG 契约
 *
 * 灵根只在 prepare 时 roll 一次存进 view,confirm 直接用这份:
 *   若 confirm 再 roll 一次,玩家会看到"预览天灵根、实拿杂灵根"。
 * 这条测试守的就是这个契约。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { rollLinggen } from '@/core/linggenGen'
import { confirmReincarnation, prepareReincarnation } from '@/core/reincarnation'
import { RandomService, mulberry32 } from '@/utils/random'

describe('转世灵根 WYSIWYG(所见即所得)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('prepare 产出合法 nextLinggen,且不动任何本世灵根状态', () => {
    const rng = new RandomService(mulberry32(11))
    const player = usePlayerStore()
    const ui = useUiStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    const oldLinggen = player.linggen

    const view = prepareReincarnation()

    expect(view.nextLinggen).toBeDefined()
    expect(view.nextLinggen.roots.length, '灵根根数为 0').toBeGreaterThan(0)
    expect(view.nextLinggen.gradeName, '品阶名为空').toBeTruthy()
    expect(player.linggen, 'prepare 改变了本世灵根状态').toBe(oldLinggen)
  })

  it('confirm 后 player.linggen 与 view.nextLinggen 是同一份(绝无二次 roll)', () => {
    const rng = new RandomService(mulberry32(22))
    const player = usePlayerStore()
    const ui = useUiStore()
    player.initCharacter('测试道友', rollLinggen(rng))

    const view = prepareReincarnation()
    const next = view.nextLinggen
    confirmReincarnation(null)

    expect(player.linggen, '落账的不是 prepare 展示的那份').toBe(next)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/core/reincarnation.spec.ts`
Expected: FAIL — `prepareReincarnation` 返回的 view 尚未填 `nextLinggen`,第一条测试的 `expect(view.nextLinggen).toBeDefined()` 断言失败。（注意:vitest 走 esbuild 转译,**不做类型检查**,失败来自运行时断言而非 tsc。）

- [ ] **Step 3b: 确认缺失字段让 tsc 报红(证明类型层也在守住契约)**

Run: `npx tsc --noEmit`
Expected: 报错,指向 `prepareReincarnation` 的 `const view: ReincarnationView = {...}` 缺 `nextLinggen`——这正是 Step 1 必填字段的作用,防止谁忘记填。属预期,下一步补齐后转绿。

- [ ] **Step 4: 实现 —— prepare 里 roll 一次存入 view**

在 `src/core/reincarnation.ts` 的 `prepareReincarnation`（line 87）函数体内，`const view: ReincarnationView = {` 之后、`}` 之前，其它字段后追加：

```ts
    // 灵根只在此处 roll 一次:展示给玩家看,confirm 直接取这份 —— WYSIWYG
    nextLinggen: rollLinggen(rng, aptitudeFloorNow()),
```

- [ ] **Step 5: 实现 —— confirm 使用 view 那份,不再自行 roll**

`src/core/reincarnation.ts:221` 由：

```ts
  player.rebirth(rollLinggen(rng, aptitudeFloorNow()))
```

改为：

```ts
  player.rebirth(view.nextLinggen)
```

确认后 toast 播报新灵根品阶（紧随第 232 行 `'一梦轮回……'` 之后，插在 `if (view.stageAdvanced)` 之前）：

```ts
  ui.toast(`来世之躯,天生一副【${view.nextLinggen.gradeName}】`, 'rare')
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run src/core/reincarnation.spec.ts`
Expected: PASS（两条全绿）

- [ ] **Step 6b: 类型检查确认转绿**

Run: `npx tsc --noEmit`
Expected: PASS（Step 3b 的红由 Step 4/5 补齐字段后消除）

- [ ] **Step 7: Commit**

```bash
git add src/core/reincarnation.ts src/stores/ui.ts src/core/reincarnation.spec.ts
git commit -m "feat: 转世灵根 WYSIWYG——prepare 只 roll 一次,confirm 直接用,杜绝二次 roll"
```

---

### Task 3: recordLife 快照本世灵根进 LifeRecord

**Files:**
- Modify: `src/core/reincarnation.ts:171-184`（recordLife 调用）
- Test: `src/core/reincarnation.spec.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `LifeRecord.linggen?`；Task 2 的流程
- Produces: `confirmReincarnation` 后 `player.reincarnation.lives[last].linggen` 等于**本世**灵根（非来世灵根）

- [ ] **Step 1: 写失败测试（追加到 `src/core/reincarnation.spec.ts`）**

```ts
describe('历世履历快照灵根', () => {
  it('recordLife 归档的是本世灵根(转世前那份),不是来世那份', () => {
    const rng = new RandomService(mulberry32(33))
    const player = usePlayerStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    const thisLife = player.linggen!

    prepareReincarnation()
    confirmReincarnation(null)

    const lives = player.reincarnation.lives
    expect(lives.length, '未归档任何一世').toBe(1)
    expect(lives[0]!.linggen, '履历没有灵根字段').toBeDefined()
    expect(lives[0]!.linggen!.gradeName, '快照的不是本世灵根').toBe(thisLife.gradeName)
    expect(lives[0]!.linggen!.roots.length).toBe(thisLife.roots.length)
  })

  it('快照是浅拷贝:相对本世快照源(转世前 player.linggen)取独立 roots 数组', () => {
    const rng = new RandomService(mulberry32(44))
    const player = usePlayerStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    const thisLife = player.linggen!

    prepareReincarnation()
    confirmReincarnation(null)

    const rec = player.reincarnation.lives[0]!
    // confirm 后 player.linggen 已是「来世」灵根;快照必须仍指向本世那份(早期断言已验 gradeName)
    expect(rec.linggen!.gradeName).toBe(thisLife.gradeName)
    expect(rec.linggen!.roots, '履历灵根 roots 与本世快照源共享同一数组引用').not.toBe(thisLife.roots)
    expect(rec.linggen!.roots.map(r => r.element).sort()).toEqual(thisLife.roots.map(r => r.element).sort())
  })
})
```

> **spec 第 4 条（老存档无 `linggen` 字段不崩）的落地说明**:本项目无 Vue 组件测试惯例（`src/` 无 `@vue/test-utils` 用法），该条由 **UI 模板可选链**承担（Task 4/5/6 均用 `l.linggen?.roots ?? []`、`l.linggen?.gradeName ?? '灵根未记'`）。`LifeRecord.linggen` 亦是可选字段，老档反序列化天然缺省。逻辑层不可构造"灵根为 null 的玩家"（`initCharacter` 必设灵根），故快照代码（Task 3 Step 3）以 `player.linggen ? {...} : undefined` 防御，但不设专门测试——此边界在 UI 层收口。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/reincarnation.spec.ts`
Expected: FAIL — `lives[0].linggen` 为 `undefined`

- [ ] **Step 3: 实现 —— recordLife 快照本世灵根**

`src/core/reincarnation.ts:173-184` 的对象字面量中，`at: Date.now()` 之前加：

```ts
    // 本世灵根随履历入册 —— 发生在 rebirth 之前,此刻 player.linggen 仍是这一世的那副
    linggen: player.linggen ? { gradeName: player.linggen.gradeName, roots: [...player.linggen.roots] } : undefined,
```

（`player.linggen` 理论上非空——建号必有——但保持可选链防御老档。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/reincarnation.spec.ts`
Expected: PASS（三组全绿）

- [ ] **Step 5: Commit**

```bash
git add src/core/reincarnation.ts src/core/reincarnation.spec.ts
git commit -m "feat: recordLife 将本世灵根快照入履历(修仙录/人物页据此回望每世牌面)"
```

---

### Task 4: 转世弹窗第二程展示新灵根卡 + toast

**Files:**
- Modify: `src/components/character/ReincarnationDialog.vue`
- Test: 无 Vue 组件测试惯例；验证 = Task 2/3 测试绿 + `vitest run` 无回归

**Interfaces:**
- Consumes: Task 2 的 `view.nextLinggen`
- Produces: 第二程"轮回"屏在"择一先天之姿"上方展示来世灵根卡

- [ ] **Step 1: 第二程加灵根卡模板**

在 `src/components/character/ReincarnationDialog.vue` 的 `<BaseModal ... step === 'next'` 内、`<p class="font-kai text-[13px] tracking-widest text-ink">择一先天之姿</p>`（line 115）之前插入：

```html
      <!-- 来世新灵根(Phase 34.9):转世发下的这张牌,踏入轮回前就看清 -->
      <div v-if="view.nextLinggen" class="mt-3 rounded-lg border border-ink/15 px-3 py-2">
        <p class="flex items-center justify-between">
          <span class="text-[10px] text-ink-faint">来世之躯</span>
          <span class="font-kai text-[14px] text-cinnabar">{{ view.nextLinggen.gradeName }}</span>
        </p>
        <div class="mt-1.5 flex items-center gap-2">
          <span
            v-for="root in view.nextLinggen.roots"
            :key="root.element"
            class="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-kai"
            :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color }"
            :title="`资质 ${root.aptitude}`"
          >
            {{ ELEMENTS[root.element].char }}
          </span>
          <span class="ml-auto text-[11px] text-ink-faint tabular">×{{ view.nextLinggen.growthMult.toFixed(2) }}</span>
        </div>
        <p class="mt-1 text-[10px] text-ink-faint">新的一世,新的根骨——资质随宿慧上浮,却仍是天生定数。</p>
      </div>
```

- [ ] **Step 2: 补 ELEMENTS 导入**

`ReincarnationDialog.vue` 的 `<script setup>` 中新增（与现有 `talentDef` 导入并列）：

```ts
  import { ELEMENTS } from '@/data/linggen'
```

- [ ] **Step 3: 确认 toast 已在 Task 2 Step 4 加入**

检查 `src/core/reincarnation.ts` 中 `ui.toast(\`来世之躯,天生一副【${view.nextLinggen.gradeName}】\`, 'rare')` 已存在（Task 2 已加）。缺失则补上。

- [ ] **Step 4: 跑全测确认无回归**

Run: `npx vitest run src/core/reincarnation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/character/ReincarnationDialog.vue
git commit -m "feat: 转世弹窗第二程展示来世灵根卡(品阶/元素徽记/资质/倍率)"
```

---

### Task 5: 人物页内嵌"历世"区块

**Files:**
- Modify: `src/views/CharacterView.vue`
- Test: 无组件测试；验证 = 逻辑测试绿 + 手测/无回归

**Interfaces:**
- Consumes: Task 3 的 `player.reincarnation.lives[i].linggen?`
- Produces: 人物页顶部灵根卡之后展示最近 5 世履历（含灵根徽记）

- [ ] **Step 1: 模板 —— 在灵根卡之后插入"历世"卡**

`src/views/CharacterView.vue` 第 34 行 `</div>`（灵根卡结束）之后、第 36 行 `<!-- 属性 -->` 之前插入：

```html
    <!-- 历世(Phase 34.9):此身之外,回望你走过的世。5 世为界,余者见修仙录 -->
    <section v-if="lifeRows.length">
      <SectionTitle title="历世" :hint="`${player.reincarnation.count} 世轮回`" />
      <div class="card-ink mt-2 px-4 py-1">
        <p v-for="l in lifeRows" :key="l.index" class="flex items-center gap-2 py-1.5 text-[12px]">
          <span class="w-14 shrink-0 font-kai text-ink-faint tabular">第{{ l.index }}世</span>
          <span class="flex gap-1">
            <span
              v-for="r in l.linggen?.roots ?? []"
              :key="r.element"
              class="grid h-5 w-5 place-items-center rounded-full border text-[10px] font-kai"
              :style="{ borderColor: ELEMENTS[r.element].color, color: ELEMENTS[r.element].color }"
              :title="`资质 ${r.aptitude}`"
            >
              {{ ELEMENTS[r.element].char }}
            </span>
          </span>
          <span class="truncate text-[10px] text-ink-soft">{{ l.linggen?.gradeName ?? '灵根未记' }} · {{ l.realmLabel }}</span>
          <span class="ml-auto shrink-0 text-[10px]" :class="l.resultColor">{{ l.resultText }}</span>
        </p>
        <p v-if="player.reincarnation.lives.length > 5" class="py-1.5 text-center text-[10px] text-ink-ghost">
          另有 {{ player.reincarnation.lives.length - 5 }} 世,尽在修仙录。
        </p>
      </div>
    </section>
```

- [ ] **Step 2: script 加 lifeRows computed**

`src/views/CharacterView.vue` `<script setup>` 中，仿照 `tendencies`（line 484-485 附近）追加（需确认 `RESULT_TEXT`/`RESULT_COLOR` 映射是否存在，不存在则在本地定义，见 Step 3）：

```ts
  /** 历世履历:最近 5 世,按世序倒排(与修仙录同口径) */
  const lifeRows = computed(() =>
    [...player.reincarnation.lives]
      .sort((a, b) => b.index - a.index)
      .slice(0, 5)
      .map(l => ({
        ...l,
        resultText: l.themeResult === 'done' ? '已成' : l.themeResult === 'broken' ? '已破' : '未竟',
        resultColor: l.themeResult === 'done' ? 'text-cinnabar' : l.themeResult === 'broken' ? 'text-amber-ink' : 'text-ink-faint'
      }))
  )
```

- [ ] **Step 3: 确认依赖已导入**

- `SectionTitle` — `CharacterView.vue` 已使用第 38 行 `<SectionTitle title="道躯" />`，确认 script 已 import（若未 import 则补 `import SectionTitle from '@/components/common/SectionTitle.vue'`）。
- `ELEMENTS` — 已 import（line 444）。
- `computed` — 已 import（line 432）。

- [ ] **Step 4: 跑全测确认无回归**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/CharacterView.vue
git commit -m "feat: 人物页内嵌「历世」卡——最近 5 世灵根徽记/境界/命题结局一目了然"
```

---

### Task 6: 修仙录历世履历补灵根徽记

**Files:**
- Modify: `src/views/LegacyView.vue:97-109`
- Test: 无组件测试；验证 = `vitest run` 无回归

**Interfaces:**
- Consumes: Task 3 的 `player.reincarnation.lives[i].linggen?`
- Produces: 修仙录历世履历每行在"第N世"后显示灵根徽记

- [ ] **Step 1: 履历行加灵根徽记**

`src/views/LegacyView.vue` 第 100-106 行的历世履历行，在 `<span class="w-11 shrink-0 font-kai text-ink-faint tabular">第{{ l.index }}世</span>` 之后插入：

```html
          <span class="flex shrink-0 gap-1">
            <span
              v-for="r in l.linggen?.roots ?? []"
              :key="r.element"
              class="grid h-5 w-5 place-items-center rounded-full border text-[10px] font-kai"
              :style="{ borderColor: ELEMENTS[r.element].color, color: ELEMENTS[r.element].color }"
              :title="`资质 ${r.aptitude}`"
            >
              {{ ELEMENTS[r.element].char }}
            </span>
          </span>
```

并在其后现有 `<span class="text-ink-soft">{{ l.realmLabel }}</span>` 改为把灵根品阶并入展示：

```html
          <span class="text-[10px] text-ink-ghost">{{ l.linggen?.gradeName ?? '' }}</span>
```

- [ ] **Step 2: 确认 ELEMENTS 已导入**

`LegacyView.vue` `<script setup>` 中若无，补：

```ts
  import { ELEMENTS } from '@/data/linggen'
```

- [ ] **Step 3: 跑全测确认无回归**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/views/LegacyView.vue
git commit -m "feat: 修仙录历世履历每行补灵根徽记(老记录无灵根字段则留空)"
```

---

### 收尾验证

- [ ] **Step 1: 全测试 + 类型检查**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS

- [ ] **Step 2: 确认提交历史**

Run: `git log --oneline -6`
Expected: 可见 T1→T6 各提交
