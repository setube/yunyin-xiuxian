/* eslint-disable no-console -- 八门是过程性验收,打印择门与规则差异 */
/**
 * 奇门遁甲 · 择门验收(Phase 34.7)
 *
 * 界域志四门的最后一门,也是最容易做成"第三份契约"的一门 ——
 * 故这里的判据先划清界限,再验效果:
 *
 *   一 八门据九宫:宫位 1~9 且不占中五,吉/平/凶俱全,门门有释义与规则;
 *   二 不夺契约之职:择门不动道源倍数(那是契约的事),只改打法;
 *   三 不择门 = 从前逐字相同:审计基线(远征模拟)不受影响;
 *   四 择了门就真的算数:远征规则合并、预估与实战同源、道痕记下当年之门。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GATES, gateDef } from '@/data/qimen'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import { expeditionRules, forecastExpedition, startWorldExpedition } from './expedition'
import { celestialWorldDef } from '@/data/endgame'
import type { WorldRunState } from '@/stores/endgame'
import { markRules, recordMark } from './endgameService'
import type { DaoMark } from '@/types'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('八门 · 据九宫而立', () => {
  it('八门俱全,门名不重复', () => {
    expect(GATES.length).toBe(8)
    expect(new Set(GATES.map(g => g.id)).size).toBe(8)
    expect(new Set(GATES.map(g => g.name)).size).toBe(8)
  })

  it('宫位取洛书 1~9 且不占中五(中宫无门)', () => {
    const palaces = GATES.map(g => g.palace).sort((a, b) => a - b)
    expect(palaces).toEqual([1, 2, 3, 4, 6, 7, 8, 9])
    expect(palaces).not.toContain(5)
  })

  it('吉、平、凶三档俱全 —— 全是吉门就无从取舍', () => {
    const kinds = new Set(GATES.map(g => g.kind))
    expect(kinds).toEqual(new Set(['吉', '平', '凶']))
  })

  it('门门有卦、方位、打法与来历,且都有可生效的规则', () => {
    for (const g of GATES) {
      expect(g.gua.length).toBeGreaterThan(0)
      expect(g.direction.length).toBeGreaterThan(0)
      expect(g.desc.length, `${g.fullName} 没说清打法`).toBeGreaterThan(6)
      expect(g.gist.length, `${g.fullName} 无来历`).toBeGreaterThan(6)
      expect(Object.keys(g.rules).length, `${g.fullName} 无规则`).toBeGreaterThan(0)
    }
    expect(gateDef('si')?.fullName).toBe('死门')
    expect(gateDef('nope')).toBeUndefined()
  })

  it('择门不夺契约之职:八门数据里没有任何道源倍数', () => {
    const raw = readFileSync(resolve(__dirname, '../data/qimen.ts'), 'utf8')
    expect(raw).not.toContain('sourceMult')
  })
})

describe('择门 · 预估与实战同源', () => {
  /** 把玩家推到能开远征的状态(真仙 + 择道途) */
  function readyForExpedition(): void {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    player.major = 9
    endgame.daoPath = 'sword'
    endgame.daoSource = 1000
  }

  it('不择门(常道)时,规则与从前逐字相同 —— 审计基线不受影响', () => {
    readyForExpedition()
    const base = forecastExpedition('chiyan', null)
    expect(base).not.toBeNull()
    // 显式传 null 与省略参数得到同一份预估
    expect(forecastExpedition('chiyan', null, null)?.difficulty).toBe(base!.difficulty)
    expect(forecastExpedition('chiyan', null, null)?.stars).toBe(base!.stars)
  })

  it('择门会改预估:死门与开门各有各的难法', () => {
    readyForExpedition()
    const none = forecastExpedition('chiyan', null, null)!
    const si = forecastExpedition('chiyan', null, 'si')!
    const kai = forecastExpedition('chiyan', null, 'kai')!
    const shown = [none, si, kai].map(f => `${f.difficulty}/${f.stars}`)
    // 三者的可行流派数或星级至少有一处不同(否则择门等于没择)
    const distinct = new Set([`${none.stars}|${none.viableStyles}`, `${si.stars}|${si.viableStyles}`, `${kai.stars}|${kai.viableStyles}`])
    expect(distinct.size, `择门后预估毫无差别:${shown.join(' ')}`).toBeGreaterThan(1)
    console.log(`\n常道 ${shown[0]} · 死门 ${shown[1]} · 开门 ${shown[2]}`)
  })

  it('实战那一场也按所择之门打(所见即所打)', () => {
    const world = celestialWorldDef('chiyan')!
    const run = { worldId: 'chiyan', pactId: null, gateId: 'sheng' } as unknown as WorldRunState
    const plain = { worldId: 'chiyan', pactId: null, gateId: null } as unknown as WorldRunState
    const gated = expeditionRules(world, run)
    const base = expeditionRules(world, plain)
    // 世界自有其规则(赤炎天本就把治疗打到 0.65),故这里钉的是「门再乘了几成」
    expect((gated?.healMult ?? 1) / (base?.healMult ?? 1)).toBeCloseTo(1.4, 6)
    expect((gated?.playerAtkMult ?? 1) / (base?.playerAtkMult ?? 1)).toBeCloseTo(0.95, 6)
    // 常道:门那几项一个都不出现,与从前逐字相同
    expect(base?.playerAtkMult).toBeUndefined()
    expect(base?.perRounds).toBeUndefined()
  })

  it('入界后:在途记在 run 上,若入界即败则记在道痕上(两种走向都不丢门)', () => {
    readyForExpedition()
    const endgame = useEndgameStore()
    const out = startWorldExpedition('chiyan', null, 'sheng')
    expect(out).not.toBeNull()
    // 入界战有胜有败:胜则 run 在途,败则当场落痕 —— 两条路都必须带着所择之门
    const inRun = endgame.worldRun?.gateId
    const inMark = endgame.marks.at(-1)?.context?.gateId
    expect(inRun ?? inMark).toBe('sheng')
  })

  it('道痕记下当年之门,忆战/重写按当年的门重打', () => {
    const endgame = useEndgameStore()
    recordMark('chiyan', '赤炎天', false, 3, null, { gateId: 'sheng' })
    const mark = endgame.marks.at(-1)!
    expect(mark.context?.gateId).toBe('sheng')
    // 道痕里的 context.gateId 必须回到规则里 —— 否则忆战就不是"重打当年那一场"
    const withGate = markRules(mark)
    expect(withGate?.healMult).toBe(gateDef('sheng')!.rules.healMult)

    const noGate = { daoPathId: 'sword', replay: { pactId: null } } as unknown as DaoMark
    expect(markRules(noGate)?.healMult, '未择门的旧痕不该凭空多出回血').toBeUndefined()
  })

  it('结算落痕时把所择之门写进 context(源码级接线)', () => {
    const src = readFileSync(resolve(__dirname, 'expedition.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).toContain('run.gateId ? { gateId: run.gateId } : undefined')
  })
})

describe('择门 · 接线', () => {
  it('远征准备里能择门,且预估把门算进去了', () => {
    // 远征准备弹窗随远征册迁入 components/celestial/ExpeditionPanel.vue
    const src = readFileSync(resolve(__dirname, '../components/celestial/ExpeditionPanel.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).toContain('in GATES')
    expect(src).toContain('forecastExpedition(prepWorldId.value, prepPact.value, prepGate.value)')
    expect(src).toContain('startWorldExpedition(prepWorld.value.id, prepPact.value, prepGate.value)')
  })

  it('界域志把九宫八门摊开了', () => {
    const src = readFileSync(resolve(__dirname, '../views/RealmCodexView.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).toContain('in GATES')
  })
})
