/* eslint-disable no-console -- 输出对账表 */
/**
 * 天界口径审计:基础属性作数,差别落在判定层。
 * 敌人按本界锚点定标(与玩家此刻多强无关),攻防血到哪儿都作数;堆叠代价由敌人一侧的判定承担:
 *   · 道之理解:构筑越厚,守关者三维越加厚,且被看破(增伤)/被挡下(减伤);
 *   · 境界压制:未及本界该有的境界,守关者额外增伤。
 * 敌人参照取玩家自己的 `celestialStats`、凡器被器魂抹平,会导致基础属性在天界等于不存在。
 * 故障注入:把任一条契约改回旧口径,本文件红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toNum } from '@/utils/gnum'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import {
  CELESTIAL_BASE_DEPTH,
  CELESTIAL_JUDGE_CAP,
  CELESTIAL_SUPPRESS_BONUS,
  celestialAnchor,
  celestialFoeCaliber,
  celestialJudgement,
  worldFoeLineup,
  worldFoeSnap
} from './gauntlet'
import { CELESTIAL_WORLDS, TRIALS } from '@/data/endgame'
import { MAX_MAJOR } from '@/data/realms'
import { recordMark } from './endgameService'
import type { StatMods } from '@/types'

const WORLD = CELESTIAL_WORLDS[0]!
const SHAPE = WORLD.foes[0]!

describe('天界口径 · 基础三维作数', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('玩家越强,天界战力越高;而敌人一动不动(不再水涨船高)', () => {
    const player = usePlayerStore()
    player.initCharacter('口径自检', { roots: [{ element: 'wood', aptitude: 80 }] } as never)
    player.major = 12
    const inv = useInventoryStore()

    const rows: { label: string; playerAtk: number; foeAtk: number }[] = []
    const snap = (label: string): void => {
      const { ref, judgement } = celestialFoeCaliber(player.major, player.celestialStats.mods, WORLD.anchorTier)
      const foe = worldFoeSnap(SHAPE, ref, 1, judgement)
      rows.push({ label, playerAtk: toNum(player.celestialStats.attack), foeAtk: toNum(foe.attack) })
    }
    snap('裸装')
    inv.items = [{ uid: 'w', templateId: 'w_zhuxian', quality: 'heaven', tier: 20, level: 5, affixes: [{ id: 'atk4', roll: 1 }] }]
    inv.equip('w', 'weapon')
    snap('一件天品')
    console.log('\n装备          玩家天界攻击      敌人攻击')
    for (const r of rows) console.log(`${r.label.padEnd(10)}    ${r.playerAtk.toExponential(3)}   ${r.foeAtk.toExponential(3)}`)

    expect(rows[1]!.playerAtk, '换上一件好装备,天界战力却没动 —— 基础属性又不作数了').toBeGreaterThan(rows[0]!.playerAtk)
    expect(rows[1]!.foeAtk, '敌人跟着玩家一起涨(倒挂:凡器越好、敌人越强)').toBeCloseTo(rows[0]!.foeAtk, 6)
  })

  it('器魂是叠加层:凝魂之后比只有装备时更强', () => {
    const player = usePlayerStore()
    player.initCharacter('口径自检', { roots: [{ element: 'wood', aptitude: 80 }] } as never)
    player.major = 12
    const inv = useInventoryStore()
    const eg = useEndgameStore()
    inv.items = [{ uid: 'w', templateId: 'w_zhuxian', quality: 'heaven', tier: 20, level: 5, affixes: [{ id: 'crit1', roll: 1 }] }]
    inv.equip('w', 'weapon')
    const gearOnly = { ...player.celestialStats.mods }
    eg.souls = [{ uid: 's1', type: 'fengmang', grade: 5, fromName: '旧剑' }] as never
    eg.equippedSouls = ['s1']
    // 锋魂给暴击/满血增伤类词条(见 data/souls),判据看词条而非攻击总数
    const added = Object.keys(player.celestialStats.mods).filter(
      k => (player.celestialStats.mods[k as never] ?? 0) > (gearOnly[k as never] ?? 0) + 1e-9
    )
    expect(added.length, '器魂没有叠加上去').toBeGreaterThan(0)
  })
})

describe('天界口径 · 锚点与阶梯', () => {
  it('锚点随层级单调递增 —— 越往后的天界,敌人越厚', () => {
    for (let i = 1; i < CELESTIAL_WORLDS.length; i += 1) {
      const prev = CELESTIAL_WORLDS[i - 1]!
      const cur = CELESTIAL_WORLDS[i]!
      expect(cur.anchorTier, `${cur.name} 的锚点不该低于 ${prev.name}`).toBeGreaterThan(prev.anchorTier)
      expect(toNum(celestialAnchor(cur.anchorTier).attack)).toBeGreaterThan(toNum(celestialAnchor(prev.anchorTier).attack))
    }
    console.log(
      '\n天界锚点:\n' + CELESTIAL_WORLDS.map(w => `${w.name}\t${w.anchorTier} 阶\t${toNum(celestialAnchor(w.anchorTier).attack).toExponential(2)}`).join('\n')
    )
  })

  it('试炼也有锚点,且同样落在阶梯上', () => {
    for (const t of TRIALS) expect(t.anchorTier, `${t.name} 没有锚点层级`).toBeGreaterThan(0)
  })

  it('锚点与玩家此刻的三维无关 —— 它是这一界的常数', () => {
    const a = celestialAnchor(WORLD.anchorTier)
    const b = celestialAnchor(WORLD.anchorTier)
    expect(toNum(a.attack)).toBeCloseTo(toNum(b.attack), 9)
    expect(toNum(a.defense)).toBeGreaterThan(0)
  })
})

describe('天界口径 · 判定层', () => {
  const heavy: StatMods = { critRate: 1.2, critDamage: 3, lifesteal: 0.8, comboRate: 0.6 }

  it('道之理解:浅构筑无判定,厚构筑被加厚且被看破/挡下', () => {
    const shallow = celestialJudgement({}, MAX_MAJOR, WORLD.anchorTier)
    expect(shallow.thicken).toBe(1)
    expect(shallow.damageBonus).toBe(0)
    const deep = celestialJudgement(heavy, MAX_MAJOR, WORLD.anchorTier)
    expect(deep.thicken).toBeGreaterThan(1)
    expect(deep.damageBonus).toBeGreaterThan(0)
    expect(deep.damageReduction).toBeGreaterThan(0)
    expect(deep.damageBonus).toBeLessThanOrEqual(CELESTIAL_JUDGE_CAP + 1e-9)
    console.log(
      `\n道之理解:深度 ${CELESTIAL_BASE_DEPTH} 以下不判定;厚构筑 → 加厚 ${deep.thicken.toFixed(2)}x · ` +
        `增伤 ${(deep.damageBonus * 100).toFixed(0)}% · 减伤 ${(deep.damageReduction * 100).toFixed(0)}%`
    )
  })

  it('境界压制:未及本界该有的境界,守关者额外增伤;到了就没有', () => {
    const under = celestialJudgement({}, 0, WORLD.anchorTier)
    const onPar = celestialJudgement({}, MAX_MAJOR, WORLD.anchorTier)
    expect(under.damageBonus).toBeCloseTo(CELESTIAL_SUPPRESS_BONUS, 9)
    expect(onPar.damageBonus, '到了该有的境界还被压制').toBe(0)
  })

  it('判定真的落在敌人身上(三维加厚 + 增伤减伤并入词条)', () => {
    const ref = celestialAnchor(WORLD.anchorTier)
    const plain = worldFoeSnap(SHAPE, ref, 1, celestialJudgement({}, MAX_MAJOR, WORLD.anchorTier))
    const judged = worldFoeSnap(SHAPE, ref, 1, celestialJudgement(heavy, MAX_MAJOR, WORLD.anchorTier))
    expect(toNum(judged.attack)).toBeGreaterThan(toNum(plain.attack))
    expect(toNum(judged.maxHp)).toBeGreaterThan(toNum(plain.maxHp))
    expect(judged.mods.damageBonus ?? 0).toBeGreaterThan(0)
    expect(judged.mods.damageReduction ?? 0).toBeGreaterThan(0)
  })
})

describe('天界口径 · 造敌只有一条路', () => {
  const flightSrc = (p: string): string => readFileSync(resolve(__dirname, p), 'utf8')

  it('远征 / 挑战 / 忆战 / 变数连战一律走 celestialFoeCaliber 或 celestialJudgement', () => {
    const expedition = flightSrc('./expedition.ts')
    expect(expedition, '远征该用统一口径造敌').toContain('celestialFoeCaliber(')
    const calls = [...expedition.matchAll(/worldFoeSnap\(([^\n]*)\)/g)].map(m => m[1]!)
    expect(calls.length, '远征里一处 worldFoeSnap 都没扫到,判据形同虚设').toBeGreaterThan(2)
    for (const c of calls) expect(c, `这次造敌没带判定:worldFoeSnap(${c})`).toMatch(/judgement/i)

    const challenge = flightSrc('./challenge.ts')
    expect(challenge, '挑战该用同一口径').toContain('celestialFoeCaliber(')
    /*
     * 阵容构造已收进 gauntlet.worldFoeLineup(challenge / endgameService / lab 原先各抄一份)。
     * 故这里改判两件事:挑战确实走那个函数,且该函数确实把 judgement 传下去 ——
     * 只查 challenge.ts 里有没有 `worldFoeSnap(...judgement)` 已随抽取失效。
     */
    expect(challenge, '挑战造敌该走 worldFoeLineup').toContain('worldFoeLineup(')
    const gauntlet = flightSrc('./gauntlet.ts')
    expect(gauntlet, 'worldFoeLineup 必须把 judgement 传给 worldFoeSnap').toMatch(/worldFoeSnap\([^\n]*judgement/)
    expect(gauntlet, '守关者那一行也要带 judgement').toMatch(/worldFoeSnap\(world\.guardian,[^\n]*judgement/)

    const endgame = flightSrc('./endgameService.ts')
    expect(endgame, '忆战/重写该用同一口径').toContain('celestialJudgement(')
  })

  it('不再有“把凡器抹平”的旧口径残留', () => {
    const gauntlet = flightSrc('./gauntlet.ts')
    expect(gauntlet, 'forgeSoul 那一套已随口径换掉').not.toContain('forgeSoul')
    expect(gauntlet, 'SOUL_CAPACITY 同样不该再出现').not.toContain('SOUL_CAPACITY')
    const player = flightSrc('../stores/player.ts')
    expect(player, '天界三维必须带上凡界装备的平铺').toMatch(/equipFlats: inventory\.equipFlats/)
  })
})

