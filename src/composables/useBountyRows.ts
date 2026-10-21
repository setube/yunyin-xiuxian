import { computed } from 'vue'
import type { BountyKind, BountySlot } from '@/data/bounty'
import { useBountyStore } from '@/stores/bounty'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { bountyRemainingSec } from '@/core/bountyService'
import { formatGN } from '@/utils/format'
import { pillDef } from '@/data/pills'
import { HERB_GRADES } from '@/data/herbGrades'
import { useNow } from '@/composables/useNow'

/** 一纸悬赏摊成订单视图;ready 判「此刻交不交得起」 */
export interface BountyRow {
  idx: number
  kind: BountyKind
  tag: string
  tagCls: string
  title: string
  desc: string
  rewardText: string
  extraText: string
  claimed: boolean
  ready: boolean
}

const B_TAG_CLS: Record<string, string> = {
  herb: 'bg-jade/15 text-jade',
  ore: 'bg-ink/10 text-ink-soft',
  pill: 'bg-cinnabar/10 text-cinnabar',
  equip: 'bg-violet-ink/15 text-violet-ink'
}

/**
 * 悬赏板的订单投影与换单倒计时。
 *
 * 「悬赏」签上的可交圆点与板上的「交货」按钮必须读同一份 ready 判据:
 * 各自算一遍的话,签上亮了圆点、点进去每张都写「暂不足」—— 玩家只会以为界面坏了。
 */
export function useBountyRows() {
  const bounty = useBountyStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  /**
   * 只有换单倒计时需要秒针;订单投影只依赖 orders 与存货。
   *
   * 此前整页共用一个 `now`,秒针一跳就把悬赏板整表重算一遍;迁出后把两者拆开:
   * 换单读数走 useNow(随游戏心跳暂停冻结),ready 只随存货/订单变化。
   */
  const now = useNow()

  const bountyRemaining = computed(() => bountyRemainingSec(bounty.bountyAt, now.value))

  function renderBounty(s: BountySlot): BountyRow {
    const claimed = s.claimed
    if (s.kind === 'herb') {
      const anyGrade = HERB_GRADES.some(g => resources.herbOf(g) >= s.target)
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '草',
        tagCls: B_TAG_CLS.herb ?? '',
        title: `募 灵草 ×${s.target}`,
        desc: '自动交出最低可用一档灵草,现货即结,价随该品(高阶留作丹方)',
        rewardText: '价随品',
        extraText: '',
        claimed,
        ready: anyGrade
      }
    }
    if (s.kind === 'ore') {
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '铁',
        tagCls: B_TAG_CLS.ore ?? '',
        title: `募 玄铁 ×${s.target}`,
        desc: '交 玄铁 一摞,现货即结',
        rewardText: formatGN(s.reward),
        extraText: '',
        claimed,
        ready: resources.ore >= s.target
      }
    }
    if (s.kind === 'pill') {
      const def = pillDef(s.kindId)
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '丹',
        tagCls: B_TAG_CLS.pill ?? '',
        title: `募 丹药 ×${s.target}`,
        desc: def ? `收「${def.name}」${s.target} 枚` : '一味指定的丹药',
        rewardText: formatGN(s.reward),
        extraText: s.extra ? `另赠 悟道×${s.extra}` : '',
        claimed,
        ready: s.kindId ? (inventory.pills[s.kindId] ?? 0) >= s.target : false
      }
    }
    return {
      idx: s.idx,
      kind: s.kind,
      tag: '器',
      tagCls: B_TAG_CLS.equip ?? '',
      title: `贡一柄 ${s.tier} 阶以上兵刃`,
      desc: '交一柄不低于此阶者,灵石器尘随品而赠',
      rewardText: '价随品',
      extraText: '另赠 器尘',
      claimed,
      ready: inventory.bagItems.some(e => e.tier >= s.tier)
    }
  }

  const bountyRows = computed(() =>
    bounty.orders
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(s => renderBounty(s))
  )

  return { bountyRemaining, bountyRows, renderBounty }
}
