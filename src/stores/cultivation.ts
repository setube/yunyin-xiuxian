/** 修行状态 —— 功法(习得/装配)与 Buff */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuffInstance, CombatSkill, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { gongfaDef, gongfaMaxLevel } from '@/data/gongfa'
import { buffDef } from '@/data/buffs'
import { branchEffective, gongfaBranchDef } from '@/data/gongfaBranches'
import { mergeMods } from '@/core/statsCalc'
import { buffCapSec } from '@/core/buffCap'
import { useDongfuStore } from '@/stores/dongfu'
import { asArray, asNumberRecord, asRecord, asStringArray, asFiniteNumber } from '@/utils/saveShape'

/** 功法在某等级下的属性 */
export function gongfaModsAt(id: string, level: number): StatMods {
  const def = gongfaDef(id)
  if (!def) return {}
  const out: StatMods = {}
  for (const k in def.baseMods) {
    const key = k as keyof StatMods
    out[key] = def.baseMods[key] ?? 0
  }
  for (const k in def.perLevelMods) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (def.perLevelMods[key] ?? 0) * Math.max(0, level - 1)
  }
  return out
}

export const useCultivationStore = defineStore(
  'cultivation',
  () => {
    /** 已习得功法:id → 等级 */
    const learned = ref<Record<string, number>>({})
    const mainGongfa = ref<string | null>(null)
    const subGongfa = ref<string[]>([])
    const buffs = ref<BuffInstance[]>([])
    /** 功法悟道分支:gongfaId → branchId(满级后择一) */
    const gongfaBranch = ref<Record<string, string>>({})

    /** 存档修复;坏的功法表 / 分支表会让属性汇总在渲染期抛错。见 utils/saveShape 与 storeResilience.spec */
    function sanitize(): void {
      const fixedLearned: Record<string, number> = {}
      for (const [id, lv] of Object.entries(asNumberRecord(learned.value, 0))) {
        const def = gongfaDef(id)
        // 认不出的功法 id 须清:会被转世原样带走(见 reincarnation.carryGongfa),并虚增藏书统计
        if (def && lv > 0) {
          // 钳到满级(秘术 3 / 主辅 9,以数据源为准):超限等级按 perLevel 放大属性,且游戏内无降级路径
          fixedLearned[id] = Math.min(Math.max(1, Math.floor(lv)), gongfaMaxLevel(def))
        }
      }
      learned.value = fixedLearned
      // 非主修门类不得占主修席:否则 gongfaMods 照算,界面却按主修展示
      if (typeof mainGongfa.value !== 'string' || gongfaDef(mainGongfa.value)?.type !== 'main' || !fixedLearned[mainGongfa.value]) {
        mainGongfa.value = null
      }
      // 辅修按首次出现保序去重(槽位按条数算,与 toggleSub 同口径);主修不得同占辅修席(词条会算两遍)
      subGongfa.value = [...new Set(asStringArray(subGongfa.value))].filter(
        id => fixedLearned[id] !== undefined && gongfaDef(id)?.type !== 'main' && id !== mainGongfa.value
      )
      // 同一 defId 只留剩余最久的一行(连同其 added):addBuff 只写一条,多行只来自坏档,会让 buffMods 叠两次
      const now = Date.now()
      const surviving = new Map<string, BuffInstance>()
      for (const b of asArray<BuffInstance>(
        buffs.value,
        [],
        x => !!x && typeof (x as BuffInstance).defId === 'string' && buffDef((x as BuffInstance).defId) !== undefined
      )) {
        const cur = { ...b, endsAt: asFiniteNumber(b.endsAt, now, 0) }
        const prev = surviving.get(b.defId)
        if (!prev || cur.endsAt > prev.endsAt) surviving.set(b.defId, cur)
      }
      buffs.value = [...surviving.values()].map(b => {
        const capSec = buffCapSec(b.defId)
        const capMs = capSec === undefined ? undefined : capSec * 1000
        const added =
          typeof b.added === 'number' && Number.isFinite(b.added) && b.added > 0 ? b.added : undefined
        if (capMs === undefined) {
          // 无丹药上限的状态(闭关 / 重伤 / 祝福):不另加上限
          return { defId: b.defId, endsAt: b.endsAt, ...(added === undefined ? {} : { added }) }
        }
        // 丹药 buff 读档复钳到四个时辰上限(与 addBuff 同口径);旧档较短的合法时长不补长
        return {
          defId: b.defId,
          endsAt: Math.min(b.endsAt, now + capMs),
          ...(added === undefined ? {} : { added: Math.min(added, capMs) })
        }
      })
      // 分支须属于该功法且功法已习得;不要求满级:转世落回 1 层(见 reincarnation.carryGongfa),而分支「转世不失」
      const keptBranch: Record<string, string> = {}
      for (const [gid, bid] of Object.entries(asRecord<string>(gongfaBranch.value))) {
        const br = gongfaBranchDef(bid)
        if (br?.gongfaId === gid && (fixedLearned[gid] ?? 0) >= 1) keptBranch[gid] = bid
      }
      gongfaBranch.value = keptBranch
    }

    const gongfaMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      if (mainGongfa.value && learned.value[mainGongfa.value]) {
        sources.push(gongfaModsAt(mainGongfa.value, learned.value[mainGongfa.value]!))
      }
      // 有效辅修只计到辅修槽位预算(与装配页 loadout 同口径);超槽的选择保留,槽位恢复后按加装顺序生效
      const subCap = useDongfuStore().subGongfaSlots
      for (const id of subGongfa.value.slice(0, subCap)) {
        if (learned.value[id]) sources.push(gongfaModsAt(id, learned.value[id]!))
      }
      // 悟道分支词条只在「仍满级且仍装配」时生效 —— 与界面上的生效标记同读 branchEffective
      for (const [gid, bid] of Object.entries(gongfaBranch.value)) {
        const def = gongfaBranchDef(bid)
        const lv = learned.value[gid]
        if (
          def?.gongfaId === gid &&
          branchEffective(gid, {
            level: lv ?? 0,
            hasBranch: true,
            isMain: gid === mainGongfa.value,
            isEffectiveSub: subGongfa.value.slice(0, subCap).includes(gid)
          })
        ) {
          sources.push(def.mods)
        }
      }
      return mergeMods(sources)
    })

    const buffMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      for (const b of buffs.value) {
        const def = buffDef(b.defId)
        if (def) sources.push(def.mods)
      }
      return mergeMods(sources)
    })

    /** 主修功法附带的战斗技能 */
    const mainSkill = computed<CombatSkill | null>(() => {
      if (!mainGongfa.value) return null
      const def = gongfaDef(mainGongfa.value)
      return def?.skill ? { ...def.skill } : null
    })

    function learn(id: string): boolean {
      const def = gongfaDef(id)
      if (!def || learned.value[id]) return false
      learned.value = { ...learned.value, [id]: 1 }
      if (def?.type === 'main' && !mainGongfa.value) mainGongfa.value = id
      return true
    }

    function upgrade(id: string): void {
      const def = gongfaDef(id)
      const lv = learned.value[id]
      // 满级闸须在此再设一道,不能只靠服务层 gongfaUpgradeCost
      if (!def || !lv || lv >= gongfaMaxLevel(def)) return
      learned.value = { ...learned.value, [id]: lv + 1 }
    }

    function equipMain(id: string): boolean {
      const def = gongfaDef(id)
      if (!def || def.type !== 'main' || !learned.value[id]) return false
      mainGongfa.value = id
      if (subGongfa.value.includes(id)) subGongfa.value = subGongfa.value.filter(x => x !== id)
      return true
    }

    function toggleSub(id: string, maxSlots: number): boolean {
      if (subGongfa.value.includes(id)) {
        subGongfa.value = subGongfa.value.filter(x => x !== id)
        return true
      }
      // NaN 会让 `length >= maxSlots` 恒为 false,等于绕过槽位上限
      if (!Number.isFinite(maxSlots) || maxSlots < 1) return false
      const def = gongfaDef(id)
      // 主修门类不得占辅修席;秘术与辅修共用槽位
      if (!def || def.type === 'main' || id === mainGongfa.value) return false
      if (subGongfa.value.length >= Math.floor(maxSlots)) return false
      if (!learned.value[id]) return false
      subGongfa.value = [...subGongfa.value, id]
      return true
    }

    /** 施加状态:同一状态重复施加时时长叠加(不是取较长者刷新);已过期实例以 now 为基准 */
    function addBuff(defId: string, now: number): void {
      if (!Number.isFinite(now) || now < 0) return
      const def = buffDef(defId)
      if (!def) return
      const add = def.durationSec * 1000
      // 丹药增益上限四个时辰(见 core/buffCap)
      const capSec = buffCapSec(defId)
      const capMs = capSec === undefined ? undefined : capSec * 1000
      const existing = buffs.value.find(b => b.defId === defId)
      if (existing) {
        let endsAt = Math.max(existing.endsAt, now) + add
        // added:UI 报叠 N 的凭据;旧档缺 added 时按已有一份起算
        let added = (existing.added ?? add) + add
        if (capMs !== undefined) {
          // 到顶后钳住;白吃的一枚由服丹文案报出
          endsAt = Math.min(endsAt, now + capMs)
          added = Math.min(added, capMs)
        }
        buffs.value = buffs.value.map(b => (b.defId === defId ? { ...b, endsAt, added } : b))
      } else {
        buffs.value = [...buffs.value, { defId, endsAt: now + add, added: add }]
      }
    }

    function hasBuff(defId: string): boolean {
      return buffs.value.some(b => b.defId === defId)
    }

    /** 移除过期 Buff,返回是否有变化 */
    function pruneBuffs(now: number): boolean {
      if (!Number.isFinite(now)) return false
      const next = buffs.value.filter(b => b.endsAt > now)
      if (next.length !== buffs.value.length) {
        buffs.value = next
        return true
      }
      return false
    }

    /** 暂停恢复:endsAt 是墙钟,须顺延暂停时长(与 `enginePause.gameNow()` 的冻结语义配套) */
    function shiftBuffEnds(pausedMs: number): void {
      if (!Number.isFinite(pausedMs) || pausedMs <= 0 || buffs.value.length === 0) return
      buffs.value = buffs.value.map(b => ({ ...b, endsAt: b.endsAt + pausedMs }))
    }

    function clearNegativeBuffs(): void {
      buffs.value = buffs.value.filter(b => buffDef(b.defId)?.kind !== 'injury')
    }

    // 选择功法悟道分支(满级后一次,不可改)
    function chooseBranch(gongfaId: string, branchId: string): boolean {
      const full = (learned.value[gongfaId] ?? 0) >= gongfaMaxLevel(gongfaDef(gongfaId))
      const def = gongfaBranchDef(branchId)
      if (!full || !def || def.gongfaId !== gongfaId) return false
      if (gongfaBranch.value[gongfaId]) return false
      gongfaBranch.value = { ...gongfaBranch.value, [gongfaId]: branchId }
      return true
    }

    return {
      learned,
      mainGongfa,
      subGongfa,
      buffs,
      gongfaBranch,
      gongfaMods,
      buffMods,
      mainSkill,
      learn,
      upgrade,
      equipMain,
      toggleSub,
      addBuff,
      hasBuff,
      pruneBuffs,
      shiftBuffEnds,
      clearNegativeBuffs,
      chooseBranch,
      sanitize
    }
  },
  { persist: persistConfig('cultivation') }
)