describe('忆战 · 境界压制按当年大境界还原', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('记痕时落定当年大境界:recordMark 把 player.major 写进道痕(旧档缺省则忆战回退 MAX)', () => {
    const player = usePlayerStore()
    player.initCharacter('忆战', { roots: [{ element: 'wood', aptitude: 80 }] } as never)
    player.major = 8
    recordMark('ichiyan', '赤炎天', true, 4)
    expect(useEndgameStore().marks[0]!.major).toBe(8)
  })

  it('忆战重打按当年境界判压制:低境记的痕,守关补正还在,不被 MAX 抹平', () => {
    // 赤炎天 tier 22 -> tierMajor 10:major 8 在锚点之下(压制,守关 +25% 增伤),MAX(20) 在之上(不压制)
    const low = celestialJudgement({}, 8, CELESTIAL_WORLDS[0]!.anchorTier)
    const top = celestialJudgement({}, MAX_MAJOR, CELESTIAL_WORLDS[0]!.anchorTier)
    expect(low.suppressed, '低境道痕应被压制').toBe(true)
    expect(top.suppressed, '满修不被压制').toBe(false)
    expect(low.damageBonus, '被压制的那痕,守关增伤还在').toBe(CELESTIAL_SUPPRESS_BONUS)
    expect(top.damageBonus).toBe(0)
  })
})

