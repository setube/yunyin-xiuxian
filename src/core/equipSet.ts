/**
 * 装备共鸣(Phase 31.0 S5)
 *
 * 不是数值堆叠式的套装(2件+10%):同组多件触发**机制效果**,
 * 成为 Build 组件(如:铁壁 = 首次致命伤保留 1 点气血)。
 * 组内装备要求件数宽松(挂载中的同 set 件数 ≥2 即共鸣)。
 */
import type { EquipmentInstance } from '@/types'
import { equipmentTemplate } from '@/data/equipment'

export interface EquipSetDef {
  id: string
  name: string
  /** 触发所需件数 */
  required: number
  /** 机制效果文案 + 战斗钩子标记 */
  effectDesc: string
  /** 机制钩子 Id(战斗引擎可识别) */
  hook: 'ironwall' | 'astral'
}

const SET_DEFS: Map<string, EquipSetDef> = new Map([
  ['s_tiebi', { id: 's_tiebi', name: '铁壁共鸣', required: 2, effectDesc: '受到致命伤害时,首次保留 1 点气血', hook: 'ironwall' }],
  ['s_xingdou', { id: 's_xingdou', name: '星斗共鸣', required: 2, effectDesc: '每场战斗开始时获得一层星光护体(护盾+5%)', hook: 'astral' }]
])

export function equipSetDef(setId: string): EquipSetDef | undefined {
  return SET_DEFS.get(setId)
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
