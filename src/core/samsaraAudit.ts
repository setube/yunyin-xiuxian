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
 *   遗产(应继承):知识、丹方、认知、履历、道果、成就
 *   状态(应重建):境界、肉身、资源、装备、洞府、持有丹药
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
import { DAO_FRUIT_COMBAT_BONUS, TALENT_DRAW_DIV, VEIN_MAIN_CAPACITY, VEIN_TOTAL_CAPACITY } from '@/data/constants'
import { VEINS } from '@/data/veins'
import { TALENTS } from '@/data/talents'
import { MAX_MAJOR } from '@/data/realms'
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
    mode: 'partial',
    detail: '每座建筑等级折半(向下取整)',
    kind: 'state',
    power: 'mid',
    compressesGrowth: true
  },
  {
    id: 'gongfa',
    name: '功法',
    mode: 'partial',
    detail: 'carryGongfa 层数折半;顶阶宿慧可留一门不折',
    kind: 'state',
    power: 'high',
    compressesGrowth: true
  },
  {
    id: 'daoFruit',
    name: '道果',
    mode: 'full',
    detail: `每世凝 ${daoFruitGain(MAX_MAJOR, 9)} 枚(修满真仙口径),永不清零`,
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
    mode: 'full',
    detail: 'rebirth() 未重置 petId,灵兽 mods 直接带入下一世',
    kind: 'state',
    power: 'mid',
    compressesGrowth: true
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
    mode: 'full',
    detail: `veinPoints/veinMain 完全不重置;满投 ${VEIN_TOTAL_CAPACITY} 点后封顶,主脉修速 +${(VEIN_TOTAL_CAPACITY * 0.4).toFixed(0)}%`,
    kind: 'state',
    power: 'mid',
    compressesGrowth: true
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
    mode: 'full',
    detail: 'rebirth() 未重置 regionStats/suppressedRegions/nemeses',
    kind: 'state',
    power: 'none',
    compressesGrowth: false
  }
]

// ---------------- 跨世永久量的累积 ----------------

/** 修满真仙再转世时,每世凝得的道果 */
export const FRUIT_PER_LIFE = daoFruitGain(MAX_MAJOR, 9)

/** 走完 n 世后累积的道果总数 */
export function daoFruitAfterLives(lives: number): number {
  return Math.max(0, lives) * FRUIT_PER_LIFE
}

/** 走完 n 世后持有的天赋数(每世 1 + major/DIV,封顶于天赋总数) */
export function talentsAfterLives(lives: number): number {
  const perLife = 1 + Math.floor(MAX_MAJOR / TALENT_DRAW_DIV)
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
 * 灵脉的跨世修速加成。
 * veinPoints 完全不重置,故第二世起就带着上一世投满的灵脉出生。
 * 与道果不同,它满投 VEIN_TOTAL_CAPACITY 点即封顶——是有界项,
 * 但这个界本身不低(全投主脉 +40% 修速),且第二世就能吃满
 */
export function veinCultBonusAt(lives: number): number {
  if (lives <= 0) return 0
  const perPoint = VEINS.find(v => v.id === 'gather')?.perPoint.cultivationSpeed ?? 0
  // 保守口径:玩家把主脉投满(VEIN_MAIN_CAPACITY),其余投别脉不计修速
  return perPoint * VEIN_MAIN_CAPACITY
}

/** 第 n 世的修行假设:灵根取典型值,天赋与灵脉按已积累量折算 */
function assumptionsAt(lives: number): SimAssumptions {
  return { linggenMult: 1.6, talentCultBonus: talentCultBonusAt(lives - 1) + veinCultBonusAt(lives - 1) }
}

/**
 * 第 n 世从炼气修到真仙所需小时。
 * 道果与天赋都按「上一世结束时」的存量计——这一世出生就带着它们
 */
export function hoursToPeakAt(lives: number): number {
  return hoursToReach(MAX_MAJOR, daoFruitAfterLives(lives - 1), assumptionsAt(lives))
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
