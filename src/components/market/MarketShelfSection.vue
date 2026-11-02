<template>
  <section ref="buySection">
    <SectionTitle title="货架" :hint="`${cards.length} 格`" />
    <p
      v-if="focusHerbState"
      class="mt-2 rounded-md border border-gold-ink/30 px-3 py-2 text-[10px] leading-relaxed text-gold-ink"
      data-focus-herb-missing
    >
      {{ focusHerbState === 'soldOut' ? '此品灵草已售罄' : '暂无此品灵草' }}
    </p>
    <div class="mt-2 grid grid-cols-2 gap-2">
      <div
        v-for="(c, i) in cards"
        :key="`${c.idx}-${i}`"
        :data-idx="c.idx"
        :data-card="i"
        class="card-ink relative flex flex-col p-2.5"
        :class="[c.sold ? 'opacity-50' : '', i === focusCard ? 'ring-2 ring-jade/70' : '']"
        :style="c.tierStyle"
      >
        <QualityAura v-if="c.quality" :quality="c.quality" />
        <span v-if="c.rare" class="absolute right-1.5 top-1.5 leading-none">
          <QualitySeal :quality="c.quality!" :size="14" />
        </span>
        <div class="flex items-center gap-2">
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md font-kai text-[13px]"
            :class="c.tagCls"
          >
            {{ c.tag }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-kai text-[13px]" :class="{ 'q-plaque': c.plaque }" :style="c.nameCls">{{ c.name }}</p>
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
            :title="c.kind === 'equipment' && inventory.bagFull ? '行囊已满' : !c.sold && !c.afford ? `灵石尚差 ${formatGap(c.stoneShort)}` : undefined"
            @click="buyOne(c.idx)"
          >
            {{ c.sold ? '已售' : c.kind === 'equipment' && inventory.bagFull ? '行囊已满' : c.afford ? '买下' : `尚差 ${formatGap(c.stoneShort)}` }}
          </button>
        </div>
      </div>
    </div>
    <p class="mt-2 text-[10px] text-ink-faint">每{{ refreshSpan }}刷新</p>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import type { GNum } from '@/types'
  import { MARKET_REFRESH_SECONDS, type MarketSlot } from '@/data/market'
  import { useMarketStore } from '@/stores/market'
  import { useResourcesStore } from '@/stores/resources'
  import { useInventoryStore } from '@/stores/inventory'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { pillDef, pillQualityColor, pillQualityName } from '@/data/pills'
  import { HERB_GRADE_NAMES, herbGradeBandLabel, herbGradeOfMajor, isHerbGrade } from '@/data/herbGrades'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { isRareQuality, qualityTierStyle } from '@/ui/qualityTier'
  import { qualityAura } from '@/ui/qualityAura'
  import { tint } from '@/utils/colorToken'
  import { focusHerbSlot, marketEquipInstance } from '@/core/marketService'
  import { cmp, gnZero, subClamp } from '@/utils/gnum'
  import { formatGN, formatGap } from '@/utils/format'
  import { classicalDuration } from '@/data/timeUnits'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import QualitySeal from '@/components/common/QualitySeal.vue'
  import QualityAura from '@/components/common/QualityAura.vue'

  interface CardView {
    idx: number
    tag: string
    tagCls: string
    kind: string
    /** 仅 material 格有;深链高亮靠它认草格 */
    matId?: 'herb' | 'ore'
    name: string
    nameCls: Record<string, string>
    sub: string
    /** 仅装备货格有;丹药/材料不套品质色 */
    quality?: import('@/types').QualityId
    rare: boolean
    /** 名牌是否加描边与字距(稀有档),见 ui/qualityAura */
    plaque: boolean
    tierStyle?: { borderColor: string; background: string }
    price: GNum
    sold: boolean
    afford: boolean
    /** 灵石尚差；买得起时为 0 */
    stoneShort: GNum
  }

  const MAT_META: Record<'herb' | 'ore', { name: string; icon: string }> = {
    herb: { name: '灵草', icon: 'leaf' },
    ore: { name: '玄铁', icon: 'mountain' }
  }
  /**
   * 角标底色。单字(丹/材/器)是**文字**,不是图标 —— 彩色字压同色淡底过不了 4.5,
   * 故字色走墨色,品类区分由色块与描边承担。
   */
  const TAG_CLS: Record<string, string> = {
    pill: 'border border-cinnabar/40 bg-cinnabar/10 text-ink',
    material: 'border border-jade/40 bg-jade/15 text-ink',
    equipment: 'border border-violet-ink/40 bg-violet-ink/15 text-ink'
  }

  const market = useMarketStore()
  const resources = useResourcesStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const ui = useUiStore()
  const route = useRoute()

  /** 续草深链高亮的货格:按渲染序号认,不按 idx(坏档可能重复 idx);只亮方子要的那一品 */
  const focusCard = ref<number | null>(null)
  /** 深链要续草却买不到:null=不必说;none=这架没进这品草;soldOut=有但卖光了 */
  const focusHerbState = ref<'none' | 'soldOut' | null>(null)
  /** 换新工期:从 MARKET_REFRESH_SECONDS 现算,不手打(见 core/dataTextAudit 的工期判据) */
  const refreshSpan = classicalDuration(MARKET_REFRESH_SECONDS)
  /** 落点所在那一架(stockedAt);存宿主,切签重挂载不丢 */
  const focusedStockAt = defineModel<number | null>('focusedStockAt', { default: null })
  const buySection = ref<HTMLElement | null>(null)

  const cards = computed<CardView[]>(() =>
    market.stock
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map(slot => renderSlot(slot))
  )

  /** 装备实例按货架时刻确定性生成,预览即购得同一件 */
  function renderSlot(slot: MarketSlot): CardView {
    const afford = !slot.sold && cmp(resources.spiritStone, slot.price) >= 0
    const base = {
      idx: slot.idx,
      tag: slot.kind === 'pill' ? '丹' : slot.kind === 'material' ? '材' : '器',
      tagCls: TAG_CLS[slot.kind] ?? '',
      kind: slot.kind,
      sold: slot.sold,
      afford,
      rare: false,
      plaque: false,
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
      // 灵草按上货时品阶显示(与标价、入账同源);旧档无 grade 按当下品兜底
      const grade = slot.grade ?? herbGradeOfMajor(player.major)
      return {
        ...base,
        matId: slot.matId,
        name: slot.matId === 'herb' ? HERB_GRADE_NAMES[grade] : meta.name,
        nameCls: {},
        sub: slot.matId === 'herb' ? `${herbGradeBandLabel(grade)} · ×${slot.count}` : `×${slot.count}`,
        price: slot.price
      }
    }
    const inst = marketEquipInstance(slot, market.stockedAt)
    const tmpl = equipmentTemplate(inst.templateId)
    const quality = qualityDef(inst.quality)
    const tier = qualityTierStyle(inst.quality)
    return {
      ...base,
      name: tmpl?.name ?? inst.templateId,
      nameCls: { color: quality.color },
      sub: `${quality.name} · ${slot.tier} 阶`,
      quality: inst.quality,
      rare: isRareQuality(inst.quality),
      plaque: qualityAura(inst.quality).plaque,
      // 密卡底色固定弱晕染,品阶浓淡交给边框与角章
      tierStyle: { borderColor: tint(quality.color, tier.border), background: tint(quality.color, 0.06) },
      price: slot.price
    }
  }

  function buyOne(idx: number): void {
    const result = market.buy(idx)
    const slot = market.stock.find(s => s.idx === idx)
    const name = slot ? renderSlot(slot).name : ''
    if (result === 'ok') ui.toast(`购得「${name}」`, 'success')
    else if (result === 'poor') ui.toast(slot ? `灵石尚差 ${formatGap(renderSlot(slot).stoneShort)}` : '灵石不足', 'warn')
    else if (result === 'bagfull') ui.toast('行囊已满', 'warn')
    else if (result === 'expired') ui.toast('货架已刷新', 'warn')
  }

  /** 续草落点:挂载与换货后都重算(高亮记渲染序号,换货后会指错);首次进入或换过货才滚 */
  function applyHerbFocus(): void {
    if (route.query.focus !== 'herb') return
    // 非法 grade 参数落回当前境界那一品
    const raw = Number(route.query.grade)
    const fallback = herbGradeOfMajor(player.major)
    const want = isHerbGrade(raw) ? raw : fallback
    const { slot, soldOut } = focusHerbSlot(market.stock, want, fallback)
    // 按对象身份取序号:重复 idx 的坏档不会把高亮挪到邻格
    const at = slot ? market.stock.slice().sort((a, b) => a.idx - b.idx).indexOf(slot) : -1
    const scroll = market.stockedAt !== focusedStockAt.value
    if (slot && at >= 0) {
      focusCard.value = at
      focusHerbState.value = null
      if (scroll) buySection.value?.querySelector<HTMLElement>(`[data-card="${at}"]`)?.scrollIntoView({ block: 'center' })
    } else {
      focusCard.value = null
      focusHerbState.value = soldOut ? 'soldOut' : 'none'
      if (scroll) buySection.value?.scrollIntoView({ block: 'start' })
    }
    focusedStockAt.value = market.stockedAt
  }

  onMounted(() => {
    // 宿主 v-if:每次切回购签都重挂载
    if (route.query.focus === 'herb') void nextTick(() => applyHerbFocus())
  })

  /** 停在购签时换货:重定位 */
  watch(
    () => market.stockedAt,
    () => {
      if (route.query.focus === 'herb') void nextTick(() => applyHerbFocus())
    }
  )
</script>
