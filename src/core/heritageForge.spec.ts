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
   *
   * 判据分三层,因为**单看数值挡不住硬编码**:六道传承里最低的恰好就是 2,
   * 把导出改成写死的 `2` 也能通过「等于各条最低值」这一条。故另外两层:
   *   ① 定义处真的从 HERITAGE_DEFS 现算(源码断言 —— 编译期常量只能这样验);
   *   ② 弹窗模板里**渲染的是那个插值**,而不只是「文件里出现过这个名字」。
   * 故障注入:把导出改成写死 2 → 定义层红;把模板改回手抄 → 模板层红。
   */
  it('入口门槛的定义处真的从数据现算,不是写死的数', () => {
    const src = readFileSync(resolve(ROOT, 'src/data/heritage.ts'), 'utf-8')
    // 编译期常量没法在运行期「反推」,只能验定义:它必须由 HERITAGE_DEFS 的 gateMajor 求最小值
    expect(src, 'HERITAGE_GATE_MAJOR 应由各条 gateMajor 求最小值').toMatch(
      /HERITAGE_GATE_MAJOR\s*=\s*Math\.min\(\s*\.\.\.HERITAGE_DEFS\.map\(d => d\.gateMajor\)\s*\)/
    )
    // 数值层:与各条最低值一致(定义写对了才成立)
    expect(HERITAGE_GATE_MAJOR, '入口门槛应是各条里最低的那道').toBe(
      Math.min(...HERITAGE_DEFS.map(d => d.gateMajor))
    )
    // 语义层:门槛之下一道也拿不到,到达门槛就有候选
    expect(forgeCandidate(HERITAGE_GATE_MAJOR - 1), '门槛以下应返回空').toEqual([])
    expect(forgeCandidate(HERITAGE_GATE_MAJOR).length, '到达门槛应有候选').toBeGreaterThan(0)
  })

  it('转世弹窗渲染的是那个插值,不只是文件里出现过这个名字', () => {
    const view = readFileSync(resolve(ROOT, 'src/components/character/RebirthDialog.vue'), 'utf-8')
    // 判据落在模板那一句上:出现标识符但模板仍印死字,是这次要防的形态
    expect(view, '模板应渲染 heritageGateRealm 插值').toMatch(/需\{\{\s*heritageGateRealm\s*\}\}境/)
    expect(view, '境名应由 REALMS 按门槛现取').toMatch(
      /heritageGateRealm\s*=\s*computed\(\(\) =>\s*REALMS\[HERITAGE_GATE_MAJOR\]/
    )
    expect(view, '不该再手抄境名').not.toContain('需金丹境')
    // 阴性对照:模板里不许出现写死的境名
    expect(view, '模板里不该出现任何写死的「金丹」境名').not.toMatch(/需[^<{]*金丹[^<]*境/)
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
