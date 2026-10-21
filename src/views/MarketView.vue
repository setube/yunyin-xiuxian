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

    <!-- 悬赏板:换单倒计时、贡器清单与展开态随 BountyBoardSection 本体 -->
    <BountyBoardSection v-else />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useBountyStore } from '@/stores/bounty'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { useResourcesStore } from '@/stores/resources'
  import { useMarketStore } from '@/stores/market'
  import { useUiStore } from '@/stores/ui'
  import { marketRemainingSec } from '@/core/marketService'
  import { useBountyRows } from '@/composables/useBountyRows'
  import BountyBoardSection from '@/components/market/BountyBoardSection.vue'
  import MarketShelfSection from '@/components/market/MarketShelfSection.vue'
  import MarketSellSection from '@/components/market/MarketSellSection.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const resources = useResourcesStore()
  const market = useMarketStore()
  const bounty = useBountyStore()
  const ui = useUiStore()
  const route = useRoute()
  const { bountyRows } = useBountyRows()

  const tab = ref<'buy' | 'sell' | 'bounty'>('buy')
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const remainingSec = computed(() => marketRemainingSec(market.stockedAt, now.value))
  /** 收割已售出的寄卖,报一声卖了什么 */
  function reapConsign(): void {
    const sold = market.collectConsign(now.value)
    for (const name of sold) ui.toast(`寄卖「${name}」已售,灵石入账`, 'success')
  }

  // 逛「购/售」时有一单可交,「悬赏」签就该亮圆点(与 BountyBoardSection 的 ready 同源)
  const tabs = computed<readonly { id: 'buy' | 'sell' | 'bounty'; label: string; dot?: boolean }[]>(() => {
    const ready = bountyRows.value.some(b => !b.claimed && b.ready)
    return [
      { id: 'buy', label: '购' },
      { id: 'sell', label: '售' },
      { id: 'bounty', label: '悬赏', dot: ready }
    ]
  })

  onMounted(() => {
    market.sync(Date.now())
    bounty.sync(Date.now())
    reapConsign()
    // 「去坊市续草」深链只负责把签切到「购」;高亮与滚动随 MarketShelfSection 本体
    if (route.query.focus === 'herb') tab.value = 'buy'
    timer = setInterval(() => {
      now.value = Date.now()
      reapConsign()
      bounty.sync(now.value)
      // 跨过货架刷新窗口的当口重上一架货(离线归来同理,这一拍立刻换新)
      if (marketRemainingSec(market.stockedAt, now.value) <= 0) market.sync(now.value)
    }, 1000)
  })
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
  })

</script>
