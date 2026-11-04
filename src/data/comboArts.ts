/** 流派组合技 —— 主副体系凑成特定搭配时激活,引擎按 comboArt 键触发 */

export interface ComboArtDef {
  id: string
  /** 参与组合的两个流派 id(不限主副次序) */
  pair: [string, string]
  name: string
  desc: string
  /** 结构性代价说明 */
  costText: string
}

export const COMBO_ARTS: ComboArtDef[] = [
  {
    id: 'xuangang',
    pair: ['gangdun', 'fanzhen'],
    name: '玄罡反震',
    desc: '护盾被破即强化反击(每场至多两次)',
    costText: '真伤之敌绕盾则不触发'
  },
  {
    id: 'kuze',
    pair: ['muze', 'beishui'],
    name: '枯泽回春',
    desc: '气血低于三成时,一切治疗增效五成',
    costText: '此时每次受疗,护盾减半'
  },
  {
    id: 'fenglian',
    pair: ['fengmang', 'lianji'],
    name: '锋连诀',
    desc: '满血会心必定衔接一记追击(每场限一次)',
    costText: '仅开局可触发'
  }
]

/** 依主副流派查激活的组合技(次序不限,副体系须足够成形) */
export function matchComboArt(primaryId: string, secondaryId: string | undefined): ComboArtDef | null {
  if (!secondaryId) return null
  return (
    COMBO_ARTS.find(
      art => (art.pair[0] === primaryId && art.pair[1] === secondaryId) || (art.pair[0] === secondaryId && art.pair[1] === primaryId)
    ) ?? null
  )
}

/** 组合技激活所需的副体系契合度 */
export const COMBO_SECONDARY_MIN = 0.45

/**
 * 组合技配对的两派名,按 `pair` 的原序。
 *
 * 组合技不限主副次序(`matchComboArt` 两向都收),故显示也不能按手上的主副排 ——
 * 否则同一招在「罡盾主 + 反震副」与「反震主 + 罡盾副」两套构筑里会写成不同样子。
 * 配不上的那侧回落为原 id:数据错了要看得见,不静默吞掉。
 *
 * @param art 已匹配到的组合技
 * @param primary 手上主体系的 id 与名
 * @param secondary 手上副体系的 id 与名
 */
export function comboPairNames(
  art: ComboArtDef,
  primary: { id: string; name: string },
  secondary: { id: string; name: string }
): [string, string] {
  return art.pair.map(id => {
    if (id === primary.id) return primary.name
    if (id === secondary.id) return secondary.name
    return id
  }) as [string, string]
}
