<template>
  <BaseModal :open="open" title="天道熔炉" @close="emit('close')">
    <div class="card-ink divide-y divide-ink/6 px-4">
      <!--
        四类物资各熔一次要点四次,而后期往往四样都堆着 —— 给一条「全部熔尽」。
        整笔仍走 furnaceConvert(同一份判据),总计与逐类预览同源。
      -->
      <div v-if="totalMelt > 0" class="flex items-center justify-between gap-2 py-2.5">
        <span class="min-w-0 flex-1 text-[12px] text-ink-soft">
          四类合计
          <span class="block text-[10px] leading-tight text-ink-faint tabular">可熔得 {{ totalMelt }} 道源</span>
        </span>
        <template v-if="meltAllArm">
          <!--
            两枚必须等高。`.btn-seal` 无 border、`.btn-ghost` 有 1px border,
            在同样的 !py-2 下内容盒同高、边框盒差 2px(实测 375 宽是 35 对 33)。
            给确认钮补 1px 透明边框,两者边框盒对齐;不靠调 padding 去凑。
          -->
          <span class="flex shrink-0 items-center gap-1.5">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="meltAllArm = false">再想想</button>
            <button class="btn-seal border border-transparent !px-2.5 !py-2 !text-[11px]" @click="doMeltAll">确认全熔</button>
          </span>
        </template>
        <button v-else class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="meltAllArm = true">
          全部熔尽
        </button>
      </div>
      <div v-for="row in furnaceRows" :key="row.rate.resource" class="py-2.5">
        <div class="flex items-center justify-between gap-2">
          <!-- 名称与存量分两行:率条插进来后单行会把「(存 3,000)」挤成折行 -->
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-[12px] text-ink-soft">{{
                row.rate.resource === "herb" ? '灵草' : row.rate.name
              }}</span>
              <!-- 熔率条:越划算越长。四类的 25/15/60/80 不必自己比 -->
              <span
                class="furnace-rate w-9 shrink-0"
                :class="`furnace-rate--${rateMark(row.rate.per, row.rate.name).tier}`"
                :style="{ '--rate-fill': `${rateMark(row.rate.per, row.rate.name).fill * 100}%` }"
                role="img"
                :aria-label="rateMark(row.rate.per, row.rate.name).label"
              />
            </span>
            <span class="block text-[10px] leading-tight text-ink-faint tabular">
              存 {{ formatNum(row.have) }}
            </span>
          </span>
          <!-- 全熔防误触:亮出整包与可得道源,再按一下才熔 -->
          <button
            class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
            :disabled="row.gain <= 0"
            @click="furnaceConfirm = row.rate.resource"
          >
            熔尽本包 → {{ row.gain }} 道源
          </button>
        </div>
        <div
          v-if="furnaceConfirm === row.rate.resource"
          class="mt-1.5 rounded-md bg-cinnabar/5 px-3 py-2"
        >
          <p class="text-[10px] leading-relaxed text-cinnabar">
            <span class="tabular">{{ row.rate.name }} ×{{ formatNum(row.spend) }}</span>
            → 道源 <span class="tabular">+{{ row.gain }}</span> · 余
            <span class="tabular">{{ formatNum(row.left) }}</span>
            · 不可逆
          </p>
          <div class="mt-1.5 flex justify-end gap-2">
            <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="furnaceConfirm = null">
              再想想
            </button>
            <button class="btn-seal !px-3 !py-2 !text-[11px] tabular" @click="doFurnace(row.rate)">
              确认熔尽
            </button>
          </div>
        </div>
      </div>
      <!--
        灵石那一行与上面四行同一套排法:存量在左、动作在右。
        原先钮里写着「33.51 亿 → 5 道源」——320 宽下这一格只有 100 余 px,
        「源」被挤到第二行,整行比上面四行高出半行(实测 320 折成 2 行,375 是 1 行)。
        价签挪到左侧存量那一行,钮只写动作词,与「熔尽本包」那四颗同宽。
      -->
      <div class="flex items-center justify-between gap-2 py-2.5">
        <span class="min-w-0 text-[12px] text-ink-soft">
          灵石(存 {{ formatGN(resources.spiritStone) }})
          <span
            v-if="stoneShort.m <= 0"
            class="tabular text-[10px] text-ink-faint"
          >{{ formatGN(furnaceStoneCost()) }} → {{ FURNACE_STONE_DAO_SOURCE }} 道源</span>
          <span v-else class="tabular text-[10px] text-cinnabar">灵石尚差 {{ formatGap(stoneShort) }}</span>
        </span>
        <button
          class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]"
          :disabled="stoneShort.m > 0"
          :title="stoneShort.m > 0 ? `灵石尚差 ${formatGap(stoneShort)}` : undefined"
          @click="furnaceConvertStone()"
        >熔 铸</button>
      </div>
      <div class="py-2.5">
        <!--
          凝一枚与连凝分开两颗钮:道源攒够几十枚的量时,一枚一枚点几十次没有意义。
          连凝的可凝数与 condenseDaoFruit 同口径(整枚计),整笔原子 ——
          不够全额就一枚也不凝,不留下半枚的零头。
        -->
        <!-- 标签与钮分两行:窄屏下并排会把「道源凝道果(跨世保留)」挤成竖排 -->
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span class="shrink-0 text-[12px] text-ink-soft">道源凝道果(跨世保留)</span>
          <span class="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
              :disabled="fruitShort.short.m > 0"
              :title="fruitShort.reason ?? undefined"
              @click="doCondense()"
            >
              {{
                fruitShort.short.m > 0
                  ? `道果 +1(道源尚差 ${daoSourceShortText(DAO_SOURCE_PER_FRUIT, endgame.daoSource)})`
                  : `${DAO_SOURCE_PER_FRUIT} 道源 → 道果 +1`
              }}
            </button>
            <!-- 只够凝一枚时不必摆连凝:两颗钮做同一件事 -->
            <button
              v-if="affordable > 1"
              class="btn-ghost !px-3 !py-2 !text-[11px] tabular"
              @click="doCondenseAll()"
            >
              连凝 {{ affordable }} 枚
            </button>
          </span>
        </div>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint tabular">
          当前 {{ fruitInfo.total }} 枚 · 有效 {{ fruitCountLabel(fruitInfo.effective) }}
          <span class="text-gold-ink"
            >→ 凝后 {{ fruitCountLabel(fruitInfo.nextEffective) }}(+{{ fruitInfo.deltaPct }}%)</span
          >
        </p>
        <!-- 边际刻度:再凝一枚还剩几成力。刻度递减,不靠「边际渐减」四个字 -->
        <div v-if="fruitInfo.total > 0" class="mt-1 flex items-center gap-2">
          <span
            class="fruit-pips shrink-0"
            role="img"
            :aria-label="`${nextMargin.label} · 六格中 ${nextMargin.pips} 格`"
          >
            <i v-for="n in MARGIN_PIPS" :key="n" :class="{ on: n <= nextMargin.pips }" />
          </span>
          <svg
            v-if="showCurve"
            class="fruit-curve min-w-0 flex-1"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <polyline :points="curvePoints" />
          </svg>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 炉</button>
    </template>
  </BaseModal>

  <BaseModal :open="fruitDialogOpen" title="道果" @close="closeFruitDialog()">
    <div class="space-y-2.5 text-[12px] leading-relaxed">
      <p class="text-ink-soft">{{ fruitDialog.intro }}</p>
      <div>
        <p class="font-kai text-[12px] tracking-wider text-ink">用途</p>
        <p class="text-ink-faint">{{ fruitDialog.usages.join(" · ") }}</p>
      </div>
      <div>
        <p class="font-kai text-[12px] tracking-wider text-ink">获取</p>
        <p class="text-ink-faint">{{ fruitDialog.gains.join(" · ") }}</p>
      </div>
      <!-- 生命周期形制:与道源那扇同一套(见 ui/resourceTone),不再各写一个左边框色 -->
      <p
        class="flex items-start gap-2 border-l-2 pl-2 text-[11px]"
        :class="`res-tone res-tone--${toneOf(fruitDialog.roleTone).tone}`"
      >
        <span class="res-tone__seal shrink-0 font-kai" aria-hidden="true">{{ toneOf(fruitDialog.roleTone).seal }}</span>
        <span class="min-w-0">
          <span class="block text-ink">{{ fruitDialog.lifecycle }}</span>
          <span class="block text-[10px] text-ink-faint">{{ toneOf(fruitDialog.roleTone).note }}</span>
        </span>
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="closeFruitDialog()">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resourceTone as toneOf } from '@/ui/resourceTone'
import BaseModal from '@/components/common/BaseModal.vue'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import {
  DAO_SOURCE_PER_FRUIT,
  FURNACE_RATES,
  FURNACE_STONE_DAO_SOURCE,
  type FurnaceRate
} from '@/data/endgame'
import {
  condenseDaoFruit,
  condenseFruitAffordable,
  furnaceConvert,
  furnaceConvertStone,
  furnaceStoneCost
} from '@/core/endgameService'
import {
  daoFruitDialog,
  dismissFruitTutorial,
  fruitCountLabel,
  fruitMarginalInfo,
  shouldShowFruitTutorial
} from '@/core/resourceGuidance'
import { formatGN, formatGap, formatNum } from '@/utils/format'
import { gnZero, subClamp } from '@/utils/gnum'
import { daoSourceShortfall, daoSourceShortText } from '@/core/daoSource'
import { MARGIN_PIPS, marginCurvePoints, marginMark } from '@/ui/fruitMargin'
import { rateMark } from '@/ui/furnaceRate'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const resources = useResourcesStore()
const furnaceUi = useUiStore()
const player = usePlayerStore()
const endgame = useEndgameStore()

