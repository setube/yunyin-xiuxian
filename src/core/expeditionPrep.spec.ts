/**
 * 远征 · 天机透视出发前「先算后战」的同源口径
 *
 * previewFight 是 fate 道的招牌「天机透视·入界之敌」:出发前预览应当用
 * 与首战完全相同的规则来算胜算(道途 × 世界 × 契约 × 奇门)。此前 run=null
 * 时只按 currentDaoRules() 预估,漏掉 world.rules 与所择契约/奇门 ——
 * 报的胜算比实况乐观一整档(赤炎天的回合上限、生机稀薄一概不报)。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { rng, RandomService, mulberry32 } from '@/utils/random'
import { celestialWorldDef } from '@/data/endgame'
import { useEndgameStore, type WorldRunState } from '@/stores/endgame'
import { previewFight, withCarriedHp } from './expedition'
import { resolveCombat } from './combat'
import type { CombatantSnap } from '@/types'

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
 * 天机「携带气血」预报边界守卫 —— 把 1.33 那条「天机预览补算携带气血,玩家越残它不再
 * 报得越乐观」的修复钉成测试(此前 only 测了 run=undefined 的出发前视角)。
 *
 * 界主战是天堑(胜0.08/负0.93,一翻即变),资深预览在真实界主上拿不到中段胜率,
 * 故这里守三件「携带气血 → 预报如实报低」所依赖的原子事实:
 *  1. withCarriedHp 把携带气血精确写进 playerStartHpPct(±起手上限夹逼);
 *  2. 战斗结算真的按 playerStartHpPct 起手(构造刀口之战:满血赢、带伤输);
 *  3. 天机预览确定性(同输入必同预报)。
 * 任一环被拆掉(预报再报乐观),必有断言翻红。
 */
describe('远征 · 天机携带气血预报边界', () => {
  it('withCarriedHp 把携带气血精确写进入界起手(playerStartHpPct,含上限夹逼)', () => {
    const run = (hp: number): WorldRunState =>
      ({ worldId: 'x', layer: 1, gateId: null, pactId: null, carriedHpPct: hp, cleared: [], history: [] }) as unknown as WorldRunState
    // 携带 30% → 起手 30%
    expect(withCarriedHp({}, run(0.3)).playerStartHpPct).toBe(0.3)
    // 携带 30% vs 入界起手上限 90% → 取小 30%
    expect(withCarriedHp({ playerStartHpPct: 0.9 }, run(0.3)).playerStartHpPct).toBe(0.3)
    // 携带 50% 不得越过入界起手上限 20%(出发时的血线就是天花)
    expect(withCarriedHp({ playerStartHpPct: 0.2 }, run(0.5)).playerStartHpPct).toBe(0.2)
  })

  it('战斗结算按 playerStartHpPct 起手:满血赢、带伤输(刀口之战)', () => {
    // 刀口:玩家 2 击杀 150 血的敌;敌每击 40。满血 100 扛得住两击,50% 血 50 就扛不住。
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
    endgame.$patch({ worldRun: { worldId: 'chiyan', layer: 1, gateId: null, pactId: null, carriedHpPct: 1, cleared: [], history: [] } as unknown as WorldRunState })
    const a = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: null, gateId: null })
    const b = previewFight(world.foes[0]!, undefined, rng, { worldId: 'chiyan', pactId: null, gateId: null })
    expect(a).not.toBeNull()
    expect(b!.rate).toBe(a!.rate)
  })
})
