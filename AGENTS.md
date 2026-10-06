# Repository Guidelines

面向 AI 助手的仓库速查。语言以中文为主，聚焦"这里什么是真的、怎么不搞坏仓库"。

## Project Overview

**云隐修仙录** — 一款 Vue 3 驱动的文字修仙放置（idle）游戏，单机离线成长玩法。版本 1.37.0，`type: module`。支持 Web/PWA、Electron、Android（Capacitor）多端。许可证 CC BY-NC 4.0（禁止商用）；打包的楷体字型为 LXGW WenKai，SIL OFL 1.1（许可证文本在 `public/fonts/OFL.txt`，再分发时须保留）。

## Architecture & Data Flow

核心不变式是 **严格的分层数据流**，遵守它才不会破坏游戏：

```
src/data/  纯静态声明式内容，零副作用，唯一数据源
   ↓ 只读引用
src/core/  游戏逻辑（引擎/战斗/数值/存档），完全在 ts 内计算
   ↓ 状态提升
src/stores/ Pinia 状态（持久化 <-> 内存）
   ↓ 展示
src/ui/    展示层字符串/图标注册（非逻辑）
```

- **src/data/** — 纯静态声明式数据，无副作用、单一事实源。48 个模块：realms、regions、enemies（132）、equipment（288 模板）、affixes（113）、gongfa、gongfaBranches、pills、artifacts、souls、xiangxiu、ziwei、yijing、qimen、daolu、endgame、mutators、constants（556 行，含 `TICK_MS`、`OFFLINE_MIN_SECONDS`、`AGE_YEARS_PER_HOUR`、`ACTIVE_STAMP_MS` 等）。**这里的数字就是真实游戏数值，改动会影响全流程。**
- **src/core/** — 游戏逻辑。关键模块：`engine.ts`（在线心跳 1000ms 单例，含 start/stop 与防重复 interval 守卫）、`combat.ts`（后台完整预演后回放）、`statsCalc.ts`（词缀递减 + 软上限）、`equipGen.ts`、`exploration.ts`、`offline.ts`、`progress.ts`（任务/成就横向总线）、`theme.ts`、`worldGen.ts`（终局世界生成，三重审计门）；另有 16 个 `*Service.ts` 与 6 个 `*Sim.ts` 平衡模拟器。
- **src/stores/** — 15 个 Pinia store；除 `ui.ts` 外 14 个经 `persistConfig('<id>')`（`utils/storage.ts`）持久化。**任何持久化 store 必须暴露 `sanitize()`** 修复损坏存档——`storeResilience.spec.ts` 会从源码正则 `/persistConfig\('([a-zA-Z]+)'\)/` 抓取列表并逐一跑恶意损坏用例，缺 `sanitize` 即测试红。
- **src/ui/** — 展示层数据（icons 注册、statNames、codex、enemyLore、releaseNotes、`*Text.ts`）。注意 "palette" 不是模块，是 `src/ui/palette.spec.ts` 治理测试。
- **src/utils/** — `GNum`（大数 `{m,e}=m×10^e`，`gn/ad/mul/div/powN/cmp/toNum`；**`toNum` 在 e>308 返回 Infinity，需守卫**）、`format`（formatGN/Num/Rate/Percent/Duration/Countdown/Clock/Years）、`random`（mulberry32 + RandomService 单例）、`storage`（前缀 `yunyin.`，SAVE_VERSION 2，AES 加密，节流合并写入 `SAVE_FLUSH_MS` 5000，`PERSISTED_STORES` 列表，`subscribeSaveWriteFailure`，preflightScan 隔离，v1→v2 迁移）、`saveShape`（asArray/asStringArray/asRecord/asRecordOf/asFiniteNumber 守卫）、`platform`、`colorToken`（tint）。
- **src/types/** — 领域类型（CombatResult、CombatSideStats、FoeOrigin、GNum、EquipSlot…）。

## Key Directories

| 路径 | 用途 |
|---|---|
| `src/data/` | 静态声明式游戏内容（唯一事实源）|
| `src/core/` | 游戏逻辑 + 184 个同目录 `*.spec.ts` |
| `src/stores/` | Pinia 状态（14 持久化 + ui 临时）|
| `src/ui/` | 展示层字符串 / 图标 | 
| `src/utils/` | 大数、格式化、随机、存储、存档守卫 |
| `src/types/` | 领域类型 |
| `src/router/` | hash 路由 + 首启流程守卫 |
| `src/composables/` | useNow 等 |
| `scripts/` | test-report.mjs、ui-smoke.mjs、layout-check.mjs、offline-check.mjs、fonts/build-kai-font.py |
| `.github/workflows/` | CI（PR 检查、发布 Pages/PWA/Docker/Electron/APK）|
| `.planning/ril/` | RIL 图（工程记忆，勿手改 JSON）|

tsconfig paths `@/* → ./src/*`，开启 `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`；`vue-tsc -b` 走 project references 做类型检查。

## Development Commands

包管理器 **Bun**（安装用 `bun install`，CI 用 `bun install --frozen-lockfile`）。

> ⚠️ **最大坑：`bun run test` ≠ `bun test`**。`bun run test` = `vitest run`（完整套件）；裸 `bun test` 会触发 Bun 自带 runner 而非 Vitest，**永远不要用**。

- `bun run dev` — Vite 开发服务器
- `bun run check` — `vue-tsc -b`（类型检查）+ `eslint src`（lint）。注意：**不含测试、不含构建**
- `bun run test` — `vitest run` 全量测试
- `bun run test:report` — `scripts/test-report.mjs`（vitest json + 按系统分桶 PASS/FAIL；任一失败或未归类文件即退出 1；CI 限 maxWorkers=4）
- `bun run build` — `vue-tsc -b && vite build`
- `bun run smoke` / `smoke:late` — 构建 + playwright ui-smoke
- `bun run layout-check` — 构建 + `node scripts/layout-check.mjs`（**仅本地**，已从 CI 移除；Windows 用 `node` 而非 bun，耗时约 10 分钟）
- `bun run offline-check` — 构建 + SW 离线自检
- `bun run build:electron` / `build:android` / `build:apk`
- 楷体打包：`uv run scripts/fonts/build-kai-font.py`

## Code Conventions & Common Patterns

- **提交信息：Conventional `type(scope): subject`**，commitlint（husky commit-msg）强制，header ≤200 字。**Body 必须是逐条 bullet（`- x`），一条事实一行，禁止散文段落**——owner 用 filter-branch 重写过历史，要求干净的行项目。
- **持久化 store 必须有 `sanitize()`**：见 storeResilience.spec.ts（从源码抓 `persistConfig` 列表逐一验证）。新增持久化 store 没有 sanitize → 测试直接红。
- **语义色禁用裸 hex**：颜色只以 `--color-x-rgb`（裸 RGB 通道变量）定义在 `src/style.css`；`tailwind.config.js` 的 `withAlpha` 构建 `rgb(var(--x)/<alpha-value>)` 支持 `bg-ink/10` 与 color-mix；暗色主题在 `html[data-theme='dark']` 下仅覆写通道变量。palette.spec.ts 红线：明暗 token 1:1、每 token 映射进 tailwind、无同值异名、源中引用的颜色名必须存在、slash-opacity 只能来自 config 步进、强文本 ≥4.5:1、印面 cream `#f6f1e5` 需匹配 `.btn-seal` 与双主题印底、CIE76 保证品质/元素层级可区分。
  - **朱/金/靛/紫印章上的 scarlet 印面文字用 `.seal-face` 类，不要用 `text-paper`**（dark 下 text-paper 会反成近黑）。
- **字体**：`font-kai` 仅用于标题/境界名/名号，正文用系统栈。捆绑楷体子集 1.5MB（"GB 屏幕阅读版"）；新增装饰字形须进 `build-kai-font.py` 的 `SYMBOLS_FROM_SYSTEM` 白名单，否则构建失败。
- **动画**：`@keyframes` 定义在 style.css；必须同时尊重 `@media (prefers-reduced-motion: reduce)` 与 `.reduce-motion` 块，且两处都要把 `animation-delay` 归零。键盘可访问：全局 `:focus-visible` 朱砂描边已存在，别用 `outline-none` 干掉；纯图标按钮要有 `aria-label`。
- **Big number 注意**：`GNum.toNum()` 在 e>308 返回 Infinity，处理超大数值前先守卫。
- **数据流**：改数值去 `src/data/`，改逻辑去 `src/core/`，改展示去 `src/ui/`，不要跨层硬编码。
- **测试**：`describe/it` 用中文 given-when-then，真实断言，刻意故障注入证明测试能抓 bug。

## Important Files

- `package.json` — 版本/脚本/依赖入口
- `src/main.ts` — 应用入口
- `src/style.css` + `tailwind.config.js` — 设计系统（颜色/字体/动画/dark 主题）
- `src/core/engine.ts` — 在线心跳单例
- `src/core/offline.ts` — 离线结算（sanitizeOfflineInputs → engine.start 时调用各持久化 store 的 `.sanitize()`）
- `src/utils/storage.ts` — 存档持久化/加密/迁移（SAVE_PREFIX、SAVE_VERSION、PERSISTED_STORES）
- `src/utils/gnum.ts` — 大数
- `src/router/` — 路由与首启守卫
- `scripts/test-report.mjs`、`ui-smoke.mjs`、`layout-check.mjs`、`offline-check.mjs`
- `.github/workflows/` — CI 定义
- `vite.config.ts` / `vitest.config.ts` / `tsconfig*.json`

## Runtime/Tooling Preferences

- 必需运行时：**Bun**（开发与构建）。Windows 上 `layout-check` 等个别脚本需用 `node`。
- 包管理：`package.json` 锁定，安装用 `bun install`。
- Node/TS 栈：Vue 3.5、Pinia 3、TS 6.0 strict、Vite 8、Tailwind 3.4、Vitest 5、lucide-vue-next、Tone.js（音频）、CryptoJS（存档 AES）。Electron 39 / Capacitor 8 / PWA。
- Browserslist：Chrome≥51 / Android≥7 / iOS≥12 / Safari≥12。
- **RIL 图**：`.planning/ril/graph.json` 是知识图谱唯一事实源（typed 节点+边：decisions/hypotheses/evidence/tasks）。**只能经 `.agents/skills/graph-engineering/scripts/ril.py` 编辑，绝不手改 JSON**。常用：`ril.py tasks --top N`、`ril.py check`、`ril.py node add/set`、`ril.py edge add`、`ril.py lock/unlock`。graph.json 正常是不随代码提交的工作区文件（git status 常显示其为 modified）。agent 启动时加载活动任务；若无，进入 deep-dive 找新问题（每轮 ≤3 个新任务节点）。

## Testing & QA

- **框架**：Vitest 5；测试与实现同目录共存 `*.spec.ts`（共 242 个 spec：core 184、ui 36、stores 9、utils 8、data 2、composables 2、router 1）。README 里的 "155/143" 已过时——实际 242/184。
- **运行**：全量 `bun run test`；分桶报告 `bun run test:report`。
- **红线测试（改了相关逻辑必须保住）**：
  - `storeResilience.spec.ts` — 持久化 store 必须带 `sanitize`，且经恶意损坏用例。
  - `palette.spec.ts` — 颜色 token/对比度/印面色不变式。
  - `dataIntegrity.spec.ts` — 每个声明的 key 可读可写。
  - `importCorruption` — 半损坏/垃圾存档要么水合要么干净拒绝，且保留本地存档。
  - `combat.spec.ts` — 无死循环，HP 在 0..1。
  - `offlineCap.spec.ts` — 离线上限生效，混沌道祖 5 条离线台词有限。
- **惯用模式**：TTL / 去重淘汰用 `vi.useFakeTimers`。
- **QA 脚本**：`test-report.mjs`（按系统分桶，失败/未归类即退出 1）；`ui-smoke.mjs`（375x812 交互冒烟，pageerror + NaN/Infinity 泄漏即失败，跳过破坏性按钮）；`layout-check.mjs`（38 项自检：无横向溢出、双栏 dvh 固定、触控目标 ≥28px、模态触控巡逻、tab-rail 粘性、无纵向挤压/孤行标点/数字单位断行、a11y 图标 aria；约 10 分钟，仅本地）；`offline-check.mjs`（SW 接管 + 离线启动 + 发布接管）。CI 对 `test-report` 限 maxWorkers=4。
- **Git 保护**：main 仅通过 PR merge，禁止 force-push；v* release tag 只由发布流水线打。PR 校验 CI = 类型检查 + lint + 单测 + 生产构建全部绿。**CHANGELOG.md 需更新**（新增 / 调整与优化 / 修复 三节，中文一行式，格式 `## [ver] — date · 副标题`）。
