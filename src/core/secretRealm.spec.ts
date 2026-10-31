/* eslint-disable no-console -- 打印层间推进 */
/** 短期秘境验收:进得去、规则是真的、推得动、出得来 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gn, subClamp, toNum } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { intrinsicRuleTexts, SECRET_REALMS, SECRET_RULES, secretRuleByText } from '@/data/secretRealms'
import { MATERIALS, type MaterialBucket, type MaterialDef } from '@/data/materials'
import { rng } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useEndgameStore } from '@/stores/endgame'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { useLoreStore } from '@/stores/lore'
import { startExploration } from './exploration'
import { endgameBusy } from './endgameActivity'
import { rollFieldMaterial } from './loreService'
import {
  SECRET_LAYERS,
  SECRET_MAX_LOSSES,
  abandonRealm,
  availableRealms,
  currentRealm,
  enterSecretRealm,
  entryCostOf,
  entryCostText,
  entryShortfallOf,
  fightSecretLayer,
  realmUnlock,
  secretFightRules,
  secretLayerFoe,
  secretLayerReward,
  secretRuleTexts,
  secretRealmDef,
  tierOfMajor
} from './secretRealm'

const forceWin = vi.hoisted(() => ({ value: false }))

// 默认原样透传;forceWin 时只把胜负钉成胜,其余照真算
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    resolveCombat: (...args: Parameters<typeof mod.resolveCombat>): ReturnType<typeof mod.resolveCombat> => {
      const r = mod.resolveCombat(...args)
      return forceWin.value ? { ...r, win: true } : r
    }
  }
})

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 够格且有钱的玩家 */
function ready(major = 3): void {
  usePlayerStore().major = major
  useResourcesStore().addStone(gn(1_000_000_000))
}

