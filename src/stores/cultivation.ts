/** 修行状态 —— 功法(习得/装配)与 Buff */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuffInstance, CombatSkill, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { gongfaDef, gongfaMaxLevel } from '@/data/gongfa'
import { buffDef } from '@/data/buffs'
import { gongfaBranchDef } from '@/data/gongfaBranches'
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
    /** Phase 31 A3:功法悟道分支(gongfaId → branchId,满级后择一) */
    const gongfaBranch = ref<Record<string, string>>({})

    /**
     * 存档修复:功法表/分支表被写坏时,属性汇总会在渲染期 Object.entries(null) 抛错。
     * 形状不对就修回可用值 —— 见 utils/saveShape 与 storeResilience.spec。
     */
    function sanitize(): void {
      const fixedLearned: Record<string, number> = {}
      for (const [id, lv] of Object.entries(asNumberRecord(learned.value, 0))) {
        if (lv > 0) {
          // 等级钳到该功法满级(秘术 3 / 主辅 9,以数据源为准)——坏档把等级写远超上限
          // 会按 perLevel 无限放大属性且游戏内无降级路径,永久膨胀
          fixedLearned[id] = Math.min(Math.max(1, Math.floor(lv)), gongfaMaxLevel(gongfaDef(id)))
        }
      }
      learned.value = fixedLearned
      if (typeof mainGongfa.value !== 'string' || !fixedLearned[mainGongfa.value]) mainGongfa.value = null
      subGongfa.value = asStringArray(subGongfa.value).filter(id => fixedLearned[id] !== undefined)
      buffs.value = asArray<BuffInstance>(buffs.value, [], b => !!b && typeof (b as BuffInstance).defId === 'string').map(b => {
        const capSec = buffCapSec(b.defId)
        const capMs = capSec === undefined ? undefined : capSec * 1000
        if (capMs === undefined) {
          // 不受丹药上限约束的状态(闭关/重伤/祝福):仅保证时限是有限数字,不另加局部上限
          return { ...b, endsAt: asFiniteNumber(b.endsAt, Date.now(), 0) }
        }
        // 受上限的丹药 buff:读档复钳到 2× 单颗上限(与 addBuff 同口径)。
        // 此前只钳写入口、没钳读档——坏档/老档若带超限时长(如 5× 的「无限囤」残留),
        // 会横跨整段会话有效,尤以修速类(+50% 聚灵)为甚。endsAt 钳在 now+cap、added 钳在 cap。
        const now = Date.now()
        return {
          ...b,
          endsAt: Math.min(asFiniteNumber(b.endsAt, now, 0), now + capMs),
          added: Math.min(asFiniteNumber(b.added, 0, 0), capMs)
        }
      })
      // 悟道分支:只留「bid 真属于 gid 且该功法已满级」的条目 —— 分支是不装配仍生效的永久
      // 被动,注入 {m_daozu:'b_daozu_ben'} 会白送词条,故归属与习得状态都要校验
      const keptBranch: Record<string, string> = {}
      for (const [gid, bid] of Object.entries(asRecord<string>(gongfaBranch.value))) {
        const br = gongfaBranchDef(bid)
        if (br?.gongfaId === gid && (fixedLearned[gid] ?? 0) >= gongfaMaxLevel(gongfaDef(gid))) keptBranch[gid] = bid
      }
      gongfaBranch.value = keptBranch
    }

    const gongfaMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      if (mainGongfa.value && learned.value[mainGongfa.value]) {
        sources.push(gongfaModsAt(mainGongfa.value, learned.value[mainGongfa.value]!))
      }
      // 有效辅修只计到洞府辅修槽位预算(与装配页 loadout 的 slice(0, subGongfaSlots) 同口径):
      // 转世后藏书楼缩水、槽位变少,超出预算的伴生功法不再白给词条 ——
      // 玩家选中的列表原样保留,待藏书楼抬回、槽位恢复时按加装顺序自动重新激活。
      const subCap = useDongfuStore().subGongfaSlots
      for (const id of subGongfa.value.slice(0, subCap)) {
        if (learned.value[id]) sources.push(gongfaModsAt(id, learned.value[id]!))
      }
      // Phase 31 A3:悟道分支追加词条(选过的功法)
      for (const [gid, bid] of Object.entries(gongfaBranch.value)) {
        const def = gongfaBranchDef(bid)
        if (def?.gongfaId === gid) sources.push(def.mods)
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
      if (learned.value[id]) return false
      learned.value = { ...learned.value, [id]: 1 }
      const def = gongfaDef(id)
      if (def?.type === 'main' && !mainGongfa.value) mainGongfa.value = id
      return true
    }

    function upgrade(id: string): void {
      const lv = learned.value[id]
      if (!lv) return
      learned.value = { ...learned.value, [id]: lv + 1 }
    }

    function equipMain(id: string): void {
      if (learned.value[id]) mainGongfa.value = id
    }

    function toggleSub(id: string, maxSlots: number): boolean {
      if (subGongfa.value.includes(id)) {
        subGongfa.value = subGongfa.value.filter(x => x !== id)
        return true
      }
      if (subGongfa.value.length >= maxSlots) return false
      if (!learned.value[id]) return false
      subGongfa.value = [...subGongfa.value, id]
      return true
    }

    /**
     * 施加状态 —— 同一状态重复施加时**时长叠加**,不是取较长者刷新。
     *
     * 旧实现 Math.max(旧 endsAt, now + dur) 等价于「刷新」:buff 还剩 20 分钟时再服同一味丹,
     * 那 20 分钟被清零重算,药力白丢。改为把新时长加到已有剩余时长上(尚在生效的实例以
     * 旧 endsAt 为基准),「药力化开」这句承诺的时长才足额兑现。
     *
     * 已过期(理论上 pruneBuffs 已清,但离线/坏档可能残留)的实例以 now 为基准,
     * 不把历史负剩余时间叠进来。
     */
    function addBuff(defId: string, now: number): void {
      const def = buffDef(defId)
      if (!def) return
      const add = def.durationSec * 1000
      // 丹药增益有上限(单颗 × 倍数,见 core/buffCap):超过上限的部分被削掉
      const capSec = buffCapSec(defId)
      const capMs = capSec === undefined ? undefined : capSec * 1000
      const existing = buffs.value.find(b => b.defId === defId)
      if (existing) {
        let endsAt = Math.max(existing.endsAt, now) + add
        // added 随施加累加,UI 报叠 N 的凭据;旧档实例没有 added 时按「已有一份」起算
        let added = (existing.added ?? add) + add
        if (capMs !== undefined) {
          // 到顶之后再服:endsAt 与 added 都钳在上限,不再线性堆(白吃的一枚由服丹文案报清)
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
      const next = buffs.value.filter(b => b.endsAt > now)
      if (next.length !== buffs.value.length) {
        buffs.value = next
        return true
      }
      return false
    }

    function clearNegativeBuffs(): void {
      buffs.value = buffs.value.filter(b => buffDef(b.defId)?.kind !== 'injury')
    }

    // Phase 31 A3:选择功法悟道分支(满级后一次,不可改)
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
      clearNegativeBuffs,
      chooseBranch,
      sanitize
    }
  },
  { persist: persistConfig('cultivation') }
)
