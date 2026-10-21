<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 门面:灵石余额 + 左侧货架倒计时(只对「购」一栏有效) -->
    <div class="card-ink flex items-center justify-between px-4 py-3">
      <div>
        <p class="font-kai text-[14px] tracking-widest text-ink">坊市</p>
        <p class="text-[10px] text-ink-faint">灵石换机缘 · 时换时新</p>
      </div>
      <div class="text-right">
        <p class="flex items-center justify-end gap-1 tabular text-[13px] text-gold-ink">
          <GameIcon name="gem" :size="14" />
          {{ formatGN(resources.spiritStone) }}
        </p>
        <p v-if="tab === 'buy'" class="mt-0.5 text-[10px] tabular" :class="remainingSec <= 0 ? 'text-cinnabar' : 'text-ink-faint'">
          {{ remainingSec <= 0 ? '新货上架中…' : `刷新还差 ${formatCountdown(remainingSec)}` }}
        </p>
      </div>
    </div>

    <InkTabs v-model="tab" :tabs="tabs" />

    <!-- 购入货架:深链续草的高亮与滚动随货架段本体 -->
    <MarketShelfSection v-if="tab === 'buy'" />

    <!-- 售出:寄卖计时与逐品定价随 MarketSellSection 本体 -->
    <MarketSellSection v-else-if="tab === 'sell'" />

    <!-- 悬赏板:商号收购订单,交货得灵石 -->
    <section v-else class="space-y-4">
      <p class="card-ink flex items-center justify-between px-3 py-2 text-[10px] text-ink-faint">
        <span>商号悬赏收购,交货即结。价比摆摊售出更丰。</span>
        <span class="tabular" :class="bountyRemaining <= 0 ? 'text-cinnabar' : ''">
          {{ bountyRemaining <= 0 ? '正在换新单…' : `换新单还差 ${formatCountdown(bountyRemaining)}` }}
        </span>
      </p>
      <div class="space-y-2">
        <div v-for="b in bountyList" :key="b.idx" class="card-ink p-3" :class="b.claimed ? 'opacity-50' : ''">
          <div class="flex items-center gap-2.5">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[14px]" :class="b.tagCls">{{ b.tag }}</span>
            <div class="min-w-0 grow">
              <p class="truncate font-kai text-[13px] text-ink">{{ b.title }}</p>
              <p class="text-[10px] text-ink-faint">{{ b.desc }}</p>
            </div>
          </div>
          <div class="mt-2 flex items-center justify-between">
            <span class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span class="flex items-center gap-0.5 tabular text-gold-ink"><GameIcon name="gem" :size="12" />{{ b.rewardText }}</span>
              <span v-if="b.extraText" class="text-azure">· {{ b.extraText }}</span>
            </span>
            <button v-if="b.kind === 'equip'" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="b.claimed || !b.ready" @click="openEquipOrder = openEquipOrder === b.idx ? null : b.idx">
              {{ b.claimed ? '已交' : openEquipOrder === b.idx ? '收起' : '选一件交货' }}
            </button>
            <button v-else class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="b.claimed || !b.ready" @click="claimOne(b.idx)">
              {{ b.claimed ? '已交' : b.ready ? '交货' : '暂不足' }}
            </button>
          </div>
          <div
            v-if="b.kind === 'equip' && openEquipOrder === b.idx"
            class="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md bg-paper-deep/60 p-1.5"
          >
            <p class="px-2 pb-1 text-[10px] text-ink-faint">点选一件即交货,不可撤回;价随所交之品的品质。</p>
            <p v-if="equipCandidates(b.idx).length === 0" class="px-2 py-3 text-center text-[11px] text-ink-faint">
              行囊里没有够格的兵刃。
            </p>
            <button
              v-for="c in equipCandidates(b.idx)"
              :key="c.uid"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left active:bg-ink/6"
              @click="claimEquipOne(b, c)"
            >
              <span class="min-w-0 grow truncate font-kai text-[12px]" :style="{ color: c.color }">{{ c.name }}</span>
              <span class="shrink-0 text-[10px] text-ink-faint">{{ c.qualityName }} · {{ c.tier }} 阶</span>
              <span class="shrink-0 text-[10px] tabular text-gold-ink">{{ formatGN(c.stone) }}</span>
              <span v-if="c.dust > 0" class="shrink-0 text-[10px] text-ink-faint">尘×{{ c.dust }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import type { GNum } from '@/types'
  import type { BountyKind, BountySlot } from '@/data/bounty'
  import { useBountyStore } from '@/stores/bounty'
  import { bountyRemainingSec, equipBountyReward } from '@/core/bountyService'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { useResourcesStore } from '@/stores/resources'
  import { useMarketStore } from '@/stores/market'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import { pillDef } from '@/data/pills'
  import { HERB_GRADES } from '@/data/herbGrades'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { marketRemainingSec } from '@/core/marketService'
  import MarketShelfSection from '@/components/market/MarketShelfSection.vue'
  import MarketSellSection from '@/components/market/MarketSellSection.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const resources = useResourcesStore()
  const market = useMarketStore()
  const inventory = useInventoryStore()
  const bounty = useBountyStore()
  const ui = useUiStore()
  const route = useRoute()

  const tab = ref<'buy' | 'sell' | 'bounty'>('buy')
  /** 展开中的「贡兵刃」悬赏单(idx);null=全部收起 */
  const openEquipOrder = ref<number | null>(null)
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const remainingSec = computed(() => marketRemainingSec(market.stockedAt, now.value))
  /** 收割已售出的寄卖,报一声卖了什么 */
  function reapConsign(): void {
    const sold = market.collectConsign(now.value)
    for (const name of sold) ui.toast(`寄卖「${name}」已售,灵石入账`, 'success')
  }

  const bountyRemaining = computed(() => bountyRemainingSec(bounty.bountyAt, now.value))

  /** 一纸悬赏摊成订单视图;ready 判「此刻交不交得起」 */
  const bountyList = computed(() =>
    bounty.orders
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(s => renderBounty(s))
  )
  // 逛「购/售」时有一单可交,「悬赏」签就该亮圆点(与 claimOne 的 ready 同源)
  const tabs = computed<readonly { id: 'buy' | 'sell' | 'bounty'; label: string; dot?: boolean }[]>(() => [
    { id: 'buy', label: '购' },
    { id: 'sell', label: '售' },
    { id: 'bounty', label: '悬赏', dot: bountyList.value.some(b => !b.claimed && b.ready) }
  ])

  interface BountyView {
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

  function renderBounty(s: BountySlot): BountyView {
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
        desc: `交 玄铁 一摞,现货即结`,
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
    const ready = inventory.bagItems.some(e => e.tier >= s.tier)
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
      ready
    }
  }

  function claimOne(idx: number): void {
    const result = bounty.claim(idx)
    const slot = bounty.orders.find(s => s.idx === idx)
    const label = slot ? `「${renderBounty(slot).title}」` : ''
    if (result === 'ok') ui.toast(`悬赏 ${label} 已交货,灵石入账`, 'success')
    else if (result === 'insufficient') ui.toast('存货不足,凑齐再来', 'warn')
    else if (result === 'nobag') ui.toast('行囊里没有够格的兵刃', 'warn')
    else if (result === 'expired') ui.toast('悬赏已换新单,请按新单再交', 'warn')
  }

  /** 某一纸贡兵刃悬赏可交付的行囊兵刃(≥门槛阶),含各自实交收益;点选再交,不再自动取第一件 */
  function equipCandidates(idx: number): Array<{ uid: string; name: string; color: string; qualityName: string; tier: number; stone: GNum; dust: number }> {
    const slot = bounty.orders.find(s => s.idx === idx)
    if (!slot || slot.kind !== 'equip') return []
    return inventory.bagItems
      .filter(e => e.tier >= slot.tier)
      .sort((a, b) => qualityDef(b.quality).rank - qualityDef(a.quality).rank)
      .map(eq => {
        const q = qualityDef(eq.quality)
        const r = equipBountyReward(eq.tier, q.rank)
        return {
          uid: eq.uid,
          name: equipmentTemplate(eq.templateId)?.name ?? eq.templateId,
          color: q.color,
          qualityName: q.name,
          tier: eq.tier,
          stone: r.stone,
          dust: r.dust
        }
      })
  }

  /** 点选一件贡出;成交即收拢清单 */
  function claimEquipOne(b: BountyView, c: { uid: string }): void {
    const result = bounty.claimEquip(b.idx, c.uid)
    if (result === 'ok') {
      openEquipOrder.value = null
      ui.toast(`悬赏 「${b.title}」 已交货,灵石入账`, 'success')
    } else if (result === 'insufficient') ui.toast('这件兵刃不够门槛', 'warn')
    else if (result === 'missing') ui.toast('行囊里找不到这件兵刃', 'warn')
    else if (result === 'expired') {
      openEquipOrder.value = null
      ui.toast('悬赏已换新单,请按新单再交', 'warn')
    }
  }

  onMounted(() => {
    market.sync(Date.now())
    bounty.sync(Date.now())
    reapConsign()
    // 「去坊市续草」深链只负责把签切到「购」;高亮与滚动随 MarketShelfSection 本体
    if (route.query.focus === 'herb') tab.value = 'buy'
    timer = setInterval(() => {
      now.value = Date.now()
      reapConsign()
      const prevOrders = bounty.orders
      bounty.sync(now.value)
      // 换版了:展开中的贡器清单盯的是旧单,留着会挂在新单下面选货交
      if (bounty.orders !== prevOrders) openEquipOrder.value = null
      // 跨过货架刷新窗口的当口重上一架货(离线归来同理,这一拍立刻换新)
      if (marketRemainingSec(market.stockedAt, now.value) <= 0) market.sync(now.value)
    }, 1000)
  })
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
  })

</script>
