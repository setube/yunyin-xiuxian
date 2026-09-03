/**
 * 浅轮回收益面审计
 *
 * 结论已定:深修是**阶段性内容投资**(拿一次永久继承),不该被强行做成
 * 每世可重复的收益;金丹作为最快的道果农场也予以承认。
 *
 * 但还剩一个必须回答的问题:
 * **金丹轮回一世,到底能永久推进哪些东西?**
 *
 * 判据很简单:
 *   若只有道果 → 健康。玩家是在「刷资源」与「探索内容」之间做选择。
 *   若还能大量推进其他永久资产 → 浅轮回的收益面过宽,
 *     那才是「反复轮回却觉得没意义」的真正来源——
 *     因为什么都在涨,却没有一样是非深修不可的。
 *
 * 本模块只做度量,不改数值。
 */
import { daoFruitGain } from './formulas'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { TALENTS } from '@/data/talents'
import { PETS } from '@/data/pets'
import { MENTORS } from '@/data/mentors'
import { ACHIEVEMENTS } from '@/data/achievements'
import { INSIGHT_PER_LIFE_REALM } from '@/data/samsara'
import { TALENT_DRAW_DIV, VEIN_TOTAL_CAPACITY } from '@/data/constants'

/** 一项永久资产在浅轮回下的推进性质 */
export type ProgressKind =
  /** 每世都能再推一点,且无上限 */
  | 'unbounded'
  /** 每世都能推,但会封顶 */
  | 'capped'
  /** 只能拿一次,之后轮回再多也不动 */
  | 'onetime'
  /** 金丹够不着 */
  | 'gated'

export interface ShallowGainRow {
  id: string
  name: string
  kind: ProgressKind
  /** 每世推进量的描述 */
  perLife: string
  /** 上限(capped 时有意义);null 表示无限或不适用 */
  cap: number | null
  /** 从零推满需要多少世(仅 capped) */
  livesToCap: number | null
  evidence: string
}

const GOLD = MANUAL_REBIRTH_MIN_MAJOR
/** 金丹世每次轮回抽到的天赋数 */
const TALENT_PER_LIFE = 1 + Math.floor(GOLD / TALENT_DRAW_DIV)

/**
 * 金丹轮回的永久收益清单。
 * 逐条对照 confirmReincarnation 与各 store 的重置逻辑核实
 */
export const SHALLOW_GAINS: ShallowGainRow[] = [
  {
    id: 'daoFruit',
    name: '道果',
    kind: 'unbounded',
    perLife: `+${daoFruitGain(GOLD, 9)} 枚`,
    cap: null,
    livesToCap: null,
    evidence: 'player.addDaoFruit(view.daoFruitGained),永不清零且无上限'
  },
  {
    id: 'insight',
    name: '宿慧',
    kind: 'unbounded',
    perLife: `+${(GOLD + 1) * INSIGHT_PER_LIFE_REALM}`,
    cap: null,
    livesToCap: null,
    evidence: `lifeInsight = (major+1)×${INSIGHT_PER_LIFE_REALM};player.addInsight 每世入账,无上限`
  },
  {
    id: 'talents',
    name: '先天之姿',
    kind: 'capped',
    perLife: `+${TALENT_PER_LIFE} 项`,
    cap: TALENTS.length,
    livesToCap: Math.ceil(TALENTS.length / TALENT_PER_LIFE),
    evidence: `每世抽 1 + floor(major/${TALENT_DRAW_DIV}) 项;真实存档 17 世正好集满 ${TALENTS.length} 项`
  },
  {
    id: 'veins',
    name: '灵脉',
    kind: 'capped',
    perLife: '视本世灵石产出',
    cap: VEIN_TOTAL_CAPACITY,
    livesToCap: null,
    evidence: '灵石每世清零但 veinPoints 跨世保留,可逐世累积投满'
  },
  {
    id: 'pets',
    name: '灵兽',
    kind: 'capped',
    perLife: '事件掉落,概率推进',
    cap: PETS.length,
    livesToCap: null,
    evidence: '发放事件无 minRealm,标签 general/forest;图鉴 collect 与 petId 均跨世保留'
  },
  {
    id: 'lore',
    name: '认知(材料/丹方/敌手/技艺)',
    kind: 'capped',
    perLife: '日常行为持续推进',
    cap: null,
    livesToCap: null,
    evidence: 'noteEnemy 走探索、studyRecipe 走藏经阁被动钻研;lore store 完全不重置,金丹世照样在长'
  },
  {
    id: 'achievements',
    name: '成就与图鉴',
    kind: 'capped',
    perLife: '按行为解锁',
    cap: ACHIEVEMENTS.length,
    livesToCap: null,
    evidence: 'quests store 不参与轮回重置;真实存档两位玩家均已 48/50'
  },
  {
    id: 'mentor',
    name: '师承',
    kind: 'onetime',
    perLife: '—',
    cap: MENTORS.length,
    livesToCap: null,
    evidence: 'adoptMentor 有 `if (mentor.value !== null) return`,一世只能拜一位且跨世保留'
  },
  {
    id: 'daoSource',
    name: '道源与道痕',
    kind: 'gated',
    perLife: '—',
    cap: null,
    livesToCap: null,
    evidence: 'endgameUnlocked() 要求 major >= MAX_MAJOR,金丹够不着'
  }
]

export interface ShallowSummary {
  unbounded: ShallowGainRow[]
  capped: ShallowGainRow[]
  onetime: ShallowGainRow[]
  gated: ShallowGainRow[]
  /** 金丹轮回能推进的项数(unbounded + capped) */
  progressable: number
}

export function summarizeShallow(): ShallowSummary {
  const by = (k: ProgressKind): ShallowGainRow[] => SHALLOW_GAINS.filter(g => g.kind === k)
  const unbounded = by('unbounded')
  const capped = by('capped')
  return {
    unbounded,
    capped,
    onetime: by('onetime'),
    gated: by('gated'),
    progressable: unbounded.length + capped.length
  }
}
