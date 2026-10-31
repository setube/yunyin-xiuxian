# Repository Guidelines

面向 AI 助手的仓库速查。语言以中文为主，聚焦"这里什么是真的、怎么不搞坏仓库"。

## Project Overview

**云隐修仙录** — 一款 Vue 3 驱动的文字修仙放置（idle）游戏，单机离线成长玩法。版本 1.42.0，`type: module`。支持 Web/PWA、Electron、Android（Capacitor）多端。许可证 CC BY-NC 4.0（禁止商用）；打包的楷体字型为 LXGW WenKai，SIL OFL 1.1（许可证文本在 `public/fonts/OFL.txt`，再分发时须保留）。

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

- **src/data/** — 纯静态声明式数据，无副作用、单一事实源。58 个模块：realms、regions、enemies（132）、equipment（288 模板）、affixes（119）、statNames（属性键→中文名，唯一命名表）、gongfa、gongfaBranches、pills、artifacts、souls、xiangxiu、ziwei、yijing、qimen、daolu、endgame、mutators、constants（556 行，含 `TICK_MS`、`OFFLINE_MIN_SECONDS`、`AGE_YEARS_PER_HOUR`、`ACTIVE_STAMP_MS` 等）。**这里的数字就是真实游戏数值，改动会影响全流程。**
- **src/core/** — 游戏逻辑。关键模块：`engine.ts`（在线心跳 1000ms 单例，含 start/stop 与防重复 interval 守卫）、`combat.ts`（后台完整预演后回放）、`statsCalc.ts`（词缀递减 + 软上限）、`equipGen.ts`、`exploration.ts`、`offline.ts`、`progress.ts`（任务/成就横向总线）、`theme.ts`、`worldGen.ts`（终局世界生成，三重审计门）；另有 19 个 `*Service.ts` 与 6 个 `*Sim.ts` 平衡模拟器。
- **src/stores/** — 18 个 Pinia store（另有非 store 的 `sanitizeAll.ts` 逐仓自愈入口）；除 `ui.ts` 外 17 个经 `persistConfig('<id>')`（`utils/storage.ts`）持久化。**任何持久化 store 必须暴露 `sanitize()`** 修复损坏存档——`storeResilience.spec.ts` 会从源码正则 `/persistConfig\('([a-zA-Z]+)'\)/` 抓取列表并逐一跑恶意损坏用例，缺 `sanitize` 即测试红。
- **src/ui/** — 展示层数据（icons 注册、codex、enemyLore、releaseNotes、powerText、`*Text.ts`）。注意 "palette" 不是模块，是 `src/ui/palette.spec.ts` 治理测试。
- **src/utils/** — `GNum`（大数 `{m,e}=m×10^e`，`gn/ad/mul/div/powN/cmp/toNum`；**`toNum` 在 e>308 返回 Infinity，需守卫**）、`format`（formatGN/Num/Rate/Percent/Duration/Countdown/Clock/Years）、`random`（mulberry32 + RandomService 单例）、`storage`（前缀 `yunyin.`，SAVE_VERSION 2，AES 加密，节流合并写入 `SAVE_FLUSH_MS` 5000，`PERSISTED_STORES` 列表，`subscribeSaveWriteFailure`，preflightScan 隔离，v1→v2 迁移）、`saveShape`（asArray/asStringArray/asRecord/asRecordOf/asFiniteNumber 守卫）、`platform`、`colorToken`（tint）。
- **src/types/** — 领域类型（CombatResult、CombatSideStats、FoeOrigin、GNum、EquipSlot…）。

## Key Directories

| 路径 | 用途 |
| --- | --- |
| `src/data/` | 静态声明式游戏内容（唯一事实源） |
| `src/core/` | 游戏逻辑 + 230 个同目录 `*.spec.ts` |
| `src/stores/` | Pinia 状态（17 持久化 + ui 临时） |
| `src/ui/` | 展示层字符串 / 图标 |
| `src/utils/` | 大数、格式化、随机、存储、存档守卫 |
| `src/types/` | 领域类型 |
| `src/router/` | hash 路由 + 首启流程守卫 |
| `src/composables/` | useNow / useWallClock 等 |
| `scripts/` | test-report.mjs、ui-smoke.mjs、focus-check.mjs、aria-check.mjs、multitab-check.mjs、layout-check.mjs、offline-check.mjs、fonts/build-kai-font.py |
| `.github/workflows/` | CI（PR 检查、发布 Pages/PWA/Docker/Electron/APK） |

tsconfig paths `@/* → ./src/*`，开启 `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`；`vue-tsc -b` 走 project references 做类型检查。

## Development Commands

包管理器 **Bun**（安装用 `bun install`，CI 用 `bun install --frozen-lockfile`）。

> ⚠️ **最大坑：`bun run test` ≠ `bun test`**。`bun run test` = `vitest run`（完整套件）；裸 `bun test` 会触发 Bun 自带 runner 而非 Vitest，**永远不要用**。

- `bun run dev` — Vite 开发服务器
- `bun run check` — `vue-tsc -b`（类型检查）+ `eslint src`（lint）。注意：**不含测试、不含构建**
- `bun run test` — `vitest run` 全量测试
- `bun run test:report` — `scripts/test-report.mjs`（vitest json + 按系统分桶 PASS/FAIL；用例失败、整文件失败、未归类文件、文档写回用例条数，或 vitest 非零退出（未处理错误）即退出 1；CI 限 maxWorkers=4）
- `bun run build` — `vue-tsc -b && vite build`
- `bun run smoke` / `smoke:late` — 构建 + playwright ui-smoke
- `bun run layout-check` — 构建 + `node scripts/layout-check.mjs`（**仅本地**，已从 CI 移除；Windows 用 `node` 而非 bun，耗时约 10 分钟）
- `bun run offline-check` — 构建 + SW 离线自检
- `bun run build:electron` / `build:android` / `build:apk`
- 楷体打包：`uv run scripts/fonts/build-kai-font.py`

## Code Conventions & Common Patterns

- **提交信息：Conventional `type(scope): subject`**，commitlint（husky commit-msg）强制，header ≤200 字。**subject 与 body 都用中文**（中国古典文字修仙项目）。**Body 必须是逐条 bullet（`- x`），一条事实一行，禁止散文段落**——owner 用 filter-branch 重写过历史，要求干净的行项目。
- **提交粒度**：每个 commit 最小完备——单一主题、自包含、可独立评审/回滚，能单独看懂改了啥。body 仍逐条 bullet、一行一事实；特别小的 trivial 改动（几行、同主题）允许并入同一 commit，commit 数不设硬指标，以真实有效改动为准，绝不灌水凑数。
- **持久化 store 必须有 `sanitize()`**：见 storeResilience.spec.ts（从源码抓 `persistConfig` 列表逐一验证）。新增持久化 store 没有 sanitize → 测试直接红。
- **语义色禁用裸 hex**：颜色只以 `--color-x-rgb`（裸 RGB 通道变量）定义在 `src/style.css`；`tailwind.config.js` 的 `withAlpha` 构建 `rgb(var(--x)/<alpha-value>)` 支持 `bg-ink/10` 与 color-mix；暗色主题在 `html[data-theme='dark']` 下仅覆写通道变量。palette.spec.ts 红线：明暗 token 1:1、每 token 映射进 tailwind、无同值异名、源中引用的颜色名必须存在、slash-opacity 只能来自 config 步进、强文本 ≥4.5:1、印面 cream `#f6f1e5` 需匹配 `.btn-seal` 与双主题印底、CIE76 保证品质/元素层级可区分。
  - **朱/金/靛/紫印章上的 scarlet 印面文字用 `.seal-face` 类，不要用 `text-paper`**（dark 下 text-paper 会反成近黑）。
- **字体**：`font-kai` 仅用于标题/境界名/名号，正文用系统栈。捆绑楷体子集 1.5MB（"GB 屏幕阅读版"）；新增装饰字形须进 `build-kai-font.py` 的 `SYMBOLS_FROM_SYSTEM` 白名单，否则构建失败。
- **动画**：`@keyframes` 定义在 style.css；必须同时尊重 `@media (prefers-reduced-motion: reduce)` 与 `.reduce-motion` 块，且两处都要把 `animation-delay` 归零。键盘可访问：全局 `:focus-visible` 朱砂描边已存在，别用 `outline-none` 干掉；纯图标按钮要有 `aria-label`。
- **Big number 注意**：`GNum.toNum()` 在 e>308 返回 Infinity，处理超大数值前先守卫。
- **层级地雷（反复踩过）**：灵石相关的报价/奖励/花费曲线（经 `stoneByTier`）一律骑 `maxTierForMajor(major)` 的真实区域阶梯（至 32 阶）——**别拿境界大阶 `major`(0-20) 当层级**。坊市装备价、悬赏贡器门槛、`playerTier`(成就/每日/主线灵石奖励 + 灵脉投点/迁移费) 都曾固死在旧尺 `min(20, major*2+2)` 上、在混沌道祖处偏约 2.2e5 倍才被修掉。新增 `stoneByTier` 调用点前，先对照 `marketService.marketTier` / `bountyService` / `pillCraftCost` 确认用的是同一把尺。
- **数据流**：改数值去 `src/data/`，改逻辑去 `src/core/`，改展示去 `src/ui/`，不要跨层硬编码。
- **测试**：`describe/it` 用中文 given-when-then，真实断言，刻意故障注入证明测试能抓 bug。

## UI Copy（界面文案）

用户定的文案规范（2026-09-25；AI 自主生成约束 2026-10-01 补），按本单机离线项目改写。适用于全部界面文案（toast、错误信息、按钮、空态、提示、确认框），也适用于与用户的对话、任务过程说明与最终总结。**例外**：剧情、世界观、物品 / 功法 / 装备 / 首领描述、战报逐回合描写、版本说明、隐私条款正文，允许完整长句，但同样不劝导、不煽情、不车轱辘话。

> 最终原则：**少说，不解释，不劝导，不煽情，不文学化。** UI 文案是系统状态，不是对话。只告诉玩家现在是什么状态，不替玩家思考、做决定、规划下一步。

### 基本规则

1. **极度简短**：只写当前状态、结果或必要操作，不解释、不铺垫、不扩展。能用 4 个字就不写 8 个字；能用短语就不写句子；能不写就不写。不为「让玩家更容易理解」加背景、原因或操作建议。
2. **禁止 AI 式解释**：不主动解释「为什么」。禁用句式：「因为……所以……」「由于……」「当前……因此……」「请……以便……」「……后可以……」「……即可……」「……方便……」「……帮助你……」。禁用按钮上的拒因不算解释（见「固定写法」）。
3. **禁止主动给建议**：除非是明确的引导按钮或教程（如首页「第一步」格的「去历练」「去突破」、炼丹缺料的「去坊市续草」「去历练攒石」、修行志的「去办」、iOS「添加到主屏幕」三步提示），不告诉玩家下一步该做什么。
4. **禁止把系统状态写成客服话术**：「货架刚换新,请按新货再买」→「货架已刷新」。
5. **禁止无意义的世界观文案**：普通 UI 状态不为「游戏感」做文学化加工。「山风掠过,四下无声……」→「暂无战报」；「纪录待创」+「破界之时,自见分晓」→「暂无纪录」。
6. **优先标签，不用句子**：本项目常用状态词：「暂无战报」「暂无藏品」「暂无纪录」「未解锁」「已装备」「未装备」「行囊已满」「无可化尘」「强化已至上限」「闭关中」「历练在途」「导出失败」「存档写入失败」。
7. **删除礼貌废话**：「请稍后再试」「请耐心等待」「感谢您的理解」「建议您……」「你可以……」「如果……可以……」，除非确实承担明确的操作指引。
8. **一个状态只说一个事实**：状态、原因、操作分别由 UI 承担，不塞进一条文案。例：「已上锁:先在行囊解锁,方可分解」→ 分解钮（纯图标）的 aria-label / title 写「分解(已上锁)」，解锁交给同一弹窗里的锁定钮。
9. **长度上限**：普通 UI 状态 ≤ 8 个汉字；按钮 2～6 个汉字；提示尽量 ≤ 12 个汉字；错误信息 ≤ 10 个汉字。按汉字计，「应 战」中间的空格是排版。本项目按钮常在主词后带代价或拒因（「应 战(远征在途)」「投一点 · N 石」「确认开洗 · 至多 灵石N·尘×M」），这部分不计，主词守 2～6 个汉字（对原规范的适配，见「禁用即给原因」）。

### AI 自主生成文案的强制约束

自行设计界面、补交互、写空态 / 错误态 / 提示时：

- **默认不新增文案（最重要）**：需求没有明确要求加文案，不因自己的产品判断新增。确需状态提示时用最短表达。优先级：已有文案 > 状态词 > 短语 > 完整句子。
- **不替玩家思考**：不因推测玩家「可能不知道怎么办」就加原因解释、操作建议、下一步指引、使用技巧、功能说明、安慰 / 鼓励 / 礼貌性文字。
- **完整体验 ≠ 完整解释**：禁止「可能不知道为什么 → 给原因」「可能不知道怎么办 → 给建议」「可能觉得空 → 加一句提示」「页面太空 → 加氛围文案」「信息不够完整 → 补说明」。空白本身是合法 UI 状态；「暂无藏品」「未解锁」本身就是完整状态。
- **优先用 UI 表达**：能用按钮、标签、图标、数值、状态、Tooltip、颜色、禁用状态、进度条、空状态、页面标题表达的，不另写说明；UI 已经表达清楚时可以不写字。
- **不擅自设计客服式交互**：「请稍后再试」「你可以尝试……」「建议……」「可以前往……」「换一个再试」「如果仍然……」「为了……」「这样可以……」只在明确的操作引导或新手教程里允许。
- **不擅自制造世界观**：普通系统 UI 不加旁白、世界观描述、评价、情绪、玩笑、隐喻、文学化表达；除非该位置本身就是剧情、区域描述、首领描述或道途叙事等内容文本。
- **发现问题不自补方案**：灵石尚差不加「灵石自历练与悬赏来」；败于首领不加「需再蓄力」；导出失败不加「请检查存储空间后重试」；行囊已满不加「腾一席再来」。只写当前事实；第 3 条列的引导钮不在此列。
- **像系统输出，不像人说话**：✗「这个文件是空的,换一个再试」→ ✓「文件为空」；✗「复制失败 —— 异常记录就在「导出存档」里,可整份发给我们」→ ✓「复制失败」。
- **状态词不扩写**：✗「行囊中无可化尘之物」→ ✓「无可化尘」；✗「你正在闭关静修,心无旁骛,暂勿外出历练」→ ✓「闭关中」。

### 固定写法

- **缺资源**：知道差额写「X尚差 N」（「灵石尚差 20」），拿不到差额才写「X不足」；门槛写「灵气不足 · 需 N 缕」。缺哪样报哪样，两样都缺用「 · 」并列。
- **在途互斥**：拒因只用「闭关中」「历练在途」「身在秘境」「远征在途」（后三种以 `src/core/endgameActivity.ts` 的 `endgameBusy().reason` 为准，新代码取 `.reason`；按钮正文等处另有同词字面量，改词须全仓搜），不另造说法。
- **不可逆操作**：风险标「不可逆」；两步确认的取消钮写「再想想」，不用「取消」「确定」；确认钮默认写「确认 + 操作名」（确认删除 / 确认分解 / 确认散去 / 确认凝炼 / 确认返还 / 确认重写 / 确认熔尽 / 确认重铸 / 确认开洗），连 升 / 连 投 / 连 炼 / 开 炉 ×N / 清理化尘 / 改 立 这几处复述动作（「改 立」由 `src/core/veinVisibility.spec.ts` 钉着）；`src/ui/irreversibleConfirm.spec.ts` 只查它列出的文件。
- **禁用即给原因**：禁用按钮上直接写拒因（状态词或差额），如「应 战(远征在途)」「修为未至圆满」「灵石尚差 N」，不写句子；纯图标钮的拒因放 aria-label 与 title（分解钮「分解(已装备)」）。
- **空态**：优先「暂无 + 具体名词」（暂无战报 / 暂无丹药 / 暂无灵兽）；有对象但无可操作的写「无可 + 动词」（无可化尘）。
- **存档与文件回执**：失败写「X失败」（导出失败 / 复制失败 / 存档写入失败）；坏文件写「文件为空」「文件无法读取」。单机离线，不写连接、同步类状态词。

### 示例

| 错误 | 正确 |
| --- | --- |
| 此器已至锤炼之极,再锻无益 | 强化已至上限 |
| 行囊空空,去历练中寻些机缘吧 | 暂无藏品 |
| 器灵尘尚差 2,炉火难续(分解闲置装备可得) | 器灵尘尚差 2 |
| 导出没能完成,请稍后再试 | 导出失败 |
| 这个文件读不出来,换一个再试 | 文件无法读取 |
| 上次存档没能存下 —— 本机容量可能已满。请先「导出存档」留一份,再清理本机空间或换设备导入。 | 存档写入失败 |
| 此世气象尚未凝成。天地未就,不妨先去历练,待此世凝成再来。 | 此世未成 |
| 今日已兑满,明日再来 | 今日已用尽 |

### 写完先做删除测试

- 删掉一半，玩家还能理解吗？能 → 删。
- 删掉这句，玩家还能完成当前操作吗？能 → 删。
- 只是在解释系统为什么这样设计？→ 删。
- 只是在告诉玩家「你可以去做某事」，而 UI 已有对应按钮？→ 删（明确的操作引导除外）。
- 只是让玩家「感觉更容易理解」，或让空状态「不那么空」？→ 删。
- 像客服在和玩家说话？→ 改成系统状态。
- 能直接变成 2～6 个字的标签？→ 用标签。

### 对话与总结

同样适用：只报状态、结果、必要操作；不铺垫、不解释设计原因、不主动给建议、不客套；能用标签或短语就不用句子，一行一个事实；数字、路径、错误原文照实给出，不因求短省略事实。

## Commit Conventions

- **Conventional Commits**; **message in Chinese** (subject & body, this is a Chinese classical cultivation project); concise subject (`type(scope): summary`).
- Body is a **list of bullets** (one point per line), clear and **without redundant padding** — filler destroys the retrievability of the information.
- **Commit granularity (minimal, complete)**:
  - One commit = one logically complete, self-contained change (code + its tests landed together).
  - A one-line change does not get its own commit; fold it into a related small change to avoid fragmentation.
  - Do not cram thousands / tens of thousands of lines into a single commit; unless a deep review confirms it is inherently minimal-and-complete (mechanical refactor, codegen, wholesale migration), in which case note the exception in the message.
  - Don't split for splitting's sake; prefer merging like small changes together.
- Workflow: `commit_message.txt` → `git commit -F` → delete; **only commit when the user explicitly asks**.
- **NEVER** `--no-verify`, force-push `main`, or append a `Co-Authored-By` AI attribution.

## Important Files

- `package.json` — 版本/脚本/依赖入口
- `src/main.ts` — 应用入口
- `src/style.css` + `tailwind.config.js` — 设计系统（颜色/字体/动画/dark 主题）
- `src/core/engine.ts` — 在线心跳单例
- `src/core/offline.ts` — 离线结算（sanitizeOfflineInputs → engine.start 时调用各持久化 store 的 `.sanitize()`）
- `src/utils/storage.ts` — 存档持久化/加密/迁移（SAVE_PREFIX、SAVE_VERSION、PERSISTED_STORES）
- `src/utils/gnum.ts` — 大数
- `src/router/` — 路由与首启守卫
- `scripts/test-report.mjs`、`ui-smoke.mjs`、`focus-check.mjs`、`aria-check.mjs`、`multitab-check.mjs`、`layout-check.mjs`、`offline-check.mjs`
- `.github/workflows/` — CI 定义
- `vite.config.ts` / `vitest.config.ts` / `tsconfig*.json`

## Runtime/Tooling Preferences

- 必需运行时：**Bun**（开发与构建）。Windows 上 `layout-check` 等个别脚本需用 `node`。
- 包管理：`package.json` 锁定，安装用 `bun install`。
- Node/TS 栈：Vue 3.5、Pinia 3、TS 6.0 strict、Vite 8、Tailwind 3.4、Vitest 5、lucide-vue-next、Tone.js（音频）、CryptoJS（存档 AES）。Electron 39 / Capacitor 8 / PWA。
- Browserslist：Chrome≥51 / Android≥7 / iOS≥12 / Safari≥12。

## Testing & QA

- **框架**：Vitest 5；测试与实现同目录共存 `*.spec.ts`（共 328 个 spec：core 230、ui 44、stores 24、utils 11、data 9、composables 9、router 1）。用例条数不写进文档(`bun run test:report` 每次自己打)。
- **运行**：全量 `bun run test`；分桶报告 `bun run test:report`。
- **红线测试（改了相关逻辑必须保住）**：
  - `storeResilience.spec.ts` — 持久化 store 必须带 `sanitize`，且经恶意损坏用例。
  - `palette.spec.ts` — 颜色 token/对比度/印面色不变式。
  - `dataIntegrity.spec.ts` — 每个声明的 key 可读可写。
  - `importCorruption` — 半损坏/垃圾存档要么水合要么干净拒绝，且保留本地存档。
  - `combat.spec.ts` — 无死循环，HP 在 0..1。
  - `offlineCap.spec.ts` — 离线上限生效，混沌道祖 5 条离线台词有限。
- **惯用模式**：TTL / 去重淘汰用 `vi.useFakeTimers`。
- **QA 脚本**：`test-report.mjs`（按系统分桶，失败/整文件失败/未归类/文档例数/vitest 非零退出即退出 1）；`ui-smoke.mjs`（375x812 交互冒烟，pageerror + NaN/Infinity 泄漏即失败，跳过破坏性按钮）；`layout-check.mjs`（38 项自检：无横向溢出、双栏 dvh 固定、触控目标 ≥28px、模态触控巡逻、tab-rail 粘性、无纵向挤压/孤行标点/数字单位断行、a11y 图标 aria；约 10 分钟，仅本地）；`offline-check.mjs`（SW 接管 + 离线启动 + 发布接管）。CI 对 `test-report` 限 maxWorkers=4。
- **Git 保护**:main 仅通过 PR merge,禁止 force-push;v* release tag 只由发布流水线打。PR 校验 CI = 类型检查 + lint + 单测 + 生产构建全部绿。**CHANGELOG.md 需更新**(新增 / 调整与优化 / 修复 三节,中文一行式,格式 `## [ver] — date · 副标题`)。
- **历史线性**:main 历史必须线性,禁止 merge 提交。合入 PR 一律用 `gh pr merge --rebase`,逐提交保留分支历史——**默认不要用 `--squash`**:合入用 squash 会把分支上那几个「可独立评审」的提交并成一个,提交条目在 main 历史里就没了(除非用户明确要压成单个提交);严禁「Create a merge commit」/ `gh pr merge --merge`(会在 main 上引入双亲 merge 节点,破坏线性)。同步主干一律 `git rebase main`,禁止「Merge main into …」式提交(`.github/workflows/history-linear.yml` 会把这类提交判为失败,其权威合并期闸门是分支规则集「Require a linear history」)。
- **PR 承载多 commit**：一个 PR 可承载多个 commit；PR 内每个 commit 都须能被独立评审，且 PR 作为整体说明改动主题。
