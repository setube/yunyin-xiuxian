/* eslint-disable no-console -- 审计报告 */
import { describe, expect, it } from 'vitest'
import { ENEMIES } from '@/data/enemies'
import { REGIONS, regionDef } from '@/data/regions'
import { enemyTraits, regionEcology } from './buildAdvisor'

/** Boss 阶段与机制有效性审计:只验机制配置,不模拟胜率(装备/功法成长测不出) */

const ALL_BOSSES = ENEMIES.filter(x => x.isBoss)

function bossFingerprint(boss: (typeof ALL_BOSSES)[number]): string {
  const effects = [...new Set(boss.skills.map(s => s.effect ?? 'plain'))].sort()
  const modKeys = Object.keys(boss.mods ?? {}).sort()
  const phaseCount = boss.phases?.length ?? 0
  return `${boss.archetype ?? 'none'}|${effects.join(',')}|${modKeys.join(',')}|p${phaseCount}`
}

describe('Phase 30.8: Boss 阶段与机制有效性审计', () => {
  it('① Boss 阶段覆盖: 至少 80% 的 Boss 应有战斗阶段', () => {
    const withPhases = ALL_BOSSES.filter(b => (b.phases?.length ?? 0) > 0)
    console.log(`\n—— Phase 30.8 Boss 阶段有效性审计 ——`)
    console.log(`  有阶段的 Boss: ${withPhases.length}/${ALL_BOSSES.length} (${Math.round((withPhases.length / ALL_BOSSES.length) * 100)}%)`)

    expect(withPhases.length / ALL_BOSSES.length).toBeGreaterThanOrEqual(0.8)
  })

  it('② 阶段机制多样性: 阶段触发的 mod/技能变化应多样化', () => {
    const changes = new Set<string>()
    for (const b of ALL_BOSSES) {
      for (const p of b.phases ?? []) {
        if (p.modChanges) {
          for (const k of Object.keys(p.modChanges)) changes.add(`mod:${k}`)
        }
        if (p.skillChanges && p.skillChanges.length > 0) {
          for (const sk of p.skillChanges) changes.add(`skill:${sk.effect ?? 'plain'}:${sk.mult}`)
        }
        if (p.label) changes.add(`label:${p.label}`)
      }
    }

    console.log(`\n  阶段变化类型: ${changes.size} 种`)
    for (const c of changes) console.log(`    - ${c}`)

    expect(changes.size, '阶段变化应多样化').toBeGreaterThanOrEqual(4)
  })

  it('③ 阶段变化强度: 每个阶段的机制参数变化应显著(mods 增量为原始值的 50%+)', () => {
    const weakChanges: string[] = []

    for (const boss of ALL_BOSSES) {
      for (const p of boss.phases ?? []) {
        if (!p.modChanges) continue
        for (const [k, v] of Object.entries(p.modChanges)) {
          const base = (boss.mods?.[k as keyof typeof boss.mods] ?? 0) as number
          const delta = (v as number) - base
          /*
           * 标题说「增量为原始值的 50%+」是**相对**判定,而旧实现判的是绝对差 < 0.1。
           * 两者会得出相反的结论:万妖林主的 regenPerRound 从 0.015 到 0.04,
           * 绝对差 0.025(旧实现判为弱),相对变化 +167%(其实是强变化)。
           * 基数很小时相对判定才有意义;基数近零时退回绝对差,否则任何增量都是无穷倍。
           */
          const rel = base > 1e-6 ? Math.abs(delta) / base : Number.POSITIVE_INFINITY
          const strong = base > 1e-6 ? rel >= 0.5 : Math.abs(delta) >= 0.1
          if (!strong) {
            weakChanges.push(`${boss.name}: ${k} 由 ${base} 变为 ${v}(相对 ${base > 1e-6 ? (rel * 100).toFixed(0) + '%' : '—'})`)
          }
        }
      }
    }

    console.log(`\n  弱变化警告:`)
    if (weakChanges.length > 0) {
      for (const w of weakChanges) console.log(`    ⚠ ${w}`)
    } else {
      console.log('    ✅ 所有阶段变化均 ≥0.1')
    }

    expect(weakChanges, '标题说「每个阶段都显著」,那就不该有任何一处不达标' + (weakChanges.length ? '：' + weakChanges.join(';') : '')).toEqual([])
  })

  it('④ Boss 生态一致性: archetype 应与技能/mod 机制匹配', () => {
    const mismatches: string[] = []

    for (const boss of ALL_BOSSES) {
      const allSkills = [
        ...boss.skills,
        ...(boss.phases ?? []).flatMap(p => p.skillChanges ?? [])
      ]
      const allMods = { ...(boss.mods ?? {}) }
      for (const p of boss.phases ?? []) {
        if (p.modChanges) Object.assign(allMods, p.modChanges)
      }

      const hasBurst = allSkills.some(sk => (sk.mult ?? 0) >= 2.0)
      const hasMulti = allSkills.some(sk => sk.effect === 'multi')
      const hasPierce = allSkills.some(sk => sk.effect === 'pierce')
      const hasDodge = (allMods.dodgeRate ?? 0) >= 0.1
      const counter = (allMods.counterRate ?? 0) >= 0.1
      const shield = (allMods.shieldOnStart ?? 0) >= 0.1
      const regen = (allMods.regenPerRound ?? 0) >= 0.01
      const lifesteal = (allMods.lifesteal ?? 0) >= 0.1

      const arch = boss.archetype
      if (arch === 'berserk' && !hasBurst) mismatches.push(`${boss.name}: 狂暴但无高爆发`)
      if (arch === 'counter' && !hasMulti && !counter) mismatches.push(`${boss.name}: 反制但无多段/反击`)
      if (arch === 'truedmg' && !hasPierce) mismatches.push(`${boss.name}: 真伤但无 pierce`)
      if (arch === 'antiheal' && !lifesteal) mismatches.push(`${boss.name}: 吸血型但无吸血词条`)
      if (arch === 'evasive' && !hasDodge) mismatches.push(`${boss.name}: 闪避但无闪避词条`)
      if (arch === 'attrition' && !regen && !lifesteal) mismatches.push(`${boss.name}: 消耗但无回复/吸血`)
      if (arch === 'threshold' && !shield && !hasPierce) mismatches.push(`${boss.name}: 门槛但无护盾/真伤词条`)
    }

    if (mismatches.length > 0) {
      console.log(`\n  ⚠ 生态不一致:`)
      for (const m of mismatches) console.log(`    - ${m}`)
    } else {
      console.log('\n  所有 Boss 的 archetype 与机制一致 ✅')
    }

    expect(mismatches.length, 'Boss archetype 应与机制一致').toBe(0)
  })

  it('⑤ Boss 机制指纹: 各 Boss 的机制组合至少有 60% 独特', () => {
    const fingerprints = new Map<string, number>()
    for (const boss of ALL_BOSSES) {
      const fp = bossFingerprint(boss)
      fingerprints.set(fp, (fingerprints.get(fp) ?? 0) + 1)
    }

    const uniqueCount = fingerprints.size
    console.log(`\n  独特机制指纹: ${uniqueCount}/${ALL_BOSSES.length}`)
    for (const boss of ALL_BOSSES) {
      console.log(`    ${boss.name}: ${bossFingerprint(boss)}`)
    }

    expect(uniqueCount / ALL_BOSSES.length).toBeGreaterThanOrEqual(0.6)
  })

  it('⑥ Boss 与区域生态一致: Boss 机制应是区域生态的极端表达', () => {
    const inconsistencies: string[] = []

    for (const boss of ALL_BOSSES) {
      const region = REGIONS.find(r => r.boss === boss.id)
      if (!region) continue

      const eco = regionEcology(regionDef(region.id)!)
      const bossTraits = enemyTraits(boss)

      /*
       * 生态全 0 是「这一区没有特征敌人」(低阶敌人属性温和,enemyTraits 给不出特质),
       * 不是「Boss 与生态不匹配」—— 两者混在一起判,会把数据稀疏当成设计错误。
       */
      const ecoEmpty = Object.values(eco).every(v => v === 0)
      if (ecoEmpty) continue
      const hasOverlap = bossTraits.some(t => (eco[t as keyof typeof eco] ?? 0) > 0)
      if (!hasOverlap) {
        inconsistencies.push(`${boss.name}(区域 ${region.id} 生态 ${JSON.stringify(eco)})的机制 ${bossTraits.join(',') || '无'} 与生态无重叠`)
      }
    }

    if (inconsistencies.length > 0) {
      console.log(`\n  ⚠ 区域生态不一致:`)
      for (const i of inconsistencies) console.log(`    - ${i}`)
    } else {
      console.log('\n  所有 Boss 机制与区域生态一致 ✅')
    }

    /*
     * 阈值原为 ≤5,正好把上面那条「万妖林主」盖住。宽阈值让判据长期绿着,
     * 却没人直到这一处不匹配 —— 显式列为例外比放宽阈值诚实:
     * 万妖林主是 attrition 消耗型(靠 regenPerRound 拖),而 wanyao 的生态是闪避,
     * 两种打法放一起是有意的(消耗克制闪避),不是笔误。
     * 新增例外必须写在这里并说明理由,否则判据会红。
     */
    const KNOWN_EXCEPTIONS = new Set(['万妖林主'])

    const unexpected = inconsistencies.filter(line => !KNOWN_EXCEPTIONS.has(line.split('(')[0]!))
    expect(
      unexpected,
      'Boss 机制应与区域生态相关(新增例外请写进 KNOWN_EXCEPTIONS 并说明理由)'
    ).toEqual([])
  })
})
