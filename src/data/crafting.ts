/**
 * 百工技艺谱(Phase 32.3)
 *
 * 三条铁律:
 * 1. 技艺不是职业。没有选择、没有加点、没有转职——做什么长什么,做得多就精。
 * 2. 技艺不是单一等级。「炼丹 Lv.30」这种一刀切的口径在此不存在,
 *    辨得出药未必配得好伍,配得好伍未必凝得成丹。
 * 3. 技艺(做得到)与知识(知道怎么做)分开计量。知识在 stores/lore.ts 的认知度里。
 */
import type { PillDef } from '@/types'
import { MATERIALS, type MaterialDef } from './materials'

export type SkillId =
  // 识材道(炼丹炼器共用)
  | 'discern'
  // 炼丹道
  | 'herbLore'
  | 'pairing'
  | 'condense'
  | 'temper'
  | 'nurture'
  // 灵火道(共用;Phase 32.5 再拆成引火/控温/分焰/聚焰/融焰/护炉/收火)
  | 'flame'
  // 炼器道
  | 'smithing'
  | 'inscribe'

export type DaoId = 'shicai' | 'liandan' | 'linghuo' | 'lianqi'

export interface SkillDef {
  id: SkillId
  name: string
  dao: DaoId
  /** 这项技艺具体管什么(玩家可见) */
  desc: string
  /** 练不到家时会发生什么(玩家可见,替代枯燥的数值说明) */
  lackText: string
}

export const DAO_NAMES: Record<DaoId, string> = {
  shicai: '识材道',
  liandan: '炼丹道',
  linghuo: '灵火道',
  lianqi: '炼器道'
}

export const SKILLS: SkillDef[] = [
  { id: 'discern', name: '识材', dao: 'shicai', desc: '认出眼前是什么灵材', lackText: '采回来的东西堆在角落,你叫不出它的名字。' },
  { id: 'herbLore', name: '辨药', dao: 'liandan', desc: '通晓药性寒热与毒理', lackText: '寒热不分,烈药下炉便是一炉焦糊。' },
  { id: 'pairing', name: '配伍', dao: 'liandan', desc: '定君臣佐使,调和相冲药性', lackText: '药性在炉中互斗,成丹药力散乱。' },
  { id: 'condense', name: '凝丹', dao: 'liandan', desc: '聚散乱药力为丹形', lackText: '火候到了却聚不拢,药液在炉底摊成一片。' },
  { id: 'temper', name: '淬药', dao: 'liandan', desc: '逼出杂质,提纯药力', lackText: '丹是成了,药力却虚浮不实。' },
  { id: 'nurture', name: '养丹', dao: 'liandan', desc: '温养护持,压住残毒', lackText: '出炉即散气,毒性也压不住。' },
  { id: 'flame', name: '控火', dao: 'linghuo', desc: '引火、控温、护炉', lackText: '炉温忽高忽低,越好的方子越经不起你这么烧。' },
  { id: 'smithing', name: '锻打', dao: 'lianqi', desc: '千锤定形,逼出材质本性', lackText: '锤下去的是力气,不是形。' },
  { id: 'inscribe', name: '铭纹', dao: 'lianqi', desc: '刻纹引灵,使器通灵', lackText: '纹刻得工整,却是死纹,引不进一丝灵气。' }
]

export const SKILL_IDS = SKILLS.map(s => s.id)

const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]))

export function skillDef(id: SkillId): SkillDef | undefined {
  return SKILL_BY_ID.get(id)
}

// ============ 熟练度曲线 ============

/**
 * 累积经验 → 熟练度 0~100。
 * 双曲饱和:永远逼近 100 而不到顶——技艺无"练满"一说,也就不存在满级通吃。
 */
export const SKILL_EXP_SCALE = 600

export function skillLevelFromExp(exp: number): number {
  const e = Math.max(0, exp)
  return (100 * e) / (e + SKILL_EXP_SCALE)
}

/** 技艺境地:用叙事分档代替裸数字,避免玩家把技艺读成"等级" */
const SKILL_STAGES: readonly { min: number; name: string }[] = [
  { min: 94, name: '大成' },
  { min: 85, name: '通玄' },
  { min: 72, name: '精通' },
  { min: 58, name: '娴熟' },
  { min: 40, name: '小成' },
  { min: 25, name: '入门' },
  { min: 10, name: '初识' },
  { min: 0, name: '生疏' }
]

