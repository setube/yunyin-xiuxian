/**
 * 功法悟道分支(Phase 31.0 A3)
 *
 * 功法满级(learned[id] >= maxLevel)后可择一条悟道方向,
 * 改变该功法从满级起的成长方向(追加 perLevelMods 风格词条)。
 * 同一功法因此出现多个版本 —— 与"无职业 + 混合 Build"契合。
 * 分支一经选择不可更改(转世保留)。
 */
import type { StatMods } from '@/types'
import { gongfaDef } from './gongfa'

export interface GongfaBranchDef {
  /** 所属功法 */
  gongfaId: string
  id: string
  name: string
  desc: string
  /** 选此分支后追加的词条(以满级为基准一次性追加) */
  mods: StatMods
}

export const GONGFA_BRANCHES: GongfaBranchDef[] = [
  {
    gongfaId: 'm_taixuan',
    id: 'b_taixuan_sha',
    name: '杀伐',
    desc: '太玄入杀道,攻伐更烈',
    mods: { attackPct: 0.1, damageBonus: 0.05 }
  },
  {
    gongfaId: 'm_taixuan',
    id: 'b_taixuan_shou',
    name: '守御',
    desc: '太玄入守道,护体更坚',
    mods: { defensePct: 0.1, maxHpPct: 0.05 }
  },
  {
    gongfaId: 'm_taixuan',
    id: 'b_taixuan_guiyi',
    name: '归一',
    desc: '万法归一,气机更纯',
    mods: { cultivationSpeed: 0.06, qiRegen: 0.06 }
  },
  {
    gongfaId: 'm_lihuo',
    id: 'b_lihuo_fen',
    name: '焚天',
    desc: '离火更炽,出招更狠',
    mods: { damageBonus: 0.08, critRate: 0.03 }
  },
  {
    gongfaId: 'm_lihuo',
    id: 'b_lihuo_xu',
    name: '续焰',
    desc: '火尽不熄,攻守兼备',
    mods: { attackPct: 0.05, defensePct: 0.05 }
  },
  {
    gongfaId: 'm_qingmu',
    id: 'b_qingmu_sheng',
    name: '生生',
    desc: '木气长生,愈战愈盛',
    mods: { maxHpPct: 0.08, regenPerRound: 0.01 }
  },
  {
    gongfaId: 'm_qingmu',
    id: 'b_qingmu_lian',
    name: '缠连',
    desc: '藤蔓缠敌,出手愈快',
    mods: { speed: 0.05, attackPct: 0.04 }
  }
]

const BY_ID = new Map(GONGFA_BRANCHES.map(b => [b.id, b]))

export function gongfaBranchDef(id: string): GongfaBranchDef | undefined {
  return BY_ID.get(id)
}

export function branchesFor(gongfaId: string): GongfaBranchDef[] {
  return GONGFA_BRANCHES.filter(b => b.gongfaId === gongfaId)
}

/**
 * 该功法此刻是否真能悟道。
 *
 * 满级只是前提,还须确有歧路可择 —— 全书功法只有寥寥数部写了分支,
 * 若只判满级,余下几十部都会在界面上挂出一个点开即空的「可悟道」,
 * 玩家看得见却哪儿也去不了。判据集中在此,界面提示与实际可选项不会分叉。
 */
export function canEnlighten(gongfaId: string, level: number): boolean {
  const def = gongfaDef(gongfaId)
  if (!def) return false
  return level >= (def.maxLevel ?? 9) && branchesFor(gongfaId).length > 0
}
