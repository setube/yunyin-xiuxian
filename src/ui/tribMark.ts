import { TRIBULATIONS, type TribulationDef } from '@/data/tribulations'
import type { TribulationKind } from '@/data/tribulations'

/**
 * 天劫劫型的形制。
 *
 * 五种劫型(雷鸣 / 逆流 / 裂魂 / 铁躯 / 重压)各有一枚单字印,而界面一处未用:
 * 修炼页的劫卡只写劫名与一句劫势,详情面板只写那句劫势。五种劫名都是两个字,
 * 「这次是哪个劫」得逐字读;而**解法完全不同** —— 雷鸣碾护盾、逆流压恢复、
 * 裂魂给爆发、铁躯碾护盾更狠、重压起手两道最重。带错装备进来,是这一趟最大的代价。
 *
 * 这一层只做一件事:把 `data/tribulations` 里早备好的 `seal` 单字搬上界面。
 * 一个字就够区分五劫,且与「雷 / 流 / 魂 / 躯 / 压」的语义直接对得上 ——
 * 不必另造图形,也不必用品阶色(劫型是分类,不是稀有度)。
 *
 * 门槛与字都取自数据表,本模块不另立:新增劫型若忘了写 seal,`tribSeal` 返回空串,
 * 调用点据此不画印,而不是画一个假的。
 */

/** 劫型形制:印字 + 劫名 + 读屏说法 */
export interface TribMark {
  /** 印面单字(取自数据);取不到时为空串,调用点据此不画 */
  seal: string
  /** 劫名,原样转发 */
  name: string
  /** 读屏与 title 的说法:劫名 + 「劫」,不另造词 */
  label: string
}

/** 按劫型取形制;认不出时给一枚空印,不抛错 */
export function tribMark(kind: TribulationKind | undefined): TribMark {
  const def = TRIBULATIONS.find(t => t.id === kind)
  return {
    seal: typeof def?.seal === 'string' ? def.seal : '',
    name: def?.name ?? '',
    label: def ? `${def.name}劫` : ''
  }
}

/** 按劫型定义直接取(plan 里已带 def 时用这个,省一次查表) */
export function tribMarkOf(def: TribulationDef | undefined): TribMark {
  return {
    seal: typeof def?.seal === 'string' ? def.seal : '',
    name: def?.name ?? '',
    label: def ? `${def.name}劫` : ''
  }
}

/** 五种劫型各有一印,用于判据核对「每劫都登记了」 */
export function tribMarks(): { def: TribulationDef; mark: TribMark }[] {
  return TRIBULATIONS.map(def => ({ def, mark: tribMarkOf(def) }))
}
