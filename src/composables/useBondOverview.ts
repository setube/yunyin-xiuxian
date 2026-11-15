import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { TA, bondText, daoluDef, daoluView } from '@/data/daolu'
import { pendingBondEvent, pendingIntent } from '@/core/daoluService'

/**
 * 道侣域共享投影:人物页道侣入口卡与道侣弹窗(BondDialog)同读。
 * hasBondWord、herIntent 的在世守卫等复合条件只在此定义。
 */
export function useBondOverview() {
  const player = usePlayerStore()

  const bond = computed(() => player.bond)
  const rawDef = computed(() => (bond.value ? (daoluDef(bond.value.daoluId) ?? null) : null))
  /** 人物卡:速写/所求/底线已换好代词 */
  const bondDef = computed(() => (rawDef.value ? daoluView(rawDef.value) : null))
  /** 弹窗自写的文案(经历名、标签)里的 {ta} 走这里;没有道侣时原样返回 */
  function ta(text: string): string {
    return rawDef.value ? bondText(text, rawDef.value.gender) : text
  }
  const pronoun = computed(() => ta(TA))
  /*
   * 历世同行只给最近若干条。
   *
   * `reincarnation.bonds` 每次转世归档一条,只增不减,而 `BondDialog` 是 `v-for`
   * 逐条渲(`max-h-40 overflow-y-auto` 只管视觉高度)。坏档塞 5000 条就渲 5000 行。
   *
   * **不改数据**:`daoluService.destinedCandidate` 拿 `deep.length` 算宿缘概率
   * (`0.08 × 条数`,封顶 0.35)、`ui/codex` 拿全量判收录 —— 截数据会改变玩法。
   * 与 `LegacyView.lifeRows` 同一处理:只在渲染侧截。
   */
  const PAST_BONDS_SHOWN = 200
  const pastBonds = computed(() => player.reincarnation.bonds.slice(-PAST_BONDS_SHOWN))
  /** 待决的共同事件:由历练情境写入关系状态,界面只读,不在打开弹窗时抽 */
  const pendingEvent = computed(() => pendingBondEvent())
  /** 道侣主动提出的事;三种回应,忽略不等于回绝 */
  const herIntent = computed(() =>
    bond.value && !bond.value.departed && !bond.value.fallen ? pendingIntent() : null
  )
  /** 有未答的事(道侣提的言 / 世界递的事),入口行要报出 */
  const hasBondWord = computed(() => !!pendingEvent.value || !!herIntent.value)

  return { bond, bondDef, pastBonds, pendingEvent, herIntent, hasBondWord, pronoun, ta }
}
