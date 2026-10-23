import { computed } from 'vue'
import type { FoeOrigin, RegionDef } from '@/types'
import type { WorldDef } from '@/data/realms'
import { REGIONS } from '@/data/regions'
import { worldOf } from '@/data/realms'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { canEnterRegion, entryBlockReason } from '@/core/mortalWorldService'
import { regionBossCleared, regionFoeOrigin } from '@/core/exploration'
import { currentLifeOf, suppressionProgress, type SuppressionProgress } from '@/core/suppress'
import { detectBuild } from '@/core/buildDetect'
import {
  detectionAdaptation,
  ecologyChips,
  regionEcology,
  type Adaptation,
  type EcoLevel,
  type EcoTrait
} from '@/core/buildAdvisor'

/**
 * 一行地界的全部事实 —— 区域卡、分组与「可见到哪一处」共用这一份投影。
 *
 * 时间相关的两列(复聚倒计时、已守时长)**刻意不在这里**:本表要为每处地界跑
 * `regionEcology` / `detectionAdaptation` / `suppressionProgress`,每秒一跳的
 * `now` 一旦写进来,整表就会跟着秒针重算四十余遍。
 */
export interface RegionRow {
  def: RegionDef
  unlocked: boolean
  canEnter: boolean
  blockReason: string | null
  cleared: boolean
  suppressed: boolean
  revived: boolean
  qualified: boolean
  progress: SuppressionProgress
  tooHard: boolean
  foeOrigin: FoeOrigin
  chips: { trait: EcoTrait; name: string; level: EcoLevel }[]
  adaptation: Adaptation | null
}

/**
 * 历练页的地界投影与分组。
 *
 * `visibleRows` 的截断条件必须带上 `canEnter`:本世路线的首段可能排在地界表靠后的
 * 位置,若只按旧链「已发现」截断,它会被挡在可见范围外 —— 实测新号因此整页 0 个
 * 出发按钮。展示序则倒序(新解锁的地界排最上),但截断仍在数据序上算。
 */
export function useRegionRows() {
  const adventure = useAdventureStore()
  const player = usePlayerStore()

  const currentBuild = computed(() => detectBuild(player.finalStats.mods))

  const regionRows = computed<RegionRow[]>(() =>
    REGIONS.map(r => {
      const eco = regionEcology(r)
      const suppressed = player.suppressedRegions.includes(r.id)
      /**
       * 妖气复聚是**落盘的世界状态**(core/regionRevival 写 adventure.revived),
       * 不是「镇压到点的临时读数」:两者含义不同 —— 复聚只发生在已靖地界,
       * 而镇压满 72 小时只是松开镇压。此前这里拿 `isReviving` 现算,
       * 于是 `adventure.revived` 只写不读,复聚只在结算那一瞬的 toast 里出现过,
       * 之后再进历练页,地界既没有「妖气复聚」章、也不说「再历一程即可复靖」。
       */
      const revived = adventure.revived.includes(r.id)
      return {
        def: r,
        // 旧链:这处地界是否**已被发现** —— 决定列表可见性、锁图标与简介
        unlocked: adventure.unlocked.includes(r.id),
        // 统一准入谓词:此刻**能否进去** —— 决定出发按钮。
        // 两者必须分开:visibleRows 按「已发现」截断列表,
        // 若拿准入当可见性,路线上未轮到的地界会把后面能进的一并藏掉
        canEnter: canEnterRegion(r.id),
        blockReason: entryBlockReason(r.id),
        cleared: regionBossCleared(r.id),
        suppressed,
        revived,
        /** 是否取得过镇压资格(本世取得即永久,转世随皮囊散去) */
        qualified: player.suppressQualified.includes(r.id),
        /** 镇压资格进度(三条判据的当前值/阈值) */
        // 传世号:界面进度条与 checkSuppression 同判,旧世战绩不再显示成「三项全绿」
        progress: suppressionProgress(player.regionStats[r.id], currentLifeOf(player)),
        tooHard: r.minRealm > player.major,
        /** 此地之敌的加成来源(层级补偿 × 地界凶险;出行方式那一档另算) */
        foeOrigin: regionFoeOrigin(r),
        // 第一层信息:只保留最强的两个生态标签
        chips: ecologyChips(eco).slice(0, 2),
        adaptation: currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
      }
    })
  )

  const visibleRows = computed(() => {
    const rows = regionRows.value
    const firstLocked = rows.findIndex(r => !r.unlocked && !r.canEnter)
    return firstLocked < 0 ? rows : rows.slice(0, firstLocked + 1)
  })

  /**
   * 按界域分组:人间界/仙界/神界/混沌海的历练地界各自成段,便于在高界导航。
   *
   * 展示序 = 倒序(玩家反馈:「历练列表应该倒序排列,每次都要往下活动很久」)——
   * 进阶路线上每次新解锁的地界排在最上。判定截断仍在数据序上算:
   * 谜一样的「下一个地界」谁也不提前剧透,只是摆出来的时候反着排罢了。
   */
  const groupedRows = computed(() => {
    const groups: { world: WorldDef; rows: RegionRow[] }[] = []
    for (const row of [...visibleRows.value].reverse()) {
      const world = worldOf(row.def.minRealm)
      const hit = groups.find(g => g.world.id === world.id)
      if (hit) hit.rows.push(row)
      else groups.push({ world, rows: [row] })
    }
    return groups
  })

  return { currentBuild, regionRows, groupedRows }
}
