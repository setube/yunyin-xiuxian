/* eslint-disable no-console */
/**
 * 诸界总览「出发」的必要性审计
 *
 * 路线自带解锁之后,历练页上存在两条出发路径。只回答一个问题:
 *
 *   **在已有本世路线的前提下,总览出发是否仍提供不可替代的功能?**
 *
 * 判据不靠感觉:比较两条路径在同一个区域上能拿到什么。
 * 若总览拿到的一切路线都能给,且不含路线给不了的东西,它就是重复入口。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  OVERVIEW_ROLES,
  REGIONS,
  capabilities,
  caseFacts,
  escapeRouteNeeded,
  recommend,
  rolesNeedingDepart,
  sameCombatSource
} from './overviewNecessity'
import { generateMortalWorld } from './mortalWorldGen'
import { canEnterNode } from './mortalWorldService'
import { useAdventureStore } from '@/stores/adventure'

const WORLD = generateMortalWorld(20260904)

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('总览必要性 · 三种情形', () => {
  it('逐情形的事实', () => {
    const LABEL = { routeLocked: 'A 路线未开放', routeOpen: 'B 路线已覆盖', offRoute: 'C 不在路线内' }
    console.log('\n情形            路线可进  总览可进  总览有增量')
    for (const c of caseFacts()) {
      console.log(
        `${LABEL[c.case].padEnd(14)} ${(c.viaRoute ? '是' : '否').padStart(8)} ` +
          `${(c.viaOverview ? '是' : '否').padStart(9)} ${(c.overviewAdds ? '是' : '否').padStart(11)}`
      )
      console.log(`    ${c.note}`)
    }
  })

  it('B 情形是纯重复入口:两条路径进同一区域、同一批敌人、同一份奖励', () => {
    const b = caseFacts().find(c => c.case === 'routeOpen')!
    expect(b.viaRoute).toBe(true)
    expect(b.viaOverview).toBe(true)
    expect(b.overviewAdds).toBe(false)
    // 战斗数据同源是「重复」的硬证据
    const caps = capabilities(WORLD, REGIONS.length)
    expect(sameCombatSource(caps)).toBe(true)
    console.log('\n两条路径的战斗数据都取自 REGIONS —— 差别只在准入条件,不在内容')
  })

  it('A 情形的「增量」是绕过,不是退路', () => {
    const a = caseFacts().find(c => c.case === 'routeLocked')!
    expect(a.overviewAdds).toBe(true)
    // 但它增的是「跳过本世路线的推进顺序」
    expect(a.note).toContain('绕过')
    console.log(
      '\n总览确实能进入路线尚未开放的区域 —— 但这是绕过推进顺序。' +
        '\n老存档解锁越多,绕得越远:全解锁存档可以直接跳到第六段对应的地界'
    )
  })

  it('实测:全解锁老存档能用总览绕过整条路线', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = REGIONS.map(r => r.id)
    adventure.setMortalWorld(WORLD)
    // 路线上除首段外全部未开放
    const routeLocked = WORLD.chain.slice(1).filter(p => !canEnterNode(p.nodeId))
    expect(routeLocked.length).toBe(WORLD.chain.length - 1)
    // 但这些地界在总览里全部可出发
    const overviewOpen = routeLocked.filter(p => adventure.unlocked.includes(p.fromId))
    expect(overviewOpen.length).toBe(routeLocked.length)
    console.log(
      `\n本世路线锁着 ${routeLocked.length} 段,而这 ${overviewOpen.length} 段在总览里全都能直接出发。` +
        '\n「本世路线决定本世可达性」这条原则被总览整条绕开'
    )
  })

  it('C 情形:路线之外的区域确实只有总览能去', () => {
    const c = caseFacts().find(x => x.case === 'offRoute')!
    expect(c.viaRoute).toBe(false)
    expect(c.viaOverview).toBe(true)
    const offRoute = REGIONS.filter(r => !WORLD.chain.some(p => p.fromId === r.id))
    console.log(
      `\n本世 ${WORLD.chain.length} 段之外还有 ${offRoute.length} 处地界。` +
        '\n但「这一世走不到那里」本就是世界的一部分 —— 若都能去,世界就没有边界了'
    )
    expect(offRoute.length).toBeGreaterThan(0)
  })
})

describe('总览必要性 · 退路的前提是否成立', () => {
  it('首段天然可进入,故不存在「路线一段都进不去」的状态', () => {
    const adventure = useAdventureStore()
    adventure.unlocked = []
    adventure.cleared = []
    adventure.setMortalWorld(WORLD)
    expect(canEnterNode(WORLD.chain[0]!.nodeId)).toBe(true)
    expect(escapeRouteNeeded(WORLD)).toBe(false)
    console.log('\n旧链清空也能进首段 —— 「脱困退路」的前提不成立')
  })

  it('唯一残留情形是首段打不过,但那是难度问题', () => {
    // 用旧区域刷等级再回来,等于绕过世界的难度设计
    console.log(
      '\n首段太难 → 去旧区域刷等级 → 回来打首段。' +
        '\n这条路径存在,但它绕过的是**世界的难度曲线**,' +
        '\n与「本世路线决定本世可玩什么」直接冲突。' +
        '\n真要解决,应调首段难度,而不是保留一张平行地图'
    )
    expect(escapeRouteNeeded(WORLD)).toBe(false)
  })
})

describe('总览必要性 · 其余职责是否需要出发', () => {
  it('职责表', () => {
    console.log('\n职责            需要出发按钮')
    for (const r of OVERVIEW_ROLES) {
      console.log(`${r.name.padEnd(14)} ${r.needsDepart ? '是' : '否'}`)
      console.log(`    ${r.evidence}`)
    }
  })

  it('索引、历史、镇压三项全是只读', () => {
    const readOnly = OVERVIEW_ROLES.filter(r => !r.needsDepart).map(r => r.name)
    expect(readOnly).toContain('世界知识索引')
    expect(readOnly).toContain('历世足迹')
    expect(readOnly).toContain('区域镇压状态')
    console.log(`\n只读职责:${readOnly.join('、')} —— 这些不需要「出发」`)
  })

  it('唯一需要出发的职责(脱困退路)前提已被证伪', () => {
    const needs = rolesNeedingDepart()
    expect(needs).toHaveLength(1)
    expect(needs[0]!.id).toBe('escape')
    expect(escapeRouteNeeded(WORLD)).toBe(false)
    console.log('\n需要出发的只有「脱困退路」一项,而它的前提(路线进不去)不成立')
  })
})

describe('总览必要性 · 结论', () => {
  it('建议:保留总览,取消常规出发', () => {
    const rec = recommend(WORLD)
    expect(rec.disposition).toBe('demote')
    console.log(`\n处置:${rec.disposition === 'demote' ? '降级为只读' : rec.disposition}`)
    console.log(`理由:${rec.reason}`)
    console.log(`保留职责:${rec.keptRoles.join('、')}`)
    console.log(
      '\n认知模型因此变干净:' +
        '\n  本世路线 = 这一世怎么玩' +
        '\n  诸界总览 = 世界知识 / 历史索引' +
        '\n而不是两张都能玩的地图'
    )
  })

  it('这一结论依赖「首段永远可进入」,该前提若变则结论失效', () => {
    // 把判据本身的依赖写明:若将来首段也需要条件解锁,
    // 退路问题会重新成立,总览出发可能需要恢复
    const adventure = useAdventureStore()
    adventure.setMortalWorld(WORLD)
    expect(canEnterNode(WORLD.chain[0]!.nodeId)).toBe(true)
    console.log(
      '\n本结论的唯一前提:canEnterNode 对 route[0] 恒为 true。' +
        '\n若将来首段也加条件(例如境界门槛),「路线进不去」会重新出现,' +
        '\n届时须重跑本审计'
    )
  })
})
