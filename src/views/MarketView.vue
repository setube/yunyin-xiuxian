<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 门面:灵石余额 + 货架倒计时 —— 一眼是「钱够不够、货还有多久换」 -->
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
        <p class="mt-0.5 text-[10px] tabular" :class="remainingSec <= 0 ? 'text-cinnabar' : 'text-ink-faint'">
          {{ remainingSec <= 0 ? '新货上架中…' : `刷新还差 ${formatCountdown(remainingSec)}` }}
        </p>
      </div>
    </div>

    <!-- 货架:一格一抉择,买走即换新(下一周期) -->
    <section>
      <SectionTitle title="货架" :hint="`${cards.length} 格`" />
      <div class="mt-2 grid grid-cols-2 gap-2">
        <div
          v-for="c in cards"
          :key="c.idx"
          class="card-ink flex flex-col p-2.5"
          :class="c.sold ? 'opacity-50' : ''"
        >
          <div class="flex items-center gap-2">
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded-md font-kai text-[13px]"
              :class="c.tagCls"
            >
              {{ c.tag }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-kai text-[13px]" :style="c.nameCls">{{ c.name }}</p>
              <p class="truncate text-[10px] text-ink-faint">{{ c.sub }}</p>
            </div>
          </div>
          <div class="mt-auto flex items-center justify-between pt-2">
            <span class="flex items-center gap-0.5 tabular text-[12px] text-gold-ink">
              <GameIcon name="gem" :size="12" />{{ formatGN(c.price) }}
            </span>
            <button
              class="btn-ghost px-2.5 py-1"
              :disabled="c.sold"
              @click="buyOne(c.idx)"
            >
              {{ c.sold ? '已售' : '买下' }}
            </button>
          </div>
        </div>
      </div>
      <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
        满架售罄、或隔一段时辰,货郎自会换上别的东西;离线亦照此工期走。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import type { GNum } from '@/types'
  import type { MarketSlot } from '@/data/market'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { useResourcesStore } from '@/stores/resources'
  import { useMarketStore } from '@/stores/market'
  import { useUiStore } from '@/stores/ui'
  import { pillDef } from '@/data/pills'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { marketEquipInstance, marketRemainingSec } from '@/core/marketService'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  interface CardView {
    idx: number
    tag: string
    tagCls: string
    name: string
    nameCls: Record<string, string>
    sub: string
    price: GNum
    sold: boolean
  }

  const MAT_META: Record<'herb' | 'ore', { name: string; icon: string }> = {
    herb: { name: '灵草', icon: 'leaf' },
    ore: { name: '玄铁', icon: 'mountain' }
  }
  const TAG_CLS: Record<string, string> = {
    pill: 'bg-cinnabar/10 text-cinnabar',
    material: 'bg-jade/15 text-jade',
    equipment: 'bg-violet-ink/15 text-violet-ink'
  }

  const resources = useResourcesStore()
  const market = useMarketStore()
  const ui = useUiStore()

  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const remainingSec = computed(() => marketRemainingSec(market.stockedAt, now.value))
  const cards = computed<CardView[]>(() =>
    market.stock
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(slot => renderSlot(slot))
  )

  /** 把一格货摊成卡片视图;装备实例按货架时刻确定性生成,预览即购得同一件 */
  function renderSlot(slot: MarketSlot): CardView {
    const base = {
      idx: slot.idx,
      tag: slot.kind === 'pill' ? '丹' : slot.kind === 'material' ? '材' : '器',
      tagCls: TAG_CLS[slot.kind] ?? '',
      sold: slot.sold
    }
    if (slot.kind === 'pill') {
      const def = pillDef(slot.pillId)!
      return {
        ...base,
        name: def.name,
        nameCls: { color: qualityDef(def.quality).color },
        sub: `${qualityDef(def.quality).name} · ×${slot.count}`,
        price: slot.price
      }
    }
    if (slot.kind === 'material') {
      const meta = MAT_META[slot.matId]
      return {
        ...base,
        name: meta.name,
        nameCls: {},
        sub: `补洞府之材 · ×${slot.count}`,
        price: slot.price
      }
    }
    const inst = marketEquipInstance(slot, market.stockedAt)
    const tmpl = equipmentTemplate(inst.templateId)
    const quality = qualityDef(inst.quality)
    return {
      ...base,
      name: tmpl?.name ?? inst.templateId,
      nameCls: { color: quality.color },
      sub: `${quality.name} · ${slot.tier} 阶`,
      price: slot.price
    }
  }

  function buyOne(idx: number): void {
    const result = market.buy(idx)
    const slot = market.stock.find(s => s.idx === idx)
    const name = slot ? renderSlot(slot).name : ''
    if (result === 'ok') {
      ui.toast(`于坊市购得「${name}」`, 'success')
    } else if (result === 'poor') {
      ui.toast('灵石不足', 'warn')
    } else if (result === 'bagfull') {
      ui.toast('行囊已满,腾一席再来', 'warn')
    }
    // 'sold' / 'missing' 属竞态,安静略过即可
  }

  onMounted(() => {
    market.sync(Date.now())
    timer = setInterval(() => {
      now.value = Date.now()
      // 跨过刷新窗口的当口重上一架货(离线归来同理,这一拍立刻换新)
      if (marketRemainingSec(market.stockedAt, now.value) <= 0) market.sync(now.value)
    }, 1000)
  })
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer)
  })
</script>
