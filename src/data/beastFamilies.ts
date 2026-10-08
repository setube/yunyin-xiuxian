/**
 * 敌人与灵宠的「族类 → 形」表
 *
 * 原先敌人的 icon 是「大类够用就行」那一套:132 只敌人只用了 19 枚图标,
 * 其中 47 只共用骷髅 —— 独角妖狼、霞光巨蟒、玄冰蛟、万妖林主、瑶池仙后、
 * 混沌道祖全是一枚骷髅;18 只共用兽爪(野狼、野猪、石猿、灵狐、妖熊、霜狼
 * 与「麒麟」同形)。名字写着狼,画的是骷髅;麒麟画成猪爪 —— 浸入感就是这么碎的。
 *
 * 这里的规矩只有两条:
 *   一 一族共形 —— 同类可以共用,「各方神兽」不必各画一枚;
 *   二 异族不共形 —— 这条由 src/ui/beastFamilies.spec.ts 的判据盯着:
 *      一枚图标被一个以上族类共用即红,不是靠自觉。
 *
 * 族类表是**唯一事实源**:数据里只写 `family`,形从这里取。新加敌人时先问
 * 「它是什么族类」,而不是「哪个图标差不多」—— 后者正是「长刀配斧形」的来路。
 *
 * 图标沿用云隐现有的 lucide 注册表(见 src/ui/icons.ts);lucide 没有蛇/龙/麒麟
 * 的专形,这三类暂以神异的抽象形代(波浪/云纹/幻城),待未来补水墨专形,
 * 归属治理不受影响 —— 数据只认族类,换形只改这一张表。
 */
import type { BeastFamily } from '@/types'

export interface BeastFamilyDef {
  /** 族类在人话里的名字(写进注释与文档,不直接上界面) */
  name: string
  /**
   * 这一族共用的那枚形(注册在 src/ui/icons.ts)。
   * 同一枚形只能出现在一个族类上 —— beastFamilies.spec.ts 会红。
   */
  icon: string
  /** 归入这一族的都长什么样 —— 数据侧照着它归类 */
  covers: string
}

export const BEAST_FAMILIES: Record<BeastFamily, BeastFamilyDef> = {
  // ---- 血肉走兽 ----
  beast: { name: '走兽', icon: 'paw', covers: '狼、猪、狐、熊、猿、猴、鹿、狸、鼠及四方神兽/异兽/凶兽/仙兽' },
  winged: { name: '羽禽', icon: 'bird', covers: '雀、鹰、鹤、鸾、鹏、蝙蝠 —— 有羽能飞者' },
  piscine: { name: '鱼鲛', icon: 'fish', covers: '鱼、鲛、鲨、游鱼、鬼鲛' },
  chelonian: { name: '龟', icon: 'turtle', covers: '龟;雪背小龟一类,背甲为形' },
  serpent: { name: '蛇蟒', icon: 'waves', covers: '蛇、蟒、九头蛇 —— 无角无足鳞虫' },
  dragon: { name: '龙属瑞兽', icon: 'cloud', covers: '蛟、螭龙、应龙、麒麟 —— 有角有鳞瑞兽' },
  verdant: { name: '草木', icon: 'leaf', covers: '藤木花草;噬人藤一类' },
  aqueous: { name: '水属', icon: 'droplets', covers: '水里的物事:泥怪、沼泽、海皇、渡厄仙槎(槎是舟,不是兽)' },

  // ---- 非血肉之躯 ----
  undead: { name: '骨骸', icon: 'skull', covers: '尸、骸、腐尸、行尸、沉尸 —— 留着躯壳没了魂的' },
  ghost: { name: '幽魂', icon: 'ghost', covers: '魂、鬼、影、残念、亡魂、恶鬼 —— 连躯壳都没了的' },
  construct: { name: '傀儡机关', icon: 'hammer', covers: '傀儡、俑、石像、神像、泥塑 —— 土木金石做出的人形' },
  blade: { name: '剑器', icon: 'sword', covers: '剑之属:剑灵、断剑、剑冢之主、枪灵' },

  // ---- 人形一类:按名目里的「魔/仙/神」分,不按强弱 ----
  armored: { name: '甲士', icon: 'shield', covers: '卫、兵、将、守卫、执事、卫士、骑士、斥候 —— 披甲执兵之士' },
  demon: { name: '妖魔', icon: 'wand', covers: '妖、魔:妖王、魔尊、妖圣、域主、罗刹、古魔、神魔' },
  immortal: { name: '仙人', icon: 'user', covers: '仙道:仙娥、仙翁、仙后、道童、道尊、仙子、道祖' },
  deity: { name: '神明', icon: 'crown', covers: '神:神王、神帝、天主、神官、守者、殿主、主宰' },

  // ---- 有专门名目的灵物 ----
  spirit: { name: '灵气', icon: 'sparkles', covers: '仙灵、真灵、游灵、本源、游影 —— 不是亡魂,是一缕灵气' },
  astral: { name: '星辰', icon: 'star', covers: '星光之属:星君、星主、星海 —— 星辰为主' },
  mirage: { name: '蜃象', icon: 'castle', covers: '海市蜃楼之属:蜃妖、蜃楼之主 —— 幻象做成的城' },
  outsider: { name: '天外', icon: 'orbit', covers: '自天外来的客;天外来客一类' },
  treasure: { name: '金玉', icon: 'gem', covers: '金玉之精:三足金蟾、帝印神兽' }
}

/** 族类取形 —— 数据侧与渲染侧共用这一个入口,免得两处各写一份 icon */
export function beastIcon(family: BeastFamily): string {
  return BEAST_FAMILIES[family].icon
}
