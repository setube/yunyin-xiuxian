/** 真仙终局状态 —— 道途 / 道源 / 战绩 / 道痕 / 远征进行时 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CelestialWorldDef, DaoMark, DaoPathId, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { mergeMods } from '@/core/statsCalc'
import { SOUL_SLOTS, soulMods as soulModsOf, type SoulInstance } from '@/data/souls'

export interface TrialRecord {
  clears: number
  /** 最少总回合(越少越好) */
  bestRounds: number
}

/** 路线远征进行时(可跨会话续行) */
export interface WorldRunState {
  worldId: string
  pactId: string | null
  /** 0..2 = 待选该层路线;3 = 待战界主 */
  layer: number
  /** 沿途节点累计的额外道源 */
  bonus: number
  rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number }[]
  carriedHpPct: number
  totalRounds: number
  /** 剑意/杀意逐胜层数 */
  winStacks: number
  /** 逆命契:签约时封印的主流派核心词条(负值) */
  sealedMods?: StatMods
}

const MAX_MARKS = 60

export const useEndgameStore = defineStore(
  'endgame',
  () => {
    /** 本世道途(转世后重选) */
    const daoPath = ref<DaoPathId | null>(null)
    /** 道源:跨世永存的终局资粮 */
    const daoSource = ref(0)
    const worldClears = ref<Record<string, number>>({})
    const trialRecords = ref<Record<string, TrialRecord>>({})
    const marks = ref<DaoMark[]>([])
    /** 进行中的路线远征(null = 无) */
    const worldRun = ref<WorldRunState | null>(null)
    /** 当前虚界(程序化生成、裁判过审的世界;id 恒为 'void') */
    const voidWorld = ref<CelestialWorldDef | null>(null)
    /** 今日天道完成日(day number;跨世保留) */
    const dailyDoneDay = ref<number | null>(null)
    /** 修行节点(Phase 28):跨世不灭的「首次」历史 */
    const milestones = ref<{ id: string; life: number; at: number }[]>([])
    /** 极限纪录(Phase 28):只与过去的自己比 */
    const records = ref<Record<string, { value: number; life: number; note: string }>>({})

    // Phase 30.9 道源/道果认知:一次性教学标记(终局导览 / 道果解释 / 资源说明已阅)
    const endgameTutorialSeen = ref(false)
    const daoFruitTutorialSeen = ref(false)
    const resourceDialogSeen = ref(false)
    /** 器魂:凡器在天界的形意。持有池 + 已装配(至多 SOUL_SLOTS 枚) */
    const souls = ref<SoulInstance[]>([])
    const equippedSouls = ref<string[]>([])
    const soulTutorialSeen = ref(false)

    /** 已装配器魂(过滤掉已不存在的 uid) */
    const activeSouls = computed<SoulInstance[]>(() => {
      // 防御两个数组字段:器魂是后加的 state,若存档来自旧版本、经过外部迁移或被手工改坏,
      // 恢复后这里可能不是数组。直接 .map 会在**渲染期**抛 TypeError,
      // 而 Vue 会不断重试渲染 —— 表现就是「出现异常,已记录」的 toast 反复弹出
      const equipped = equippedSouls.value
      const pool = souls.value
      if (!Array.isArray(equipped) || !Array.isArray(pool)) return []
      return equipped.map(id => pool.find(s => s.uid === id)).filter((s): s is SoulInstance => s !== undefined)
    })

    /** 持有的器魂(同上,保证调用方永远拿到数组) */
    const soulList = computed<SoulInstance[]>(() => (Array.isArray(souls.value) ? souls.value : []))

    /** 已装配器魂提供的词条合计(天界生效) */
    const soulMods = computed<StatMods>(() => mergeMods(activeSouls.value.map(soulModsOf)))

    function addSoul(soul: SoulInstance): void {
      souls.value = [...soulList.value, soul]
    }

    /** 装配器魂;槽位已满或已装配则返回 false */
    function equipSoul(uid: string): boolean {
      const equipped = Array.isArray(equippedSouls.value) ? equippedSouls.value : []
      if (equipped.includes(uid)) return false
      if (equipped.length >= SOUL_SLOTS) return false
      if (!soulList.value.some(s => s.uid === uid)) return false
      equippedSouls.value = [...equipped, uid]
      return true
    }

    function unequipSoul(uid: string): void {
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    /** 散去器魂(不可逆:原器早已毁去,散了就没了) */
    function dissolveSoul(uid: string): void {
      souls.value = soulList.value.filter(s => s.uid !== uid)
      equippedSouls.value = (Array.isArray(equippedSouls.value) ? equippedSouls.value : []).filter(id => id !== uid)
    }

    const totalClears = computed(
      () =>
        Object.values(worldClears.value).reduce((s, n) => s + n, 0) + Object.values(trialRecords.value).reduce((s, r) => s + r.clears, 0)
    )

    function chooseDao(id: DaoPathId): boolean {
      if (daoPath.value !== null) return false
      daoPath.value = id
      return true
    }

    function addDaoSource(n: number): void {
      daoSource.value = Math.max(0, Math.floor(daoSource.value + n))
    }

    function spendDaoSource(n: number): boolean {
      if (daoSource.value < n) return false
      daoSource.value -= n
      return true
    }

    function recordWorldClear(worldId: string): void {
      worldClears.value = { ...worldClears.value, [worldId]: (worldClears.value[worldId] ?? 0) + 1 }
    }

    function recordTrial(trialId: string, rounds: number): void {
      const prev = trialRecords.value[trialId]
      trialRecords.value = {
        ...trialRecords.value,
        [trialId]: {
          clears: (prev?.clears ?? 0) + 1,
          bestRounds: prev ? Math.min(prev.bestRounds, rounds) : rounds
        }
      }
    }

    function addMark(mark: DaoMark): void {
      marks.value = [mark, ...marks.value].slice(0, MAX_MARKS)
    }

    function markDailyDone(day: number): void {
      dailyDoneDay.value = day
    }

    /** 记一个修行节点(首次才记),返回是否新增 */
    function addMilestone(id: string, life: number): boolean {
      if (milestones.value.some(m => m.id === id)) return false
      milestones.value = [...milestones.value, { id, life, at: Date.now() }]
      return true
    }

    /** 更新极限纪录;better 决定方向(如最少回合取小),返回是否刷新 */
    function updateRecord(id: string, value: number, life: number, note: string, better: 'min' | 'max'): boolean {
      const prev = records.value[id]
      if (prev && (better === 'min' ? value >= prev.value : value <= prev.value)) return false
      records.value = { ...records.value, [id]: { value, life, note } }
      return true
    }

    /** 转世:道途归还天地,道源与道痕随神魂不灭;进行中的远征就此中断 */
    function onRebirth(): void {
      daoPath.value = null
      worldRun.value = null
    }

    return {
      daoPath,
      daoSource,
      worldClears,
      trialRecords,
      marks,
      worldRun,
      voidWorld,
      dailyDoneDay,
      milestones,
      records,
      endgameTutorialSeen,
      souls,
      equippedSouls,
      soulTutorialSeen,
      activeSouls,
      soulList,
      soulMods,
      addSoul,
      equipSoul,
      unequipSoul,
      dissolveSoul,
      daoFruitTutorialSeen,
      resourceDialogSeen,
      totalClears,
      chooseDao,
      addDaoSource,
      spendDaoSource,
      recordWorldClear,
      recordTrial,
      addMark,
      markDailyDone,
      addMilestone,
      updateRecord,
      onRebirth
    }
  },
  { persist: persistConfig('endgame') }
)