/**
 * `worldFoeLineup`:前 `fights - 1` 场按 foes 循环取、末位固定守关者。
 *
 * 这段循环原先在 challenge / endgameService / lab 各抄一份(逐字相同),已收进 gauntlet。
 * 收进一处之后要钉住它的形状:场数、顺序、守关者在末位、以及全员带同一份判定。
 * 故障注入:把末位守关者去掉、或让循环多跑一场,本条红。
 */
describe('天界阵容 · worldFoeLineup 的形状', () => {
  const world = CELESTIAL_WORLDS[0]!
  const judgement = celestialJudgement({}, MAX_MAJOR, world.anchorTier)
  const ref = celestialAnchor(world.anchorTier)

  it('场数等于 world.fights,末位是守关者', () => {
    const foes = worldFoeLineup(world, ref, judgement)
    expect(foes.length, '阵容长度该等于 world.fights').toBe(world.fights)
    const expectedGuardian = worldFoeSnap(world.guardian, ref, 1, judgement)
    expect(foes[foes.length - 1]!.name, '末位该是守关者').toBe(expectedGuardian.name)
  })

  it('前几场按 foes 循环取,与逐场构造逐个相同', () => {
    const foes = worldFoeLineup(world, ref, judgement)
    for (let i = 0; i < world.fights - 1; i += 1) {
      const expected = worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, judgement)
      expect(JSON.stringify(foes[i]), `第 ${i} 场与逐场构造不一致`).toBe(JSON.stringify(expected))
    }
  })

  it('判定逐位都生效:被压制时每一位敌人都与无判定不同', () => {
    const low = celestialJudgement({}, 0, world.anchorTier)
    expect(low.suppressed, '探针前提:0 境该被压制').toBe(true)
    const suppressed = worldFoeLineup(world, ref, low)
    const neutral = worldFoeLineup(world, ref)
    for (let i = 0; i < suppressed.length; i += 1) {
      expect(
        JSON.stringify(suppressed[i]),
        `第 ${i} 位敌人的三维与无判定时相同 —— judgement 没传到这一位`
      ).not.toBe(JSON.stringify(neutral[i]))
    }
  })

  it('判定确实传到每一位敌人身上:被压制时阵容整体更强', () => {
    const low = celestialJudgement({}, 0, world.anchorTier)
    expect(low.suppressed, '探针前提:0 境该被压制').toBe(true)
    const suppressed = worldFoeLineup(world, ref, low)
    const neutral = worldFoeLineup(world, ref)
    // 至少有一位三维不同,说明 judgement 没被吞
    const differs = suppressed.some((f, i) => JSON.stringify(f) !== JSON.stringify(neutral[i]))
    expect(differs, '判定完全没起作用 —— judgement 没传到敌人').toBe(true)
  })
})
