/**
 * 妖气复聚 —— 让「已靖」不是终点,让旧主能再碰面
 *
 * 起因(两处设计自己拆自己的台):
 *  一 首领认知写了三道门槛,还特意给首领「加倍」,可首领一条命只打一次 ——
 *    「知其路数」「洞悉」两层对首领永远够不着。专门为首领写的情报事实上没人看得到。
 *  二 妖气复聚(镇压满 72 小时自动解除)只复聚了杂兵:妖气之源(首领)不回来,
 *    而镇压资格永久、一键就能切回 —— 于是那个倒计时对玩家几乎只是一次点击。
 * 故把复聚定成**世界自己的节律**:够钟的已靖地界,旧主归来(该地界不再「已靖」)。
 *
 * 三条设计口径:
 *  一 **不惩罚挂机**:复聚只把「已靖」收回去,镇压资格仍然永久 —— 一键就能把收益接回来。
 *  二 **重逢是内容,不是税**:归来的首领按老规矩发(首领倍率 + 保底装备),并推进认知。
 *  三 **告别「一次性内容」**:再靖一次即复「已靖」,此后照旧 pending 下一次妖气复聚。
 *
 * 钟的起点见 worldMemory.regionTouchedAt:最后一次当地战斗、镇压、或把它靖平,取最晚。
 */
import { REGIONS, regionDef } from '@/data/regions'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { isRegionRevived, regionTouchedAt } from './worldMemory'

/** 提示里最多点名几处 —— 回来一次撞上二十处复聚时,别糊一屏名字 */
const LITANY_LIMIT = 3

/**
 * 结算妖气复聚:够钟的已靖地界,旧主归来、该地界不再「已靖」。
 *
 * 由 settleSuppressedRegions 在结算前调用(在线每 tick 与离线结算同走这一处),
 * 必须在「没有镇压就直接返回」之前 —— 已靖却从不镇压的地界一份镇压都没有,
 * 若让早退挡在前面,那条路永远走不到。
 *
 * @returns 这一次刚复聚(旧主归来)的地界 id
 */
export function settleRegionRevivals(now: number = Date.now()): string[] {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const returned: string[] = []

  for (const region of REGIONS) {
    // 从未靖平的地界没有「妖气」可聚(首领本来就在);旧主早已归来的不必每 tick 再看
    if (adventure.revived.includes(region.id)) continue
    if (!adventure.cleared.includes(region.id)) continue
    const touchedAt = regionTouchedAt(
      player.regionStats[region.id]?.lastUpdateAt,
      player.suppressedSince[region.id],
      adventure.clearedAt[region.id]
    )
    if (!isRegionRevived(touchedAt, now)) continue
    adventure.markRevived(region.id)
    returned.push(region.id)
  }

  if (returned.length > 0) {
    useUiStore().toast(`${litany(returned)}的旧主归来 —— 再历一程即可复靖`, 'info')
  }
  return returned
}

/** 点名几处,多了就报个数 —— 回来一次撞上二十处复聚时别糊一屏名字 */
function litany(ids: string[]): string {
  const names = ids.map(id => regionDef(id)?.name ?? id)
  const head = names.slice(0, LITANY_LIMIT).join('、')
  return names.length > LITANY_LIMIT ? `${head} 等 ${names.length} 处` : head
}
