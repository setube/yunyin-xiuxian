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

/**
 * 逆命契(sealCore)/ 无相(soloArtifact)的玩家侧负担,出发前天机预览不勾销。
 *
 * 这是「所窥即所打」的契约:真打(runSnap)与远征预估(forecastExpedition)都吃
 * 逆命契封印核心、无相伴生只带一件法宝;出发前的 previewFight 若不吃,玩家看到的
 * 胜算就比真打乐观。共享 helper pactBoundedSnap 把它做成单一来源 —— 这里直接在
 * 快照上验证负担真的落位,不用去赌一场胜负正好五五开的仗。
 */
describe('远征 · 出发前契约不勾销玩家侧负担', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('逆命契封印当前流派的核心词条(连击→comboRate/comboDamage 归零)', () => {
    const player = usePlayerStore()
    const inv = useInventoryStore()
    player.initCharacter('探', { roots: [{ element: 'wood', aptitude: 90 }] } as never)
    player.major = 5
    player.sub = 0
    // 明确的连击流:武器带 连击(cb2)/连环(lh2),其余只堆生存,让核心词条是主要战力来源
    const SLOTS: EquipSlot[] = ['weapon','head','body','wrist','belt','boots','necklace','ring','talisman']
    const MORTAL_TOP = ['w_jiujie','h_zichen','b_taiqing','wr_jieyun','bl_yunlei','bo_lingxu','n_jiuzhuan','r_ziyuan','tl_yulei']
    inv.items = MORTAL_TOP.map((t, i): EquipmentInstance => ({
      uid: `x${i}`, templateId: t, quality: 'divine', tier: 40, level: 15,
      affixes: [{ id: 'cb2', roll: 0.9 }, { id: 'lh2', roll: 0.9 }, { id: 'hp4', roll: 0.7 }, { id: 'def4', roll: 0.7 }]
    }))
    inv.items.forEach((it, i) => inv.equip(it.uid, SLOTS[i]!))
    // 词条真落位 + 流派真被识别 —— 否则「封印核心」这句断言是空转
    const comboRate = modOf(player.finalStats.mods, 'comboRate')
    expect(comboRate, '连击词条应落进面板').toBeGreaterThan(0)
    expect(detectBuild(player.finalStats.mods), '应识别出流派').not.toBeNull()

    const base = buildPlayerSnap(true)
    const bounded = pactBoundedSnap(base, pactDef('ni')!)
    // 逆命契把当前流派核心词条反向抹掉
    expect(modOf(bounded.mods, 'comboRate'), '逆命契应封印连击核心').toBeCloseTo(0, 6)
    expect(modOf(bounded.mods, 'comboDamage'), '逆命契应封印连环核心').toBeCloseTo(0, 6)
  })
})