/** 全熔确认态(按资源键);弹窗关闭即复位 */
const furnaceConfirm = ref<FurnaceRate['resource'] | null>(null)
watch(
  () => props.open,
  open => {
    if (!open) furnaceConfirm.value = null
  }
)

/** 全熔预览与 furnaceConvert 同口径 floor(have/per);灵草按仙品+计 */
function haveOf(rate: FurnaceRate): number {
  return rate.resource === 'herb' ? resources.herbMeltable : (resources[rate.resource] as number)
}
/**
 * 熔炉四行:存量、可熔得、整包料、余料一并算一次。
 *
 * 模板原先在每行里调 `furnacePreview(row.rate)` 四次(禁用判据 / 钮正文 / 确认态的
 * 两份读数各一次),`totalMelt` 又逐行再调一遍 —— 同一个 floor 除法算到二十遍。
 * 现随存量一起算齐,模板只读字段。
 */
const furnaceRows = computed(() =>
  FURNACE_RATES.map(rate => {
    const have = haveOf(rate)
    const gain = Math.floor(have / rate.per)
    const spend = gain * rate.per
    return { rate, have, gain, spend, left: have - spend }
  })
)
/** 四类全熔合计:逐类预览相加,与逐类推的是同一个函数 */
const totalMelt = computed(() => furnaceRows.value.reduce((sum, row) => sum + row.gain, 0))
/** 全部熔尽的二次确认态 */
const meltAllArm = ref(false)
function furnacePreview(rate: FurnaceRate): number {
  // 直接按 rate 算,不经 find:同口径且不会因表对不上号而落到非空断言上
  return Math.floor(haveOf(rate) / rate.per)
}
function doFurnace(rate: FurnaceRate): void {
  furnaceConfirm.value = null
  furnaceConvert(rate)
}
/** 全部熔尽:逐类走同一个 furnaceConvert,判据不分叉;某类不够一炉时自然跳过 */
function doMeltAll(): void {
  meltAllArm.value = false
  let gained = 0
  for (const rate of FURNACE_RATES) {
    if (furnacePreview(rate) > 0) gained += furnaceConvert(rate)
  }
  if (gained > 0) furnaceUi.toast(`四类熔作道源 +${gained}`, 'success')
}

