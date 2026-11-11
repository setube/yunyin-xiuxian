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
        <!-- 两列窄卡(168×99),角上已给到三枚形制,不适用宽卡那套;compact 只画左上 -->
        <QualityAura v-if="c.quality" :quality="c.quality" compact />
        <!-- 灵草格按品阶上形制;玄铁等无品阶材料不挂 -->
        <QualityAura v-else-if="c.herbGrade" :rank="herbQualityRank(c.herbGrade)" :tone="herbQualityTone(c.herbGrade)" compact />
        <!--
          最上档质感:窄卡的右下角是「买下」按钮,御纹的右下直角会直接压在按钮上 ——
          实测御纹 (148,79)–(166,97) 与按钮 (110,54)–(156,89) 相交。
          故走格子档,只留左上。
        -->
        <span v-if="c.luster" class="luster-cornice luster-cornice--tile" aria-hidden="true" />
        <span v-if="c.luster" class="luster-sheen" aria-hidden="true" />
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
            <!--
              名字是这张卡第一样要读的东西,而窄格(320 下格内宽约 78px)放不下 ——
              截掉的是「这一件到底是什么」。悬停给全文,与下一行副标题同一做法。
            -->
            <p
              class="truncate font-kai text-[13px]"
              :class="{ 'q-plaque': c.plaque }"
              :style="c.nameCls"
              :title="c.name"
            >{{ c.name }}</p>
            <!--
              副标题原用 ink-faint,它在纯纸上是 5.20:1,可分。但货架卡有品阶淡底:
              灵草/装备卡按品阶铺 6%~13%,神品那档的朱色最深,ink-faint 压上去只剩 4.32:1。
              换 ink-soft:纸 8.18、6% 底 7.52、13% 底 6.80,各种卡上都留得住余量;
              与标题(墨 / 品阶色)仍拉开一档,层级不变。
            -->
            <!--
              title:窄格上这行会被 truncate 掐掉。实测 320px 下格内宽 78px,
              「神人~神帝境方子所用 · ×12」有 129px —— 只露出六个字,而这是功能信息
              (这批草喂哪个境界的方子),不是装饰。悬停给全文,读屏靠 aria-label。
            -->
            <p class="truncate text-[10px] text-ink-soft" :title="c.sub" :aria-label="c.sub">{{ c.sub }}</p>
          </div>
        </div>
        <div class="mt-auto flex flex-wrap items-center justify-between gap-y-1 pt-2">
          <!--
            窄格下换行,不截数字:价签是玩家判断买不买得起的那条数,截掉等于没写。
            200% 缩放下格内只有约 78px,「gem + 价格」和「买下」挤不进一行就上下排。
          -->
          <span class="flex flex-wrap items-center gap-0.5 tabular text-[12px] text-gold-ink">
            <GameIcon name="gem" :size="12" class="shrink-0" />{{ formatGN(c.price) }}
          </span>
          <button
            class="btn-ghost min-w-0 whitespace-normal !px-2.5 !py-2 !text-[11px] text-center"
            :disabled="c.sold || !c.afford || (c.kind === 'equipment' && inventory.bagFull)"
            :title="c.kind === 'equipment' && inventory.bagFull ? '行囊已满' : !c.sold && !c.afford ? `灵石尚差 ${formatGap(c.stoneShort)}` : undefined"
            @click="buyOne(c.idx)"
          >
            {{ c.sold ? '已售' : c.kind === 'equipment' && inventory.bagFull ? '行囊已满' : c.afford ? '买下' : `灵石尚差 ${formatGap(c.stoneShort)}` }}
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
  import { pillDef, pillQualityName, pillQualityTextColor, pillRank } from '@/data/pills'
  import { HERB_GRADE_NAMES, herbGradeBandLabel, herbGradeOfMajor, isHerbGrade, type HerbGrade } from '@/data/herbGrades'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { isRareQuality, qualityTierStyle } from '@/ui/qualityTier'
  import { qualityAura } from '@/ui/qualityAura'
  import { lusterByRank, lusterOf } from '@/ui/luster'
  import { herbQualityLuster, herbQualityRank, herbQualityTextColor, herbQualityTier, herbQualityTone } from '@/ui/herbQuality'
  import { tint } from '@/utils/colorToken'
  import { focusHerbSlot, marketEquipInstance } from '@/core/marketService'
  import { celebrateTreasure } from '@/core/loot'
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
    /** 仅灵草格有:品阶(1~5),决定形制与字色;玄铁等其它材料为 undefined */
    herbGrade?: HerbGrade
    name: string
    nameCls: Record<string, string>
    sub: string
    /** 仅装备货格有;丹药/材料不套品质色 */
    quality?: import('@/types').QualityId
    rare: boolean
    /** 名牌是否加描边与字距(稀有档),见 ui/qualityAura */
    plaque: boolean
    /** 最上档质感层;非最上档为 null,见 ui/luster */
    luster: import('@/ui/luster').Luster | null
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
   *
   * 但原先把这件事交给了 0.10/0.15 的底与 0.40 的边:实测底与纸只差 1.16~1.23:1,
   * 描边 1.78~1.89:1 —— 玩家看不出三色之别,品类区分形同虚设。
   * 浅色底再往上堆也救不了(alpha 0.28 才 1.54:1),能担事的是描边:
   * 提到 0.70 得 3.0~3.3:1(图形元素可辨下限),底色同步提到 0.20 补一层色感。
   * 墨字压在新底上仍有 10.44:1,原来的 AA 不变。
   */
  const TAG_CLS: Record<string, string> = {
    pill: 'border border-cinnabar/70 bg-cinnabar/20 text-ink',
    material: 'border border-jade/70 bg-jade/20 text-ink',
    equipment: 'border border-violet-ink/70 bg-violet-ink/20 text-ink'
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
      // 丹药格走 rank 入口(道品 rank 9 在这里也要享有质感层)
      luster: slot.kind === 'pill' ? lusterByRank(pillRank(pillDef(slot.pillId)!)) : null,
      stoneShort: afford ? gnZero() : subClamp(slot.price, resources.spiritStone)
    }
    if (slot.kind === 'pill') {
      const def = pillDef(slot.pillId)!
      return {
        ...base,
        name: def.name,
        nameCls: { color: pillQualityTextColor(def) },
        sub: `${pillQualityName(def)} · ×${slot.count}`,
        price: slot.price
      }
    }
    if (slot.kind === 'material') {
      const meta = MAT_META[slot.matId]
      // 灵草按上货时品阶显示(与标价、入账同源);旧档无 grade 按当下品兜底
      const grade = slot.grade ?? herbGradeOfMajor(player.major)
      if (slot.matId !== 'herb') {
        return {
          ...base,
          matId: slot.matId,
          name: meta.name,
          nameCls: {},
          sub: `×${slot.count}`,
          price: slot.price
        }
      }
      // 灵草走品阶形制(见 ui/herbQuality):同一套光环/角章/浓淡,与丹药格并排时读得通
      const herbTier = herbQualityTier(grade)
      return {
        ...base,
        matId: slot.matId,
        name: HERB_GRADE_NAMES[grade],
        nameCls: { color: herbQualityTextColor(grade) },
        sub: `${herbGradeBandLabel(grade)} · ×${slot.count}`,
        herbGrade: grade,
        luster: herbQualityLuster(grade),
        /*
         * 底色封到 6%,与装备卡同规 —— 品阶浓淡交给边框与角章。
         *
         * 原先这里直接用 herbTier.bg(神品那档 13%):13% 的朱叠在卡片底上,
         * 价签的 gold-ink 压上去只剩 4.39:1(实测,跌破正文 AA)。而价签是
         * 「买不买得起」唯一的那条读数,不能为了一层色感牺牲它。
         * 隔壁装备卡早就是这个口径(「密卡底色固定弱晕染」),灵草格当时漏了。
         * 判据见 palette.spec「货架价签在品阶淡底上也要过线」。
         */
        tierStyle: { borderColor: tint(herbQualityTone(grade), herbTier.border), background: tint(herbQualityTone(grade), 0.06) },
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
      nameCls: { color: qualityTextColor(quality.id) },
      sub: `${quality.name} · ${slot.tier} 阶`,
      quality: inst.quality,
      rare: isRareQuality(inst.quality),
      plaque: qualityAura(inst.quality).plaque,
    luster: lusterOf(inst.quality),
      // 密卡底色固定弱晕染,品阶浓淡交给边框与角章
      tierStyle: { borderColor: tint(quality.color, tier.border), background: tint(quality.color, 0.06) },
      price: slot.price
    }
  }

  function buyOne(idx: number): void {
    const result = market.buy(idx)
    const slot = market.stock.find(s => s.idx === idx)
    const name = slot ? renderSlot(slot).name : ''
    if (result === 'ok') {
      ui.toast(`购得「${name}」`, 'success')
      // 顶档之物另办仪典:与拾得同一份判定(见 ui/treasureCeremony)
      if (slot) celebratePurchase(slot)
    } else if (result === 'poor') ui.toast(slot ? `灵石尚差 ${formatGap(renderSlot(slot).stoneShort)}` : '灵石不足', 'warn')
    else if (result === 'bagfull') ui.toast('行囊已满', 'warn')
    else if (result === 'expired') ui.toast('货架已刷新', 'warn')
  }

  /**
   * 买到的若是顶档之物,与拾得同办得宝仪典(见 ui/treasureCeremony)。
   *
   * 货架上的装备实例由 (stockedAt, idx) 确定性再生 —— 买之前预览的那件、
   * 买之后仪典报的那件,是同一件;这里按同一份再生存根名与成色。
   */
  function celebratePurchase(slot: MarketSlot): void {
    if (slot.kind === 'pill' && slot.pillId) {
      const def = pillDef(slot.pillId)
      if (def) celebrateTreasure({ kind: 'pill', pill: def })
      return
    }
    if (slot.kind !== 'equipment') return
    const inst = marketEquipInstance(slot, market.stockedAt)
    const tmpl = equipmentTemplate(inst.templateId)
    celebrateTreasure({
      kind: 'equip',
      quality: inst.quality,
      name: tmpl?.name ?? inst.templateId,
      icon: tmpl?.icon ?? 'sword'
    })
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
