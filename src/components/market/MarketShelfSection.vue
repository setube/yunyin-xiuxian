<template>
  <!-- 购入货架 -->
  <!-- ref 供「去坊市续草」跳进来后滚到货架 -->
  <section ref="buySection">
    <SectionTitle title="货架" :hint="`${cards.length} 格`" />
    <!-- 深链进来却碰不上可买的草:先说实话,别让「续草」落成一架看不懂的货 -->
    <p
      v-if="focusHerbState"
      class="mt-2 rounded-md border border-gold-ink/30 bg-gold-ink/10 px-3 py-2 text-[10px] leading-relaxed text-gold-ink"
      data-focus-herb-missing
    >
      {{ focusHerbState === 'soldOut' ? '这一品灵草已售罄,货郎两时辰后换新 —— 也可先去历练采些。' : '架上这一刻没有这一品灵草,货郎两时辰后换新 —— 也可先去历练采些。' }}
    </p>
    <div class="mt-2 grid grid-cols-2 gap-2">
      <div
        v-for="(c, i) in cards"
        :key="`${c.idx}-${i}`"
        :data-idx="c.idx"
        :data-card="i"
        class="card-ink flex flex-col p-2.5"
        :class="[c.sold ? 'opacity-50' : '', i === focusCard ? 'ring-2 ring-jade/70' : '']"
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
            class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]"
            :disabled="c.sold || !c.afford || (c.kind === 'equipment' && inventory.bagFull)"
            :title="c.kind === 'equipment' && inventory.bagFull ? '行囊满' : !c.sold && !c.afford ? `灵石尚差 ${formatGN(c.stoneShort)}` : undefined"
            @click="buyOne(c.idx)"
          >
            {{ c.sold ? '已售' : c.kind === 'equipment' && inventory.bagFull ? '行囊满' : c.afford ? '买下' : `尚差 ${formatGN(c.stoneShort)}` }}
          </button>
        </div>
      </div>
    </div>
    <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
      满架售罄、或隔一段时辰,货郎自会换上别的东西;离线亦照此工期走。
    </p>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import type { GNum } from '@/types'
  import type { MarketSlot } from '@/data/market'
  import { useMarketStore } from '@/stores/market'
  import { useResourcesStore } from '@/stores/resources'
  import { useInventoryStore } from '@/stores/inventory'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { pillDef, pillQualityColor, pillQualityName } from '@/data/pills'
  import { HERB_GRADE_NAMES, herbGradeBandLabel, herbGradeOfMajor, isHerbGrade } from '@/data/herbGrades'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { focusHerbSlot, marketEquipInstance } from '@/core/marketService'
  import { cmp, gnZero, subClamp } from '@/utils/gnum'
  import { formatGN } from '@/utils/format'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  interface CardView {
    idx: number
    tag: string
    tagCls: string
    kind: string
    /** 仅 material 格有:灵草 / 玄铁(深链高亮要靠它认出哪一格是草) */
    matId?: 'herb' | 'ore'
    name: string
    nameCls: Record<string, string>
    sub: string
    price: GNum
    sold: boolean
    /** 当前灵石是否买得起 —— 买不起的货不再与买得起的长得一样 */
    afford: boolean
    /** 灵石尚差；买得起时为 0 */
    stoneShort: GNum
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

  const market = useMarketStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const route = useRoute()

  /**
   * 从「开炉炼丹 → 缺料 → 去坊市续草」跳进来时高亮的货格(按渲染序号认,
   * 不按 idx:坏档/导入的货架可能有重复 idx,按 idx 会亮错那一格)。
   *
   * 只亮**方子要的那一品**的草:丹炉缺灵品草却亮凡品格,买回来照样开不了炉。
   */
  const focusCard = ref<number | null>(null)
  /** 深链要续草却买不到:null=不必说;none=这架没进这品草;soldOut=有但卖光了 */
  const focusHerbState = ref<'none' | 'soldOut' | null>(null)
  /** 上一次把落点算给哪一架货(stockedAt);换货后才需要重新滚动 */
  let focusedStockAt: number | null = null
  const buySection = ref<HTMLElement | null>(null)

  const cards = computed<CardView[]>(() =>
    market.stock
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(slot => renderSlot(slot))
  )

  /** 把一格货摊成卡片视图;装备实例按货架时刻确定性生成,预览即购得同一件 */
  function renderSlot(slot: MarketSlot): CardView {
    const afford = !slot.sold && cmp(resources.spiritStone, slot.price) >= 0
    const base = {
      idx: slot.idx,
      tag: slot.kind === 'pill' ? '丹' : slot.kind === 'material' ? '材' : '器',
      tagCls: TAG_CLS[slot.kind] ?? '',
      kind: slot.kind,
      sold: slot.sold,
      afford,
      stoneShort: afford ? gnZero() : subClamp(slot.price, resources.spiritStone)
    }
    if (slot.kind === 'pill') {
      const def = pillDef(slot.pillId)!
      return {
        ...base,
        name: def.name,
        nameCls: { color: pillQualityColor(def) },
        sub: `${pillQualityName(def)} · ×${slot.count}`,
        price: slot.price
      }
    }
    if (slot.kind === 'material') {
      const meta = MAT_META[slot.matId]
      // 灵草按上货那一刻的品阶显示(与标价、入账同源),旧档无 grade → 按当下品兜底
      const grade = slot.grade ?? herbGradeOfMajor(player.major)
      return {
        ...base,
        matId: slot.matId,
        name: slot.matId === 'herb' ? HERB_GRADE_NAMES[grade] : meta.name,
        nameCls: {},
        sub: slot.matId === 'herb' ? `${herbGradeBandLabel(grade)} · ×${slot.count}` : `补洞府之材 · ×${slot.count}`,
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
    else if (result === 'poor') ui.toast(slot ? `灵石尚差 ${formatGN(renderSlot(slot).stoneShort)}` : '灵石不足', 'warn')
    else if (result === 'bagfull') ui.toast('行囊已满,腾一席再来', 'warn')
    else if (result === 'expired') ui.toast('货架刚换新,请按新货再买', 'warn')
  }

  /**
   * 把「续草」的落点定到当前货架上 —— 首次进入,以及**每次换货之后**都要重算。
   *
   * 只在 onMounted 里算一次是不够的:货架两小时一换(离线归来也立刻换新),
   * 而高亮记的是渲染序号,换货后同一个序号多半变成另一件货,墨绿框就指着
   * 一件与灵草无关的东西,比不亮更误导。
   */
  function applyHerbFocus(scroll = true): void {
    if (route.query.focus !== 'herb') return
    // 丹炉带过来的目标品阶;乱掷的参数忽略,落回当前境界该有的那一品
    const raw = Number(route.query.grade)
    const fallback = herbGradeOfMajor(player.major)
    const want = isHerbGrade(raw) ? raw : fallback
    const { slot, soldOut } = focusHerbSlot(market.stock, want, fallback)
    // 按**对象身份**在排好序的货架里取序号:重复 idx 的坏档不会把高亮挪到邻格
    const at = slot ? market.stock.slice().sort((a, b) => a.idx - b.idx).indexOf(slot) : -1
    if (slot && at >= 0) {
      focusCard.value = at
      focusHerbState.value = null
      if (scroll) buySection.value?.querySelector<HTMLElement>(`[data-card="${at}"]`)?.scrollIntoView({ block: 'center' })
    } else {
      focusCard.value = null
      focusHerbState.value = soldOut ? 'soldOut' : 'none'
      if (scroll) buySection.value?.scrollIntoView({ block: 'start' })
    }
    focusedStockAt = market.stockedAt
  }

  onMounted(() => {
    /*
     * 「去坊市续草」深链:落在坊市后把**方子要的那一品**灵草格滚进视口并高亮。
     * 只做一次(不改签的后续切换):玩家自己切去售/悬赏时不该被拽回来。
     * 这架货可能没进这一品草、也可能刚卖光 —— 那就只停在货架顶部并说明,
     * 不硬滚到不存在的东西,也不拿别品的草冒充。
     */
    if (route.query.focus === 'herb') void nextTick(() => applyHerbFocus())
  })

  /** 换货后重定位(离开期间换过货也算) */
  watch(
    () => market.stockedAt,
    nextStockedAt => {
      if (route.query.focus !== 'herb') return
      // 换过货才滚,不把玩家刚看的货拽走
      const restocked = nextStockedAt !== focusedStockAt
      void nextTick(() => applyHerbFocus(restocked))
    }
  )
</script>
