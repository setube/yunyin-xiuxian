/* eslint-disable no-console -- 审计报告 */
import { describe, expect, it } from 'vitest'
import { ENEMIES } from '@/data/enemies'
import { REGIONS, maxTierForMajor } from '@/data/regions'
import { MAX_MAJOR } from '@/data/realms'

/** Boss 生态审计:技能、mod、攻防血倍率与机制组合的多样性;不测玩家能否击败 */

const ALL_BOSSES = ENEMIES.filter(x => x.isBoss)

describe('Phase 30.6: Boss 生态审计', () => {
  it('Boss 技能机制分布', () => {
    console.log('\n—— Phase 30.6 Boss 生态审计: 技能机制分布 ——')
    console.log('')

    const mechanicsCount = {
      multiHit: 0,
      trueDamage: 0,
      heal: 0,
      stun: 0,
      highCrit: 0,
      noSpecial: 0
    }

    for (const boss of ALL_BOSSES) {
      let hasMultiHit = false
      let hasTrueDamage = false
      let hasHeal = false
      let hasStun = false
      let hasHighCrit = false

      for (const skill of boss.skills) {
        if (skill.effect === 'multi') hasMultiHit = true
        if (skill.effect === 'pierce') hasTrueDamage = true
        if (skill.effect === 'drain') hasHeal = true
        if (skill.effect === 'stun') hasStun = true
        if ((skill.mult ?? 1.0) >= 2.0) hasHighCrit = true
      }

      if (hasMultiHit) mechanicsCount.multiHit += 1
      if (hasTrueDamage) mechanicsCount.trueDamage += 1
      if (hasHeal) mechanicsCount.heal += 1
      if (hasStun) mechanicsCount.stun += 1
      if (hasHighCrit) mechanicsCount.highCrit += 1
      if (!hasMultiHit && !hasTrueDamage && !hasHeal && !hasStun && !hasHighCrit) {
        mechanicsCount.noSpecial += 1
      }
    }

    console.log(`  多段攻击: ${mechanicsCount.multiHit}/${ALL_BOSSES.length}`)
    console.log(`  真实伤害: ${mechanicsCount.trueDamage}/${ALL_BOSSES.length}`)
    console.log(`  治疗技能: ${mechanicsCount.heal}/${ALL_BOSSES.length}`)
    console.log(`  眩晕控制: ${mechanicsCount.stun}/${ALL_BOSSES.length}`)
    console.log(`  高爆发(倍率≥2.0): ${mechanicsCount.highCrit}/${ALL_BOSSES.length}`)
    console.log(`  无特殊机制: ${mechanicsCount.noSpecial}/${ALL_BOSSES.length}`)

    const usedMechanics = [
      mechanicsCount.multiHit,
      mechanicsCount.trueDamage,
      mechanicsCount.heal,
      mechanicsCount.stun
    ].filter(c => c > 0).length

    expect(usedMechanics, 'Boss 应使用至少 3 种不同技能机制').toBeGreaterThanOrEqual(3)
  })

  it('Boss mod 机制分布', () => {
    console.log('\n—— Boss mod 机制分布 ——')
    console.log('')

    const modCount = {
      dodge: 0,
      thorns: 0,
      armorPen: 0,
      lifeSteal: 0,
      critRate: 0,
      critDmg: 0,
      defBreak: 0,
      noMod: 0
    }

    for (const boss of ALL_BOSSES) {
      const mods = boss.mods ?? {}
      if (mods.dodgeRate) modCount.dodge += 1
      if (mods.counterRate) modCount.thorns += 1
      if (mods.armorPen) modCount.armorPen += 1
      if (mods.lifesteal) modCount.lifeSteal += 1
      if (mods.critRate) modCount.critRate += 1
      if (mods.critDamage) modCount.critDmg += 1
      if (mods.armorPen) modCount.defBreak += 1
      if (Object.keys(mods).length === 0) modCount.noMod += 1
    }

    console.log(`  闪避: ${modCount.dodge}/${ALL_BOSSES.length}`)
    console.log(`  反伤: ${modCount.thorns}/${ALL_BOSSES.length}`)
    console.log(`  护甲穿透: ${modCount.armorPen}/${ALL_BOSSES.length}`)
    console.log(`  吸血: ${modCount.lifeSteal}/${ALL_BOSSES.length}`)
    console.log(`  暴击率: ${modCount.critRate}/${ALL_BOSSES.length}`)
    console.log(`  暴击伤害: ${modCount.critDmg}/${ALL_BOSSES.length}`)
    console.log(`  破甲: ${modCount.defBreak}/${ALL_BOSSES.length}`)
    console.log(`  无 mod: ${modCount.noMod}/${ALL_BOSSES.length}`)

    const usedMods = [
      modCount.dodge,
      modCount.thorns,
      modCount.armorPen,
      modCount.lifeSteal,
      modCount.critRate,
      modCount.defBreak
    ].filter(c => c > 0).length

    expect(usedMods, 'Boss 应使用至少 4 种不同 mod').toBeGreaterThanOrEqual(4)
  })

  it('Boss 数值分布: 攻防血倍率应有差异化', () => {
    console.log('\n—— Boss 数值分布 ——')
    console.log('')

    const profiles: Array<{ name: string; atk: number; def: number; hp: number }> = []
    for (const boss of ALL_BOSSES) {
      profiles.push({
        name: boss.name,
        atk: boss.atkMult,
        def: boss.defMult,
        hp: boss.hpMult
      })
    }

    const atkSpread = Math.max(...profiles.map(p => p.atk)) - Math.min(...profiles.map(p => p.atk))
    const defSpread = Math.max(...profiles.map(p => p.def)) - Math.min(...profiles.map(p => p.def))
    const hpSpread = Math.max(...profiles.map(p => p.hp)) - Math.min(...profiles.map(p => p.hp))

    console.log(`  攻击倍率极差: ${atkSpread.toFixed(2)}`)
    console.log(`  防御倍率极差: ${defSpread.toFixed(2)}`)
    console.log(`  生命倍率极差: ${hpSpread.toFixed(2)}`)

    expect(atkSpread, '攻击倍率应有显著差异').toBeGreaterThan(1.0)
    expect(hpSpread, '生命倍率应有显著差异').toBeGreaterThan(1.0)
  })

  it('Boss 身份多样性: 不同 Boss 应有不同的机制组合', () => {
    console.log('\n—— Boss 身份多样性 ——')
    console.log('')

    const signatures = new Set<string>()
    for (const boss of ALL_BOSSES) {
      const skillEffects = boss.skills.map(s => s.effect ?? 'normal').sort().join(',')
      const modKeys = Object.keys(boss.mods ?? {}).sort().join(',')
      const profile = `atk${boss.atkMult}def${boss.defMult}hp${boss.hpMult}`
      const signature = `${skillEffects}|${modKeys}|${profile}`
      signatures.add(signature)
    }

    const uniqueCount = signatures.size
    console.log(`  独特机制组合: ${uniqueCount}/${ALL_BOSSES.length}`)

    expect(uniqueCount / ALL_BOSSES.length, 'Boss 机制组合应多样化').toBeGreaterThanOrEqual(0.8)
  })

  it('Boss 列表完整性', () => {
    console.log('\n—— Boss 列表 ——')
    console.log('')
    for (const boss of ALL_BOSSES) {
      console.log(`  ${boss.name} (tier ${boss.tier})`)
    }
    expect(ALL_BOSSES.length, '每位区域首领都应有定义,且总数与区域数一致').toBe(REGIONS.length)
    expect(ALL_BOSSES.every(b => b.archetype !== undefined), '首领必须带 archetype 机制家族').toBe(true)
  })
})

