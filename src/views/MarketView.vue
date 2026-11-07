<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="card-ink flex items-center justify-between px-4 py-3">
      <h2 class="font-kai text-[14px] tracking-widest text-ink font-normal">坊市</h2>
      <div class="text-right">
        <p class="flex items-center justify-end gap-1 tabular text-[13px] text-gold-ink">
          <GameIcon name="gem" :size="14" />
          {{ formatGN(resources.spiritStone) }}
        </p>
        <p v-if="tab === 'buy'" class="mt-0.5 text-[10px] tabular" :class="remainingSec <= 0 ? 'text-cinnabar' : 'text-ink-faint'">
          {{ remainingSec <= 0 ? '刷新中…' : `刷新 ${formatCountdown(remainingSec)}` }}
        </p>
      </div>
    </div>

    <InkTabs v-model="tab" :tabs="tabs" />

    <MarketShelfSection v-if="tab === 'buy'" v-model:focused-stock-at="herbFocusedAt" />

    <MarketSellSection v-else-if="tab === 'sell'" />

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
  /** 续草落点所在那一架:货架段切签即卸载,记在宿主 */
  const herbFocusedAt = ref<number | null>(null)
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const remainingSec = computed(() => marketRemainingSec(market.stockedAt, now.value))
  function reapConsign(): void {
    const sold = market.collectConsign(now.value)
    for (const name of sold) ui.toast(`寄卖「${name}」已售出`, 'success')
  }

  // 悬赏签圆点:与 BountyBoardSection 的 ready 同源
  /**
   * 可见 label 守「按钮主词 2~6 字」里的短轴(购/售与悬赏各占一格,写全会把签挤开);
   * `name` 只供读屏 —— 单字签念出来没有主语,听不出是买东西还是卖东西。
   */
  const tabs = computed<readonly { id: 'buy' | 'sell' | 'bounty'; label: string; name: string; dot?: boolean }[]>(() => {
    const ready = bountyRows.value.some(b => !b.claimed && b.ready)
    return [
      // 读屏名以可见的那个字开头:语音控制念「点 购」也要能命中(WAI-ARIA:名字含可见文本)
      { id: 'buy', label: '购', name: '购买' },
      { id: 'sell', label: '售', name: '出售' },
      { id: 'bounty', label: '悬赏', name: '悬赏', dot: ready }
    ]
  })

  onMounted(() => {
    market.sync(Date.now())
    bounty.sync(Date.now())
    reapConsign()
    // 「去坊市续草」深链只切签;高亮与滚动随 MarketShelfSection
    if (route.query.focus === 'herb') tab.value = 'buy'
    timer = setInterval(() => {
      now.value = Date.now()
      reapConsign()
      bounty.sync(now.value)
      if (marketRemainingSec(market.stockedAt, now.value) <= 0) market.sync(now.value)
    }, 1000)
  })
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
  })

</script>
