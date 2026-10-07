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

    <InkTabs v-model="tab" :tabs="[{ id: 'buy', label: '购' }, { id: 'sell', label: '售' }, { id: 'bounty', label: '悬赏' }]" />

    <!-- 购入货架 -->
    <section v-if="tab === 'buy'">
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

    <!-- 售出:装备寄卖 / 材料丹药即时售 -->
    <section v-else-if="tab === 'sell'" class="space-y-4">
      <!-- 寄卖装备 -->
      <div>
        <SectionTitle title="装备寄卖" :hint="`${market.consign.length}/${consignSlots}`" />
        <p class="mb-2 text-[10px] text-ink-faint">
          离包即定,约一炷香售出,灵石入账;离线照走,不可撤回。价比坊市购入同档更廉,唯图个落袋为安。
        </p>
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

        <!-- 背包可寄卖清单 -->
        <div class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-1">
          <div v-for="eq in bagList" :key="eq.uid" class="flex items-center gap-2 px-2.5 py-2">
            <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: eq.color }">{{ eq.name }}</span>
            <span class="shrink-0 text-[10px] text-ink-faint">{{ eq.tier }} 阶</span>
            <span class="shrink-0 text-[10px] tabular text-gold-ink">{{ formatGN(eq.price) }}</span>
            <button class="btn-ghost shrink-0 px-2.5 py-1" :disabled="consignSlotsFull" @click="consignOne(eq.uid)">
              寄卖
            </button>
          </div>
          <p v-if="bagList.length === 0" class="px-2.5 py-3 text-center text-[10px] text-ink-faint">
            行囊里没有可寄卖的兵刃。
          </p>
        </div>
      </div>

      <!-- 材料即时售 -->
      <div>
        <SectionTitle title="售材料" />
        <div class="mt-2 space-y-2">
          <div v-for="m in materialRows" :key="m.id" class="card-ink flex items-center justify-between px-3 py-2.5">
            <div class="flex items-center gap-2">
              <GameIcon :name="m.icon" :size="16" class="text-jade" />
              <span class="font-kai text-[13px] text-ink">{{ m.name }}</span>
              <span class="text-[10px] text-ink-faint">存 {{ m.count }}</span>
            </div>
            <button class="btn-ghost px-2.5 py-1" :disabled="m.count < MARKET_MAT_COUNT" @click="sellMaterialOne(m.id)">
              售出 ×{{ MARKET_MAT_COUNT }} ({{ formatGN(m.price) }})
            </button>
          </div>
        </div>
      </div>

      <!-- 丹药即时售 -->
      <div>
        <SectionTitle title="售丹药" :hint="`${sellablePills.length} 味`" />
        <div class="card-ink mt-2 max-h-56 divide-y divide-ink/6 overflow-y-auto px-1">
          <div v-for="p in sellablePills" :key="p.id" class="flex items-center gap-2 px-2.5 py-2">
            <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: p.color }">{{ p.name }}</span>
            <span class="shrink-0 text-[10px] text-ink-faint">×{{ p.count }}</span>
            <button class="btn-ghost shrink-0 px-2.5 py-1" @click="sellPillOne(p.id)">
              售出 ({{ formatGN(p.price) }})
            </button>
          </div>
          <p v-if="sellablePills.length === 0" class="px-2.5 py-3 text-center text-[10px] text-ink-faint">
            身上无可售的丹药。
          </p>
        </div>
      </div>
    </section>

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
            <button class="btn-ghost px-2.5 py-1" :disabled="b.claimed || !b.ready" @click="claimOne(b.idx)">
              {{ b.claimed ? '已交' : b.ready ? '交货' : '暂不足' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import type { GNum } from '@/types'
  import type { MarketSlot } from '@/data/market'
  import type { BountySlot } from '@/data/bounty'
  import { MARKET_MAT_COUNT, MARKET_CONSIGN_SLOTS } from '@/data/market'
  import { useBountyStore } from '@/stores/bounty'
  import { bountyRemainingSec } from '@/core/bountyService'
  import { formatCountdown, formatGN } from '@/utils/format'
  import { useResourcesStore } from '@/stores/resources'
  import { useMarketStore } from '@/stores/market'
  import { useInventoryStore } from '@/stores/inventory'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { pillDef } from '@/data/pills'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import {
    consignPrice,
    marketEquipInstance,
    marketRemainingSec,
    materialSellPrice,
    pillSellPrice
  } from '@/core/marketService'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
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
  const inventory = useInventoryStore()
  const bounty = useBountyStore()
  const player = usePlayerStore()
  const ui = useUiStore()

  const tab = ref<'buy' | 'sell' | 'bounty'>('buy')
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  const consignSlots = MARKET_CONSIGN_SLOTS
  const consignSlotsArr = Array.from({ length: consignSlots }, (_, i) => i)
  const consignSlotsFull = computed(() => market.consign.length >= consignSlots)

  const remainingSec = computed(() => marketRemainingSec(market.stockedAt, now.value))
  const cards = computed<CardView[]>(() =>
    market.stock
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(slot => renderSlot(slot))
  )

  /** 寄卖格里每格 → 剩余秒数 / 价 */
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
        color: qualityDef(eq.quality).color,
        tier: eq.tier,
        price: consignPrice(eq.tier, qualityDef(eq.quality).rank)
      }))
  )

  const materialRows = computed(() =>
    (['herb', 'ore'] as const).map(id => ({
      id,
      ...MAT_META[id],
      count: id === 'herb' ? resources.herb : resources.ore,
      price: materialSellPrice(player.major)
    }))
  )

  const sellablePills = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ id, count, def: pillDef(id) }))
      .filter(x => x.def !== undefined && x.def!.recipe?.stoneBase && x.count > 0)
      .map(x => ({
        id: x.id,
        name: x.def!.name,
        color: qualityDef(x.def!.quality).color,
        count: x.count,
        price: pillSellPrice(x.id)
      }))
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
    if (result === 'ok') ui.toast(`于坊市购得「${name}」`, 'success')
    else if (result === 'poor') ui.toast('灵石不足', 'warn')
    else if (result === 'bagfull') ui.toast('行囊已满,腾一席再来', 'warn')
  }

  function consignOne(uid: string): void {
    const result = market.consignEquip(uid, Date.now())
    if (result === 'ok') ui.toast('已摆上寄卖格,售出即入账', 'info')
    else if (result === 'full') ui.toast('寄卖格已满', 'info')
  }

  function sellMaterialOne(id: 'herb' | 'ore'): void {
    if (market.sellMaterial(id, player.major)) ui.toast(MAT_META[id].name + '已售出', 'success')
  }

  function sellPillOne(pillId: string): void {
    const name = pillDef(pillId)?.name ?? ''
    if (market.sellPill(pillId)) ui.toast(`${name} 已售出`, 'success')
  }

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

  interface BountyView {
    idx: number
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
    if (s.kind === 'herb' || s.kind === 'ore') {
      const name = s.kind === 'herb' ? '灵草' : '玄铁'
      return {
        idx: s.idx,
        tag: s.kind === 'herb' ? '草' : '铁',
        tagCls: B_TAG_CLS[s.kind] ?? '',
        title: `募 ${name} ×${s.target}`,
        desc: `交 ${name} 一摞,现货即结`,
        rewardText: formatGN(s.reward),
        extraText: '',
        claimed,
        ready: (s.kind === 'herb' ? resources.herb : resources.ore) >= s.target
      }
    }
    if (s.kind === 'pill') {
      const def = pillDef(s.kindId)
      return {
        idx: s.idx,
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
  }

  onMounted(() => {
    market.sync(Date.now())
    bounty.sync(Date.now())
    reapConsign()
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
