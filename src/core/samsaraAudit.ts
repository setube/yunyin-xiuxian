/**
 * 轮回继承审计
 *
 * 起因是玩家反馈「轮回次数太多没有意义」。诊断指向一件事:
 * 轮回若不制造代价,就退化成「存档继承后重新跑一遍」的 New Game+。
 *
 * 本模块只做度量,不改任何数值——先把「玩家轮回一次后到底还需要重新经历多少」
 * 量化出来,再谈砍什么。
 *
 * 核心原则(拿来当判据用):**保留「我是谁」,重置「我现在拥有多少」。**
 *   遗产(应继承)= 记忆 / 精神 / 灵魂:认知与丹方、履历与成就、道果与天赋与宿慧、
 *     称号(荣誉)、师承(道统)、道源与道痕、世界记忆(镇压资格/宿敌/机缘选择)
 *   状态(应重建)= 皮囊 / 外物:境界与修为、灵石与灵材、装备与法宝、丹药、
 *     灵兽、洞府建筑、灵脉投资、区域进度、本世之界、进行中的秘境/事件、连胜
 *
 * 本清单要求**最小完备**:凡有跨世去留的功能都必须在此登记一行(见 samsaraAudit.spec
 * 的「覆盖度」一条),既不留半截状态,也不漏掉一个子系统。
 *
 * 关键读数不是「出生战力继承了多少」——境界从真仙掉回炼气,出生战力必然极低。
 * 真正决定轮回有无意义的是 **追平时间**:第 N 世重修回上一世终点要花多久。
 * 若第 10 世只需第 1 世的零头,那这一世就没有「重新经历」可言。
 *
 * ⚠ 口径警告(saveCalibration 用真实存档验出):
 * 本模块的 hoursToPeakAt 建立在 progressionSim 之上,而后者**高估约 100~400 倍**——
 * 它算的是「纯修为累积需要多少秒」,真实玩家的修为绝大部分来自战斗、事件、
 * 丹药与离线收益。且它假设「每世都修满真仙」,而实测玩家在元婴到合体之间就转世。
 *
 * 因此:**比值可用,绝对值不可用**。
 *   可信:第 N 世 ÷ 第 1 世、兑现度、边际收益——偏差是同一系数,做除法时约掉
 *   作废:任何「第 N 世需要 X 小时」的读数
 * 引用本模块出绝对时长的结论前,先看 saveCalibration.spec.ts
 */
import { DAO_FRUIT_COMBAT_BONUS, TALENT_DRAW_DIV } from '@/data/constants'
import { TALENTS } from '@/data/talents'
import { REBIRTH_REFERENCE_MAJOR } from '@/data/realms'
import type { StatMods } from '@/types'
import { daoFruitGain } from './formulas'
import { effectiveDaoFruit } from './statsCalc'
import { hoursToReach, type SimAssumptions } from './progressionSim'

/** 继承方式 */
export type HeritageMode = 'full' | 'partial' | 'reset'

export interface HeritageRow {
  id: string
  name: string
  mode: HeritageMode
  /** 代码中的实际处理(核实过,非设计文档口径) */
  detail: string
  /** 属于「遗产」(我是谁)还是「状态」(我拥有多少) */
  kind: 'legacy' | 'state'
  /** 对战力的直接贡献:none / low / mid / high */
  power: 'none' | 'low' | 'mid' | 'high'
  /** 是否压缩下一世的成长空间——这一列才是要盯的 */
  compressesGrowth: boolean
}

/**
 * 当前实际的继承清单。
 * 逐条对照 confirmReincarnation 核实,不采信设计文档或记忆
 */
