/**
 * 世道命题:判据的可读表述(goal)与真实判据(metric)必须对得上。
 *
 * LifeThemeDef.goal 是玩家立题时读到的唯一说明,metric 是真正结算的依据。
 * 两者写岔,玩家会按错的预期过完一世,还在结算时被判「未完成」。
 *
 * 校验按 metric 形态分:
 *   realm         :goal 里须出现该大境界名,**或它所属的界域名**
 *                   (「踏入神界」对 major 14 成立 —— 神界始于神人,见 data/realms 的 WORLDS)
 *   counter/all   :goal 里的数字须与 n 吻合
 *   materialLore / recipeMastered / enemyLore / branch :同理按 n
 *   skill         :goal 用「精通/娴熟」这类文字描述等级,不做数值比对
 *   avenge        :n 固定为 1,goal 用「一名」表达
 */
import { describe, expect, it } from 'vitest'
import { LIFE_THEMES, TABOO_NAMES } from '@/data/lifeThemes'
import { realmDef, worldOf } from '@/data/realms'

/**
 * 取文本里所有整数。
 * 小数字项目里常写成中文(「一名宿敌」「三张丹方」),所以阿拉伯数字之外再查中文数字表。
 */
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const intsIn = (s: string): number[] => {
  const out = [...s.matchAll(/\d+/g)].map(m => Number(m[0]))
  for (const ch of s) {
    const v = CN_NUM[ch]
    if (v !== undefined && !out.includes(v)) out.push(v)
  }
  return out
}

describe('世道命题 · 判据说明与真实判据一致', () => {
  it('realm 型:goal 出现该境界名或它所属的界域名', () => {
    let checked = 0
    for (const t of LIFE_THEMES) {
      if (t.metric.kind !== 'realm') continue
      const realm = realmDef(t.metric.major).name
      const world = worldOf(t.metric.major).name
      const hit = t.goal.includes(realm) || t.goal.includes(world)
      expect(hit, `「${t.name}」goal 写「${t.goal}」,但 major ${t.metric.major} 是「${realm}」(属${world})`).toBe(true)
      checked += 1
    }
    expect(checked, '没有任何 realm 型命题,说明结构变了').toBeGreaterThan(0)
  })

  it('带 n 的判据:goal 里的数字包含该阈值', () => {
    const withN = (m: unknown): m is { n: number } =>
      typeof m === 'object' && m !== null && typeof (m as { n?: unknown }).n === 'number'
    let checked = 0
    for (const t of LIFE_THEMES) {
      const m = t.metric
      if (m.kind === 'all') {
        // all 型把多个子判据拼起来,goal 里应出现全部阈值
        const nums = intsIn(t.goal)
        const need: number[] = []
        const walk = (x: unknown): void => {
          if (withN(x)) need.push(x.n)
          const of = (x as { of?: unknown[] }).of
          if (Array.isArray(of)) of.forEach(walk)
        }
        walk(m)
        for (const n of need) {
          expect(nums, `「${t.name}」goal 写「${t.goal}」,缺少阈值 ${n}`).toContain(n)
        }
        checked += 1
        continue
      }
      if (!withN(m)) continue
      expect(intsIn(t.goal), `「${t.name}」goal 写「${t.goal}」,缺少阈值 ${m.n}`).toContain(m.n)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('avenge 型:n 为 1,goal 用「一名」表达', () => {
    for (const t of LIFE_THEMES) {
      if (t.metric.kind !== 'avenge') continue
      expect(t.metric.n, `「${t.name}」的雪耻数应为 1`).toBe(1)
      expect(t.goal, `「${t.name}」的 goal 没写「一名」`).toContain('一名')
    }
  })
})

describe('世道命题 · 结构不变式', () => {
  it('id 与 name 都不重复', () => {
    const ids = LIFE_THEMES.map(t => t.id)
    const names = LIFE_THEMES.map(t => t.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('宿慧收益为正且是整数', () => {
    for (const t of LIFE_THEMES) {
      expect(t.insight, `「${t.name}」的宿慧 ${t.insight} 应为正整数`).toBeGreaterThan(0)
      expect(Number.isInteger(t.insight)).toBe(true)
    }
  })

  it('minStage 是非负整数(决定何时出现)', () => {
    for (const t of LIFE_THEMES) {
      expect(t.minStage, `「${t.name}」的 minStage 为负`).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(t.minStage)).toBe(true)
    }
  })

  it('立题、判据说明与传承文案都非空', () => {
    for (const t of LIFE_THEMES) {
      expect(t.vow.length, `${t.id} 没写立题`).toBeGreaterThan(0)
      expect(t.goal.length, `${t.id} 没写判据说明`).toBeGreaterThan(0)
      expect(t.legacy.length, `${t.id} 没写传承`).toBeGreaterThan(0)
    }
  })

  it('taboo 若有,必须在 TABOO_NAMES 里有名字(否则界面显示 undefined)', () => {
    for (const t of LIFE_THEMES) {
      if (!t.taboo) continue
      expect(TABOO_NAMES[t.taboo], `「${t.name}」的禁忌 ${t.taboo} 没有中文名`).toBeTruthy()
    }
  })

  it('同一忌讳不被两条命题同时使用(撞了会让玩家以为只犯了一条)', () => {
    const used = LIFE_THEMES.map(t => t.taboo).filter((x): x is NonNullable<typeof x> => x !== undefined)
    expect(new Set(used).size, '忌讳被多条命题重复使用').toBe(used.length)
  })
})
