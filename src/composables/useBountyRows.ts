import { computed } from 'vue'
import type { BountyKind, BountySlot } from '@/data/bounty'
import { useBountyStore } from '@/stores/bounty'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { bountyRemainingSec } from '@/core/bountyService'
import { formatGN } from '@/utils/format'
import { pillDef } from '@/data/pills'
import { HERB_GRADES } from '@/data/herbGrades'
import { useWallNow } from '@/composables/useWallClock'

/** 单张悬赏的订单视图;ready = 此刻交得起 */
export interface BountyRow {
  idx: number
  kind: BountyKind
  tag: string
  tagCls: string
  title: string
  /** 补充条目(如募丹的丹名);空串不渲染 */
  desc: string
  rewardText: string
  extraText: string
  claimed: boolean
  ready: boolean
  /** 交不齐时的实际缺口;ready 为 true 时 null */
  shortText: string | null
}

/** 角标底色:单字是文字,字色走墨色(彩色字压同色淡底过不了 4.5) */
const B_TAG_CLS: Record<string, string> = {
  herb: 'border border-jade/40 bg-jade/15 text-ink',
  ore: 'bg-ink/10 text-ink-soft',
  pill: 'border border-cinnabar/40 bg-cinnabar/10 text-ink',
  equip: 'border border-violet-ink/40 bg-violet-ink/15 text-ink'
}

/**
 * 悬赏板的订单投影与换单倒计时。
 * 「悬赏」签上的可交圆点与板上的「交货」按钮须读同一份 ready 判据。
 */
export function useBountyRows() {
  const bounty = useBountyStore()
  /** 秒针只供换单倒计时,走墙钟(暂停时照走);订单投影只依赖 orders 与存货 */
  const now = useWallNow()

  const bountyRemaining = computed(() => bountyRemainingSec(bounty.bountyAt, now.value))

  const bountyRows = computed(() =>
    bounty.orders
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(s => renderBounty(s))
  )

  return { bountyRemaining, bountyRows, renderBounty }
}

/** 单张订单摊成视图;自取存货,供 composable 与行为测试共用 */
export function renderBounty(s: BountySlot): BountyRow {
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    const claimed = s.claimed
    if (s.kind === 'herb') {
      const anyGrade = HERB_GRADES.some(g => resources.herbOf(g) >= s.target)
      const bestGrade = Math.max(...HERB_GRADES.map(g => resources.herbOf(g)))
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '草',
        tagCls: B_TAG_CLS.herb ?? '',
        title: `募 灵草 ×${s.target}`,
        desc: '自动交最低可用一品',
        rewardText: '价随品',
        extraText: '',
        claimed,
        ready: anyGrade,
        shortText: anyGrade ? null : `尚差 ${Math.max(0, s.target - bestGrade)} 株`
      }
    }
    if (s.kind === 'ore') {
      const ready = resources.ore >= s.target
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '铁',
        tagCls: B_TAG_CLS.ore ?? '',
        title: `募 玄铁 ×${s.target}`,
        desc: '',
        rewardText: formatGN(s.reward),
        extraText: '',
        claimed,
        ready,
        shortText: ready ? null : `尚差 ${s.target - resources.ore} 块`
      }
    }
    if (s.kind === 'pill') {
      const def = pillDef(s.kindId)
      const owned = s.kindId ? (inventory.pills[s.kindId] ?? 0) : 0
      const ready = s.kindId ? owned >= s.target : false
      return {
        idx: s.idx,
        kind: s.kind,
        tag: '丹',
        tagCls: B_TAG_CLS.pill ?? '',
        title: `募 丹药 ×${s.target}`,
        desc: def ? `「${def.name}」` : '未知丹药',
        rewardText: formatGN(s.reward),
        extraText: s.extra ? `另赠 悟道×${s.extra}` : '',
        claimed,
        ready,
        shortText: ready ? null : s.kindId ? `尚差 ${s.target - owned} 枚` : '不可辨识'
      }
    }
    const ready = inventory.bagItems.some(e => e.tier >= s.tier)
    return {
      idx: s.idx,
      kind: s.kind,
      tag: '器',
      tagCls: B_TAG_CLS.equip ?? '',
      title: `贡 ${s.tier} 阶以上兵刃`,
      desc: '',
      rewardText: '价随品',
      extraText: '另赠 器灵尘',
      claimed,
      ready,
      shortText: ready ? null : `无 ${s.tier} 阶以上兵刃`
    }
}
