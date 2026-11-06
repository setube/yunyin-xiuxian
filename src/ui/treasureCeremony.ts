/**
 * 得宝仪典:顶档之物入手的「那一瞬」。
 *
 * 品阶视觉已有三层(`qualityTier` 浓淡 → `qualityAura` 角饰外光 → `luster` 最上档御纹),
 * 但那三层都是**常驻**的形制 —— 它们回答「这件有多好」,不负责「此刻」。
 * 而攒到一件神品/道品时,玩家心里那一喜来自一件常驻形制给不了的事:这一刻与别刻不同。
 *
 * 现状:顶档与次一档在「到手」时长得一样 —— 都是一条金边 toast 加一层金光。
 * 天品、仙品、神品依次更亮,却没有任何一处是**只给顶档**的。
 *
 * 三条铁律(判据见 treasureCeremony.spec.ts):
 *   一 只在顶档出现。每一档都给,等于每一档都没有 —— 稀有感来自落差,不来自层数。
 *   二 只报「得了什么」。不写来由、不写用途、不写下一步;文案是人物的名字,不是一句话。
 *   三 不吃点击、自己会散。它是记号,不是弹窗:全屏浮层但无控件,不进 Tab 序。
 */
import type { GongfaDef, PetDef, PillDef } from '@/types'
import type { QualityId } from '@/types'
import { qualityDef, qualityTextColor } from '@/data/qualities'
import { pillQualityColor, pillQualityName, pillQualityTextColor, pillRank } from '@/data/pills'
import { beastIcon } from '@/data/beastFamilies'

/** 五类可入手之物;仪典按类报一个词(装备/法宝/功法/丹药/灵兽) */
export type TreasureKind = 'equip' | 'artifact' | 'gongfa' | 'pill' | 'pet'

export const TREASURE_KIND_NAMES: Record<TreasureKind, string> = {
  equip: '装备',
  artifact: '法宝',
  gongfa: '功法',
  pill: '丹药',
  pet: '灵兽'
}

/**
 * 仪典门槛:神品(rank 8)及以上,丹药的道品(rank 9)同列。
 * 取品阶表里最高那一档,不另写 8 —— 将来若加更高的档,门槛自动跟上。
 */
export const TREASURE_MIN_RANK = qualityDef('divine').rank

export interface TreasureMark {
  kind: TreasureKind
  /** 类名,读屏与画面上都只用一个词 */
  kindName: string
  /** 物名。仪典正文只有这一样,不另加句子 */
  name: string
  /** 品阶名(神品 / 道品) */
  grade: string
  /** 图标名,取数据里那一枚,不在这里另配 */
  icon: string
  /** 装饰色:品阶原色,经 CSS 变量注入 —— 组件里不写死色值 */
  tone: string
  /** 文字色:品阶「当文字用」的那一版,小字过 4.5:1 */
  textTone: string
  /** 读屏播报:品阶 + 类名 + 名 */
  announce: string
}

/** 一件待判之物:数据层里已经确定的身份与成色 */
export type TreasureSource =
  | { kind: 'equip'; quality: QualityId; name: string; icon: string }
  | { kind: 'artifact'; quality: QualityId; name: string; icon: string }
  | { kind: 'gongfa'; gongfa: GongfaDef }
  | { kind: 'pill'; pill: PillDef }
  | { kind: 'pet'; pet: PetDef }

function build(
  kind: TreasureKind,
  name: string,
  icon: string,
  grade: string,
  tone: string,
  textTone: string
): TreasureMark {
  const kindName = TREASURE_KIND_NAMES[kind]
  return {
    kind,
    kindName,
    name,
    grade,
    icon,
    tone,
    textTone,
    announce: `${grade}${kindName}「${name}」`
  }
}

/**
 * 判一件东西够不够格开仪典;不够则返回 null,调用点据此什么都不做。
 *
 * 认不出的东西一律 null:仪典是加成,判不出来时宁可不办,
 * 也不把一件凡品当成神品敲锣。
 */
export function treasureOf(src: TreasureSource): TreasureMark | null {
  switch (src.kind) {
    case 'equip':
    case 'artifact': {
      const q = qualityDef(src.quality)
      if (q.rank < TREASURE_MIN_RANK) return null
      return build(src.kind, src.name, src.icon, q.name, q.color, qualityTextColor(src.quality))
    }
    case 'gongfa': {
      const q = qualityDef(src.gongfa.quality)
      if (q.rank < TREASURE_MIN_RANK) return null
      return build('gongfa', src.gongfa.name, 'book', q.name, q.color, qualityTextColor(src.gongfa.quality))
    }
    case 'pill': {
      // 丹药的 rank 走 pillRank:道品不在共享品阶表里,直接 qualityDef 会兜底成凡品
      if (pillRank(src.pill) < TREASURE_MIN_RANK) return null
      return build(
        'pill',
        src.pill.name,
        src.pill.icon,
        pillQualityName(src.pill),
        pillQualityColor(src.pill),
        pillQualityTextColor(src.pill)
      )
    }
    case 'pet': {
      const q = qualityDef(src.pet.quality)
      if (q.rank < TREASURE_MIN_RANK) return null
      return build('pet', src.pet.name, beastIcon(src.pet.family), q.name, q.color, qualityTextColor(src.pet.quality))
    }
    default:
      // 坏档里混进认不出的类:不办仪典,也不抛 —— 仪典是加成,不是校验
      return null
  }
}
