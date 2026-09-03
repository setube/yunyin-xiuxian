/* eslint-disable no-console */
/**
 * 首领唯一性审计
 *
 * 实测缺陷:同一世界里「幽冥海皇」同时镇守第二、三段,
 * 「蜃楼之主」同时镇守第四、五段 —— nearTier 逐段独立取样,
 * 段与段之间互不知情。
 *
 * 修复目标很窄:**同一世界内,同一个首领不得承担多个路线节点。**
 * 不收窄候选池、不加语义规则 —— 那属于尚未验证的 narrativeFit,
 * 与本轮的数值/结构问题不是一回事。
 *
 * 约束验的是**唯一性 + 合法回退**,不是「当前正好有 20 个首领」。
 * 候选池将来扩充或缩减,这套断言都应继续成立。
 */
import { describe, expect, it } from 'vitest'
import { ROUTE_SHAPES, generateMortalWorld, pickBoss } from './mortalWorldGen'
import { mulberry32, RandomService } from '@/utils/random'
import { ENEMIES, enemyDef } from '@/data/enemies'

const BOSS_COUNT = ENEMIES.filter(e => e.archetype !== undefined).length
const MAX_SEGMENTS = Math.max(...ROUTE_SHAPES.map(s => s.tiers.length))

describe('首领唯一性 · 同一世界内不得重复', () => {
  it('两百个世界逐一检查', () => {
    let worst: { seed: number; dup: string } | null = null
    for (let seed = 1; seed <= 200; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const ids = w.chain.map(p => p.boss)
      const uniq = new Set(ids)
      if (uniq.size !== ids.length && w.bossFallbackAt.length === 0) {
        const dup = ids.find((id, i) => ids.indexOf(id) !== i)!
        worst = { seed, dup }
        break
      }
    }
    expect(worst).toBeNull()
    console.log(`\n两百个世界:未出现「非回退的重复首领」`)
  })

  it('修复前的实测样本现在已唯一', () => {
    // 截图里那一世:第二、三段同为幽冥海皇
    const w = generateMortalWorld(20260904)
    const ids = w.chain.map(p => p.boss)
    expect(new Set(ids).size).toBe(ids.length)
    console.log('\n该世的首领:')
    for (const [i, p] of w.chain.entries()) {
      console.log(`  ${i + 1}. ${p.name.padEnd(10)} ${enemyDef(p.boss)?.name ?? p.boss}`)
    }
  })

  it('段数最多的骨架也不会重复', () => {
    // 段数 ≤ 首领总数时,唯一性必须是绝对的
    expect(MAX_SEGMENTS).toBeLessThanOrEqual(BOSS_COUNT)
    let checked = 0
    for (let seed = 1; seed <= 120; seed += 1) {
      const w = generateMortalWorld(seed * 104729)
      if (w.chain.length !== MAX_SEGMENTS) continue
      checked += 1
      const ids = w.chain.map(p => p.boss)
      expect(new Set(ids).size).toBe(ids.length)
    }
    console.log(`\n最长骨架 ${MAX_SEGMENTS} 段 vs 首领池 ${BOSS_COUNT} 个;检查 ${checked} 个满段世界,全部唯一`)
  })
})

describe('首领唯一性 · 跨世界可以重复', () => {
  it('不同世界之间不设约束', () => {
    // 唯一性是**世界内**的。跨世复用是素材库该有的样子,
    // 否则二十个首领撑不了几世
    const a = generateMortalWorld(11111)
    const b = generateMortalWorld(22222)
    const shared = a.chain.map(p => p.boss).filter(id => b.chain.some(q => q.boss === id))
    console.log(`\n两世共用 ${shared.length} 个首领 —— 跨世重复是允许的`)
    expect(shared.length).toBeGreaterThanOrEqual(0)
  })

  it('长序列里首领仍有足够轮换', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const p of generateMortalWorld(seed * 7919).chain) seen.add(p.boss)
    }
    console.log(`\n四十世共出现 ${seen.size}/${BOSS_COUNT} 个不同首领`)
    expect(seen.size).toBeGreaterThan(BOSS_COUNT / 2)
  })
})

