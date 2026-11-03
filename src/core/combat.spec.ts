/* eslint-disable no-console -- 打印落空次数供复核 */
import { describe, expect, it } from 'vitest'
import type { BossPhase, CombatantSnap, CombatResult, CombatRules, EnemyDef, StatMods } from '@/types'
import { gn, mulN } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { enemyDef } from '@/data/enemies'
import { ARTIFACTS, artifactDef } from '@/data/artifacts'
import { applyCombatRuleSnap, makeEnemySnap, resolveCombat, sampleWinRate, snapPower } from './combat'
import { toNum } from '@/utils/gnum'
import { powerScale, powerScore } from './formulas'

const seeded = (seed = 1): RandomService => new RandomService(mulberry32(seed))

function playerSnap(power: number): CombatantSnap {
  return {
    name: '测试道人',
    icon: 'user',
    isPlayer: true,
    attack: gn(30 * power),
    defense: gn(15 * power),
    maxHp: gn(400 * power),
    speed: 1,
    mods: {},
    skills: [{ name: '试剑', mult: 1.6, rate: 0.25 }]
  }
}

describe('自动战斗', () => {
  const wolf = enemyDef('e_wolf')!

  it('敌战力标尺与 powerScore 同一把秤:由快照三维折出,不是界面另算', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const got = toNum(snapPower(enemy))
    const want = toNum(powerScore(enemy.attack, enemy.defense, enemy.maxHp))
    expect(got).toBeCloseTo(want, 6)
    const far = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 2)
    expect(toNum(snapPower(far))).toBeGreaterThan(got)
  })

  it('规则改后的敌力沿用规则倍率:enemyAtkMult/敌HpMult 一并计进卡片那对数', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const plain = toNum(snapPower(enemy))
    // 敌攻 ×2:战力两道都动(攻击项翻倍、减伤按攻防比走)
    const { eEff } = applyCombatRuleSnap(playerSnap(10), enemy, { enemyAtkMult: 2 })
    expect(toNum(snapPower(eEff))).toBeGreaterThan(plain)
  })

  /**
   * 规则里的三维百分比必须真的落到数值上:战斗只读快照的 attack/defense/maxHp,
   * 不经过 computeFinalStats。剑冢「防守极薄」曾因此完全不生效(秘境的负防成了纯增益)。
   * 故障注入:把 foldExtraMods 换回「只并进 mods」→ 本条红。
   */
  it('规则附加的三维百分比折进快照:负防真的变薄,正防真的变厚', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const base = playerSnap(10)
    const thin = applyCombatRuleSnap(base, enemy, { playerExtraMods: { defensePct: -0.2 } }).pEff
    expect(toNum(thin.defense)).toBeCloseTo(toNum(base.defense) * 0.8, 6)
    const thick = applyCombatRuleSnap(base, enemy, { playerExtraMods: { defensePct: 0.5 } }).pEff
    expect(toNum(thick.defense)).toBeCloseTo(toNum(base.defense) * 1.5, 6)
    // 折过之后不该再留在 mods 里:留着会在别处被算第二遍
    expect(thin.mods.defensePct, '三维百分比折完还留在词条里,会被重复计算').toBeUndefined()
  })

  it('敌方三维百分比同样兑现:防御 +10% 让同一场更难过', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const plain = applyCombatRuleSnap(playerSnap(10), enemy, {}).eEff
    const tough = applyCombatRuleSnap(playerSnap(10), enemy, { enemyExtraMods: { defensePct: 0.1 } }).eEff
    expect(toNum(tough.defense)).toBeCloseTo(toNum(plain.defense) * 1.1, 6)
    // 其余词条仍走 mods(如反击率)
    const counter = applyCombatRuleSnap(playerSnap(10), enemy, { enemyExtraMods: { counterRate: 0.15 } }).eEff
    expect(counter.mods.counterRate).toBe(0.15)
  })

  it('碾压级战力必胜,战报以胜利收尾', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const result = resolveCombat(playerSnap(100), enemy, seeded(3))
    expect(result.win).toBe(true)
    expect(result.log[result.log.length - 1]!.t).toBe('win')
  })

  /**
   * 先手判定随战斗结果带出,供战后分析讲清「差多少」。
   * 阈值语义:1 + 先手判定修正 ≥ 对手速度才算抢先;写成连续收益会让词条文案与分析面板失实。
   */
  it('先手判定如实带出:恰好持平也算抢先,差一点就不算', () => {
    const enemy = { ...makeEnemySnap(wolf, 1, 1), speed: 1.1 }
    const atPar = resolveCombat({ ...playerSnap(10), mods: { speed: 0.1 } }, enemy, seeded(7))
    expect(atPar.firstMove, '战果里应当带上先手判定').toBeDefined()
    expect(atPar.firstMove!.playerSpeed).toBeCloseTo(1.1, 10)
    expect(atPar.firstMove!.enemySpeed).toBeCloseTo(1.1, 10)
    expect(atPar.firstMove!.playerFirst, '持平即抢先(≥)').toBe(true)

    const justShort = resolveCombat({ ...playerSnap(10), mods: { speed: 0.09 } }, enemy, seeded(7))
    expect(justShort.firstMove!.playerFirst, '差 0.01 就是没抢先').toBe(false)
    expect(justShort.firstMove!.playerSpeed).toBeCloseTo(1.09, 10)
  })

  it('战力悬殊过大则败,不会死循环', () => {
    const enemy = makeEnemySnap(enemyDef('e_hmdemon')!, 20, 2)
    const result = resolveCombat(playerSnap(1), enemy, seeded(4))
    expect(result.win).toBe(false)
    expect(result.rounds).toBeLessThanOrEqual(50)
  })

  it('血量百分比始终在 0~1 之间', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const result = resolveCombat(playerSnap(2), enemy, seeded(5))
    for (const entry of result.log) {
      expect(entry.php).toBeGreaterThanOrEqual(0)
      expect(entry.php).toBeLessThanOrEqual(1)
      expect(entry.ehp).toBeGreaterThanOrEqual(0)
      expect(entry.ehp).toBeLessThanOrEqual(1)
    }
  })

  it('同层级适度成长即可取胜(数值曲线体检)', () => {
    // 玩家基础 ×2.5(同大境界内数层成长 + 装备)
    const enemy = makeEnemySnap(wolf, 1, 1)
    const p: CombatantSnap = {
      ...playerSnap(1),
      attack: gn(30),
      defense: gn(17),
      maxHp: gn(500)
    }
    const rate = sampleWinRate(p, enemy, seeded(9), 3)
    expect(rate).toBeGreaterThan(0.3)
  })

  it('sampleWinRate 取样数超表长时顶格,不越界取到 undefined→NaN', () => {
    // 表 4 档(0.08/0.4/0.72/0.93);samples=5 全胜若取 table[5] 得 NaN
    const enemy = makeEnemySnap(wolf, 1, 1)
    const rate = sampleWinRate(playerSnap(1000), enemy, seeded(9), 5)
    expect(rate).toBe(0.93)
    expect(Number.isFinite(rate)).toBe(true)
  })

  it('开局裸装带竹剑即可胜一层小怪(新手体验保护)', () => {
    // 炼气二层近似:基础三维 + 一柄凡品竹剑
    const p: CombatantSnap = {
      ...playerSnap(1),
      attack: gn(24),
      defense: gn(8),
      maxHp: gn(165),
      skills: [{ name: '太玄一气', mult: 1.5, rate: 0.2 }]
    }
    const enemy = makeEnemySnap(wolf, 1, 1)
    const rate = sampleWinRate(p, enemy, seeded(21), 3)
    expect(rate).toBeGreaterThan(0.6)
  })

  it('特殊词条不会让战斗崩溃', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const p = playerSnap(2)
    p.mods = {
      armorPen: 0.2,
      lifesteal: 0.1,
      counterRate: 0.3,
      comboRate: 0.3,
      stunRate: 0.2,
      shieldOnStart: 0.2,
      regenPerRound: 0.02,
      dodgeRate: 0.1,
      critRate: 0.3,
      critDamage: 0.5,
      lowHpDamage: 0.4,
      fullHpDamage: 0.3,
      shieldPower: 0.25,
      comboDamage: 0.5,
      counterDamage: 0.6,
      overhealShield: 0.8
    }
    const result = resolveCombat(p, enemy, seeded(12))
    expect(result.log.length).toBeGreaterThan(2)
    expect(typeof result.win).toBe('boolean')
  })

  it('技能概率在战斗判定前归一:rate>1 不会绕过 capChance 的随机数语义', () => {
    const enemy = makeEnemySnap(wolf, 1, 1)
    const p = playerSnap(100)
    // rate 不归一时,固定骰子 0.999 会被判成「没触发」;归一为 1 后必中
    p.skills = [{ name: '必中', mult: 1.2, rate: 999 }]
    const result = resolveCombat(p, enemy, new RandomService(() => 0.999))
    expect(result.stats!.player.skillCasts).toBeGreaterThan(0)
  })

  it('流派机制生效:罡盾+满血增伤使输出显著提升(统计性)', () => {
    const base = playerSnap(1.2)
    const build: CombatantSnap = {
      ...playerSnap(1.2),
      mods: { shieldOnStart: 0.3, shieldPower: 0.4, fullHpDamage: 0.3 }
    }
    let baseRounds = 0
    let buildRounds = 0
    for (let i = 0; i < 20; i += 1) {
      baseRounds += resolveCombat(base, makeEnemySnap(wolf, 1, 1), seeded(100 + i)).rounds
      buildRounds += resolveCombat(build, makeEnemySnap(wolf, 1, 1), seeded(100 + i)).rounds
    }
    expect(buildRounds).toBeLessThan(baseRounds)
  })

  it('双法宝均会自动施展', () => {
    const p = playerSnap(3)
    p.artifacts = [
      { def: artifactDef('af_lihuo')!, level: 0 },
      { def: artifactDef('af_xuantian')!, level: 0 }
    ]
    const result = resolveCombat(p, makeEnemySnap(enemyDef('e_bwking')!, 3, 1.2), seeded(7))
    const text = result.log.map(l => l.text).join('')
    expect(text.includes('离火珠') || text.includes('玄天镜')).toBe(true)
  })

  /**
   * 命中对闪避:蜃楼之主幻境 55%、冰魄化身 50%、大罗化身 48%。
   * 同一批种子量出手落空数:带命中须明显更少,且不靠别的数值赢。
   */
  it('命中按百分点抵掉闪避:同一批种子,带命中的一方落空更少', () => {
    const phantom = (): CombatantSnap => {
      const e = makeEnemySnap(enemyDef('e_shen')!, 15, 1)
      e.mods = { dodgeRate: 0.55 }
      e.attack = gn(1)
      e.defense = gn(1e12)
      e.maxHp = gn(1e12)
      e.skills = []
      return e
    }
    const misses = (accuracy: number): number => {
      let out = 0
      for (let seed = 1; seed <= 20; seed += 1) {
        const p = playerSnap(1)
        p.mods = accuracy > 0 ? { accuracy } : {}
        p.attack = gn(1)
        p.maxHp = gn(1e12)
        p.defense = gn(1e12)
        out += resolveCombat(p, phantom(), seeded(seed)).stats!.player.missedHits
      }
      return out
    }
    const bare = misses(0)
    const keen = misses(0.4)
    expect(bare, '幻影一次都没闪开,这条判据失去对象').toBeGreaterThan(0)
    expect(keen, `20 场累计落空:无命中 ${bare} 次,带四成命中 ${keen} 次 —— 命中没有换来出手`).toBeLessThan(bare)
    console.log(`\n幻影(闪避 55%)× 20 场:无命中落空 ${bare} 次,带四成命中落空 ${keen} 次`)
  })
})

