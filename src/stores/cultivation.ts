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
        const def = gongfaDef(id)
        // 认不出的功法 id 不该留在「已习得」里:它既升不了级也练不出效果,却会被转世
        // 原样带走(见 reincarnation.carryGongfa),还会让藏书统计多出一门。
        if (def && lv > 0) {
          // 等级钳到该功法满级(秘术 3 / 主辅 9,以数据源为准)——坏档把等级写远超上限
          // 会按 perLevel 无限放大属性且游戏内无降级路径,永久膨胀
          fixedLearned[id] = Math.min(Math.max(1, Math.floor(lv)), gongfaMaxLevel(def))
        }
      }
      learned.value = fixedLearned
      // 主修席只收主修门类:坏档把辅修/秘术写进 mainGongfa 时,gongfaMods 会照算,
      // 界面却仍按「主修」展示 —— 门类与席位从此各说各话。
      if (typeof mainGongfa.value !== 'string' || gongfaDef(mainGongfa.value)?.type !== 'main' || !fixedLearned[mainGongfa.value]) {
        mainGongfa.value = null
      }
      // 辅修同一门写两遍会白占一个槽(槽位预算按条数算),把真正想上的后一门挤出去。
      // 与 toggleSub 的「已在列表就不再加」同口径:按首次出现保序去重。
      // 主修也不能同时占辅修席:同一门词条会被算两遍,且「装配门类」与席位分叉。
      subGongfa.value = [...new Set(asStringArray(subGongfa.value))].filter(
        id => fixedLearned[id] !== undefined && gongfaDef(id)?.type !== 'main' && id !== mainGongfa.value
      )
      /**
       * Buff 同一状态写两条时,`buffMods` 会把同一份词条叠加两次(面板/战斗凭空多一截)。
       *
       * 写入口 addBuff 始终按 defId 合并成**一条**(旧实现也只是刷新同一条),
       * 故同一 defId 的多行只可能来自坏档/重复导入 —— 不是「两次独立服药」。
       * 因此这里只留**剩余最久**的那一行,连同它自己的 added:显示与到期同源
       * (不会报两份剂量却提前失效),也不把一条坏档复制成凭空多出的药力。
       */
      const now = Date.now()
      const surviving = new Map<string, BuffInstance>()
      // 认不出的状态 id 同样清掉:面板与到期提示都按定义取名,野 id 永远露不出来。
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
          // 不受丹药上限约束的状态(闭关/重伤/祝福):仅保证时限是有限数字,不另加局部上限
          return { defId: b.defId, endsAt: b.endsAt, ...(added === undefined ? {} : { added }) }
        }
        // 受上限的丹药 buff:读档复钳到 2× 单颗上限(与 addBuff 同口径)。
        // 此前只钳写入口、没钳读档——坏档/老档若带超限时长(如 5× 的「无限囤」残留),
        // 会横跨整段会话有效,尤以修速类(+50% 聚灵)为甚。
        return {
          defId: b.defId,
          endsAt: Math.min(b.endsAt, now + capMs),
          ...(added === undefined ? {} : { added: Math.min(added, capMs) })
        }
      })
      // 悟道分支:只留「bid 真属于 gid 且该功法已习得」的条目 —— 分支是不装配仍生效的永久
      // 被动,注入 {m_daozu:'b_daozu_ben'} 会白送词条,故归属必须校验。
      // 习得状态只要求「已学」,不要求满级:转世会把功法落回 1 层(见
      // reincarnation.carryGongfa,只留一部满级),而分支按契约「转世不失」永久保留 ——
      // 若按满级收,分支一经过转世+读档就被静默抹掉,永久被动名存实亡。
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
      // 有效辅修只计到洞府辅修槽位预算(与装配页 loadout 的 slice(0, subGongfaSlots) 同口径):
      // 转世后藏书楼缩水、槽位变少,超出预算的伴生功法不再白给词条 ——
      // 玩家选中的列表原样保留,待藏书楼抬回、槽位恢复时按加装顺序自动重新激活。
      const subCap = useDongfuStore().subGongfaSlots
      for (const id of subGongfa.value.slice(0, subCap)) {
        if (learned.value[id]) sources.push(gongfaModsAt(id, learned.value[id]!))
      }
      // Phase 31 A3:悟道分支追加词条(选过的功法)。分支只在满级可择,加成也要随
      // 「仍满级且仍装配」生效 —— 否则转世把层数折回后,一门 lv1 功法照旧吃满级专属分支;
      // 换下装配席后分支仍永久叠加,与「功法=装配规则」相悖。
      for (const [gid, bid] of Object.entries(gongfaBranch.value)) {
        const def = gongfaBranchDef(bid)
        const gdef = gongfaDef(gid)
        const lv = learned.value[gid]
        if (
          def?.gongfaId === gid &&
          gdef &&
          lv != null &&
          lv >= gongfaMaxLevel(gdef) &&
          (gid === mainGongfa.value || subGongfa.value.slice(0, subCap).includes(gid))
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
      // 满级闸不能只靠服务层 gongfaUpgradeCost:公共写入一旦被绕过,perLevel 词条
      // 会无限放大,而读档 sanitize 只能在下次加载补救。
      if (!def || !lv || lv >= gongfaMaxLevel(def)) return
      learned.value = { ...learned.value, [id]: lv + 1 }
    }

    function equipMain(id: string): boolean {
      const def = gongfaDef(id)
      if (!def || def.type !== 'main' || !learned.value[id]) return false
      mainGongfa.value = id
      // 防御性收口:若内存里已被直接写成主辅重叠,设主修时顺手撤掉辅修席那一份。
      if (subGongfa.value.includes(id)) subGongfa.value = subGongfa.value.filter(x => x !== id)
      return true
    }

    function toggleSub(id: string, maxSlots: number): boolean {
      if (subGongfa.value.includes(id)) {
        subGongfa.value = subGongfa.value.filter(x => x !== id)
        return true
      }
      // NaN 会让 `length >= maxSlots` 恒为 false,坏调用等于绕过槽位上限。
      if (!Number.isFinite(maxSlots) || maxSlots < 1) return false
      const def = gongfaDef(id)
      // 主修门类不得占辅修席(否则同一门被主/辅各算一遍);秘术与辅修共用槽位。
      if (!def || def.type === 'main' || id === mainGongfa.value) return false
      if (subGongfa.value.length >= Math.floor(maxSlots)) return false
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

    /**
     * 暂停恢复:把每条 Buff 的到期时刻顺延暂停时长。
     *
     * 暂停期间心跳不结算,`endsAt` 却是墙钟 —— 不顺延就等于「开着重置确认窗,
     * 丹药自己过期」。与 `enginePause.gameNow()` 的冻结语义配套。
     */
    function shiftBuffEnds(pausedMs: number): void {
      if (pausedMs <= 0 || buffs.value.length === 0) return
      buffs.value = buffs.value.map(b => ({ ...b, endsAt: b.endsAt + pausedMs }))
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
      shiftBuffEnds,
      clearNegativeBuffs,
      chooseBranch,
      sanitize
    }
  },
  { persist: persistConfig('cultivation') }
)
