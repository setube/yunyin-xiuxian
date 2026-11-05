import { equipmentTemplate } from '@/data/equipment'
import { equipSetDef, type EquipSetDef } from '@/core/equipSet'
import type { EquipmentInstance } from '@/types'

/**
 * 装备共鸣的形制。
 *
 * 六套共鸣在界面上此前只有一样东西:格子里一枚通用的「共」字,详情里一行「铁壁共鸣 1/2」。
 * 于是「这一件属于哪一套」在格子上分不出 —— 同一格里的「共」,可能是铁壁、可能是妖庭,
 * 得点开详情才知道;而**共鸣只有凑齐才生效**,看不出来就无从决定「下一件该先收哪个部位」。
 *
 * 这一层给三样形制,全部从 core/equipSet 与 data/equipment 现算,不另立:
 *   套纹(crest):每套一枚线纹,六枚两两不同 —— 按套 id 定位,不按名字(名字会改);
 *   机制(mechanism):三钩子各一类(护命 / 开战盾 / 汲取),色只作辅助;
 *   件数(pips):凑齐要几件就几格,已戴几件。
 *
 * 铁律与既有形制一致:形制服务于「还差哪一件」,不抢正文可读性 —— 纹样不吃指针事件。
 */

/** 三钩子各一类:护命(铁壁/神铠)、开战盾(星斗/仙甲/混沌)、汲取(妖庭) */
export type SetMechanism = 'guard' | 'shield' | 'leech'

/** 六套各一枚线纹;按套 id 定位 */
export type SetCrest = 'wall' | 'star' | 'feather' | 'shell' | 'chaos' | 'fang'

export interface SetMark {
  /** 套 id,原样转发 */
  id: string
  /** 套名,原样转发 */
  name: string
  /** 线纹种类,CSS 按它上纹样 */
  crest: SetCrest
  /** 机制类别 */
  mechanism: SetMechanism
  /** 凑齐要几件 */
  required: number
  /** 读屏与 title 的说法:套名 + 机制,不另造词 */
  label: string
}

/** 钩子 → 机制类别。新增钩子须在此补齐,`setMark` 认不出时返回 undefined(不画错的纹) */
const MECHANISM_OF_HOOK: Record<EquipSetDef['hook'], SetMechanism> = {
  ironwall: 'guard',
  astral: 'shield',
  peishi: 'leech'
}

/** 机制的中文说法(读屏与 title 用) */
export const SET_MECHANISM_NAMES: Record<SetMechanism, string> = {
  guard: '护命',
  shield: '开战盾',
  leech: '汲取'
}

/**
 * 套 id → 线纹。id 是数据层的事实源,这里只定「哪一套长得像什么」。
 * 新增套若忘了登记,`setMark` 返回 undefined,调用点不挂形制 —— 不会静默画错。
 */
const CRESTS: Record<string, SetCrest> = {
  s_tiebi: 'wall',
  s_xingdou: 'star',
  s_xianjia: 'feather',
  s_shenjia: 'shell',
  s_hundunjia: 'chaos',
  s_yaoting: 'fang'
}

/** 一套共鸣的形制;认不出就是 undefined */
export function setMark(setId: string): SetMark | undefined {
  const def = equipSetDef(setId)
  if (!def) return undefined
  const crest = CRESTS[def.id]
  if (!crest) return undefined
  const mechanism = MECHANISM_OF_HOOK[def.hook]
  if (!mechanism) return undefined
  return {
    id: def.id,
    name: def.name,
    crest,
    mechanism,
    required: def.required,
    label: `${def.name} · ${SET_MECHANISM_NAMES[mechanism]}`
  }
}

/** 按装备实例取形制(格子与详情都从这一条走,不各查一次) */
export function setMarkOfItem(inst: EquipmentInstance | undefined): SetMark | undefined {
  if (!inst) return undefined
  const setId = equipmentTemplate(inst.templateId)?.set
  return setId ? setMark(setId) : undefined
}

/** 件数刻度:凑齐要几件就几格,已戴几件。格数随 required 变,模板不再自己数 */
export function setPips(mark: SetMark, have: number): boolean[] {
  const n = Number.isFinite(have) ? Math.max(0, Math.floor(have)) : 0
  return Array.from({ length: mark.required }, (_, i) => i < n)
}