describe('首领阶段', () => {
  /** 与该层敌人同步缩放的玩家(mortalWorldGen 审计同一份基准) */
  function tierPlayer(tier: number, k: number): CombatantSnap {
    const s = powerScale(tier)
    return {
      ...playerSnap(1),
      attack: mulN(s, 96 * k),
      defense: mulN(s, 54 * k),
      maxHp: mulN(s, 1400 * k)
    }
  }

  /** 深冻结的独立副本:严格模式下任何写入(换引用、Object.assign、push)当场抛错 */
  function frozenCopy<T>(value: T): T {
    const copy = structuredClone(value)
    const freeze = (x: unknown): void => {
      if (x === null || typeof x !== 'object' || Object.isFrozen(x)) return
      Object.freeze(x)
      for (const v of Object.values(x)) freeze(v)
    }
    freeze(copy)
    return copy
  }

  /** 木桩首领:不出招、不设防,被打死时护盾吸收量就是它凝过的护盾总量 */
  function dummyBoss(mods: StatMods, phases: BossPhase[]): CombatantSnap {
    return {
      name: '木桩',
      icon: 'skull',
      isPlayer: false,
      attack: gn(1),
      defense: gn(0),
      maxHp: gn(1000),
      speed: 0.5,
      mods,
      skills: [],
      phases
    }
  }

  function killDummy(boss: CombatantSnap, seed: number, rules?: CombatRules): CombatResult {
    const result = resolveCombat({ ...playerSnap(1), attack: gn(150), maxHp: gn(1e9) }, boss, seeded(seed), rules)
    expect(result.win, '木桩没打死,护盾吸收量不等于凝盾总量').toBe(true)
    return result
  }

  const enemyShieldLines = (r: CombatResult): number => r.log.filter(l => l.t === 'shield' && l.side === 'e').length

  it('同一份首领快照连打两场:快照不被写入,两场逐位相同', () => {
    const boss = makeEnemySnap(enemyDef('e_wolfking')!, 1, 1)
    const player = playerSnap(3)
    const before = structuredClone({ boss, player })
    const first = resolveCombat(player, boss, seeded(1))
    expect(first.log.some(l => l.text.includes('狂化!')), '第一场没进第二阶段,判据失去对象').toBe(true)
    expect({ boss, player }, '战斗写回了调用方快照').toEqual(before)
    const second = resolveCombat(player, boss, seeded(1))
    expect(second, '第二场没有从第一阶段开打').toEqual(first)
  })

  it('冻结的快照与规则走遍法宝、组合技、铁壁、长生印、阶段各分支,一处不写', () => {
    const effectTypes = [...new Set(ARTIFACTS.map(a => a.active.effect.type))]
    const artifacts = effectTypes.map(t => ({ def: ARTIFACTS.find(a => a.active.effect.type === t)!, level: 3 }))
    const rules = frozenCopy({
      perRounds: { interval: 2, playerHealPct: 0.05, playerShieldPct: 0.05, enemyAtkGrowth: 0.05 },
      playerExtraMods: { lifesteal: 0.05 },
      enemyExtraMods: { critRate: 0.05 }
    })
    const markers = ['铁壁共鸣', '长生印', '罡盾崩碎', '锋连诀', '摄魂之力散于无形', '将军誓!', '狂化!']
    const seen = new Set<string>()
    const loaded = { shieldOnStart: 0.2, counterRate: 0.3, comboRate: 0.3, stunRate: 0.2, regenPerRound: 0.03, overhealShield: 0.5, critRate: 0.3 }
    for (const comboArt of ['xuangang', 'kuze', 'fenglian']) {
      for (const id of ['e_general', 'e_wolfking', 'e_python']) {
        const def = enemyDef(id)!
        // 满配一身法宝几乎不死,铁壁与濒死分支(枯泽)要靠一具只带吸血的裸身去走
        const players = [
          { ...tierPlayer(def.tier, 0.1), artifacts, comboArt, ironwallBrace: true, mods: loaded },
          { ...tierPlayer(def.tier, 0.9), artifacts, comboArt, ironwallBrace: true, mods: loaded },
          { ...tierPlayer(def.tier, 0.3), comboArt, ironwallBrace: true, mods: { lifesteal: 0.1 } }
        ]
        const base = makeEnemySnap(def, def.tier, 1)
        const boss = frozenCopy({ ...base, mods: { ...base.mods, stunRate: 0.3 } })
        for (const p of players) {
          const player = frozenCopy(p)
          for (const r of [undefined, rules]) {
            const text = resolveCombat(player, boss, seeded(5), r).log.map(l => l.text).join('\n')
            for (const m of markers) if (text.includes(m)) seen.add(m)
          }
        }
      }
    }
    expect(effectTypes.length, '法宝神通类型少于八种').toBeGreaterThanOrEqual(8)
    expect(markers.filter(m => !seen.has(m)), '这些分支一场都没走到').toEqual([])
  })

  it('sampleWinRate 的三次抽样互不串场:与每场新开快照的胜负一致', () => {
    const def = enemyDef('e_general')!
    const table = [0.08, 0.4, 0.72, 0.93]
    for (let seed = 1; seed <= 40; seed += 1) {
      const shared = sampleWinRate(tierPlayer(6, 0.8), makeEnemySnap(def, 6, 1), seeded(seed), 3)
      const rng = seeded(seed)
      let wins = 0
      for (let i = 0; i < 3; i += 1) {
        if (resolveCombat(tierPlayer(6, 0.8), makeEnemySnap(def, 6, 1), rng, undefined, false).win) wins += 1
      }
      expect(shared, `种子 ${seed}`).toBe(table[wins])
    }
  })

  it('阶段写入开战护盾即当场凝盾:将军誓后紧跟敌方护盾,吸收量多于删掉该阶段护盾的同一场', () => {
    const def = enemyDef('e_general')!
    const bare: EnemyDef = { ...def, phases: def.phases!.map(p => ({ ...p, modChanges: {} })) }
    for (let seed = 1; seed <= 20; seed += 1) {
      const withPhase = resolveCombat(tierPlayer(6, 1), makeEnemySnap(def, 6, 1), seeded(seed))
      const idx = withPhase.log.findIndex(l => l.text.includes('将军誓'))
      expect(idx, `种子 ${seed}:没进阶段`).toBeGreaterThan(-1)
      const next = withPhase.log[idx + 1]!
      expect([next.t, next.side], `种子 ${seed}:将军誓之后没有凝盾`).toEqual(['shield', 'e'])
      const without = resolveCombat(tierPlayer(6, 1), makeEnemySnap(bare, 6, 1), seeded(seed))
      expect(toNum(withPhase.stats!.enemy.shieldAbsorbed), `种子 ${seed}`).toBeGreaterThan(toNum(without.stats!.enemy.shieldAbsorbed))
    }
  })

  it('阶段抬高开战护盾只补差额,受护盾上限约束', () => {
    // 开战 25%,半血抬到 45%:补 20%;盾在半血前已被打光,两段都不顶上限
    const half = killDummy(dummyBoss({ shieldOnStart: 0.25 }, [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.45 } }]), 1)
    expect(toNum(half.stats!.enemy.shieldAbsorbed)).toBeCloseTo(450, 6)
    expect(enemyShieldLines(half)).toBe(2)
    // 开战无盾的首领(神域封锁型):差额即阶段值
    const fresh = killDummy(dummyBoss({}, [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.4 } }]), 1)
    expect(toNum(fresh.stats!.enemy.shieldAbsorbed)).toBeCloseTo(400, 6)
    // 开战 30% 未破即入阶段(阈值 1):30% + 15% 被世界规则的 40% 上限截住
    const capped = killDummy(
      dummyBoss({ shieldOnStart: 0.3 }, [{ hpThreshold: 1, modChanges: { shieldOnStart: 0.45 } }]),
      1,
      { shieldCapRatio: 0.4 }
    )
    expect(toNum(capped.stats!.enemy.shieldAbsorbed)).toBeCloseTo(400, 6)
  })

  it('阶段不写开战护盾就不凝盾:开战盾只凝一次', () => {
    const result = killDummy(dummyBoss({ shieldOnStart: 0.2 }, [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.1 } }]), 1)
    expect(toNum(result.stats!.enemy.shieldAbsorbed)).toBeCloseTo(200, 6)
    expect(enemyShieldLines(result)).toBe(1)
  })

  it('阶段改词条照常生效:入阶段即带上新减伤', () => {
    const plain = killDummy(dummyBoss({}, []), 1)
    const warded = killDummy(dummyBoss({}, [{ hpThreshold: 1, modChanges: { damageReduction: 0.5 } }]), 1)
    expect(warded.rounds, `无阶段 ${plain.rounds} 回合,开场入阶段减伤五成 ${warded.rounds} 回合`).toBeGreaterThan(plain.rounds)
  })

  it('阶段换招照常生效:狂化之后只用新招', () => {
    let phaseCasts = 0
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = resolveCombat(playerSnap(3), makeEnemySnap(enemyDef('e_wolfking')!, 1, 1), seeded(seed))
      const idx = result.log.findIndex(l => l.text.includes('狂化!'))
      if (idx < 0) continue
      const before = result.log.slice(0, idx).map(l => l.text).join('\n')
      const after = result.log.slice(idx + 1).map(l => l.text).join('\n')
      expect(before, `种子 ${seed}`).not.toContain('狂化·裂空')
      expect(after, `种子 ${seed}`).not.toContain('裂空爪')
      phaseCasts += result.log.slice(idx + 1).filter(l => l.text.includes('施展【狂化·裂空】')).length
    }
    expect(phaseCasts, '20 场里狂化之后一次新招都没出,判据失去对象').toBeGreaterThan(0)
  })
})