/**
 * 期望阶梯**写死在判据里**,不从观测数据现推。
 *
 * 原先写 `const maxTier = Math.max(...byTier.keys())`:数据把最高那一阶整个删掉后,
 * 上限跟着缩到 31,1..31 仍然一个不缺 —— 那一阶此后没有首领可打,判据却照样绿。
 * 现在的上限取自真实区域阶梯(`maxTierForMajor(MAX_MAJOR)`),删数据就会红。
 */
const TIER_TOP = maxTierForMajor(MAX_MAJOR)

/**
 * 数量对得上 ≠ 每阶都有首领。
 *
 * 上一条断言 `ALL_BOSSES.length === REGIONS.length`,但两个首领挤在同一阶时
 * 这条照样绿 —— 而另一阶就没首领可打了。玩家会卡在那个境界推不动。
 */
describe('Boss 覆盖 · 每个 tier 都要有首领', () => {
  it('1..32 阶一个不缺,且每阶至少一位', () => {
    expect(TIER_TOP, '区域阶梯的上限变了,下面的期望范围要跟着改').toBe(32)
    const byTier = new Map<number, number>()
    for (const b of ALL_BOSSES) byTier.set(b.tier, (byTier.get(b.tier) ?? 0) + 1)
    const gaps: number[] = []
    for (let t = 1; t <= TIER_TOP; t += 1) if (!byTier.has(t)) gaps.push(t)
    expect(gaps, `这些 tier 没有首领可打:${gaps.join(',')}`).toEqual([])
    for (const [tier, n] of byTier) expect(n, `${tier} 阶的首领数量异常`).toBeGreaterThan(0)
    // 超出真实阶梯的首领玩家永远碰不到
    const outOfRange = ALL_BOSSES.filter(b => b.tier < 1 || b.tier > TIER_TOP)
    expect(outOfRange, `首领 tier 超出 1..${TIER_TOP}:${outOfRange.map(b => b.id).join(',')}`).toEqual([])
  })

  it('非首领敌人的 tier 覆盖也不缺', () => {
    const tiers = new Set(ENEMIES.map(e => e.tier))
    const gaps: number[] = []
    for (let t = 1; t <= TIER_TOP; t += 1) if (!tiers.has(t)) gaps.push(t)
    expect(gaps, `这些 tier 一个敌人都没有:${gaps.join(',')}`).toEqual([])
    const outOfRange = ENEMIES.filter(e => e.tier < 1 || e.tier > TIER_TOP)
    expect(outOfRange, `敌人 tier 超出 1..${TIER_TOP}:${outOfRange.map(e => e.id).join(',')}`).toEqual([])
  })
})
