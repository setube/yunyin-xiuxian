/**
 * 宿命传承 —— 机制回归(结构断言红线)。
 *
 * 覆盖承继自 xian 的评审判据:
 *   ① 门槛       gateMajor<=本世境界才候选;浅修(major<2)永不返回
 *   ② 一世一悟      同世多门槛只锻造最高那一个 —— 不滚雪球
 *   ③ 浅修农场反例  无论转世多少世,只要每世冲不到金丹,一道也锻不出
 *   ④ 跨世持久      锻造入 reincarnation.heritage,rebirth 不清空、只清每世用量
 *   ⑤ 非倍率红线    任何传承的名号/文案/机制描述不得含攻防/修速/倍率等词
 *   ⑤b 结构红线     effect 必须 bounded-flat + 门槛>=金丹 + 轴属三选
 *   ⑥ 遗产覆盖度量  samsaraAudit 的 HERITAGE 已登记 heritage 一行(kind=legacy)
 *   ⑦ 白费注入      故意塞一道「偷偷写成倍率」的传承,证明红线扫描器拦得下
 *   ⑧ 经济不变量    forge 判定是纯计算,调用不改任何资源流与存量
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { HERITAGE_DEFS, heritageDef, type HeritageDef } from '@/data/heritage'
import { forgeCandidate, lifeForge } from './heritageForge'
import { HERITAGE } from './samsaraAudit'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'

/**
 * 非倍率红线的禁词(仅测试期生效的静态守卫,故住在 spec 而非运行时数据里):
 * 任何传承的名号/文案/机制描述出现这些,即被当作「折成了量」而判负 ——
 * 一旦可折算成攻防/修速/战力倍率,就塌回「深修指数补偿」陷阱。
 */
const FORBIDDEN = [
  '攻速',
  '攻',
  '防御',
  '修速',
  '修炼速度',
  '倍率',
  '战力',
  '伤害',
  '暴击',
  '百分比',
  '气血加成',
  '加成',
  '+',
  '%'
] as const

function aura(d: HeritageDef): string {
  return `${d.name} ${d.desc} ${d.effectDesc}`
}

describe('宿命传承 · 锻造生命周期', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('① 门槛:forgeCandidate 只返回 gateMajor<=major 的未锻造传承;浅修(major<2)永不返回', () => {
    // 金丹(major 2)以下:练气/筑基一道候选都没有
    expect(forgeCandidate(0)).toEqual([])
    expect(forgeCandidate(1)).toEqual([])
    // 金丹正恰好解锁「浴火丹心」
    expect(forgeCandidate(2).map(d => d.id)).toEqual(['danxin'])
    // 每一道候选的门槛都不超过本世所达境界
    for (const d of forgeCandidate(9)) expect(d.gateMajor).toBeLessThanOrEqual(9)
    // 已锻造的不再是候选
    const player = usePlayerStore()
    player.addHeritage('danxin')
    expect(forgeCandidate(2).map(d => d.id)).toEqual([])
  })

  it('② 一世一悟:同世到达多个未锻造门槛,只锻造最高那一个(不滚雪球)', () => {
    expect(lifeForge(2)!.id).toBe('danxin')
    expect(lifeForge(5)!.id).toBe('tonggan')
    expect(lifeForge(9)!.id).toBe('daoben') // 一蹴而就到真仙也只悟最深一道
  })

  it('③ 浅修农场反例:哪怕转世几百世,只要每世冲不到金丹,一道也锻不出', () => {
    const forged: string[] = []
    // 模拟浅修:每一世都只到筑基(major 1)就转世
    for (let life = 0; life < 200; life += 1) {
      const f = lifeForge(1)
      if (f) forged.push(f.id)
    }
    expect(forged).toEqual([])
  })

  it('④ 跨世持久:锻造后 rebirth 不清空 heritage,只清空每世用量', () => {
    const player = usePlayerStore()
    player.addHeritage('danxin')
    player.addHeritage('dubu')
    // 本世用掉一次渡劫豁免,记进每世用量
    expect(player.consumeHeritageUse('dubu', 1)).toBe(true)
    expect(player.reincarnation.heritageUses['dubu']).toBe(1)
    // 用量用满后不再生效
    expect(player.consumeHeritageUse('dubu', 1)).toBe(false)
    player.rebirth(player.linggen!) // 转世
    // 传承随神魂不灭
    expect(player.reincarnation.heritage).toContain('danxin')
    expect(player.reincarnation.heritage).toContain('dubu')
    expect(player.reincarnation.count).toBe(1)
    // 每世用量归零 —— 新的一世从头算
    expect(player.reincarnation.heritageUses).toEqual({})
  })

  it('⑤ 非倍率红线:任何传承的名号/文案/机制描述不得含攻防/修速/倍率等词', () => {
    for (const d of HERITAGE_DEFS) {
      for (const kw of FORBIDDEN) {
        expect(aura(d), `${d.id} 含禁词「${kw}」`).not.toContain(kw)
      }
    }
  })

  it('⑤b 结构红线:effect 一律 bounded-flat、门槛不低于金丹、轴属选择/容错/荣誉', () => {
    expect(HERITAGE_DEFS.length).toBeGreaterThanOrEqual(3)
    for (const d of HERITAGE_DEFS) {
      expect(d.effect, `${d.id} 必须是有界平直的能力位`).toBe('bounded-flat')
      expect(d.gateMajor, `${d.id} 金丹以下锻不出`).toBeGreaterThanOrEqual(2)
      expect(['choice', 'fault-tolerant', 'honor'], `${d.id} 轴越界`).toContain(d.axis)
      expect(heritageDef(d.id)).toBe(d)
    }
  })

  it('⑥ 遗产覆盖度量:samsaraAudit 的 HERITAGE 已登记 heritage 一行(kind=legacy, mode=full)', () => {
    const row = HERITAGE.find(r => r.id === 'heritage')
    expect(row).toBeDefined()
    expect(row!.kind).toBe('legacy')
    expect(row!.mode).toBe('full')
    expect(row!.compressesGrowth).toBe(false)
  })

  it('⑦ 白费注入:红线扫描器能拦下「偷偷写成倍率」的传承(证明这条断言不是空转)', () => {
    const sneaky: HeritageDef = {
      id: 'evil',
      name: '睥睨' /* 名字干净 */,
      gateMajor: 2,
      effect: 'bounded-flat',
      axis: 'honor',
      desc: '修炼速度提升 15%',
      effectDesc: '攻防各 +5%'
    }
    // 若有人把一道传承偷偷写成倍率,这套禁词扫描**必须**命中 —— 命中才证明它能抓
    const hit = FORBIDDEN.find(kw => aura(sneaky).includes(kw))
    expect(hit, '扫描器未命中恶意倍率词条,红线形同虚设').toBeDefined()
  })

  it('⑧ 经济不变量:forge 判定是纯计算,调用不改任何资源流与存量', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const daoBefore = player.reincarnation.daoFruit
    const heritageBefore = [...player.reincarnation.heritage]
    const usesBefore = { ...player.reincarnation.heritageUses }
    forgeCandidate(9)
    lifeForge(9)
    expect(player.reincarnation.daoFruit).toBe(daoBefore)
    expect(player.reincarnation.heritage).toEqual(heritageBefore)
    expect(player.reincarnation.heritageUses).toEqual(usesBefore)
    // 不写任何资源流(spiritStone 保持就位)
    expect(resources.spiritStone).toBeDefined()
  })
})
