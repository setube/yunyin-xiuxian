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
        <div v-for="m in materialRows" :key="m.id" class="card-ink flex items-center justify-between gap-2 px-3 py-2.5">
          <!--
            左列允许折行、且名字不许被压窄:「凡品灵草」四字在 320 宽曾被挤成一行一个字,
            行高 100px(整行别的材料是 61)。名字是这一行唯一必须完整读出的东西,
            该让位的是「存 / 每摞」那两段读数。
          -->
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <!-- 灵草按品阶上色;玄铁无品阶,保持原样 -->
            <GameIcon v-if="m.grade == null" :name="m.icon" :size="16" class="text-jade" />
            <GameIcon v-else :name="m.icon" :size="16" :style="{ color: herbQualityTone(m.grade) }" />
            <span
              class="shrink-0 whitespace-nowrap font-kai text-[13px]"
              :style="m.grade == null ? undefined : { color: herbQualityTextColor(m.grade) }"
              :class="m.grade == null ? 'text-ink' : ''"
            >{{ m.name }}</span>
            <span class="whitespace-nowrap text-[10px] text-ink-faint">存 {{ m.count }}</span>
            <!--
              整摞价原先内联在「售出」钮里:钮正文带一个长数字,与确认态那两枚短钮
              差出 60px —— 一点一退,整行左列宽就从 76.8 跳到 96.6(320 宽实测卡片高度也变)。
              价签放到存量旁,按钮只留动作词,两态宽度就咬住了。
              「每摞」是量词:钮上的 ×12 是「一摞 12 份」,裸写一个数会读成单价。
            -->
            <span class="whitespace-nowrap text-[10px] text-ink-faint tabular">每摞 {{ formatGN(m.price) }}</span>
          </div>
          <!--
            两态同栏:确认态的两枚钮各自顶替「售出」与「售尽」这两格,不增删格位。
            原先确认态是「再想想 + 确认售尽」两枚新钮(合计 119px),未确认态
            「售出 ×12 (4.021亿) + 售尽」是 179px —— 一点一退,整行的左列宽就从 76.8 跳到 96.6,
            320 宽下卡片高度也跟着 61 变成 56.5(实测)。格位固定,行就不动。
          -->
          <span class="flex shrink-0 items-center gap-1.5">
            <template v-if="sellArm === keyOf(m)">
              <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="sellArm = null">再想想</button>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="sellAllOf(m)">确认售尽</button>
            </template>
            <template v-else>
              <!--
                份数不够时钮上直接写差多少(AGENTS.md「禁用即给原因」)。
                这行原先是左侧一个独立的「尚差 N」小字:同一件事写两遍,而钮本身仍只写「售出」。
              -->
              <button
                class="btn-ghost !px-2.5 !py-2 !text-[11px]"
                :disabled="m.count < MARKET_MAT_COUNT"
                @click="m.grade == null ? sellOreOne() : sellHerbOne(m.grade)"
              >售出 ×{{ MARKET_MAT_COUNT }}{{ m.count < MARKET_MAT_COUNT ? `(尚差 ${MARKET_MAT_COUNT - m.count})` : '' }}</button>
              <!-- 后期常堆几十摞:整份售出要按几十次,故给「售尽」(两步确认,不可逆) -->
              <button
                v-if="m.lots > 1"
                class="btn-ghost !px-2 !py-2 !text-[11px] text-cinnabar"
                @click="sellArm = keyOf(m)"
              >售尽</button>
            </template>
          </span>
        </div>
      </div>
    </div>

    <div>
      <SectionTitle title="售丹药" :hint="`${sellablePills.length} 味`" />
      <div class="card-ink mt-2 max-h-56 divide-y divide-ink/6 overflow-y-auto px-1">
        <div v-for="p in sellablePills" :key="p.id" class="flex items-center gap-2 px-2.5 py-2">
          <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: p.color }">{{ p.name }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">×{{ p.count }}</span>
          <!-- 单价挪出「售出」钮,与材料行同一做法:钮正文只留动作词,两态宽度才咬得住 -->
          <span class="shrink-0 whitespace-nowrap text-[10px] text-ink-faint tabular">{{ formatGN(p.price) }}</span>
          <span class="flex shrink-0 items-center gap-1.5">
            <template v-if="sellArm === p.id">
              <button class="btn-ghost !px-2 !py-2 !text-[11px]" @click="sellArm = null">再想想</button>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="sellPillAll(p.id)">确认售尽</button>
            </template>
            <template v-else>
              <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="sellPillOne(p.id)">售出</button>
              <button
                v-if="p.count > 1"
                class="btn-ghost !px-2 !py-2 !text-[11px] text-cinnabar"
                @click="sellArm = p.id"
              >售尽</button>
            </template>
          </span>
        </div>
        <p v-if="sellablePills.length === 0" class="px-2.5 py-3 text-center text-[10px] text-ink-faint">暂无可售丹药</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
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
  import { herbQualityTextColor, herbQualityTone } from '@/ui/herbQuality'
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

  /** 一摞多少单位;售尽的可售摞数按它整除,不足一摞不算 —— 与逐次售出同一口径 */
  const materialRows = computed(() => [
    {
      id: 'ore',
      grade: null as HerbGrade | null,
      icon: 'mountain',
      name: '玄铁',
      count: resources.ore,
      lots: Math.floor(resources.ore / MARKET_MAT_COUNT),
      price: materialSellPrice(player.major)
    },
    ...HERB_GRADES.filter(g => resources.herbOf(g) > 0).map(g => ({
      id: `herb_${g}`,
      grade: g,
      icon: 'leaf',
      name: HERB_GRADE_NAMES[g],
      count: resources.herbOf(g),
      lots: Math.floor(resources.herbOf(g) / MARKET_MAT_COUNT),
      price: herbSellBatch(g, player.major)
    }))
  ])

  /** 售尽的二次确认态:材料行的键或丹药 id;值为 null 表示无确认中 */
  const sellArm = ref<string | null>(null)
  function keyOf(m: { id: string }): string {
    return m.id
  }

  /** 售尽某一行材料:逐摞走 store 的整摞售出,计价不分叉 */
  function sellAllOf(m: { id: string; grade: HerbGrade | null; lots: number }): void {
    sellArm.value = null
    const n = m.grade === null ? market.sellOreAll(player.major) : market.sellHerbAll(m.grade)
    if (n > 0) ui.toast(`${m.id === 'ore' ? '玄铁' : HERB_GRADE_NAMES[m.grade!]}×${n} 摞已售出`, 'success')
  }

  /** 售尽某一味丹药:逐枚走 store 的 sellPill */
  function sellPillAll(pillId: string): void {
    sellArm.value = null
    const name = pillDef(pillId)?.name ?? ''
    const r = market.sellPillAll(pillId)
    if (r.count > 0) ui.toast(`「${name}」×${r.count} 已售出`, 'success')
  }

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
