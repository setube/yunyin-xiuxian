<template>
  <section class="space-y-4">
    <div>
      <SectionTitle title="装备寄卖" :hint="consignHint" />
      <p class="mb-2 text-[10px] text-ink-faint">约{{ consignSpan }}售出 · 不可逆</p>
      <div class="mb-2 grid grid-cols-2 gap-2">
        <div v-for="s in consignSlotsArr" :key="s" class="card-ink flex items-center justify-between p-2.5">
          <template v-if="consignBySlot[s]">
            <div class="min-w-0">
              <p class="truncate font-kai text-[13px] text-ink">{{ consignBySlot[s]!.name }}</p>
              <p class="text-[10px] tabular text-azure">约剩 {{ formatCountdown(consignBySlot[s]!.remainingSec) }}</p>
            </div>
            <span class="shrink-0 text-[11px] tabular text-gold-ink">{{ formatGN(consignBySlot[s]!.price) }}</span>
          </template>
          <span v-else class="text-[11px] text-ink-faint">空</span>
        </div>
      </div>
      <p v-if="consignHidden > 0" class="mb-2 text-[10px] text-ink-faint">另有 {{ consignHidden }} 件寄卖</p>

      <div class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-1">
        <div v-for="eq in bagList" :key="eq.uid" class="flex items-center gap-2 px-2.5 py-2">
          <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: eq.color }">{{ eq.name }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">{{ eq.tier }} 阶</span>
          <span class="shrink-0 text-[10px] tabular text-gold-ink">{{ formatGN(eq.price) }}</span>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="consignSlotsFull" @click="consignOne(eq.uid)">
            {{ consignSlotsFull ? '寄卖(席位已满)' : '寄卖' }}
          </button>
        </div>
        <p v-if="bagList.length === 0" class="px-2.5 py-3 text-center text-[10px] text-ink-faint">暂无可寄卖兵刃</p>
      </div>
    </div>

    <div>
      <SectionTitle title="售材料" />
      <div class="mt-2 space-y-2">
        <div v-for="m in materialRows" :key="m.id" class="card-ink flex items-center justify-between px-3 py-2.5">
          <div class="flex items-center gap-2">
            <GameIcon :name="m.icon" :size="16" class="text-jade" />
            <span class="font-kai text-[13px] text-ink">{{ m.name }}</span>
            <span class="text-[10px] text-ink-faint">存 {{ m.count }}</span>
            <span v-if="m.count < MARKET_MAT_COUNT" class="text-[10px] text-cinnabar">尚差 {{ MARKET_MAT_COUNT - m.count }}</span>
          </div>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" :disabled="m.count < MARKET_MAT_COUNT" @click="m.grade == null ? sellOreOne() : sellHerbOne(m.grade)">
            售出 ×{{ MARKET_MAT_COUNT }} ({{ formatGN(m.price) }})
          </button>
        </div>
      </div>
    </div>

    <div>
      <SectionTitle title="售丹药" :hint="`${sellablePills.length} 味`" />
      <div class="card-ink mt-2 max-h-56 divide-y divide-ink/6 overflow-y-auto px-1">
        <div v-for="p in sellablePills" :key="p.id" class="flex items-center gap-2 px-2.5 py-2">
          <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: p.color }">{{ p.name }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">×{{ p.count }}</span>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="sellPillOne(p.id)">
            售出 ({{ formatGN(p.price) }})
          </button>
        </div>
        <p v-if="sellablePills.length === 0" class="px-2.5 py-3 text-center text-[10px] text-ink-faint">暂无可售丹药</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { GNum } from '@/types'
  import {
    MARKET_CONSIGN_RENDER_MAX,
    MARKET_CONSIGN_SECONDS,
    MARKET_CONSIGN_SLOTS,
    MARKET_MAT_COUNT
  } from '@/data/market'
  import { useMarketStore } from '@/stores/market'
  import { useResourcesStore } from '@/stores/resources'
  import { useInventoryStore } from '@/stores/inventory'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useWallNow } from '@/composables/useWallClock'
  import { pillDef, pillQualityColor } from '@/data/pills'
  import { HERB_GRADE_NAMES, HERB_GRADES, type HerbGrade } from '@/data/herbGrades'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { consignPrice, herbSellBatch, materialSellPrice, pillSellPrice } from '@/core/marketService'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { classicalDuration } from '@/data/timeUnits'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const market = useMarketStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  // 寄卖按墙钟入账,引擎暂停(重置 / 导入确认)时读数须照走
  const now = useWallNow()

  const consignSlots = MARKET_CONSIGN_SLOTS
  /** 寄卖工期:从 MARKET_CONSIGN_SECONDS 现算,不手打古语 */
  const consignSpan = classicalDuration(MARKET_CONSIGN_SECONDS)
  /**
   * 格数封顶 MARKET_CONSIGN_RENDER_MAX:坏档可能塞进成千上万条寄卖。
   * 超出者并成「另有 N 件」,照样在档、到点入账。
   */
  const consignSlotsArr = computed(() =>
    Array.from({ length: Math.min(MARKET_CONSIGN_RENDER_MAX, Math.max(consignSlots, market.consign.length)) }, (_, i) => i)
  )
  const consignHidden = computed(() => Math.max(0, market.consign.length - MARKET_CONSIGN_RENDER_MAX))
  const consignSlotsFull = computed(() => market.consign.length >= consignSlots)
  /** 坏档条数可超上限:照实报条数与上限,不写成「3/2」 */
  const consignHint = computed(() =>
    market.consign.length > consignSlots
      ? `${market.consign.length} 件 · 上限 ${consignSlots}`
      : `${market.consign.length}/${consignSlots}`
  )

  const consignBySlot = computed<Record<number, { name: string; price: GNum; remainingSec: number }>>(() => {
    const out: Record<number, { name: string; price: GNum; remainingSec: number }> = {}
    for (const p of market.consign) {
      out[p.slot] = { name: p.name, price: p.price, remainingSec: Math.max(0, (p.finishAt - now.value) / 1000) }
    }
    return out
  })

  const bagList = computed(() =>
    inventory.bagItems
      .slice()
      .sort((a, b) => qualityDef(b.quality).rank - qualityDef(a.quality).rank)
      .map(eq => ({
        uid: eq.uid,
        name: equipmentTemplate(eq.templateId)?.name ?? eq.templateId,
        color: qualityTextColor(eq.quality),
        tier: eq.tier,
        price: consignPrice(eq.tier, qualityDef(eq.quality).rank)
      }))
  )

  const materialRows = computed(() => [
    { id: 'ore', grade: null as HerbGrade | null, icon: 'mountain', name: '玄铁', count: resources.ore, price: materialSellPrice(player.major) },
    ...HERB_GRADES.filter(g => resources.herbOf(g) > 0).map(g => ({
      id: `herb_${g}`,
      grade: g,
      icon: 'leaf',
      name: HERB_GRADE_NAMES[g],
      count: resources.herbOf(g),
      price: herbSellBatch(g, player.major)
    }))
  ])

  const sellablePills = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ id, count, def: pillDef(id) }))
      .filter(x => x.def !== undefined && x.def!.recipe?.stoneBase && x.count > 0)
      .map(x => ({
        id: x.id,
        name: x.def!.name,
        color: pillQualityColor(x.def!),
        count: x.count,
        price: pillSellPrice(x.id)
      }))
  )

  function consignOne(uid: string): void {
    const result = market.consignEquip(uid, Date.now())
    if (result === 'ok') ui.toast('已寄卖', 'info')
    else if (result === 'full') ui.toast('寄卖格已满', 'info')
  }

  function sellOreOne(): void {
    if (market.sellMaterial(player.major)) ui.toast('「玄铁」已售出', 'success')
  }

  function sellHerbOne(g: HerbGrade): void {
    if (market.sellHerb(g)) ui.toast(`「${HERB_GRADE_NAMES[g]}」已售出`, 'success')
  }

  function sellPillOne(pillId: string): void {
    const name = pillDef(pillId)?.name ?? ''
    if (market.sellPill(pillId)) ui.toast(`「${name}」已售出`, 'success')
  }
</script>