/**
 * 倒下的人不再出手。
 *
 * 反击是「对方打完那一下顺带还手」,它可能当场把出手方打死。
 * 而追击 / 震摄这些后续节拍仍挂在出手方身上 —— 少一道自身归零的检查,
 * 就会出现「气血已经归零的人继续追击,吸血再把血拉回来,从而判胜」。
 *
 * 实测(攻击 100 / 吸血 5% / 连击 100%,对手攻击 200 / 反击 100%):
 * 第 3 拍玩家被反击打到 php=0,第 4 拍照样追击并吸血回到 0.003,最终判胜。
 */
describe('战斗 · 气血归零后不再出手', () => {
  it('被反击打死之后,不再发出追击', () => {
    const player: CombatantSnap = {
      name: '我',
      icon: 'user',
      isPlayer: true,
      attack: gn(100),
      defense: gn(0),
      maxHp: gn(1000),
      speed: 1,
      mods: { lifesteal: 0.05, comboRate: 1 },
      skills: []
    }
    const foe: CombatantSnap = {
      name: '敌',
      icon: 'skull',
      isPlayer: false,
      attack: gn(200),
      defense: gn(0),
      maxHp: gn(150),
      speed: 1,
      mods: { counterRate: 1 },
      skills: []
    }
    // flat(0.5) 让「有概率的触发」全部命中:连击必出、反击必出
    const res = resolveCombat(player, foe, new RandomService(() => 0.5), { playerStartHpPct: 0.05 })

    expect(res.win, '气血归零后靠追击吸血翻盘判胜了').toBe(false)
    expect(res.playerHpPct, '败北时气血应为 0').toBe(0)
    // 归零之后不该再出现任何由玩家发出的攻击
    const zeroAt = res.log.findIndex(l => l.php === 0)
    expect(zeroAt, '这局里玩家没被打到归零,用例前提变了').toBeGreaterThan(-1)
    const afterDeath = res.log.slice(zeroAt + 1).filter(l => l.side === 'p' && l.t === 'atk')
    expect(afterDeath, '归零之后玩家还在出手').toEqual([])
  })
})
