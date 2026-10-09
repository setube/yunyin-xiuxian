/**
 * 用具的功用与出处文案 —— 装备 / 法宝 / 功法 / 丹药 / 灵兽
 *
 * 这几样东西此前都只印一句风味文字:「玄铁铸就,大巧不工」「背驮微型山岳,稳如泰山」
 * 「尾生青羽,同程多遇」。风味是好东西,但它不回答玩家真正要问的那一句 ——
 * 这件东西到底给我什么。于是图鉴点开看完仍不知道要不要留,背包里的丹看不出服下去会怎样,
 * 灵兽的「贪宝」到底多少、值不值得为它换掉一只数值更高的伙伴,全凭猜。
 *
 * 故这里把五类用具的功用与出处收成一处纯函数:
 *   · 数值一律从表里现算(与战斗、属性汇总、背包读同一份数据,不再各写一遍);
 *   · 界面与图鉴都从这里取字,改一处即改所有露面处;
 *   · 需要等级的(法宝祭炼)按玩家自己那一份给,不给 0 级那一句(见 artifactActiveText)。
 *
 * 本文件只做映射与文案,不读 store、不改状态 —— 需要状态的调用方把状态传进来。
 */
import type { ArtifactDef, EquipmentTemplate, GongfaDef, PetDef, PillDef } from '@/types'
import { qualityDef } from '@/data/qualities'
import { pillQualityName } from '@/data/pills'
import { EQUIP_SLOT_NAMES } from '@/data/equipment'
import { artifactActiveText, artifactValue } from '@/data/artifacts'
import { buffDef } from '@/data/buffs'
import { GONGFA_TYPE_NAMES } from '@/data/gongfa'
import { ELEMENTS } from '@/data/linggen'
import { REALMS } from '@/data/realms'
import { HERB_GRADE_SHORT, herbGradeOfMajor } from '@/data/herbGrades'
import { equipSetDef } from '@/core/equipSet'
import { worldNameOfTier } from '@/core/formulas'
import { gongfaModsAt } from '@/stores/cultivation'
import { personalityEffects } from '@/core/petPersonality'
import { formatNum, formatPercent } from '@/utils/format'
import { classicalDuration } from '@/data/timeUnits'
import { modsText } from './statNames'

// ============ 装备 ============

/** 平铺三围的中文名(装备的「所主」用) */
const FLAT_NAMES = { attack: '攻击', defense: '防御', maxHp: '生命' } as const

/**
 * 装备的功用:所主(它主加哪一维)+ 固有机制 + 所属共鸣。
 *
 * 平铺数值随**掉落层级**折算(见 core/equipGen.resolveEquipStats),故这里只报
 * 「主加哪一维」而不印数字 —— 离开层级印一个数字,反而是另一种撒谎。
 */
export function equipFuncText(t: EquipmentTemplate): string {
  const parts: string[] = []
  const flats = (['attack', 'defense', 'maxHp'] as const).filter(k => t.base[k]).map(k => FLAT_NAMES[k])
  if (flats.length) parts.push(`所主:${flats.join('、')}`)
  if (t.fixedMods && Object.keys(t.fixedMods).length) parts.push(`固有:${modsText(t.fixedMods)}`)
  const set = t.set ? equipSetDef(t.set) : undefined
  if (set) parts.push(`共鸣「${set.name}」:${set.effectDesc}(${set.required} 件)`)
  return parts.join('\n')
}

/** 装备的出处一行:部位 · 界域 · 哪一阶(一阶一名) */
export function equipMetaText(t: EquipmentTemplate): string {
  return `${EQUIP_SLOT_NAMES[t.slot]} · ${worldNameOfTier(t.tier)} · ${t.tier} 阶`
}

// ============ 法宝 ============

/**
 * 法宝的功用:被动(按祭炼等级放大 —— 传进来的那个等级就是该玩家自己的)
 * + 神通说明(同一套缩放与封顶,见 artifactActiveText)。
 */
export function artifactFuncText(a: ArtifactDef, level = 0): string {
  const passive = modsText(artifactValue(a, level).passive)
  const lines: string[] = []
  if (passive) lines.push(`被动:${passive}`)
  lines.push(`神通「${a.active.name}」:${artifactActiveText(a, level)}`)
  return lines.join('\n')
}

/**
 * 法宝的出处一行:品质 · 界域 · 从哪一阶起可现世。
 *
 * 与装备那一条刻意不同:装备是「一阶一名」(名字就是它的阶),法宝是**收藏品** ——
 * 看品质与界域,升阶靠祭炼;一个「N 阶起」说清它会在哪些地界掉出来。
 */
export function artifactMetaText(a: ArtifactDef): string {
  return `${qualityDef(a.quality).name} · ${worldNameOfTier(a.fromTier)} · ${a.fromTier} 阶起可现世`
}

// ============ 功法 ============

/**
 * 功法的功用:修至圆满能得什么 + 附带神通的几率与威力。
 * 功法没有「掉落层级」这回事,满级数值对谁都是同一个 —— 故直接印满级。
 */
