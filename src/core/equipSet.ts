/** 装备共鸣:同组已装备件数达到该套 required 即触发机制效果(非数值堆叠) */
import type { EquipmentInstance } from '@/types'
import { equipmentTemplate } from '@/data/equipment'
import { formatPercent } from '@/utils/format'

export interface EquipSetDef {
  id: string
  name: string
  /** 触发所需件数 */
  required: number
  /** 机制效果文案 */
  effectDesc: string
  /** 机制钩子 Id(战斗引擎可识别) */
  hook: 'ironwall' | 'astral' | 'peishi'
}

/** astral 共鸣:开战护盾 = 最大生命 × 该比例(并入快照盾 mod,三层共用) */
export const ASTRAL_SET_SHIELD = 0.05
/** 饰品共鸣:造成伤害按该比例转化为生命(并入快照 lifesteal mod) */
export const ACCESSORY_SET_LIFESTEAL = 0.08

/** 三套 astral 共用;数取自常量,不手抄 */
function astralShieldDesc(): string {
  return `开战护盾+${formatPercent(ASTRAL_SET_SHIELD)}`
}

function peishiDesc(): string {
  return `造成伤害的 ${formatPercent(ACCESSORY_SET_LIFESTEAL)} 转化为生命`
}

const IRONWALL_DESC = '首次致命伤保留 1 点气血'

const SET_DEFS: Map<string, EquipSetDef> = new Map([
  ['s_tiebi', { id: 's_tiebi', name: '铁壁共鸣', required: 2, effectDesc: IRONWALL_DESC, hook: 'ironwall' }],
  ['s_xingdou', { id: 's_xingdou', name: '星斗共鸣', required: 2, effectDesc: astralShieldDesc(), hook: 'astral' }],
  // 高界套件沿用既有机制钩子
  ['s_xianjia', { id: 's_xianjia', name: '仙甲共鸣', required: 2, effectDesc: astralShieldDesc(), hook: 'astral' }],
  ['s_shenjia', { id: 's_shenjia', name: '神铠共鸣', required: 2, effectDesc: IRONWALL_DESC, hook: 'ironwall' }],
  ['s_hundunjia', { id: 's_hundunjia', name: '混沌共鸣', required: 2, effectDesc: astralShieldDesc(), hook: 'astral' }],
  // 饰品三件套:项链+戒指+灵符,独立钩子,不占攻防套位
  ['s_yaoting', { id: 's_yaoting', name: '妖庭共鸣', required: 3, effectDesc: peishiDesc(), hook: 'peishi' }]
])

export function equipSetDef(setId: string): EquipSetDef | undefined {
  return SET_DEFS.get(setId)
}

/** 全部共鸣定义,按登记次序。展示层要「逐套列形制」时读它,不另抄一份 id 清单 */
export function allEquipSets(): EquipSetDef[] {
  return [...SET_DEFS.values()]
}

/** 已装备件中,同 set 的件数统计 */
export function setCounts(equipped: EquipmentInstance[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const it of equipped) {
    const tpl = equipmentTemplate(it.templateId)
    if (tpl?.set) counts.set(tpl.set, (counts.get(tpl.set) ?? 0) + 1)
  }
  return counts
}

/** 当前激活的共鸣(件数达标)列表 */
export function activeSets(equipped: EquipmentInstance[]): EquipSetDef[] {
  const counts = setCounts(equipped)
  const out: EquipSetDef[] = []
  for (const [setId, n] of counts) {
    const def = SET_DEFS.get(setId)
    if (def && n >= def.required) out.push(def)
  }
  return out
}

/** 是否已激活指定机制(供战斗引擎查) */
export function hasActiveSet(equipped: EquipmentInstance[], hook: EquipSetDef['hook']): boolean {
  return activeSets(equipped).some(s => s.hook === hook)
}