export const HERITAGE: HeritageRow[] = [
  {
    id: 'realm',
    name: '境界与修为',
    mode: 'reset',
    detail: 'rebirth() 将 major/sub/exp 归零,年龄回到 START_AGE',
    kind: 'state',
    power: 'high',
    compressesGrowth: false
  },
  {
    id: 'equipment',
    name: '装备',
    mode: 'reset',
    detail: 'items = [] 且 equipped = {},佩戴与行囊一并清空',
    kind: 'state',
    power: 'high',
    compressesGrowth: false
  },
  {
    id: 'pills',
    name: '丹药',
    mode: 'reset',
    detail: 'pills = {}',
    kind: 'state',
    power: 'mid',
    compressesGrowth: false
  },
  {
    id: 'artifacts',
    name: '法宝',
    mode: 'reset',
    detail: 'artifacts = [] 且 equippedArtifacts = []',
    kind: 'state',
    power: 'high',
    compressesGrowth: false
  },
  {
    id: 'materials',
    name: '材料与灵石',
    mode: 'reset',
    detail: 'spiritStone/qi/wudao/herb/ore/page/dust 全部归零',
    kind: 'state',
    power: 'low',
    compressesGrowth: false
  },
  {
    id: 'regions',
    name: '区域进度',
    mode: 'reset',
    detail: 'unlocked 退回 qingyun,cleared 清空',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'buildings',
    name: '洞府建筑',
    mode: 'reset',
    detail: 'dongfu.resetForRebirth() 将每座建筑等级归零 —— 屋舍是外物,随皮囊散去',
    kind: 'state',
    power: 'mid',
    compressesGrowth: false
  },
  {
    id: 'gongfa',
    name: '功法',
    mode: 'partial',
    detail: '记得哪些功法(门类)是记忆,留下;练到几层是修为进度,归零回一层;顶阶宿慧可留一门满层',
    kind: 'state',
    power: 'high',
    compressesGrowth: true
  },
  {
    id: 'daoFruit',
    name: '道果',
    mode: 'full',
    detail: `每世凝 ${daoFruitGain(REBIRTH_REFERENCE_MAJOR, 9)} 枚(修满人间界并飞升真仙口径),永不清零`,
    kind: 'legacy',
    power: 'high',
    compressesGrowth: true
  },
  {
    id: 'talents',
    name: '先天之姿',
    mode: 'full',
    detail: `每世得 1 + major/${TALENT_DRAW_DIV} 项,共 ${TALENTS.length} 项可集齐`,
    kind: 'legacy',
    power: 'high',
    compressesGrowth: true
  },
  {
    id: 'heritage',
    name: '宿命传承',
    mode: 'full',
    detail: 'reincarnation.heritage 随神魂不灭,跨世不清零;每世至多锻造最深一道未入门槛(见 core/heritageForge),重复锻造被忽略',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'insight',
    name: '宿慧',
    mode: 'full',
    detail: '决定阶位,影响功法保留档与认知补齐量;不直接给战力',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: true
  },
  {
    id: 'title',
    name: '称号',
    mode: 'full',
    detail: 'rebirth() 未重置 titleId,称号 mods 直接带入下一世',
    kind: 'state',
    power: 'mid',
    compressesGrowth: true
  },
  {
    id: 'pet',
    name: '灵兽',
    mode: 'reset',
    detail: 'rebirth() 调 setPet(null) —— 灵兽是相伴的外物,下一世要与新的灵兽相识',
    kind: 'state',
    power: 'mid',
    compressesGrowth: false
  },
  {
    id: 'mentor',
    name: '师承',
    mode: 'full',
    detail: 'rebirth() 未重置 mentor,师承 mods 直接带入下一世',
    kind: 'state',
    power: 'mid',
    compressesGrowth: true
  },
  {
    id: 'veins',
    name: '灵脉投资',
    mode: 'reset',
    detail: 'dongfu.resetForRebirth() 清空 veinPoints/veinMain —— 灵脉投资是外物,每世从零重投(旧稿曾满投封顶后跨世保留)',
    kind: 'state',
    power: 'mid',
    compressesGrowth: false
  },
  {
    id: 'lore',
    name: '认知(丹方/药性/器纹/敌手)',
    mode: 'full',
    detail: 'lore store 整体不清,另按宿慧阶位 carryLore 补齐',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'quests',
    name: '成就与图鉴',
    mode: 'full',
    detail: 'quests store 不参与轮回重置',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'endgame',
    name: '道源与道痕',
    mode: 'partial',
    detail: 'onRebirth 只归还道途,道源/道痕/纪录随神魂不灭',
    kind: 'legacy',
    power: 'low',
    compressesGrowth: false
  },
  {
    id: 'suppress',
    name: '区域镇压与宿敌',
    mode: 'partial',
    detail:
      '镇压收益与资格是「我拥有多少」:旧世压下的远境若跨世,新世炼气仍按旧阶位派发高阶装备/灵石,数值当场爆炸(玩家实报)。故 rebirth() 清空 suppressedRegions/suppressedSince/suppressQualified —— 妖气复聚、回到历练地;sanitize 还兜「修复前已转世的老档」同款(清掉 minRealm>当前境界的残留)。regionStats 战绩与 nemeses 宿敌仍随神魂不灭(「世界记得你」的叙事与石碑不丢)',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  // ---- 补全:此前未被清单收录、却同样有跨世去留的功能 ----
  {
    id: 'secretRealm',
    name: '短期秘境',
    mode: 'reset',
    detail: 'player.rebirth() 置 secretRealm=null —— 进行中的一次性内容随本世结束',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'regionEvent',
    name: '区域动态事件',
    mode: 'reset',
    detail: 'player.rebirth() 置 regionEvent=null(临时异象不该跨世)',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'mortalWorld',
    name: '本世之界',
    mode: 'reset',
    detail: 'rerollMortalWorld() 每世换一方天地(与上一世去重)',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'fortuneMemory',
    name: '机缘与际遇记忆',
    mode: 'full',
    detail: 'fortuneChoices / eventChains / eventMemories 不清 —— 「世界记得你的选择」',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'bonds',
    name: '道友',
    mode: 'partial',
    detail: '关系归档入履历(archiveBond),人不留下;留的是曾同行这件事',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'trial',
    name: '逆旅契',
    mode: 'reset',
    detail: '契随皮囊散去,下一世要签得重新花道果(setLifeTrial(null))',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'streak',
    name: '连胜与当日巡游',
    mode: 'reset',
    detail: 'winStreak / lastCaveEventDay 归零 —— 属「这一世」的当下进度',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'linggen',
    name: '灵根',
    mode: 'reset',
    detail: 'rebirth() 重掷灵根;资质地板随宿慧上浮(aptitudeFloorNow)',
    kind: 'state',
    power: 'high',
    compressesGrowth: false
  },
  // ---- 补全(Phase 34.8):本轮新加的三处状态与一处身份,此前清单里没有 ----
  {
    id: 'divination',
    name: '问卦所得之卦',
    mode: 'reset',
    detail: 'rebirth() 置 divination=null —— 卦是「此一时的时机」,不是「我是谁」',
    kind: 'state',
    power: 'low',
    compressesGrowth: false
  },
  {
    id: 'breakthroughPrep',
    name: '突破准备(静坐/聚气丹)',
    mode: 'reset',
    detail: 'rebirth() 置 breakthroughPrep=null —— 下一世要重新备;未用完的一次性加成也不跨世',
    kind: 'state',
    power: 'low',
    compressesGrowth: false
  },
  {
    id: 'enlightenmentAt',
    name: '悟道频次(顿悟冷却)',
    mode: 'full',
    detail: 'enlightenmentAt 不随转世清零 —— 它是频次闸不是本世进度;清了就能靠转世刷顿悟',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'name',
    name: '道号',
    mode: 'reset',
    detail: 'rebirth() 每世重掷新道号 —— 神魂不灭带走的是所知所历,不是名号;新的皮囊换新的名(见 stores/player.rebirth)',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'reincarnationCount',
    name: '转世次数',
    mode: 'full',
    detail: 'reincarnation.count 只增不减 —— 每世道果与天赋的发放都按它计',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: true
  },
  {
    id: 'lives',
    name: '历世履历',
    mode: 'full',
    detail: 'confirmReincarnation 里 recordLife 逐世归档,只增不改(修仙录据此成书)',
    kind: 'legacy',
    power: 'none',
    compressesGrowth: false
  },
  {
    id: 'vow',
    name: '本世命题',
    mode: 'reset',
    detail: 'beginLife() 每世重立;上一世的题只入履历与宿慧,不再参与本世结算',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  }
]

// ---------------- 跨世永久量的累积 ----------------

export interface HeritageGroup {
  mode: HeritageMode
  /** 界面用语:这一组是「带走」还是「放下」 */
  title: string
  rows: HeritageRow[]
}

/**
 * 按去留分组的继承清单 —— 界面(轮回结算)与审计共用同一份,
 * 保证玩家看到的「带走/放下」与代码实际交割不会分叉。
 */
export function heritageGroups(): HeritageGroup[] {
  const titles: Record<HeritageMode, string> = {
    full: '随神魂带走',
    partial: '折损带走',
    reset: '随皮囊放下'
  }
  return (['full', 'partial', 'reset'] as const).map(mode => ({
    mode,
    title: titles[mode],
    rows: HERITAGE.filter(r => r.mode === mode)
  }))
}

/** 修满人间界并飞升真仙再转世时,每世凝得的道果 */
export const FRUIT_PER_LIFE = daoFruitGain(REBIRTH_REFERENCE_MAJOR, 9)

/** 走完 n 世后累积的道果总数 */
export function daoFruitAfterLives(lives: number): number {
  return Math.max(0, lives) * FRUIT_PER_LIFE
}

/** 走完 n 世后持有的天赋数(每世 1 + major/DIV,封顶于天赋总数) */
export function talentsAfterLives(lives: number): number {
  const perLife = 1 + Math.floor(REBIRTH_REFERENCE_MAJOR / TALENT_DRAW_DIV)
  return Math.min(TALENTS.length, Math.max(0, lives) * perLife)
}

/** 天赋按数量估算的修速加成(取全集平均值线性外推) */
export function talentCultBonusAt(lives: number): number {
  const total = TALENTS.reduce((sum, t) => sum + (t.mods.cultivationSpeed ?? 0), 0)
  const avg = TALENTS.length > 0 ? total / TALENTS.length : 0
  return avg * talentsAfterLives(lives)
}

/** 天赋按数量估算的战力加成(攻击向,同上口径) */
export function talentPowerBonusAt(lives: number): number {
  const total = TALENTS.reduce((sum, t) => sum + modSum(t.mods), 0)
  const avg = TALENTS.length > 0 ? total / TALENTS.length : 0
  return avg * talentsAfterLives(lives)
}

function modSum(mods: StatMods): number {
  let sum = 0
  for (const k in mods) {
    const v = mods[k as keyof StatMods]
    if (typeof v === 'number' && v > 0) sum += v
  }
  return sum
}

/** 第 n 世出生时携带的永久战力乘数(道果 + 天赋) */
export function permanentPowerMultAt(lives: number): number {
  const fruit = effectiveDaoFruit(daoFruitAfterLives(lives)) * DAO_FRUIT_COMBAT_BONUS
  return 1 + fruit + talentPowerBonusAt(lives)
}

// ---------------- 追平时间:轮回是否还有「重新经历」 ----------------

export interface PaceRow {
  /** 第几世(1 = 第一世) */
  life: number
  daoFruit: number
  talents: number
  /** 该世从零修到真仙所需小时 */
  hoursToPeak: number
  /** 相对第一世的耗时比例 */
  vsFirstLife: number
  /** 该世出生时携带的永久战力乘数 */
  permanentMult: number
}

/**
 * 第 n 世的修行假设:灵根取典型值,天赋按已积累量折算。
 * 灵脉不再计入 —— 地脉是外物,每世从零重投(见 HERITAGE 的 veins 一行)。
 */
function assumptionsAt(lives: number): SimAssumptions {
  return { linggenMult: 1.6, talentCultBonus: talentCultBonusAt(lives - 1) }
}

/**
 * 第 n 世从炼气修到真仙所需小时。
 * 道果与天赋都按「上一世结束时」的存量计——这一世出生就带着它们
 */
export function hoursToPeakAt(lives: number): number {
  return hoursToReach(REBIRTH_REFERENCE_MAJOR, daoFruitAfterLives(lives - 1), assumptionsAt(lives))
}

export function pacePerLife(lifeList: number[]): PaceRow[] {
  const first = hoursToPeakAt(1)
  return lifeList.map(life => {
    const hours = hoursToPeakAt(life)
    return {
      life,
      daoFruit: daoFruitAfterLives(life - 1),
      talents: talentsAfterLives(life - 1),
      hoursToPeak: hours,
      vsFirstLife: first > 0 ? hours / first : 1,
      permanentMult: permanentPowerMultAt(life - 1)
    }
  })
}

// ---------------- 汇总判据 ----------------

export interface HeritageSummary {
  /** 完整继承的条目数 */
  fullCount: number
  partialCount: number
  resetCount: number
  /** 压缩下一世成长空间的条目 */
  compressing: HeritageRow[]
  /** 属于「状态」却被完整继承的——违反「重置我拥有多少」原则 */
  stateButFull: HeritageRow[]
}

export function summarize(rows: HeritageRow[] = HERITAGE): HeritageSummary {
  return {
    fullCount: rows.filter(r => r.mode === 'full').length,
    partialCount: rows.filter(r => r.mode === 'partial').length,
    resetCount: rows.filter(r => r.mode === 'reset').length,
    compressing: rows.filter(r => r.compressesGrowth),
    stateButFull: rows.filter(r => r.kind === 'state' && r.mode === 'full')
  }
}
