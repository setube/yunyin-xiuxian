/**
 * 用具的功用与出处文案(装备 / 法宝 / 功法 / 丹药 / 灵兽),界面与图鉴都从这里取字。
 * 数值一律从表里现算,不另写一份;需要等级的(法宝祭炼)按传进来的等级给(见 artifactActiveText)。
 * 只做映射与文案,不读 store、不改状态:需要状态的调用方把状态传进来。
 */
import type { ArtifactDef, EquipmentTemplate, GongfaDef, PetDef, PillDef } from '@/types'
import { qualityDef } from '@/data/qualities'
import { pillQualityName } from '@/data/pills'
import { EQUIP_SLOT_NAMES } from '@/data/equipment'
import { artifactActiveText, artifactValue } from '@/data/artifacts'
import { cadenceMark } from './artifactCadence'
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
import { modsText } from '@/data/statNames'

// ============ 装备 ============

/** 平铺三围的中文名(装备的「所主」用) */
const FLAT_NAMES = { attack: '攻击', defense: '防御', maxHp: '生命' } as const

/**
 * 装备的功用:所主 + 固有机制 + 所属共鸣。
 * 平铺数值随掉落层级折算(见 core/equipGen.resolveEquipStats),只报主加哪一维、不印数字。
 */
export function equipFuncText(t: EquipmentTemplate): string {
  const parts: string[] = []
  const flats = (['attack', 'defense', 'maxHp'] as const).filter(k => t.base[k]).map(k => FLAT_NAMES[k])
  if (flats.length) parts.push(`所主:${flats.join('、')}`)
  if (t.fixedMods && Object.keys(t.fixedMods).length) parts.push(`固有:${modsText(t.fixedMods)}`)
  const set = t.set ? equipSetDef(t.set) : undefined
  if (set) parts.push(`${set.name}(${set.required} 件):${set.effectDesc}`)
  return parts.join('\n')
}

/** 装备的出处一行:部位 · 界域 · 哪一阶(一阶一名) */
export function equipMetaText(t: EquipmentTemplate): string {
  return `${EQUIP_SLOT_NAMES[t.slot]} · ${worldNameOfTier(t.tier)} · ${t.tier} 阶`
}

// ============ 法宝 ============

/** 法宝的功用:被动(按祭炼等级放大)+ 神通说明(同一套缩放与封顶,见 artifactActiveText) */
export function artifactFuncText(a: ArtifactDef, level = 0): string {
  const passive = modsText(artifactValue(a, level).passive)
  const lines: string[] = []
  if (passive) lines.push(`被动:${passive}`)
  /*
   * 节奏要写在这一行里。
   *
   * 同样一句「造成伤害」,三回合一次与五回合一次是两种分量 ——
   * 而图鉴是纯文本流,放不下面板里那排短刻度,只能写出来。
   * 节奏的算法与面板同源(见 ui/artifactCadence),不在这里另算一遍。
   */
  const cadence = cadenceMark(a)
  lines.push(`神通「${a.active.name}」(${cadence.label}):${artifactActiveText(a, level)}`)
  return lines.join('\n')
}

/**
 * 法宝的出处一行:品质 · 界域 · 从哪一阶起可现世。
 * 与装备「一阶一名」刻意不同:法宝是收藏品,升阶靠祭炼。
 */
export function artifactMetaText(a: ArtifactDef): string {
  return `${qualityDef(a.quality).name} · ${worldNameOfTier(a.fromTier)} · ${a.fromTier} 阶起`
}

// ============ 功法 ============

/** 功法的功用:修至圆满能得什么 + 附带神通的几率与威力;功法没有掉落层级,直接印满级。 */
export function gongfaFuncText(g: GongfaDef): string {
  const lines = [`圆满(${g.maxLevel} 层):${modsText(gongfaModsAt(g.id, g.maxLevel))}`]
  const skill = gongfaSkillLine(g.skill)
  if (skill) lines.push(skill)
  return lines.join('\n')
}

/** 神通只从主修进战斗(playerSnap 只带 mainSkill);未设主修则这一式不出手。 */
export function gongfaSkillLine(skill: GongfaDef['skill'] | undefined): string {
  if (!skill) return ''
  return `神通「${skill.name}」:出手 ${formatPercent(skill.rate)} 几率 · ${formatPercent(skill.mult)} 威力 · 须设为主修`
}

/** 功法的出处一行:类型 · 品质 · 属性 · 从哪一境起可参 */
export function gongfaMetaText(g: GongfaDef): string {
  const element = g.element ? ` · ${ELEMENTS[g.element].name}属性` : ''
  return `${GONGFA_TYPE_NAMES[g.type]} · ${qualityDef(g.quality).name}${element} · ${REALMS[g.minRealm]?.name ?? ''}期可参`
}

// ============ 丹药 ============

/** 丹药的功用:服下去会发生什么;数值取自 instant / buff 本体,不另写一份。 */
export function pillFuncText(def: PillDef): string {
  const lines: string[] = []
  const i = def.instant
  if (def.kind === 'instant' && i) {
    const parts: string[] = []
    // 修为丹按等效闭关时长计价,不写百分比
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

/** 丹药的来路:有方子的说方子(含品阶),没方子的明说「无方」 */
export function pillSourceText(def: PillDef): string {
  return def.recipe
    ? `有方:${HERB_GRADE_SHORT[herbGradeOfMajor(def.minRealm)]}灵草×${def.recipe.herb}`
    : '无方:历练掉落、际遇'
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

/** 灵兽性子对历练的实际影响:数值取自 core/petPersonality,逐项摊开(零值不列)。 */
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
