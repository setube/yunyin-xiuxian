/**
 * 收徒状态 —— 已收弟子与他们的游历任务(持久化,须带 sanitize;见 storeResilience.spec)
 *
 * 任务按墙钟走(不存跑腿时钟,完工只看 finishAt 是否已过),离线归来、或打开界面
 * 一拍 collectFinished 即收割。产出由 apprenticeService 纯算,这里只管入账。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { rng } from '@/utils/random'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { stoneByTier } from '@/core/formulas'
import { herbGradeOfMajor } from '@/data/herbGrades'
import {
  APPRENTICE_MAX_LEVEL,
  APPRENTICES,
  BOND_TITLES,
  STARTER_APPRENTICE,
  apprenticeDef,
  apprenticeSlots,
  type ApprenticeSpec
} from '@/data/apprentices'
import {
  apprenticeSpoils,
  apprenticeTaskSeconds,
  dispatchAllToNeed,
  taskDone,
  type OwnedApprentice,
  type TaskSpoils
} from '@/core/apprenticeService'
import { asArray } from '@/utils/saveShape'

let seq = 0
function nextUid(): string {
  seq += 1
  return `apt_${Date.now().toString(36)}_${seq.toString(36)}`
}

function isSpec(v: unknown): v is ApprenticeSpec {
  return v === 'herb' || v === 'ore' || v === 'adventure' || v === 'seek' || v === 'study'
}

function clampLevel(v: unknown): number {
  const n = Math.floor(Number(v) || 1)
  return Math.min(APPRENTICE_MAX_LEVEL, Math.max(1, n))
}

function clampBond(v: unknown): number {
  const n = Math.floor(Number(v) || 0)
  return Math.max(0, n)
}

/** 跨世之缘只对「真传(最高羁绊位阶)」开放,封顶到其阈值不越界 */
const REBIRTH_KARMA_CAP = BOND_TITLES[BOND_TITLES.length - 1]!.min

function clampKarma(v: unknown): number {
  const n = Math.floor(Number(v) || 0)
  return Math.min(REBIRTH_KARMA_CAP, Math.max(0, n))
}

/** 把一趟产出入账到资源/背包 */
function applySpoils(spoils: TaskSpoils): void {
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  // 采药按玩家当前大境界的品阶显式入账(五品分账;与五品经济同口径)
  if (spoils.herb) resources.addHerb(herbGradeOfMajor(usePlayerStore().major), spoils.herb)
  if (spoils.ore) resources.addSmall('ore', spoils.ore)
  if (spoils.dust) resources.addSmall('dust', spoils.dust)
  if (spoils.wudao) resources.addSmall('wudao', spoils.wudao)
  if (spoils.stone) resources.addStone(spoils.stone)
  if (spoils.pillId && spoils.pillCount) inventory.addPill(spoils.pillId, spoils.pillCount)
}

