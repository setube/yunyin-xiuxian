/**
 * sanitizeAllStores 的幂等性。
 *
 * 这条路径每次启动都跑一遍(engine.start 前)。若不幂等,意味着「同一份存档
 * 读两次会得到不同状态」—— 玩家每刷新一次页面,存档就被改写一次,数值缓慢漂移,
 * 而且这类漂移极难复现(要恰好在两次启动之间比较)。
 *
 * 各 store 自己的 sanitize 已有局部用例,但没有任何一条验「整串跑两遍结果相同」。
 * 本条对空档与有内容的档各跑一遍。
 *
 * 已知的唯一时间依赖在 cultivation.sanitize:坏 endsAt 会被填成 Date.now()。
 * 填完即成为具体时间戳,第二次调用读到的是有限数,故仍幂等 —— 下面第三条会验它。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sanitizeAllStores } from './sanitizeAll'
import { usePlayerStore } from './player'
import { useResourcesStore } from './resources'
import { useInventoryStore } from './inventory'
import { useDongfuStore } from './dongfu'
import { useApprenticeStore } from './apprentice'
import { useLoadoutsStore } from './loadouts'
import { useCultivationStore } from './cultivation'
import { useEndgameStore } from './endgame'
import { useAdventureStore } from './adventure'
import { useGameStore } from './game'
import { useQuestsStore } from './quests'
import { useSettingsStore } from './settings'
import { useLoreStore } from './lore'
import { useMarketStore } from './market'
import { useBountyStore } from './bounty'
import { usePacingTelemetry } from './pacingTelemetry'
import { useDiagStore } from './diag'
import { PERSISTED_STORES } from '@/utils/storage'
import { gn } from '@/utils/gnum'

/**
 * 取**全部十七个**持久化 store 的状态快照。
 *
 * 原先只收九个(漏了 game / quests / settings / lore / market / bounty / pacing / diag),
 * 理由大概是「那几个是遥测与设置,不是游戏进度」—— 但幂等的判据是「读两次会不会改写存档」,
 * 与是不是进度无关:这八个同样落盘,同样每启动跑一遍 sanitize。
 * 下面 `PERSISTED_STORES` 与列表比对,少一个或多一个都会红,防止以后新增分片时又漏掉。
 *
 * 列表单独拎出来是为了让那条判据能数个数;`snapshot()` 只负责拼状态。
 */
const snapshotStores = [
  useGameStore,
  usePlayerStore,
  useResourcesStore,
  useInventoryStore,
  useCultivationStore,
  useDongfuStore,
  useAdventureStore,
  useQuestsStore,
  useSettingsStore,
  useLoadoutsStore,
  useEndgameStore,
  useLoreStore,
  useMarketStore,
  useApprenticeStore,
  useBountyStore,
  usePacingTelemetry,
  useDiagStore
] as const

function snapshot(): string {
  const parts = [
    useGameStore().$state,
    usePlayerStore().$state,
    useResourcesStore().$state,
    useInventoryStore().$state,
    useCultivationStore().$state,
    useDongfuStore().$state,
    useAdventureStore().$state,
    useQuestsStore().$state,
    useSettingsStore().$state,
    useLoadoutsStore().$state,
    useEndgameStore().$state,
    useLoreStore().$state,
    useMarketStore().$state,
    useApprenticeStore().$state,
    useBountyStore().$state,
    usePacingTelemetry().$state,
    useDiagStore().$state
  ]
  return JSON.stringify(parts)
}

describe('sanitizeAllStores · 幂等', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * 快照必须盖住每一个持久化分片。
   *
   * 故障注入:把 `snapshot()` 里任意一个 store 删掉,本条即红 ——
   * 原先只收九个,漏掉的八个(遥测/设置/坊市/悬赏…)整整一年没有幂等判据。
   */
  it('快照覆盖全部持久化分片', () => {
    const covered = snapshotStores.length
    expect(covered, `快照收了 ${covered} 个,持久化分片有 ${PERSISTED_STORES.length} 个`).toBe(
      PERSISTED_STORES.length
    )
  })

  it('空档:连跑两遍状态完全相同', () => {
    sanitizeAllStores()
    const a = snapshot()
    sanitizeAllStores()
    expect(snapshot(), '空档连跑两遍必须完全一致').toBe(a)
  })

  it('有内容的档:连跑两遍状态完全相同', () => {
    usePlayerStore().major = 12
    usePlayerStore().sub = 5
    usePlayerStore().exp = gn(123456)
    useResourcesStore().spiritStone = gn(999999)
    useInventoryStore().items = [
      {
        uid: 'u1',
        templateId: 'w_zhuqing',
        tier: 3,
        quality: 'spirit',
        level: 4,
        locked: false,
        affixes: [
          { id: 'atk1', roll: 0.5 },
          { id: 'def1', roll: 0.8 }
        ]
      }
    ] as never
    useDongfuStore().veinPoints = { gather: 10, craft: 5, alchemy: 0, insight: 0 } as never
    useApprenticeStore().apprentices = [{ uid: 'a1', archId: 'ap_youxia', level: 3, bond: 100, task: null }] as never
    useLoadoutsStore().list = [
      { id: 'l1', name: '剑修', seal: '道', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 1 }
    ] as never

    sanitizeAllStores()
    const a = snapshot()
    sanitizeAllStores()
    expect(snapshot(), '有内容的档连跑两遍也必须完全一致').toBe(a)
  })

  it('坏 buff 的 endsAt 被填成读档时刻后不再变动(时间依赖处也幂等)', () => {
    useCultivationStore().buffs = [{ defId: 'buff_juling', endsAt: Number.NaN }] as never
    sanitizeAllStores()
    const t1 = useCultivationStore().buffs[0]!.endsAt
    sanitizeAllStores()
    expect(useCultivationStore().buffs[0]!.endsAt, '第二次调用不该再刷新 endsAt').toBe(t1)
    expect(Number.isFinite(t1)).toBe(true)
  })

  it('坏档连跑两遍也收敛:第一遍修完,第二遍不再改', () => {
    usePlayerStore().major = -99
    usePlayerStore().sub = -99
    useInventoryStore().items = [{ uid: '', templateId: 42, affixes: 'x' }] as never
    useDongfuStore().veinPoints = { gather: Number.NaN, ghost: 999 } as never
    sanitizeAllStores()
    const a = snapshot()
    sanitizeAllStores()
    expect(snapshot(), '坏档只该在第一遍被修,第二遍必须原样').toBe(a)
  })
})
