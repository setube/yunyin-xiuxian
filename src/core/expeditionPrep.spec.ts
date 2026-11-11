/**
 * 远征 · 天机透视出发前与首战同源:previewFight 须按首战规则算胜算(道途 × 世界 × 契约 × 奇门)。
 * 只按 currentDaoRules() 预估会漏掉 world.rules 与所择契约/奇门,胜算偏乐观。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { rng, RandomService, mulberry32 } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { useEndgameStore, type WorldRunState } from '@/stores/endgame'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { pactDef } from '@/data/pacts'
import { detectBuild } from './buildDetect'
import { buildPlayerSnap } from './playerSnap'
import { modOf } from './statsCalc'
import { pactBoundedSnap, previewFight, withCarriedHp } from './expedition'
import { resolveCombat } from './combat'
import type { CombatantSnap, EquipSlot, EquipmentInstance } from '@/types'

describe('远征 · 天机透视出发前', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useEndgameStore().$patch({ daoPath: 'fate' })
  })

  it('赤炎天出发前:回合上限与生机稀薄都得报出来(与首战同一份世界规则)', () => {
    const world = celestialWorldDef('chiyan')!
    const pv = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: null, gateId: null })
    expect(pv, '天机道应能看到预览').not.toBeNull()
    const risk = pv!.riskLines.join(';')
    expect(risk, '赤炎天 enemyAtkMult/maxRounds/healMult 世界规则都应体现在预警里').toContain('32 回合')
    expect(risk).toContain('生机稀薄')
  })

  it('契约也得算进预览:血契(回血归零)出发前就报凶险,不是开战才翻脸', () => {
    const world = celestialWorldDef('chiyan')!
    const pv = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: 'xue', gateId: null })
    expect(pv).not.toBeNull()
    expect(pv!.riskLines.join(';')).toContain('生机稀薄')
  })
})

/**
 * 天机预览计入携带气血的边界守卫。真实界主战拿不到中段胜率,只钉三件原子事实:
 * withCarriedHp 写入并夹逼 playerStartHpPct;战斗按 playerStartHpPct 起手;预览确定性。
 * 任一环被拆,必有断言红。
 */
describe('远征 · 天机携带气血预报边界', () => {
  /*
   * 新 pinia = 干净的终局/人物分片。
   *
   * 本组最后一条「天机预览确定性」要 `useEndgameStore()` 再 `previewFight(...)`,
   * 而块内一个 beforeEach 都没有:乱序把本组排到最前时,
   * `previewFight` 拿不到玩家快照,直接返回 null(`expected null not to be null`)。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('withCarriedHp 把携带气血精确写进入界起手(playerStartHpPct,含上限夹逼)', () => {
    const run = (hp: number): WorldRunState =>
      ({ worldId: 'x', layer: 1, gateId: null, pactId: null, carriedHpPct: hp, cleared: [], history: [] }) as unknown as WorldRunState
    expect(withCarriedHp({}, run(0.3)).playerStartHpPct).toBe(0.3)
    expect(withCarriedHp({ playerStartHpPct: 0.9 }, run(0.3)).playerStartHpPct).toBe(0.3)
    expect(withCarriedHp({ playerStartHpPct: 0.2 }, run(0.5)).playerStartHpPct).toBe(0.2)
  })

  it('战斗结算按 playerStartHpPct 起手:满血赢、带伤输(刀口之战)', () => {
    // 刀口:玩家两击杀敌;敌每击 40,满血 100 扛两击,半血扛不住
    const SK = { name: '击', mult: 1, rate: 1, effect: 'plain' as const }
    const player: CombatantSnap = {
      name: 'F战', icon: 'x', isPlayer: true,
      attack: { m: 80, e: 0 }, defense: { m: 0, e: 0 }, maxHp: { m: 100, e: 0 }, speed: 10, mods: {}, skills: [SK]
    }
    const foe: CombatantSnap = {
      name: 'E敌', icon: 'x', isPlayer: false,
      attack: { m: 40, e: 0 }, defense: { m: 0, e: 0 }, maxHp: { m: 150, e: 0 }, speed: 5, mods: {}, skills: [SK]
    }
    expect(resolveCombat(player, foe, new RandomService(mulberry32(1)), { playerStartHpPct: 1 }).win, '满血应当赢了这场刀口').toBe(true)
    expect(resolveCombat(player, foe, new RandomService(mulberry32(1)), { playerStartHpPct: 0.5 }).win, '半血就该输了').toBe(false)
  })

  it('天机预览确定性:同输入必同预报', () => {
    const endgame = useEndgameStore()
    const world = celestialWorldDef('chiyan')!
    /*
     * `previewFight` 头一句是 `if (endgame.daoPath !== 'fate') return null` ——
     * 原先本组没有 beforeEach,那份 daoPath 是**前面某条用例留下的**,
     * 于是先把 beforeEach 补上,就得在这里显式立起来(否则预览恒为 null)。
     */
    endgame.$patch({ daoPath: 'fate' })
    endgame.$patch({ worldRun: { worldId: 'chiyan', layer: 1, gateId: null, pactId: null, carriedHpPct: 1, cleared: [], history: [] } as unknown as WorldRunState })
    const a = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: null, gateId: null })
    const b = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: null, gateId: null })
    expect(a).not.toBeNull()
    expect(b!.rate).toBe(a!.rate)
  })
})

/**
 * 逆命契(sealCore)/ 孤剑契(soloArtifact)的玩家侧负担,出发前预览不勾销。
 * 单一来源 pactBoundedSnap;直接验快照上的负担落位,不赌一场胜负。
 */
describe('远征 · 出发前契约不勾销玩家侧负担', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('逆命契封印当前流派的核心词条(连击→comboRate/comboDamage 归零)', () => {
    const player = usePlayerStore()
    const inv = useInventoryStore()
    player.initCharacter('探', { roots: [{ element: 'wood', aptitude: 90 }] } as never)
    player.major = 5
    player.sub = 0
    // 连击流:核心词条 cb2/lh2,其余只堆生存
    const SLOTS: EquipSlot[] = ['weapon','head','body','wrist','belt','boots','necklace','ring','talisman']
    const MORTAL_TOP = ['w_jiujie','h_zichen','b_taiqing','wr_jieyun','bl_yunlei','bo_lingxu','n_jiuzhuan','r_ziyuan','tl_yulei']
    inv.items = MORTAL_TOP.map((t, i): EquipmentInstance => ({
      uid: `x${i}`, templateId: t, quality: 'divine', tier: 40, level: 15,
      affixes: [{ id: 'cb2', roll: 0.9 }, { id: 'lh2', roll: 0.9 }, { id: 'hp4', roll: 0.7 }, { id: 'def4', roll: 0.7 }]
    }))
    inv.items.forEach((it, i) => inv.equip(it.uid, SLOTS[i]!))
    // 前置:词条落位、流派可识别,否则封印断言空转
    const comboRate = modOf(player.finalStats.mods, 'comboRate')
    expect(comboRate, '连击词条应落进面板').toBeGreaterThan(0)
    expect(detectBuild(player.finalStats.mods), '应识别出流派').not.toBeNull()

    const base = buildPlayerSnap(true)
    const bounded = pactBoundedSnap(base, pactDef('ni')!)
    expect(modOf(bounded.mods, 'comboRate'), '逆命契应封印连击核心').toBeCloseTo(0, 6)
    expect(modOf(bounded.mods, 'comboDamage'), '逆命契应封印连环核心').toBeCloseTo(0, 6)
  })
})
