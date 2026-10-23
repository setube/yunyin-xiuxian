/**
 * 妖气复聚 —— 让「已靖」不是终点,让旧主能再碰面
 *
 * 起因(两处设计自己拆自己的台):
 *  一 首领认知写了三道门槛,还特意给首领「加倍」,可首领一条命只打一次 ——
 *    「知其路数」「洞悉」两层对首领永远够不着。专门为首领写的情报事实上没人看得到。
 *  二 妖气复聚(镇压满 72 小时自动解除)只复聚了杂兵:妖气之源(首领)不回来,
 *    而镇压资格本世内永久、一键就能切回 —— 于是那个倒计时对玩家几乎只是一次点击。
 * 故把复聚定成**世界自己的节律**:够钟的已靖地界,旧主归来(该地界不再「已靖」)。
 *
 * 三条设计口径:
 *  一 **不惩罚挂机**:复聚只把「已靖」收回去,本世的镇压资格仍然保留 —— 一键就能把收益接回来。
 *  二 **重逢是内容,不是税**:归来的首领按老规矩发(首领倍率 + 保底装备),并推进认知。
 *  三 **告别「一次性内容」**:再靖一次即复「已靖」,此后照旧 pending 下一次妖气复聚。
 *
 * 钟的起点见 worldMemory.regionTouchedAt:最后一次当地战斗、镇压、或把它靖平,取最晚。
 */
import { REGIONS, regionDef } from '@/data/regions'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { isRegionRevived, regionReviveClock } from './worldMemory'

/** 提示里最多点名几处 —— 回来一次撞上二十处复聚时,别糊一屏名字 */
const LITANY_LIMIT = 3

/**
 * 结算妖气复聚:够钟的地界,旧主归来(不再「已靖」)且镇压随之松开。
 *
 * 由 settleSuppressedRegions 在结算前调用(在线每 tick 与离线结算同走这一处),
 * 必须在「没有镇压就直接返回」之前 —— 已靖却从不镇压的地界一份镇压都没有,
 * 若让早退挡在前面,那条路永远走不到。
 *
 * **够不够钟只看一把钟**(`regionTouchedAt`:最后一次在当地战斗、镇压、靖平取最晚):
 * 从前镇压那一半在 suppress.settleSuppressedRegions 里另按 `suppressedSince` 单独判
 * 「满 72 小时」,两把钟各判各的,于是同一片地界会一处判松、一处判不松 —— 今天还在
 * 那片打怪,镇压却被按更早的镇压时刻收了回去;既已靖又镇压的地界则在同一个 tick
 * 弹两条,把**同一次复聚**说成两桩事。判定与播报都收在这一处,一片地界每 tick 至多被点名一次。
 *
 * @returns 这一次复聚的两类地界:`returned` 旧主归来(已靖被收回),
 *   `loosened` 镇压被妖气松开(收益随之停下)。调用方(归来卷轴)要分别记账 ——
 *   前者说的是「首领复出」,后者说的是「收益停了」,混作一句会让玩家以为丢档。
 */
export function settleRegionRevivals(
  now: number = Date.now()
): { returned: string[]; loosened: string[] } {
  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const returned: string[] = []
  const loosened: string[] = []
  const doubled: string[] = []

  for (const region of REGIONS) {
    const clearedNow = adventure.cleared.includes(region.id)
    const suppressedNow = player.suppressedRegions.includes(region.id)
    // 既没靖平也不镇压的地界没有「妖气」可聚(首领本来就在)
    if (!clearedNow && !suppressedNow) continue
    const touchedAt = regionReviveClock(region.id)
    if (!isRegionRevived(touchedAt, now)) continue
    // 妖气都聚起来了,压不住 —— 镇压松开(资格仍在,随时可一键接回)
    if (suppressedNow) {
      player.loosenSuppression(region.id)
      loosened.push(region.id)
    }
    // 已靖的地界:旧主归来,此处不再「已靖」(再靖一次即复位)
    if (clearedNow) {
      adventure.markRevived(region.id)
      returned.push(region.id)
    }
    // 两样都占的地界记下来:它只该被点一次名(两句各报一次 = 同一桩事说两遍)
    if (clearedNow && suppressedNow) doubled.push(region.id)
  }

  if (doubled.length > 0) {
    useUiStore().toast(`${litany(doubled)}妖气复聚 —— 旧主归来、镇守松动,再历一程即可复靖`, 'info')
  }
  const returnedOnly = returned.filter(id => !doubled.includes(id))
  const loosenedOnly = loosened.filter(id => !doubled.includes(id))
  if (returnedOnly.length > 0) {
    useUiStore().toast(`${litany(returnedOnly)}的旧主归来 —— 再历一程即可复靖`, 'info')
  }
  if (loosenedOnly.length > 0) {
    useUiStore().toast(`${litany(loosenedOnly)}妖气复聚,镇压松动——此地重新成为历练之地`, 'info')
  }
  return { returned, loosened }
}

/** 点名几处,多了就报个数 —— 回来一次撞上二十处复聚时别糊一屏名字 */
function litany(ids: string[]): string {
  const names = ids.map(id => regionDef(id)?.name ?? id)
  const head = names.slice(0, LITANY_LIMIT).join('、')
  return names.length > LITANY_LIMIT ? `${head} 等 ${names.length} 处` : head
}