export const useApprenticeStore = defineStore(
  'apprentice',
  () => {
    const apprentices = ref<OwnedApprentice[]>([])
    /** 跨世之缘:真传道童转世后凝成的一丝缘(一次性,新世 starter 携带后清零) */
    const rebirthKarma = ref(0)

    /** 存档修复:弟子逐位修形,坏位整位丢弃;任务形状不对就当作闲置 */
    function sanitize(): void {
      rebirthKarma.value = clampKarma(rebirthKarma.value)
      const clean: OwnedApprentice[] = []
      for (const raw of asArray<unknown>(apprentices.value)) {
        if (!raw || typeof raw !== 'object' || !('archId' in raw)) continue
        const archId = raw.archId
        if (typeof archId !== 'string' || !apprenticeDef(archId)) continue
        const uid = 'uid' in raw && typeof raw.uid === 'string' && raw.uid ? raw.uid : nextUid()
        const level = clampLevel('level' in raw ? raw.level : 1)
        const bond = clampBond('bond' in raw ? raw.bond : 0)
        let task: OwnedApprentice['task'] = null
        if ('task' in raw && raw.task && typeof raw.task === 'object') {
          const t = raw.task as { spec?: unknown; startAt?: unknown; finishAt?: unknown }
          if (isSpec(t.spec) && Number.isFinite(t.startAt) && Number.isFinite(t.finishAt)) {
            task = { spec: t.spec, startAt: Math.max(0, Math.floor(t.startAt as number)), finishAt: Math.max(0, Math.floor(t.finishAt as number)) }
          }
        }
        clean.push({ uid, archId, level, bond, task })
      }
      apprentices.value = clean
    }

    /** 无弟子则白送一名入门弟子(让这功能一开局就看得见摸得着),仅此一次。
     *  若上一世凝有跨世之缘(真传),starter 带着这份传承羁绊入场,随后清零(一次性携带,不每世重演) */
    function sync(): void {
      if (apprentices.value.length === 0) {
        apprentices.value = [{ uid: nextUid(), archId: STARTER_APPRENTICE, level: 1, bond: rebirthKarma.value, task: null }]
        rebirthKarma.value = 0
      }
    }

    /** 收割所有已完工的弟子,return 尾账供界面报「弟子归来,带回…」 */
    function collectFinished(now: number, major: number): TaskSpoils[] {
      const reaped: TaskSpoils[] = []
      for (const appr of apprentices.value) {
        if (!taskDone(appr, now)) continue
        const spec = appr.task!.spec
        const spoils = apprenticeSpoils(appr.archId, spec, major, appr.level)
        applySpoils(spoils)
        appr.level = Math.min(APPRENTICE_MAX_LEVEL, appr.level + 1)
        appr.bond += 1
        appr.task = null
        reaped.push(spoils)
      }
      return reaped
    }

    /** 派一名闲置弟子去跑一趟;忙着的、找不到的都派不动 */
    function dispatch(uid: string, spec: ApprenticeSpec, now: number): boolean {
      const appr = apprentices.value.find(x => x.uid === uid)
      if (!appr || appr.task) return false
      appr.task = { spec, startAt: now, finishAt: now + apprenticeTaskSeconds(spec) * 1000 }
      return true
    }

    /** 收一名新弟子;槽满或灵石不够则不成 */
    function recruit(major: number): 'full' | 'poor' | 'ok' {
      if (apprentices.value.length >= apprenticeSlots(major)) return 'full'
      const owned = new Set(apprentices.value.map(a => a.archId))
      const pool = APPRENTICES.filter(x => x.id !== STARTER_APPRENTICE && !owned.has(x.id))
      if (pool.length === 0) return 'full'
      const cost = stoneByTier(major, 30)
      if (!useResourcesStore().spendStone(cost)) return 'poor'
      apprentices.value.push({ uid: nextUid(), archId: rng.pick(pool).id, level: 1, bond: 0, task: null })
      return 'ok'
    }

    /** 一键「各尽其长」:把每名闲置道童派到当前最缺的门;忙的不动;返回实际派了几个 */
    function dispatchAll(now: number): number {
      const idle = apprentices.value
        .filter(a => !a.task)
        .map(a => ({ uid: a.uid, talent: apprenticeDef(a.archId)!.talent }))
      if (idle.length === 0) return 0
      const resources = useResourcesStore()
      const major = usePlayerStore().major
      const targets = dispatchAllToNeed(idle, {
        herb: resources.herbOf(herbGradeOfMajor(major)),
        ore: resources.ore,
        wudao: resources.wudao,
        dust: resources.dust
      })
      for (const t of targets) {
        const appr = apprentices.value.find(x => x.uid === t.uid)
        if (appr && !appr.task) {
          appr.task = { spec: t.spec, startAt: now, finishAt: now + apprenticeTaskSeconds(t.spec) * 1000 }
        }
      }
      return targets.length
    }

    /** 转世清零:道童是今生观中家业,随皮囊散去;新世由 sync() 补送 starter。
     *  只取最高那名的羁绊,且仅「真传(满位阶)」凝成跨世之缘(封顶到真传位阶不越界);
     *  道童本体不复活,只落 rebirthKarma 这一丝「老仆相寻」的缘。 */
    function resetForRebirth(): void {
      let max = 0
      for (const appr of apprentices.value) max = Math.max(max, appr.bond)
      rebirthKarma.value = max >= REBIRTH_KARMA_CAP ? REBIRTH_KARMA_CAP : 0
      apprentices.value = []
    }

    return { apprentices, rebirthKarma, sanitize, sync, collectFinished, dispatch, dispatchAll, resetForRebirth, recruit }
  },
  { persist: persistConfig('apprentice') }
)
