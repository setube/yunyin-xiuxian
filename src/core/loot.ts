/** 掉落服务:战斗胜利后的奖励结算 */
import type { ArtifactDef, EquipmentInstance, GNum, RegionDef } from '@/types'
import { rng } from '@/utils/random'
import { gnZero, isZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { salvageYieldText } from '@/ui/forgeText'
import { isRareQuality, qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { PILLS, pillRank } from '@/data/pills'
import { STONE_AMT_PER_BATTLE } from './pillValue'
import { HERB_GRADE_SHORT, herbGradeOfMajor } from '@/data/herbGrades'
import { ARTIFACTS, artifactDef } from '@/data/artifacts'
import { lifeThemeDef } from '@/data/lifeThemes'
import {
  ARTIFACT_DROP_CHANCE,
  BATTLE_EXP_SECS,
  ARTIFACT_DUPLICATE_WUDAO,
  EQUIP_DROP_CHANCE,
  EQUIP_DROP_CHANCE_CAP,
  HERB_DROP_CHANCE,
  INSTANT_EXP_LAYER_CAP,
  ORE_DROP_CHANCE,
  PAGE_DROP_CHANCE,
  PILL_DROP_CHANCE
} from '@/data/constants'
import { generateEquipment } from './equipGen'
import { expFromSecs, stoneByTier } from './formulas'
import { modOf, capChance } from './statsCalc'
import { personalityEffects } from './petPersonality'
import { autoRecycleReason, compareEvictable, keepVerdict, shouldAutoRecycle, smartKeepEnabled } from './smartKeep'
import { salvageOf } from './salvage'
import { checkQualityAchievement, collect, track } from './progress'
import { harvestMaterials } from './loreService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useUiStore } from '@/stores/ui'

export interface DropSummary {
  /** 战报文案(含「战利翻倍」这类提示) */
  lines: string[]
  /** 本次真正入账的灵石(与 addStone 同一份数,非另算的期望值) */
  stone: GNum
  /** 本次真正入账的修为(与 gainExp 的同一份数) */
  exp: GNum
  /** 战报里的实物条数(残页/装备/丹药/法宝);「战利翻倍」这类提示不算拾获 */
  items: number
}

export interface AcquireResult {
  /** 给人看的文案(战斗报告/事件/弹窗行) */
  line: string
  /** 是否真正入了行囊(未入 = 自动化尘或满包化尘) */
  bagged: boolean
  /** 智能收纳腾位:新件入包、包里旧物化尘,此时 dust / stone 记的是旧物;结算「回收化尘」须计入 */
  evicted: boolean
  /** 本次拾取化出的器灵尘(新件化尘,或腾位化掉的旧件;单纯入包为 0) */
  dust: number
  /** 本次拾取的灵石返还(化尘时可能有:被挤掉的旧件若练过) */
  stone: GNum
}

/** 装备入账监听者(离线结算用它把历练、镇压、际遇三条路记成一本账) */
type AcquireListener = (inst: EquipmentInstance, res: AcquireResult) => void
const acquireListeners = new Set<AcquireListener>()

/** 订阅每一次装备入账,返回退订函数 */
export function onAcquire(listener: AcquireListener): () => void {
  acquireListeners.add(listener)
  return () => {
    acquireListeners.delete(listener)
  }
}

/**
 * 拾取一件已生成的装备:入包或折算。在线与离线都先过自动回收裁决(仅智能收纳开启时生效);
 * forceKeep(新手馈赠)不受此闸约束。
 */
export function acquireEquipment(inst: EquipmentInstance, opts: { quiet?: boolean; forceKeep?: boolean } = {}): AcquireResult {
  const res = acquireInto(inst, opts)
  for (const listener of acquireListeners) listener(inst, res)
  return res
}

function acquireInto(inst: EquipmentInstance, opts: { quiet?: boolean; forceKeep?: boolean }): AcquireResult {
  const { quiet = false, forceKeep = false } = opts
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const q = qualityDef(inst.quality)
  const t = equipmentTemplate(inst.templateId)
  const label = `${q.name}·${t?.name ?? '不明之物'}`
  // 先记见闻再判去留:化尘的也算见过。此处是装备入账唯一漏斗,图鉴收录深度不另设埋点
  useLoreStore().noteEquipSeen(inst.templateId, q.rank, inst.tier)
  track('equipsGained')
  collect('equip', inst.templateId)
  checkQualityAchievement(q.rank)
  /** 化尘结算:与手动分解同一条账(底材 + 强化投入八成) */
  const toDust = (item: EquipmentInstance): AcquireResult => {
    const gain = salvageOf(item)
    resources.addSmall('dust', gain.dust)
    resources.addStone(gain.stone)
    const tail = `化作${salvageYieldText(gain.dust, isZero(gain.stone) ? undefined : formatGN(gain.stone))}`
    return { line: tail, bagged: false, evicted: false, dust: gain.dust, stone: gain.stone }
  }
  const why = !forceKeep && shouldAutoRecycle(inst) ? autoRecycleReason(inst) : null
  if (why) {
    const res = toDust(inst)
    return { ...res, line: `${label}(自动回收·${why},${res.line})` }
  }
  if (!inventory.addEquipment(inst)) {
    // 腾位:化掉包内最差的「与道无缘」件
    if (smartKeepEnabled() && keepVerdict(inst).keep) {
      const evictable = inventory.bagItems
        .filter(it => !it.locked && !keepVerdict(it).keep)
        .sort(compareEvictable)[0]
      if (evictable) {
        inventory.removeEquipment(evictable.uid)
        const evicted = toDust(evictable)
        if (inventory.addEquipment(inst)) {
          return {
            line: `${label}(收纳规则腾位:${equipmentTemplate(evictable.templateId)?.name ?? '旧物'}${evicted.line})`,
            bagged: true,
            evicted: true,
            dust: evicted.dust,
            stone: evicted.stone
          }
        }
        // 腾位后仍放不进(理论上不会):旧物已化尘不追回,新件按满包折算
      }
    }
    const res = toDust(inst)
    return { ...res, line: `${label}(行囊已满,${res.line})` }
  }
  if (!quiet && isRareQuality(q)) {
    ui.toast(`拾得「${label}」`, 'rare')
  }
  return { line: label, bagged: true, evicted: false, dust: 0, stone: gnZero() }
}

/**
 * 收入一件法宝;重复则折算悟道点。
 * @param quiet 不弹 toast(离线等批量结算用)
 * @param autoEquip 空祭炼位时自动祭上。离线传 false(玩家不在场)
 */
export function acquireArtifact(defId: string, quiet = false, autoEquip = true): string {
  const gain = acquireArtifactGain(defId, quiet, autoEquip)
  return gain?.line ?? ''
}

/** 一次法宝到手的结构(批量结算按件聚合播报用) */
export interface ArtifactGain {
  defId: string
  name: string
  /** 给人看的那一行(单件口径) */
  line: string
  /** 囊中已有、并未入囊 */
  duplicate: boolean
  /** 重复折算的悟道点(非重复为 0) */
  wudao: number
}

/**
 * 收入一件法宝,回报结构而非只给一句文案。
 * 调用方判重读 duplicate;判据在 addArtifact 内部,另抄一份会分叉。
 * @return null 表示野 id(无此法宝),调用方须停止后续抽取
 */
export function acquireArtifactGain(defId: string, quiet = false, autoEquip = true): ArtifactGain | null {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const def = artifactDef(defId)
  if (!def) return null
  collect('artifact', defId)
  const player = usePlayerStore()
  const vow = player.reincarnation.vow
  // 立下「整世不祭法宝」(taboo=artifact)之题时只入囊、不自动祭上;破题由 exploration 的 taboo 判定负责
  const forbidArtifact = Boolean(vow && !vow.broken && lifeThemeDef(vow.themeId)?.taboo === 'artifact')
  if (!inventory.addArtifact(defId, autoEquip && !forbidArtifact)) {
    resources.addSmall('wudao', ARTIFACT_DUPLICATE_WUDAO)
    return {
      defId,
      name: def.name,
      line: `法宝「${def.name}」(已拥有,化作悟道点×${ARTIFACT_DUPLICATE_WUDAO})`,
      duplicate: true,
      wudao: ARTIFACT_DUPLICATE_WUDAO
    }
  }
  if (!quiet) ui.toast(`获得法宝「${def.name}」`, 'rare')
  return { defId, name: def.name, line: `法宝「${def.name}」`, duplicate: false, wudao: 0 }
}

/** 随机一件当前境界可用的掉落丹药 */
export function randomDropPill(major: number): string | null {
  const pool = PILLS.filter(p => p.minRealm <= major && !p.recipe)
  if (pool.length === 0) return null
  const picked = rng.weighted(pool, p => 100 / (1 + pillRank(p) * 2))
  return picked.id
}

/**
 * 就近加成的窗口与幅度:层级差 5 阶以内吃加成,同层级最多 ×21。
 * ×6 压不住旧物凡品(权重 100)对本界域玄/地/天(14~10)的品质差,混沌海又会多半是墨玉葫芦;
 * 实测 32 阶抽到仙界以上之物:×6 时 0.40,×21 时 0.61。
 */
export const ARTIFACT_NEAR_WINDOW = 5
export const ARTIFACT_NEAR_BONUS = 4

/**
 * 一件法宝在某个层级下的掉落权重:品质权重 × 就近加成。
 * 用加法而非指数衰减:旧法宝不被彻底关掉(图鉴要补齐)。
 */
export function artifactDropWeight(def: ArtifactDef, tier: number): number {
  const qualityWeight = 100 / (1 + qualityDef(def.quality).rank * 1.5)
  const distance = Math.max(0, tier - def.fromTier)
  return qualityWeight * (1 + ARTIFACT_NEAR_BONUS * Math.max(0, ARTIFACT_NEAR_WINDOW - distance))
}

/** 随机一件玩家层级可及的法宝(权重见 artifactDropWeight) */
export function randomDropArtifact(tier: number): string | null {
  const pool = ARTIFACTS.filter(a => a.fromTier <= tier)
  if (pool.length === 0) return null
  return rng.weighted(pool, a => artifactDropWeight(a, tier)).id
}

/**
 * 战斗胜利掉落。
 * 概率进 rng.chance 前先归一到 [0,1](rng.chance 不钳制,>1 必然掉落、<0 永不掉落);
 * capChance 取 statsCalc 唯一一份,与 combat 共用。
 * @param autoEquipArtifact 空祭炼位时自动祭上法宝;离线整段结算传 false(玩家不在场,同 autoResolveEvent)
 */
export function afterWin(region: RegionDef, rewardMult: number, isBoss: boolean, autoEquipArtifact = true): DropSummary {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const mods = player.finalStats.mods
  const lines: string[] = []
  let items = 0
  const tier = region.tier
  const bossMult = isBoss ? 4 : 1
  const doubled = rng.chance(capChance(modOf(mods, 'doubleDropRate'))) ? 2 : 1

  const stoneAmt = rng.float(0.8, 1.2) * rewardMult * bossMult * doubled * (1 + modOf(mods, 'spiritStoneGain'))
  const stone = stoneByTier(tier, STONE_AMT_PER_BATTLE * stoneAmt)
  resources.addStone(stone)

  // 战斗修为与丹药、际遇同一把尺:等效闭关时长 × 各倍率,封顶不满一层
  const expSecs = BATTLE_EXP_SECS * rewardMult * (isBoss ? 4 : 1) * doubled * (1 + modOf(mods, 'expGain'))
  const exp = expFromSecs(player.expReq, expSecs, player.cultPerSec, INSTANT_EXP_LAYER_CAP)
  player.gainExp(exp)

  // 战报须显式报品(高 1 品 = 贵 10 倍),与 eventEngine 的 `${HERB_GRADE_SHORT[grade]}灵草 +N` 同口径
  if (rng.chance(HERB_DROP_CHANCE)) {
    const n = rng.int(1, 3) * doubled
    const grade = herbGradeOfMajor(region.minRealm)
    resources.addHerb(grade, n)
    harvestMaterials(tier, 'herb', n)
    lines.push(`${HERB_GRADE_SHORT[grade]}灵草 +${n}`)
  }
  if (rng.chance(ORE_DROP_CHANCE)) {
    const n = rng.int(1, 2) * doubled
    resources.addSmall('ore', n)
    harvestMaterials(tier, 'ore', n)
    // 与灵草同规:掉落须报进战报
    lines.push(`玄铁 +${n}`)
  }
  if (rng.chance(capChance(PAGE_DROP_CHANCE * rewardMult))) {
    const n = rng.int(1, 2) * doubled
    resources.addSmall('page', n)
    lines.push(`功法残页 +${n}`)
    items += 1
  }

  // luck 并入灵兽性格的 dropLuck(兑现图鉴承诺)
  const luck = modOf(mods, 'luck') + personalityEffects(player.petId).dropLuck
  const equipChance = EQUIP_DROP_CHANCE * rewardMult * (1 + modOf(mods, 'dropRate')) * (isBoss ? 2.5 : 1)
  for (let i = 0; i < doubled; i += 1) {
    if (rng.chance(Math.min(EQUIP_DROP_CHANCE_CAP, equipChance)) || (isBoss && i === 0)) {
      // 普通战不传品质下限:传了(哪怕是 0)即「显式下限」,品质窗口失效,在线会比离线/审计多掉低阶高品。首领例外
      const inst = generateEquipment(tier, rng, isBoss ? { luck, minQualityRank: 1 } : { luck })
      lines.push(acquireEquipment(inst).line)
      items += 1
    }
  }

  if (rng.chance(capChance(PILL_DROP_CHANCE * rewardMult * (isBoss ? 3 : 1)))) {
    const pillId = randomDropPill(player.major)
    if (pillId) {
      inventory.addPill(pillId, 1)
      collect('pill', pillId)
      const def = PILLS.find(p => p.id === pillId)
      lines.push(`丹药「${def?.name ?? ''}」`)
      items += 1
    }
  }

  if (rng.chance(capChance(ARTIFACT_DROP_CHANCE * (isBoss ? 6 : 1) * (1 + luck)))) {
    const artId = randomDropArtifact(tier)
    if (artId) {
      lines.push(acquireArtifact(artId, false, autoEquipArtifact))
      items += 1
    }
  }

  if (doubled === 2) {
    lines.unshift(lines.length ? '战利翻倍' : '灵石修为翻倍')
  }

  return { lines, stone, exp, items }
}

/**
 * 一胜的期望所得(出行预览用),与 afterWin 同一套公式。
 * 灵石取 rng.float(0.8,1.2) 的均值 1.0、非首领;修为走 expFromSecs。
 */
export function expectedWinReward(region: RegionDef, rewardMult: number): { stone: GNum; exp: GNum } {
  const player = usePlayerStore()
  const mods = player.finalStats.mods
  const tier = region.tier
  // 福缘翻倍均值 1 + capChance(p),与 afterWin 的 doubled、离线的 doubleMult 同源;漏乘则预览低 5~12%
  const doubleMult = 1 + capChance(modOf(mods, 'doubleDropRate'))
  const stone = stoneByTier(tier, 10 * rewardMult * (1 + modOf(mods, 'spiritStoneGain')) * doubleMult)
  const exp = expFromSecs(
    player.expReq,
    BATTLE_EXP_SECS * rewardMult * (1 + modOf(mods, 'expGain')) * doubleMult,
    player.cultPerSec,
    INSTANT_EXP_LAYER_CAP
  )
  return { stone, exp }
}
