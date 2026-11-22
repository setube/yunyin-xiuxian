/**
 * 计数器键的**运行时**清单。
 *
 * `CounterKey` 是编译期联合类型(19 个),运行时一个字都不剩 ——
 * 而读档自愈要判断「这个键游戏认不认得」,只能靠一份真实存在的表。
 *
 * 键有两个来源,**都不手写**:
 *
 * 一 有消费方的键:`ACHIEVEMENTS` / `MAIN_QUESTS` / `DAILY_TASKS` 里声明的那批。
 *    它们本来就只能在数据表里出现,直接读。
 *
 * 二 只记账、没有消费方的键:如 `battles` / `pillsFailed` —— 被
 *    `track()` 写着玩,任何成就或日课都不读它。这一批**运行时读不到调用字符串**,
 *    但 Vite 的 `import.meta.glob` 能把 `src/core` 的源码**当文本**读进来,
 *    于是可以扫。
 *
 * 手写清单是这里最坏的选择:数据表增删条件时它会静默过期,而过期的表会
 * **悄悄丢掉**新加的计数(读档时当野键清掉)。用前两路推导 + 一条覆盖判据兜住。
 */
import { ACHIEVEMENTS } from '@/data/achievements'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import type { CounterKey } from '@/types'

/** 来源一:数据表里声明的计数键 */
function fromDataTables(): CounterKey[] {
  const out = new Set<CounterKey>()
  for (const a of ACHIEVEMENTS) {
    if (a.cond.type === 'counter') out.add(a.cond.key)
  }
  for (const q of MAIN_QUESTS) {
    if (q.cond.type === 'counter') out.add(q.cond.key)
  }
  for (const d of DAILY_TASKS) out.add(d.counterKey)
  return [...out]
}

/**
 * 来源二:源码里 `track('key')` / `trackQuiet('key')` 的字面量键。
 *
 * 用 `import.meta.glob(…, { query: '?raw' })` 把 core 下的源码读成文本。
 * 这一步在**测试环境与浏览器构建**都可用(glob 是编译期展开的)。
 * 它只扫本文件所在项目的源码,不碰运行时数据。
 */
function fromTrackCalls(): CounterKey[] {
  const files = import.meta.glob('../core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
  const out = new Set<CounterKey>()
  for (const [path, src] of Object.entries(files)) {
    // 测试文件不参与:它们里的 track 是夹具
    if (path.endsWith('.spec.ts')) continue
    for (const m of src.matchAll(/\btrack(?:Quiet)?\(\s*'([a-zA-Z]+)'/g)) out.add(m[1] as CounterKey)
  }
  return [...out]
}

export const COUNTER_KEYS: ReadonlySet<CounterKey> = new Set([...fromDataTables(), ...fromTrackCalls()])