export function skillStageName(level: number): string {
  return SKILL_STAGES.find(s => level >= s.min)?.name ?? '生疏'
}

// ============ 丹方工艺表 ============

export interface RecipeCraft {
  /** 丹方阶位 1~9。超出自身可承受阶位不是不能炼,是极难炼 */
  rank: number
  /** 用到的灵材(君臣佐使,首味为君药) */
  materials: readonly string[]
  /** 这张方子吃重哪几项技艺,权重和为 1 */
  skills: Readonly<Partial<Record<SkillId, number>>>
}

/** 少数有特写工艺的丹方:其余按下方规则推导 */
const CRAFT_OVERRIDES: Readonly<Record<string, Partial<RecipeCraft>>> = {
  // 破境丹:成败全在凝丹一步
  p_pojing: { skills: { condense: 0.4, flame: 0.22, pairing: 0.18, herbLore: 0.1, temper: 0.1 } },
  // 玄冥护体丹:阴寒药性极难压,配伍为要
  p_xuanming: { materials: ['mat_xuanyin', 'mat_hansui', 'mat_jiuye'], skills: { pairing: 0.38, herbLore: 0.24, nurture: 0.2, flame: 0.18 } },
  // 延寿类:养丹为要,急不得
  p_yanshou: { skills: { nurture: 0.36, temper: 0.24, condense: 0.16, herbLore: 0.14, flame: 0.1 } },
  p_qianshou: { skills: { nurture: 0.36, temper: 0.24, condense: 0.16, herbLore: 0.14, flame: 0.1 } },
  p_wanshou: { skills: { nurture: 0.34, temper: 0.26, condense: 0.18, herbLore: 0.12, flame: 0.1 } },
  // 破釜丹:以毒引烈,幽冥花为引
  p_pofudan: { materials: ['mat_youming', 'mat_chiyan', 'mat_qingzhi'], skills: { herbLore: 0.34, nurture: 0.26, pairing: 0.22, flame: 0.18 } },
  // 九转还魂丹:九转之名不虚,样样都要
  p_jiuzhuan: {
    materials: ['mat_taixushen', 'mat_jiuye', 'mat_leixin', 'mat_youming'],
    skills: { condense: 0.24, temper: 0.2, pairing: 0.2, flame: 0.18, nurture: 0.18 }
  }
}

/** 按阶位挑主药:取阶位最接近且不超过的一味,再配两味低阶辅药 */
function deriveMaterials(rank: number): string[] {
  const herbs = MATERIALS.filter(x => x.bucket === 'herb').sort((a, b) => a.rank - b.rank)
  const pick = (target: number): MaterialDef => {
    const eligible = herbs.filter(x => x.rank <= target)
    return (eligible[eligible.length - 1] ?? herbs[0]!) as MaterialDef
  }
  const king = pick(rank)
  const minister = pick(Math.max(1, rank - 2))
  const assistant = herbs[0]!
  const ids = [king.id, minister.id, assistant.id]
  return [...new Set(ids)]
}

/** 即时类丹药重凝丹淬药(要的是药力),状态类重配伍养丹(要的是持久与稳定) */
function deriveSkills(kind: PillDef['kind']): Partial<Record<SkillId, number>> {
  return kind === 'instant'
    ? { condense: 0.3, temper: 0.26, flame: 0.18, herbLore: 0.14, pairing: 0.12 }
    : { pairing: 0.3, nurture: 0.26, flame: 0.18, herbLore: 0.14, condense: 0.12 }
}

/**
 * 取丹方工艺。alchemyLevel 在旧口径里是"解锁所需丹炉等级",
 * 此处改读为丹方阶位——它本就是这张方子有多难的度量,只是过去被当成门槛用了。
 */
export function recipeCraft(def: PillDef): RecipeCraft | null {
  if (!def.recipe) return null
  const rank = Math.max(1, Math.min(9, def.alchemyLevel ?? 1))
  const ov = CRAFT_OVERRIDES[def.id]
  return {
    rank,
    materials: ov?.materials ?? deriveMaterials(rank),
    skills: ov?.skills ?? deriveSkills(def.kind)
  }
}
