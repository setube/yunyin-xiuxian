/**
 * 流派识别 —— 从最终属性推断玩家当前构筑,供 Build 面板展示
 */
import type { AnyStatKey, StatMods } from '@/types'
import { artifactDef } from '@/data/artifacts'
import { buffDef } from '@/data/buffs'
import { equipmentTemplate } from '@/data/equipment'
import { gongfaDef } from '@/data/gongfa'
import { gongfaBranchDef } from '@/data/gongfaBranches'
import { mentorDef } from '@/data/mentors'
import { petDef } from '@/data/pets'
import { talentDef } from '@/data/talents'
import { titleDef } from '@/data/titles'
import { useCultivationStore } from '@/stores/cultivation'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { resolveEquipStats } from './equipGen'
import { modOf } from './statsCalc'

export interface BuildStyleDef {
  id: string
  name: string
  /** 印章单字 */
  seal: string
  desc: string
  /** 核心词条 → 满契合参考值 */
  core: Partial<Record<AnyStatKey, number>>
}

export const BUILD_STYLES: BuildStyleDef[] = [
  {
    id: 'beishui',
    name: '背水流',
    seal: '背',
    desc: '身陷绝境,战意愈炽;濒死缠斗,最擅攻坚',
    core: { lowHpDamage: 0.5, lowHpReduction: 0.3 }
  },
  { id: 'gangdun', name: '罡盾流', seal: '盾', desc: '罡气为盾,愈守愈强;硬撼高爆发之敌', core: { shieldOnStart: 0.25, shieldPower: 0.3 } },
  { id: 'fanzhen', name: '反震流', seal: '棘', desc: '以彼之力,还施彼身;多段之敌自取灭亡', core: { counterRate: 0.3, counterDamage: 0.5 } },
  { id: 'lianji', name: '连击流', seal: '连', desc: '快剑连绵,不留喘息;唯疾影难缠', core: { comboRate: 0.3, comboDamage: 0.4 } },
  {
    id: 'muze',
    name: '沐泽流',
    seal: '泽',
    desc: '生生不息,久战不衰;惧雷霆一击',
    core: { lifesteal: 0.08, regenPerRound: 0.025, overhealShield: 0.5 }
  },
  {
    id: 'fengmang',
    name: '锋芒流',
    seal: '锋',
    desc: '锋芒毕露,先发制人;收割脆敌如探囊',
    core: { fullHpDamage: 0.35, firstStrike: 0.35, critRate: 0.15 }
  }
]

export interface BuildDetection {
  style: BuildStyleDef
  /** 0~1 契合度 */
  affinity: number
  stageName: string
  /** 核心词条当前数值 */
  coreValues: { key: AnyStatKey; value: number }[]
  /** 副体系(混合流派;修行无职业,道路可以不纯) */
  secondary?: { style: BuildStyleDef; affinity: number }
  /** 展示名:纯派为「罡盾流」,混合为「罡盾·反震」 */
  displayName: string
}

/** 副体系判定门槛 */
const SECONDARY_MIN_AFFINITY = 0.3

/** 流派「成形 / 大成」的契合度门槛 —— 文案里的「契合 ≥60%」也读这一枚,别另处抄 */
export const STYLE_MATURE_AFFINITY = 0.6
export const STYLE_MASTER_AFFINITY = 0.9

function shortName(style: BuildStyleDef): string {
  return style.name.replace(/流$/, '')
}

/** 识别当前流派;不足雏形返回 null */
export function detectBuild(mods: StatMods): BuildDetection | null {
  const scored = BUILD_STYLES.map(style => {
    const keys = Object.keys(style.core) as AnyStatKey[]
    let sum = 0
    for (const key of keys) {
      const ref = style.core[key] ?? 1
      sum += Math.min(1, modOf(mods, key) / ref)
    }
    return { style, affinity: sum / keys.length }
  }).sort((a, b) => b.affinity - a.affinity)

  const best = scored[0]!
  if (best.affinity < 0.25) return null

  const second = scored[1]!
  const hasSecondary = second.affinity >= SECONDARY_MIN_AFFINITY
  const keys = Object.keys(best.style.core) as AnyStatKey[]
  return {
    style: best.style,
    affinity: best.affinity,
    stageName: best.affinity >= STYLE_MASTER_AFFINITY ? '大成' : best.affinity >= STYLE_MATURE_AFFINITY ? '成形' : '雏形',
    coreValues: keys.map(key => ({ key, value: modOf(mods, key) })).filter(x => x.value > 0),
    secondary: hasSecondary ? { style: second.style, affinity: second.affinity } : undefined,
    displayName: hasSecondary ? `${shortName(best.style)}·${shortName(second.style)}` : best.style.name
  }
}

/**
 * 列出当前构筑里真正带着核心词条的来路。
 *
 * 识别读的是 finalStats.mods,来路却曾只扫功法/法宝/天赋——
 * 一身护符堆出来的罡盾,面板上「成路于」是空的。
 * 装备按实算词条(固有 + 随机),与 detectBuild 吃到的是同一份。
 */
export function buildSources(style: BuildStyleDef): string[] {
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const coreKeys = new Set(Object.keys(style.core))
  const names: string[] = []

  const hasCore = (mods: StatMods | undefined): boolean => {
    if (!mods) return false
    return Object.keys(mods).some(k => coreKeys.has(k) && (mods[k as AnyStatKey] ?? 0) !== 0)
  }

  for (const it of inventory.equippedItems) {
    if (!hasCore(resolveEquipStats(it).mods)) continue
    names.push(equipmentTemplate(it.templateId)?.name ?? '法器')
  }

  const equippedGongfa = [cultivation.mainGongfa, ...cultivation.subGongfa].filter((x): x is string => !!x)
  for (const id of equippedGongfa) {
    const def = gongfaDef(id)
    if (def && (hasCore(def.baseMods) || hasCore(def.perLevelMods))) names.push(`《${def.name}》`)
  }
  // 悟道分支并进 gongfaMods,不看是否仍在主修位
  for (const [gid, bid] of Object.entries(cultivation.gongfaBranch)) {
    const def = gongfaBranchDef(bid)
    if (def?.gongfaId === gid && hasCore(def.mods)) {
      const book = gongfaDef(gid)?.name ?? gid
      names.push(`《${book}》·${def.name}`)
    }
  }
  for (const art of inventory.currentArtifacts) {
    const def = artifactDef(art.defId)
    if (def && hasCore(def.passive)) names.push(`「${def.name}」`)
  }
  for (const b of cultivation.buffs) {
    const def = buffDef(b.defId)
    if (def && hasCore(def.mods)) names.push(`丹效·${def.name}`)
  }
  for (const id of player.reincarnation.talents) {
    const def = talentDef(id)
    if (def && hasCore(def.mods)) names.push(`天赋·${def.name}`)
  }
  if (player.titleId) {
    const def = titleDef(player.titleId)
    if (def && hasCore(def.mods)) names.push(`称号·${def.name}`)
  }
  if (player.mentor) {
    const def = mentorDef(player.mentor)
    if (def && hasCore(def.mods)) names.push(`师承·${def.name}`)
  }
  if (player.petId) {
    const def = petDef(player.petId)
    if (def && hasCore(def.mods)) names.push(`灵兽·${def.name}`)
  }
  return names
}