const fruitInfo = computed(() => fruitMarginalInfo())
/** 下一枚(凝后那一枚)的边际形制:刻度与折线都从它起算 */
const nextMargin = computed(() => marginMark(fruitInfo.value.total + 1))
const curvePoints = computed(() => marginCurvePoints(fruitInfo.value.total))
/** 一两枚时曲线是平的:没有可读的形状,不如不画 */
const showCurve = computed(() => fruitInfo.value.total >= 4)

const fruitShort = computed(() => daoSourceShortfall(DAO_SOURCE_PER_FRUIT, endgame.daoSource))
/** 手上道源最多能凝几枚:连凝钮的可凝数,与 condenseDaoFruit 同口径 */
const affordable = computed(() => condenseFruitAffordable())
/** 灵石熔铸缺口;价签与 furnaceConvertStone 同源 */
const stoneShort = computed(() => {
  const cost = furnaceStoneCost()
  return resources.hasStone(cost) ? gnZero() : subClamp(cost, resources.spiritStone)
})

/** 凝道果:道果说明关掉前,凝成即弹 */
const fruitDialogOpen = ref(false)
const fruitDialog = computed(() => daoFruitDialog())
let fruitOpenedAt = -Infinity
function doCondense(n = 1): void {
  const before = player.reincarnation.daoFruit
  condenseDaoFruit(n)
  if (player.reincarnation.daoFruit === before || !shouldShowFruitTutorial()) return
  fruitOpenedAt = performance.now()
  fruitDialogOpen.value = true
}
/** 连凝:一次把手上的道源凝尽;可凝数由 affordable 给,不在这里重算 */
function doCondenseAll(): void {
  doCondense(affordable.value)
}
/** 道果说明的一切关闭都走这里 */
function closeFruitDialog(): void {
  if (!dismissFruitTutorial(fruitOpenedAt, performance.now())) return
  fruitDialogOpen.value = false
}
</script>
