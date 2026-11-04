import { BEAST_FAMILIES } from '@/data/beastFamilies'
import { PETS } from '@/data/pets'
import type { BeastFamily } from '@/types'

/**
 * 灵兽族徽。
 *
 * 灵兽卡此前只有名字、品阶与性格 —— 而这头兽是「走兽」还是「龙属瑞兽」,
 * 界面上一字未提。族类数据早就有了(`data/beastFamilies.ts`,敌人与灵宠共用),
 * 图鉴与战报取的是它的图标,名号页却没用上。
 *
 * 这一层把族类画成**一印一族**:
 *   印字:取族名的**首字**(走兽→走、羽禽→羽、龙属瑞兽→龙)。
 *         首字天然不重,不必另立一张对照表 —— 族名改字,印跟着变。
 *   族谱:按族聚合「已有几只 / 共有几只」,让「我这五族各收了几头」一眼可数。
 *
 * 铁律:族类是**分类**不是品阶,故不套品阶色,也不做稀有度排序;
 * 排序只按数据表里首次出现的次序,改表即改序。
 */

export interface BeastCrest {
  family: BeastFamily
  /** 印字:族名首字 */
  seal: string
  /** 族名,原样转发 */
  name: string
  /** 族类图标(注册在 ui/icons.ts),图鉴与战报共用同一枚 */
  icon: string
}

/** 一族一印;未知族兜底成一枚空印,不抛错 */
export function beastCrest(family: BeastFamily): BeastCrest {
  const def = BEAST_FAMILIES[family]
  return {
    family,
    seal: typeof def?.name === 'string' && def.name.length > 0 ? def.name[0]! : '兽',
    name: def?.name ?? '兽',
    icon: def?.icon ?? 'paw'
  }
}

export interface FamilyRow extends BeastCrest {
  /** 已有的只数 */
  owned: number
  /** 这一族共几只 */
  total: number
}

/** 有灵兽的族,按数据表首次出现的次序;不按只数排序 */
function petFamilies(): BeastFamily[] {
  const seen: BeastFamily[] = []
  for (const p of PETS) {
    if (!seen.includes(p.family)) seen.push(p.family)
  }
  return seen
}

/**
 * 灵兽族谱:每一族「已有 / 共有」。
 * 只列**有灵兽的族** —— 敌人占了二十一族,把灵兽没有的族也画进族谱,
 * 玩家会以为那些也能收。
 */
export function familyRoster(ownedIds: readonly string[]): FamilyRow[] {
  const owned = new Set(ownedIds)
  return petFamilies().map(family => {
    const inFamily = PETS.filter(p => p.family === family)
    return {
      ...beastCrest(family),
      owned: inFamily.filter(p => owned.has(p.id)).length,
      total: inFamily.length
    }
  })
}