export function gongfaFuncText(g: GongfaDef): string {
  const lines = [`圆满(${g.maxLevel} 层)可得:${modsText(gongfaModsAt(g.id, g.maxLevel))}`]
  const skill = gongfaSkillLine(g.skill)
  if (skill) lines.push(skill)
  return lines.join('\n')
}

/**
 * 神通只从主修进战斗(playerSnap 只带 mainSkill)。
 * 几率与威力从功法表现算;未设主修则这一式不出手。
 */
export function gongfaSkillLine(skill: GongfaDef['skill'] | undefined): string {
  if (!skill) return ''
  return `附带神通「${skill.name}」:出手 ${formatPercent(skill.rate)} 几率,${formatPercent(skill.mult)} 威力。须设为主修,战斗只出这一式`
}

/** 功法的出处一行:类型 · 品质 · 属性 · 从哪一境起可参 */
export function gongfaMetaText(g: GongfaDef): string {
  const element = g.element ? ` · ${ELEMENTS[g.element].name}属性` : ''
  return `${GONGFA_TYPE_NAMES[g.type]} · ${qualityDef(g.quality).name}${element} · ${REALMS[g.minRealm]?.name ?? ''}期可参`
}

// ============ 丹药 ============

/**
 * 丹药的功用:服下去会发生什么。
 *
 * 丹药卡片此前只有风味与数量 —— 而「这一味值不值一趟险、值得不值得炼」正是玩家要问的。
 * 数值取自 instant / buff 本体,不另写一份:改数据,文案自己跟上。
 */
export function pillFuncText(def: PillDef): string {
  const lines: string[] = []
  const i = def.instant
  if (def.kind === 'instant' && i) {
    const parts: string[] = []
    // 修为丹按等效闭关时长计价(Phase 39):写"折合闭关那一段等效时长"而不是百分比 ——
    // 玩家要判断的是"这枚丹抵我多久",不是"它占这道墙的几成"
    if (i.expSecs) parts.push(`修为 +折合闭关 ${classicalDuration(i.expSecs)}(至多不满一层)`)
    if (i.expFixed) parts.push(`修为 +${formatNum(i.expFixed)} 点`)
    if (i.qiPct) parts.push(`灵气 +上限的 ${Math.round(i.qiPct * 100)}%`)
    if (i.lifespanYears) parts.push(`寿元 +${formatNum(i.lifespanYears)} 载`)
    if (i.wudao) parts.push(`悟道点 +${formatNum(i.wudao)}`)
    if (parts.length) lines.push(`服之:${parts.join(' · ')}`)
  } else if (def.buffId) {
    const buff = buffDef(def.buffId)
    if (buff) {
      lines.push(`服之化开「${buff.name}」:${modsText(buff.mods)}(持续 ${Math.round(buff.durationSec / 60)} 分钟)`)
    }
  }
  lines.push(pillSourceText(def))
  return lines.join('\n')
}

/** 丹药的来路:有方子的说方子(含方子要的品阶),没方子的明说「只能偶得」 */
export function pillSourceText(def: PillDef): string {
  return def.recipe
    ? `有方:${HERB_GRADE_SHORT[herbGradeOfMajor(def.minRealm)]}灵草×${def.recipe.herb},丹房可炼`
    : '无方,只在历练掉落与际遇里偶得'
}

/** 丹药的出处一行:品质 · 类别 · 从哪一境起现世 */
export function pillMetaText(def: PillDef): string {
  return `${pillQualityName(def)} · ${def.recipe ? '可炼' : '偶得'} · ${REALMS[def.minRealm]?.name ?? ''}期起见`
}

// ============ 灵兽 ============

/** 灵兽的出战加成(数值) */
export function petFuncText(def: PetDef): string {
  return modsText(def.mods)
}

/**
 * 灵兽性子对历练的实际影响 —— 带数说话。
 *
 * 性格此前只有一句定性的话(「更容易发现稀有之物,但也会招来危险」)——
 * 可「更容易」是多少?值不值得为它换掉一只数值更高的伙伴?这些数一直在
 * core/petPersonality 里参与结算,却没在界面上露过面。故逐项摊开(零值不列)。
 */
export function petTraitText(def: PetDef): string {
  const e = personalityEffects(def.id)
  const delta = (mult: number): string => `${mult >= 1 ? '+' : ''}${formatPercent(mult - 1)}`
  const parts: string[] = []
  if (e.exploreDurMult !== 1) parts.push(`历练时长 ${delta(e.exploreDurMult)}`)
  if (e.dangerMult !== 1) parts.push(`遇险 ${delta(e.dangerMult)}`)
  if (e.dropLuck !== 0) parts.push(`掉落气运 ${e.dropLuck > 0 ? '+' : ''}${formatPercent(e.dropLuck)}`)
  if (e.lossReduction !== 0) parts.push(`战败率 ${e.lossReduction > 0 ? '−' : '+'}${formatPercent(Math.abs(e.lossReduction))}`)
  return parts.join(' · ')
}
