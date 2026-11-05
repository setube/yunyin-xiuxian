/** 宿命传承机制回归(结构断言红线);用例 ①~⑧ 为承继自 xian 的评审判据 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
import { createPinia, setActivePinia } from 'pinia'
import { HERITAGE_DEFS, HERITAGE_GATE_MAJOR, heritageDef, type HeritageDef } from '@/data/heritage'
import { forgeCandidate, lifeForge } from './heritageForge'
import { HERITAGE } from './samsaraAudit'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'

/**
 * 非倍率红线禁词(仅测试期静态守卫,不进运行时数据):传承名号/文案/机制描述出现即判负;
 * 可折算成攻防/修速/战力倍率即塌回「深修指数补偿」陷阱。
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

  /**
   * 界面上的入口门槛也要读数据,不许手抄境名。
   *
   * 转世弹窗原写「需金丹境」,而门槛实际由各条传承的 gateMajor 决定(候选筛选就是 gateMajor <= major)。
   * 手抄境名会在两条线上分叉:改了最低那道传承的门槛,界面还写着旧境名。
   * 与洞府灵脉的 veinGateRealm 同一套做法 —— 门槛读数据,境名由界面临时取。
   * 故障注入:把 HERITAGE_GATE_MAJOR 改成写死的 2,或把弹窗改回手抄,本条红。
   */
  it('入口门槛从数据算,与「金丹以下永不返回」同一条线', () => {
    const computed = Math.min(...HERITAGE_DEFS.map(d => d.gateMajor))
    expect(HERITAGE_GATE_MAJOR, '入口门槛应是各条里最低的那道').toBe(computed)
    expect(HERITAGE_GATE_MAJOR, '入口门槛不该高于「浅修永不返回」的那一境').toBe(2)
    // 门槛之下的境界确实一道也拿不到
    expect(forgeCandidate(HERITAGE_GATE_MAJOR - 1), '门槛以下应返回空').toEqual([])
    expect(forgeCandidate(HERITAGE_GATE_MAJOR).length, '到达门槛应有候选').toBeGreaterThan(0)
  })

  it('转世弹窗的境名读门槛,不手抄「需金丹境」', () => {
    const view = readFileSync(resolve(ROOT, 'src/components/character/RebirthDialog.vue'), 'utf-8')
    expect(view, '传承门槛应读 HERITAGE_GATE_MAJOR').toContain('HERITAGE_GATE_MAJOR')
    expect(view, '境名应由 REALMS 现取').toContain('heritageGateRealm')
    expect(view, '不该再手抄境名').not.toContain('需金丹境')
  })

  it('① 门槛:forgeCandidate 只返回 gateMajor<=major 的未锻造传承;浅修(major<2)永不返回', () => {
    expect(forgeCandidate(0)).toEqual([])
    expect(forgeCandidate(1)).toEqual([])
    expect(forgeCandidate(2).map(d => d.id)).toEqual(['danxin'])
    for (const d of forgeCandidate(9)) expect(d.gateMajor).toBeLessThanOrEqual(9)
    const player = usePlayerStore()
    player.addHeritage('danxin')
    expect(forgeCandidate(2).map(d => d.id)).toEqual([])
  })

  it('② 一世一悟:同世到达多个未锻造门槛,只锻造最高那一个(不滚雪球)', () => {
    expect(lifeForge(2)!.id).toBe('danxin')
    expect(lifeForge(5)!.id).toBe('tonggan')
    expect(lifeForge(9)!.id).toBe('daoben')
  })

  it('③ 浅修农场反例:哪怕转世几百世,只要每世冲不到金丹,一道也锻不出', () => {
    const forged: string[] = []
    // 每世只到筑基(major 1)
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
    expect(player.consumeHeritageUse('dubu', 1)).toBe(true)
    expect(player.reincarnation.heritageUses['dubu']).toBe(1)
    expect(player.consumeHeritageUse('dubu', 1)).toBe(false)
    player.rebirth(player.linggen!)
    expect(player.reincarnation.heritage).toContain('danxin')
    expect(player.reincarnation.heritage).toContain('dubu')
    expect(player.reincarnation.count).toBe(1)
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
    expect(resources.spiritStone).toBeDefined()
  })
})