describe('首领唯一性 · 回退必须被记录', () => {
  it('当前配置下不触发回退', () => {
    // 段数 ≤ 首领总数,故正常情况下永不回退
    let fallbacks = 0
    for (let seed = 1; seed <= 200; seed += 1) {
      fallbacks += generateMortalWorld(seed * 7919).bossFallbackAt.length
    }
    expect(fallbacks).toBe(0)
    console.log(`\n两百个世界共触发回退 ${fallbacks} 次 —— 首领池(${BOSS_COUNT})远多于最长骨架(${MAX_SEGMENTS})`)
  })

  it('回退字段存在且可被审计,不是隐式行为', () => {
    // 关键:未来若首领池缩减或骨架加长,回退会发生 ——
    // 那时 bossFallbackAt 会记下段序,而不是悄悄产生重复
    const w = generateMortalWorld(20260904)
    expect(Array.isArray(w.bossFallbackAt)).toBe(true)
    console.log(
      '\nbossFallbackAt 是世界结构的一部分:' +
        '\n候选耗尽时复用首领会被记下段序,不会退化成无声的重复'
    )
  })

  it('候选不足时:直接测回退路径本身', () => {
    // 上一条只证明「当前不触发回退」,那等于回退代码完全没被测过。
    // 这里注入一个只有两个首领的小池子,再取三次 ——
    // 前两次必须唯一,第三次必须回退且被标记
    const pool = ENEMIES.filter(e => e.archetype !== undefined).slice(0, 2)
    expect(pool).toHaveLength(2)
    const rng = new RandomService(mulberry32(42))
    const used = new Set<string>()
    const picks: { id: string; fellBack: boolean }[] = []
    for (let i = 0; i < 3; i += 1) {
      const got = pickBoss(6, rng, used, pool)
      picks.push({ id: got.boss.id, fellBack: got.fellBack })
      used.add(got.boss.id)
    }
    // 池子够用时不回退,且互不相同
    expect(picks[0]!.fellBack).toBe(false)
    expect(picks[1]!.fellBack).toBe(false)
    expect(picks[0]!.id).not.toBe(picks[1]!.id)
    // 池子耗尽时回退,但仍返回一个合法首领(不是 null,不让生成失败)
    expect(picks[2]!.fellBack).toBe(true)
    expect(pool.some(b => b.id === picks[2]!.id)).toBe(true)
    console.log(
      `\n两个首领的池子取三次:${picks.map(p => `${enemyDef(p.id)?.name}${p.fellBack ? '(回退)' : ''}`).join(' → ')}` +
        '\n前两次唯一,第三次回退且被标记 —— 回退不会让生成失败,也不会无声重复'
    )
  })

  it('回退只在真正耗尽时发生,不会提前触发', () => {
    // 池子有三个、只取两次 → 一次都不该回退
    const pool = ENEMIES.filter(e => e.archetype !== undefined).slice(0, 3)
    const rng = new RandomService(mulberry32(7))
    const used = new Set<string>()
    for (let i = 0; i < 3; i += 1) {
      const got = pickBoss(6, rng, used, pool)
      expect(got.fellBack).toBe(false)
      used.add(got.boss.id)
    }
    expect(used.size).toBe(3)
    console.log('\n三个首领取三次:全部唯一,零回退 —— 回退不是「候选窗口没命中」就触发')
  })
})

describe('首领唯一性 · 故障注入:断言必须能抓住重复', () => {
  it('强制两段同一首领,唯一性断言变红', () => {
    const w = generateMortalWorld(20260904)
    expect(w.chain.length).toBeGreaterThan(1)
    // 人为制造重复
    const tampered = {
      ...w,
      chain: w.chain.map((p, i) => (i === 1 ? { ...p, boss: w.chain[0]!.boss } : p))
    }
    const ids = tampered.chain.map(p => p.boss)
    // 这正是修复前的实际形态
    expect(new Set(ids).size).not.toBe(ids.length)
    const dup = enemyDef(ids[0]!)?.name ?? ids[0]
    console.log(
      `\n注入重复后:第一、二段同为「${dup}」,唯一性检查确实为假 ——` +
        '\n证明断言能抓住重复,不是「代码看起来不会重复」'
    )
  })

  it('未注入时同一断言为真 —— 对照组', () => {
    const w = generateMortalWorld(20260904)
    const ids = w.chain.map(p => p.boss)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
