import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { daoluDef } from '@/data/daolu'
import { pendingBondEvent, pendingIntent } from '@/core/daoluService'

/**
 * 道侣域的共享投影 —— 人物页道侣入口卡与道侣弹窗(BondDialog)都要读的那一批。
 *
 * 入口卡的副行/badge 与弹窗正文读的是同一份关系状态。拆分后两处各自拿一份
 * computed(都只读 player store 与 core 服务,无共享可变状态),定义只此一份,
 * 不会各抄各的之后漂移 —— 尤其 hasBondWord(有未答的事)与 herIntent 的
 * 在世守卫,这类复合条件抄两份迟早走样。
 */
export function useBondOverview() {
  const player = usePlayerStore()

  const bond = computed(() => player.bond)
  const bondDef = computed(() => (bond.value ? (daoluDef(bond.value.daoluId) ?? null) : null))
  const pastBonds = computed(() => player.reincarnation.bonds)
  /**
   * 待决的共同事件 —— 由历练情境写入关系状态,界面只读取。
   *
   * 34.0 之前是「打开弹窗才抽一个」:内容是真的,时机是假的。
   * 现在事件在历练途中就已发生,弹窗只是去看它
   */
  const pendingEvent = computed(() => pendingBondEvent())
  /** 她主动提出的事(34.1);三种回应,忽略不等于回绝 */
  const herIntent = computed(() =>
    bond.value && !bond.value.departed && !bond.value.fallen ? pendingIntent() : null
  )
  /** 道侣有未答的事(她自己提的言 / 世界递的事) —— 入口那一行要报出来 */
  const hasBondWord = computed(() => !!pendingEvent.value || !!herIntent.value)

  return { bond, bondDef, pastBonds, pendingEvent, herIntent, hasBondWord }
}