describe('秘境 · 进得去', () => {
  it('元婴(≥3)起有秘境可探,金丹之前没有', () => {
    const player = usePlayerStore()
    player.major = 2
    expect(realmUnlock()).toBe(false)
    expect(availableRealms()).toEqual([])
    player.major = 3
    expect(realmUnlock()).toBe(true)
    expect(availableRealms().length).toBeGreaterThanOrEqual(2)
  })

  it('进入要付灵石;付不出则拒绝且不落状态', () => {
    const resources = useResourcesStore()
    usePlayerStore().major = 3
    const def = SECRET_REALMS[0]!
    expect(enterSecretRealm(def.id).ok).toBe(false)
    expect(currentRealm()).toBeNull()

    resources.addStone((entryCostOf(def, 3) as { kind: 'stone'; stone: ReturnType<typeof gn> }).stone)
    const before = resources.spiritStone.m
    expect(enterSecretRealm(def.id).ok).toBe(true)
    expect(currentRealm()?.realmId).toBe(def.id)
    expect(resources.spiritStone.m).toBeLessThan(before)
  })

  it('灵石付不出:缺口只报尚差多少,卡面与服务拒因同源', () => {
    const resources = useResourcesStore()
    usePlayerStore().major = 3
    const def = SECRET_REALMS[0]!
    const cost = entryCostOf(def, 3) as { kind: 'stone'; stone: ReturnType<typeof gn> }
    resources.spiritStone = gn(0)
    const short = entryShortfallOf(def, 3)
    expect(short?.kind).toBe('stone')
    expect(short?.stone).toEqual(cost.stone)
    expect(short?.reason).toContain('尚差')
    expect(short?.reason).toContain('石')
    expect(short?.reason).not.toContain('灵石不足')

    expect(enterSecretRealm(def.id).ok).toBe(false)
    expect(useUiStore().toasts.at(-1)?.text).toBe(short?.reason)
    expect(currentRealm()).toBeNull()
  })

  it('灵石只差一部分:报实际差额,不是总价', () => {
    const resources = useResourcesStore()
    usePlayerStore().major = 3
    const def = SECRET_REALMS[0]!
    const cost = entryCostOf(def, 3) as { kind: 'stone'; stone: ReturnType<typeof gn> }
    resources.spiritStone = gn(10)
    const short = entryShortfallOf(def, 3)
    expect(short?.kind).toBe('stone')
    expect(short?.stone).toEqual(subClamp(cost.stone, resources.spiritStone))
    expect(short?.stone).not.toEqual(cost.stone)
  })

  it('秘境是一次性的:已在其中不许再进;门槛不够的进不去', () => {
    ready(3)
    expect(enterSecretRealm('sr_kurong').ok).toBe(true)
    expect(enterSecretRealm('sr_kurong').ok).toBe(false)
    abandonRealm()
    expect(enterSecretRealm('sr_kuye').ok).toBe(false) // 门槛 4
    expect(enterSecretRealm('nope').ok).toBe(false)
  })

  it('秘境与历练互斥:历练途中不许入秘境,秘境之中不许开历练', () => {
    ready(3)
    const adventure = useAdventureStore()
    // 先证清场状态能开场,排除 qingyun 解锁链失败的干扰
    expect(startExploration('qingyun', 'normal')).toBe(true)
    adventure.setSession(null)
    expect(enterSecretRealm('sr_kurong').ok).toBe(true)
    expect(startExploration('qingyun', 'normal'), '在秘境内不许再开历练').toBe(false)
    adventure.setSession(null)
    abandonRealm()
    expect(startExploration('qingyun', 'normal')).toBe(true)
    expect(enterSecretRealm('sr_kurong').ok, '历练途中不许入秘境').toBe(false)
  })

  it('远征在途:秘境入口与核心拒绝同源,界面判据也认出同一原因', () => {
    ready(3)
    const endgame = useEndgameStore()
    endgame.worldRun = {
      worldId: 'chiyan',
      pactId: null,
      gateId: null,
      layer: 1,
      bonus: 0,
      rows: [],
      carriedHpPct: 1,
      totalRounds: 0,
      winStacks: 0
    }
    expect(endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)?.kind).toBe('expedition')
    expect(enterSecretRealm('sr_kurong').ok).toBe(false)
    expect(useUiStore().toasts.at(-1)?.text).toContain('远征在途')
  })

  /** 故障注入:把 busy.reason 换回手抄字面量 → 本条红。 */
  it('秘境入口拒因取自 endgameBusy 本体,核心与界面说同一句话', () => {
    ready(3)
    const endgame = useEndgameStore()
    endgame.worldRun = { worldId: 'chiyan', pactId: null, gateId: null, layer: 0, bonus: 0, rows: [], carriedHpPct: 1, totalRounds: 0, winStacks: 0 }
    const out = enterSecretRealm('sr_kurong')
    const expected = endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)!
    expect(out.reason, '核心返回的拒因就是判据本体那一句').toBe(expected.reason)
    expect(useUiStore().toasts.at(-1)?.text, 'toast 也是同一句,不再各写一份').toBe(expected.reason)
  })

  it('入口代价按地界层级折算 —— 高境界不是只贵一点', () => {
    const def = SECRET_REALMS[0]!
    expect(tierOfMajor(3)).toBeGreaterThan(0)
    expect((entryCostOf(def, 9) as { stone: { m: number } }).stone.m).toBeGreaterThan((entryCostOf(def, 3) as { stone: { m: number } }).stone.m)
  })
})

describe('秘境 · 规则是真的', () => {
  it('规则池里每条都能落到既有的战斗规则上(不是纯文本)', () => {
    expect(SECRET_RULES.length).toBeGreaterThanOrEqual(5)
    for (const r of SECRET_RULES) {
      expect(r.text.length).toBeGreaterThan(1)
      expect(Object.keys(r.rules).length, `${r.text} 没有任何可生效的规则`).toBeGreaterThan(0)
    }
  })

  it('进入时掷 1~2 条随机规则,不重复', () => {
    for (let i = 0; i < 20; i += 1) {
      setActivePinia(createPinia())
      ready(3)
      enterSecretRealm('sr_kurong')
      const st = currentRealm()!
      expect(st.rules.length).toBeGreaterThanOrEqual(1)
      expect(st.rules.length).toBeLessThanOrEqual(2)
      expect(new Set(st.rules).size).toBe(st.rules.length)
      for (const text of st.rules) expect(SECRET_RULES.some(r => r.text === text)).toBe(true)
    }
  })

  it('本境规则与随机规则都并进战斗(逐条隔离验证,不吃随机掷的运气)', () => {
    // 固定状态逐条验;用真实掷骰会时红时绿
    const base = {
      realmId: 'sr_kurong',
      enteredAt: 0,
      layer: 1,
      wins: 0,
      losses: 0,
      spoils: [],
      rules: [] as string[],
      carriedHpPct: 1,
      finished: false
    }
    // 枯荣古境自带:治疗 ×2
    expect(secretFightRules(base).healMult).toBe(2)
    expect(secretFightRules({ ...base, rules: ['回合上限 20'] }).maxRounds).toBe(20)
    // 规则合并是乘区不是覆盖:×2 遇「治疗减半」回落到 ×1
    expect(secretFightRules({ ...base, rules: ['治疗减半'] }).healMult).toBe(1)
    const l1 = secretFightRules(base, 1)
    const l3 = secretFightRules(base, SECRET_LAYERS)
    expect(l3.enemyAtkMult!).toBeGreaterThan(l1.enemyAtkMult!)
    expect(l3.enemyHpMult!).toBeGreaterThan(l1.enemyHpMult!)
  })
})

describe('秘境 · 推得动、出得来', () => {
  it('一直打到结束:状态必被清空,且结算次数有限', () => {
    ready(3)
    enterSecretRealm('sr_kurong')
    let guard = 0
    let cleared = false
    while (currentRealm() && guard < 20) {
      const r = fightSecretLayer()
      expect(r).not.toBeNull()
      if (r!.cleared) cleared = true
      guard += 1
    }
    expect(guard).toBeLessThan(20)
    expect(currentRealm()).toBeNull()
    console.log(`\n秘境 ${cleared ? '通关' : '被逐出'} · 共 ${guard} 次结算`)
  })

  it('层间按本境规则变法:枯荣古境每层之末损血', () => {
    ready(3)
    enterSecretRealm('sr_kurong')
    expect(currentRealm()!.carriedHpPct).toBe(1)
    fightSecretLayer()
    const st = currentRealm()
    if (st) {
      expect(st.carriedHpPct).toBeLessThan(1)
      expect(st.carriedHpPct).toBeGreaterThan(0)
    }
  })

  it('败满两次被逐出,状态清空', () => {
    ready(3)
    enterSecretRealm('sr_kurong')
    const st = currentRealm()!
    usePlayerStore().setSecretRealm({ ...st, carriedHpPct: 0.05 })
    let results = 0
    while (currentRealm() && results < 10) {
      fightSecretLayer()
      results += 1
    }
    expect(currentRealm()).toBeNull()
    expect(SECRET_MAX_LOSSES).toBe(2)
  })

  it('被逐出那句从 SECRET_MAX_LOSSES 现算,不再手写「两场」', () => {
    const src = readFileSync(resolve(__dirname, 'secretRealm.ts'), 'utf8')
    expect(src).toContain('cnNumber(SECRET_MAX_LOSSES)')
    expect(src, '手写的「连败两场」会在门槛改成三场时当场撒谎').not.toContain('连败两场')
  })

  it('秘境卡片在开打前摆出已败场数与剩余容错,并读同一份门槛', () => {
    const card = readFileSync(
      resolve(__dirname, '../components/adventure/SecretRealmCard.vue'),
      'utf8'
    )
    expect(card).toContain('state.losses')
    expect(card).toContain('SECRET_MAX_LOSSES')
    expect(card).not.toMatch(/再败\s*[0-9]+\s*场/)
  })

  it('放弃即出,状态清空(已得战利不退)', () => {
    ready(3)
    enterSecretRealm('sr_kurong')
    abandonRealm()
    expect(currentRealm()).toBeNull()
  })

  it('坏档修形:层数/气血/规则越界都夹回来,认不得的秘境直接作废', () => {
    const player = usePlayerStore()
    // 层数 99 会一路「通关」;气血 5 让开局算成 NaN
    player.setSecretRealm({
      realmId: 'sr_kurong',
      enteredAt: -1,
      layer: 99,
      wins: -3,
      losses: 9,
      spoils: ['旧的一行', 42 as never],
      rules: ['治疗减半', '不存在的规则'],
      carriedHpPct: 5,
      finished: 'yes' as never
    } as never)
    player.sanitize()
    const fixed = currentRealm()!
    expect(fixed.layer).toBe(SECRET_LAYERS)
    expect(fixed.carriedHpPct).toBe(1)
    expect(fixed.losses).toBe(SECRET_MAX_LOSSES)
    expect(fixed.wins).toBe(0)
    expect(fixed.rules).toEqual(['治疗减半'])
    expect(fixed.spoils).toEqual(['旧的一行'])
    expect(fixed.finished).toBe(false)
    expect(fixed.enteredAt).toBeGreaterThanOrEqual(0)

    // 认不得的秘境 id 作废,免得状态永远结算不完
    player.setSecretRealm({ ...fixed, realmId: 'sr_nope' } as never)
    player.sanitize()
    expect(currentRealm()).toBeNull()
  })

  it('秘境有非 spec 的入口 —— 骨架之所以叫骨架,就是因为没人接它', () => {
    const files = [resolve(__dirname, '../components/adventure/SecretRealmCard.vue'), resolve(__dirname, '../views/AdventureView.vue')]
    const corpus = files
      .map(f => readFileSync(f, 'utf8'))
      .join('\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(corpus).toContain('enterSecretRealm(')
    expect(corpus).toContain('fightSecretLayer(')
    expect(corpus).toContain('abandonRealm(')
    // 战报级别跟胜负走:胜 success,败 warn;同写 info 则配色与提示音分不出胜负
    expect(corpus, '秘境战报的胜级须是 success').toContain("r.win ? 'success' : 'warn'")
  })

  /**
   * 两张卡(历练页凡境册 / 试炼域天界册)共用全局单份、不分册的 `currentRealm()`,不筛就会串门。
   * 故障注入:把 state 改回 `computed(() => currentRealm())` → 本条红。
   */
  it('秘境卡的「在境中」只认本册,身在另一册时就地说明', () => {
    const src = readFileSync(resolve(__dirname, '../components/adventure/SecretRealmCard.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src, '在境中须按本册 gate 过滤').toContain("secretRealmDef(s.realmId)?.gate === props.gate ? s : null")
    expect(src, '另一册在境时要单独算出提示').toContain('const elsewhere = computed')
    expect(src, '另一册在境时不摆入口').toContain('v-if="elsewhere"')
  })
})

describe('秘境 · 两阶(凡境灵石 / 天界道源)', () => {
  it('凡境册真仙前就有,天界册要真仙(≥9)', () => {
    const player = usePlayerStore()
    player.major = 3
    expect(realmUnlock('mortal')).toBe(true)
    expect(realmUnlock('celestial')).toBe(false)
    expect(availableRealms('celestial')).toEqual([])
    player.major = 9
    expect(realmUnlock('celestial')).toBe(true)
    expect(availableRealms('celestial').length).toBeGreaterThanOrEqual(2)
    expect(availableRealms('mortal').every(r => r.gate === 'mortal')).toBe(true)
    expect(availableRealms('celestial').every(r => r.gate === 'celestial')).toBe(true)
  })

  it('天界秘境付的是道源:够则扣,不够则拒绝', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    player.major = 9
    const def = availableRealms('celestial')[0]!
    expect(enterSecretRealm(def.id).ok).toBe(false)
    expect(currentRealm()).toBeNull()

    endgame.addDaoSource(100)
    const before = endgame.daoSource
    expect(enterSecretRealm(def.id).ok).toBe(true)
    const cost = entryCostOf(def, 9) as { kind: 'daoSource'; daoSource: number }
    expect(endgame.daoSource).toBe(before - cost.daoSource)
  })

  it('道源付不出:缺口只报尚差多少,付得起后判据归空', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    player.major = 9
    const def = availableRealms('celestial')[0]!
    const cost = entryCostOf(def, 9) as { kind: 'daoSource'; daoSource: number }
    endgame.daoSource = 10
    const short = entryShortfallOf(def, 9)
    expect(short?.kind).toBe('daoSource')
    expect(short?.daoSource).toBe(cost.daoSource - 10)
    expect(short?.reason).toBe(`道源尚差 ${cost.daoSource - 10}`)

    endgame.addDaoSource(cost.daoSource - 10)
    expect(entryShortfallOf(def, 9)).toBeNull()
  })

  it('付得起时缺口判据为空,入口按钮按它启用', () => {
    const player = usePlayerStore()
    player.major = 3
    useResourcesStore().spiritStone = gn(1_000_000_000)
    expect(entryShortfallOf(SECRET_REALMS[0]!, 3)).toBeNull()
    const card = readFileSync(resolve(__dirname, '../components/adventure/SecretRealmCard.vue'), 'utf8')
    expect(card, '付不起的入口必须真的禁用,不能只降透明度').toContain(':disabled="!canPay(r)"')
    expect(card, '卡面缺口读同一份 core 判据').toContain('entryShortfallOf(r, player.major)')
    expect(card, '付不起时就地列差').toContain('entryShort(r)?.reason')
  })

  it('判据通过后扣款瞬间失败:仍点名实际缺口,不退回「灵石或道源」', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.major = 3
    resources.spiritStone = gn(1_000_000_000)
    const def = SECRET_REALMS[0]!
    const cost = entryCostOf(def, 3) as { kind: 'stone'; stone: ReturnType<typeof gn> }
    vi.spyOn(resources, 'spendStone').mockImplementation(() => {
      resources.spiritStone = gn(0)
      return false
    })
    expect(enterSecretRealm(def.id).ok).toBe(false)
    expect(useUiStore().toasts.at(-1)?.text).toBe(`灵石尚差 ${formatGN(cost.stone)}`)
    expect(currentRealm()).toBeNull()
  })

  it('代价文案与货币一致(界面上不手写)', () => {
    const mortal = SECRET_REALMS.find(r => r.gate === 'mortal')!
    const celestial = SECRET_REALMS.find(r => r.gate === 'celestial')!
    expect(entryCostText(mortal, 9)).toContain('灵石')
    expect(entryCostText(celestial, 9)).toContain('道源')
  })
})

describe('秘境 · 敌人按玩家缩放(与远征/试炼同法)', () => {
  /** 「玩家相对」口径:同一裸装玩家,真仙与神人两处秘境的敌我比值同量级 */
  const state = { realmId: 'sr_xingchen', enteredAt: 0, layer: 1, wins: 0, losses: 0, spoils: [], rules: [], carriedHpPct: 1, finished: false }

  it('敌我比值由敌人倍率决定,不随境界陡增', () => {
    const player = usePlayerStore()
    const ratioAt = (major: number): number => {
      player.major = major
      const foe = secretLayerFoe(state)
      return toNum(foe.snap.attack) / toNum(player.finalStats.attack)
    }
    const r9 = ratioAt(9)
    const r14 = ratioAt(14)
    expect(Number.isFinite(r9) && Number.isFinite(r14)).toBe(true)
    expect(r9).toBeGreaterThan(0)
    expect(Math.max(r9, r14) / Math.min(r9, r14), '两界敌我比值量级不同 —— 敌人还在按层级绝对值生成').toBeLessThan(3)
  })

  it('敌人倍率有上界:裸装玩家吃力是设计,但不该出现「绝对数值墙」', () => {
    // 裸装吃亏是设计;钉上限:敌攻不超过玩家 5 倍,结算文案有效
    const player = usePlayerStore()
    for (const major of [3, 9, 14, 20]) {
      player.major = major
      const foe = secretLayerFoe({ ...state, layer: SECRET_LAYERS })
      const ratio = toNum(foe.snap.attack) / toNum(player.finalStats.attack)
      expect(ratio, `major ${major} 的秘境敌人攻击是玩家的 ${ratio.toFixed(1)} 倍`).toBeLessThan(5)
      expect(Number.isFinite(toNum(foe.snap.maxHp))).toBe(true)
    }
    // 真打一场:不崩、不空
    player.major = 9
    ready(9)
    useEndgameStore().addDaoSource(100) // 天界秘境付道源
    expect(enterSecretRealm('sr_xingchen').ok).toBe(true)
    const r = fightSecretLayer()
    expect(r).not.toBeNull()
    expect(r!.lines.length).toBeGreaterThan(0)
    for (const line of r!.lines) expect(line).not.toContain('NaN')
  })
})

describe('秘境 · 战利倍率算得出对', () => {
  it('同一层级同一层数下,灵石战利与本境倍率成正比', () => {
    const a = secretLayerReward(10, 1, 1.2)
    const b = secretLayerReward(10, 1, 1.5)
    expect(toNum(b.stone) / toNum(a.stone)).toBeCloseTo(1.5 / 1.2, 6)
  })

  it('层数越深灵石越厚,材料只随层数(不吃倍率,免得几条产线被拉平)', () => {
    const l1 = secretLayerReward(10, 1, 1.4)
    const l3 = secretLayerReward(10, 3, 1.4)
    expect(toNum(l3.stone)).toBeGreaterThan(toNum(l1.stone))
    expect(l1.material).toBe(3)
    expect(l3.material).toBe(5)
    expect(secretLayerReward(10, 2, 9).material).toBe(secretLayerReward(10, 2, 0.1).material)
  })

  it('层级单调:同层同倍率下,高一层的战利必然更厚', () => {
    // 只钉单调性,不钉「高一层的第一层 > 低一层的第三层」:
    // 实测 11 层×1.2 倍(1.59万)< 10 层×1.5 倍第 3 层(1.74万),深层厚赏压过是设计允许
    for (let tier = 3; tier < 30; tier += 1) {
      expect(toNum(secretLayerReward(tier + 1, 2, 1.2).stone)).toBeGreaterThan(toNum(secretLayerReward(tier, 2, 1.2).stone))
    }
  })
})

/**
 * 层胜掉灵草属战斗掉落,与历练掉落同经 harvestMaterials 计照面:按掉落数抽(每批至多 3 抽),抽本境层级的灵材。
 * 故障注入:删掉 fightSecretLayer 里的 harvestMaterials、改成只抽 1 回、层级传错 → 本条红。
 */
describe('秘境 · 层胜掉灵草计照面', () => {
  function seenIn(bucket: MaterialBucket): number {
    const lore = useLoreStore()
    return MATERIALS.filter(m => m.bucket === bucket).reduce((n, m) => n + lore.seenOf(m.id), 0)
  }

  it('层胜:灵草照旧入账,同时计照面', () => {
    ready(3)
    expect(enterSecretRealm('sr_kurong').ok).toBe(true)
    const resources = useResourcesStore()
    const herb0 = resources.herb
    const ore0 = resources.ore
    const tier = tierOfMajor(3)
    // 灵材池一律取最末(最高阶)那味,其余照常掷:照面落在哪味,就钉住了按哪个层级抽
    const weighted = rng.weighted.bind(rng)
    const spy = vi
      .spyOn(rng, 'weighted')
      .mockImplementation((items, weightOf) =>
        items.length > 0 && items.every(x => MATERIALS.includes(x as MaterialDef)) ? items[items.length - 1]! : weighted(items, weightOf)
      )
    forceWin.value = true
    let r: ReturnType<typeof fightSecretLayer> = null
    let top: MaterialDef | null = null
    let low: MaterialDef | null = null
    try {
      top = rollFieldMaterial(tier, 'herb')
      low = rollFieldMaterial(1, 'herb')
      r = fightSecretLayer()
    } finally {
      forceWin.value = false
      spy.mockRestore()
    }
    expect(r?.win, '前置:本层取胜').toBe(true)
    expect(top?.id, '前置:层级不同,抽中的不同').not.toBe(low?.id)
    const { material } = secretLayerReward(tier, 1, secretRealmDef('sr_kurong')!.rewardMult)
    const draws = Math.min(3, material)
    expect(resources.herb - herb0, '灵草数照旧').toBe(material)
    expect(resources.ore, '不发玄铁').toBe(ore0)
    expect(useLoreStore().seenOf(top!.id), '按掉落数抽本境层级的灵材').toBe(draws)
    expect(seenIn('herb'), '别的灵材不计').toBe(draws)
    expect(seenIn('ore')).toBe(0)
  })
})

/**
 * 旧会话存的是旧说法「敌方多一段追击」(实装是敌方反击概率 +15%):读档归一为现行说法,规则照样生效。
 *
 * 故障注入:去掉 legacyTexts → 旧档两条红;sanitize 不归一 → 读档那条红。
 */
describe('秘境 · 反击规则的文案与旧档', () => {
  const NEW = '敌方反击概率 +15%'
  const OLD = '敌方多一段追击'
  const base = {
    realmId: 'sr_kurong',
    enteredAt: 1,
    layer: 1,
    wins: 0,
    losses: 0,
    spoils: [] as string[],
    rules: [] as string[],
    carriedHpPct: 1,
    finished: false
  }

  it('文案与实装一致:写的是反击,不是追击', () => {
    const rule = SECRET_RULES.find(r => r.rules.enemyExtraMods?.counterRate !== undefined)!
    expect(rule.text).toBe(NEW)
    expect(rule.rules.enemyExtraMods!.counterRate).toBeCloseTo(0.15)
    expect(SECRET_RULES.some(r => r.text.includes('追击'))).toBe(false)
  })

  it('旧文案只作别名:不与现行文案重名,且只认一条规则', () => {
    const current = new Set(SECRET_RULES.map(r => r.text))
    for (const r of SECRET_RULES) {
      for (const old of r.legacyTexts ?? []) {
        expect(current.has(old), old).toBe(false)
        expect(SECRET_RULES.filter(x => x.legacyTexts?.includes(old))).toHaveLength(1)
      }
    }
    expect(secretRuleByText(OLD)?.text).toBe(NEW)
    expect(secretRuleByText(NEW)?.text).toBe(NEW)
    expect(secretRuleByText('不存在的规则')).toBeUndefined()
  })

  it('旧档存着旧文案:读档后显示新文案,反击概率照样并入敌方', () => {
    const player = usePlayerStore()
    player.setSecretRealm({ ...base, rules: [OLD, '治疗减半'] })
    player.sanitize()
    const st = currentRealm()!
    expect(st.rules).toEqual([NEW, '治疗减半'])
    const rules = secretFightRules(st)
    expect(rules.enemyExtraMods?.counterRate).toBeCloseTo(0.15)
    // 枯荣古境自带治疗 ×2,与「治疗减半」相乘回到 ×1:另一条规则没被归一顺手丢掉
    expect(rules.healMult).toBe(1)
  })

  it('未经读档清洗的旧文案,反查照样认得', () => {
    expect(secretFightRules({ ...base, rules: [OLD] }).enemyExtraMods?.counterRate).toBeCloseTo(0.15)
  })

  it('新旧文案同时在档里只算一次,不叠成 +30%', () => {
    const player = usePlayerStore()
    player.setSecretRealm({ ...base, rules: [OLD, NEW] })
    player.sanitize()
    expect(currentRealm()!.rules).toEqual([NEW])
    expect(secretFightRules(currentRealm()!).enemyExtraMods?.counterRate).toBeCloseTo(0.15)
  })

  it('新文案能被掷到,落档即是新文案,并入战斗', () => {
    ready(3)
    const idx = SECRET_RULES.findIndex(r => r.text === NEW)
    expect(idx).toBeGreaterThanOrEqual(0)
    // 掷 1 条,抽中反击那条
    const spy = vi.spyOn(rng, 'int').mockImplementationOnce(() => 1).mockImplementationOnce(() => idx)
    try {
      expect(enterSecretRealm('sr_kurong').ok).toBe(true)
    } finally {
      spy.mockRestore()
    }
    const st = currentRealm()!
    expect(st.rules).toEqual([NEW])
    expect(secretFightRules(st).enemyExtraMods?.counterRate).toBeCloseTo(0.15)
  })
})

/**
 * 界面「此地规则」原只报 state.rules(进场随机抽的那一两条),
 * 而秘境自带规则(归墟之眼:攻 ×1.25 / 敌血 ×1.2 / 回合上限 25)全程作用于战斗却从不显示。
 * 故障注入:把 secretRuleTexts 改回只返回 state.rules,本条红。
 */
describe('秘境 · 自带规则也要报给玩家', () => {
  it('归墟之眼:三条自带规则与随机规则一并出现在文案里', () => {
    const st = {
      realmId: 'sr_guixu',
      enteredAt: 1,
      layer: 1,
      wins: 0,
      losses: 0,
      spoils: [],
      rules: ['治疗减半'],
      carriedHpPct: 1,
      finished: false
    }
    const texts = secretRuleTexts(st)
    expect(texts, '自带回合上限没报出来 —— 玩家不知道这场只有 25 回合').toContain('回合上限 25')
    expect(texts.some(t => t.includes('敌方气血')), '敌方气血加成没报出来').toBe(true)
    expect(texts.some(t => t.includes('我方攻击')), '我方攻击加成没报出来').toBe(true)
    // 随机规则跟在自带规则之后,一条不丢
    for (const rolled of st.rules) expect(texts, `随机规则「${rolled}」被吞了`).toContain(rolled)
  })

  it('自带规则文案随 rules 走:改数值即改文案,不靠手抄', () => {
    for (const def of SECRET_REALMS) {
      const texts = intrinsicRuleTexts(def)
      // 每一项 rules 都至少产出一条文案(空 rules 的秘境除外)
      if (Object.keys(def.rules).length > 0) {
        expect(texts.length, `${def.name} 有自带规则却一条文案都没有`).toBeGreaterThan(0)
      }
      for (const line of texts) expect(line, `${def.name} 文案里出现 undefined`).not.toContain('undefined')
    }
  })
})
