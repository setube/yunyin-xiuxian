<template>
  <section>
    <SectionTitle title="功法" :hint="`残页 ${resources.page} · 悟道点 ${formatGN(resources.wudao)}`" />
    <!-- 悟道兑换:后期限量灵石换悟道点 -->
    <div
      v-if="player.major >= WUDAO_EXCHANGE_MIN_MAJOR"
      class="mb-2 flex items-center justify-between gap-3 rounded border border-gold-ink/30 bg-gold-ink/5 px-3 py-2"
    >
      <div class="min-w-0">
        <p class="text-[11px] text-ink">灵石 → 悟道</p>
        <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
          每次 {{ formatGN(player.wudaoExchangeState.cost) }} 灵石得 {{ WUDAO_EXCHANGE_GAIN }} 点 · 今日
          {{ player.wudaoExchangeToday }}/{{ WUDAO_EXCHANGE_PER_DAY }}
        </p>
      </div>
      <button
        class="chip-ink shrink-0 !text-[10px]"
        :disabled="!player.canExchangeWudao"
        @click="doExchange"
      >
        {{ player.canExchangeWudao ? '兑换' : exchangeBlockedText }}
      </button>
    </div>
    <div class="mt-2 space-y-2">
      <!-- 主修 -->
      <button
        v-if="mainDef"
        class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98"
        @click="ui.gongfaDetailId = mainDef.id"
      >
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cinnabar/40 bg-cinnabar/10 font-kai text-ink">主</span>
        <span class="min-w-0 grow">
          <span class="flex items-center gap-1.5">
            <span class="min-w-0 truncate font-kai text-[14px] text-ink">{{ mainDef.name }}</span>
            <span
              v-if="branchName(mainDef.id)"
              class="min-w-0 shrink truncate rounded border border-gold-ink/40 bg-gold-ink/10 px-1.5 py-0.5 text-[10px] text-ink"
            >
              {{ branchName(mainDef.id) }}
            </span>
            <span
              v-else-if="canEnlighten(mainDef.id)"
              class="shrink-0 rounded border border-azure/40 bg-azure/10 px-1.5 py-0.5 text-[10px] text-ink"
            >
              待悟道
            </span>
            <span v-if="mainCanUpgrade" class="shrink-0 rounded border border-jade/40 bg-jade/10 px-1.5 py-0.5 text-[10px] text-ink">可升层</span>
          </span>
          <span class="block text-[11px] text-ink-faint">
            第 {{ cultivation.learned[mainDef.id] }} 层 · {{ qualityDef(mainDef.quality).name }}
          </span>
        </span>
        <GameIcon name="flame" :size="15" class="text-cinnabar" />
      </button>

      <!-- 门类分段切换:主修/辅修/秘术三选一,只渲染选中门类 -->
      <div
        class="card-ink flex flex-wrap gap-1 p-1"
        role="tablist"
        aria-label="功法门类"
        @keydown="onGongfaCatKeydown"
      >
        <button
          v-for="g in gongfaCategories"
          :id="`gongfa-cat-tab-${g.type}`"
          :key="g.type"
          role="tab"
          :aria-controls="`gongfa-cat-panel-${g.type}`"
          :aria-selected="gongfaCat === g.type"
          :tabindex="gongfaCat === g.type ? 0 : -1"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 font-kai text-[13px] tracking-[0.1em] transition-colors duration-200"
          :class="gongfaCat === g.type ? gongfaCatActive(g.type) : 'text-ink-faint active:text-ink-soft'"
          @click="gongfaCat = g.type"
        >
          <span
            class="grid h-5 w-5 place-items-center rounded font-kai text-[11px]"
            :class="gongfaCat === g.type ? 'bg-ink/8' : gongfaCatSeal(g.type)"
          >{{ g.seal }}</span>
          <span>{{ GONGFA_TYPE_NAMES[g.type] }}</span>
          <!-- 半透明字在两主题都跌破 AA(纸/15 内格 4.17:1、奶油 60% 2.95:1);层级由字号承担,颜色继承印面 -->
          <span class="text-[10px]" :class="gongfaCat === g.type ? '' : 'text-ink-faint'">{{ g.items.length }} 部</span>
        </button>
      </div>

      <p class="px-1 text-[10px] leading-relaxed text-ink-faint">
        <template v-if="poolLeft > 0">此门尚余 {{ poolLeft }} 部</template>
        <template v-else>此门此境已收全</template>
      </p>

      <div
        :id="`gongfa-cat-panel-${gongfaCat}`"
        class="card-ink max-h-80 divide-y divide-ink/6 overflow-y-auto px-1"
        role="tabpanel"
        :aria-labelledby="`gongfa-cat-tab-${gongfaCat}`"
      >
        <button
          v-for="def in activeGongfaItems"
          :key="def.id"
          class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left active:bg-ink/4"
          @click="ui.gongfaDetailId = def.id"
        >
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md font-kai text-[13px]"
            :class="gongfaCatSeal(def.type)"
          >{{ sealOf(def.type) }}</span>
          <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: qualityTextColor(def.quality) }">{{ def.name }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">{{ cultivation.learned[def.id] }} 层</span>
          <span v-if="branchName(def.id)" class="max-w-24 shrink-0 truncate rounded border border-gold-ink/40 bg-gold-ink/10 px-1.5 py-0.5 text-[10px] text-ink">
            {{ branchName(def.id) }}
          </span>
          <span v-else-if="canEnlighten(def.id)" class="shrink-0 rounded border border-azure/40 bg-azure/10 px-1.5 py-0.5 text-[10px] text-ink">待悟道 →</span>
          <span v-else-if="isFull(def.id)" class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px] text-ink-faint">圆满</span>
          <span class="shrink-0 text-[10px]" :class="equipStateOf(def.id) ? 'text-jade' : 'text-ink-faint'">
            {{ equipStateOf(def.id) || '未装配' }}
          </span>
        </button>
        <p v-if="activeGongfaItems.length === 0" class="px-2.5 py-5 text-center text-[10px] text-ink-faint">暂无功法</p>
      </div>

      <button class="btn-ghost w-full" :disabled="!canComprehend" @click="comprehendGongfa()">
        参悟功法(残页×{{ COMPREHEND_PAGE_COST }})
        <span v-if="comprehendLeft === 0" class="ml-1 text-[10px] text-ink-faint">· {{ gongfaAllLearnedToast() }}</span>
        <span v-else-if="pageShort > 0" class="ml-1 text-[10px] text-ink-faint">· 尚差 {{ pageShort }} 页</span>
        <span v-else class="ml-1 text-[10px] text-ink-faint">· 尚余 {{ comprehendLeft }} 部</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useDongfuStore } from '@/stores/dongfu'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useUiStore } from '@/stores/ui'
  import { comprehendGongfa, gongfaUpgradeCost } from '@/core/gongfaService'
  import { GONGFA, gongfaDef, gongfaMaxLevel, GONGFA_TYPE_NAMES } from '@/data/gongfa'
  import type { GongfaDef, GongfaType } from '@/types'
  import { canEnlighten as canEnlightenGongfa, gongfaBranchDef } from '@/data/gongfaBranches'
  import {
    COMPREHEND_PAGE_COST,
    WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, WUDAO_EXCHANGE_GAIN
  } from '@/data/constants'
  import { formatGN, formatGap } from '@/utils/format'
  import { gongfaAllLearnedToast } from '@/ui/gongfaText'
  import { exchangeOkToast, exchangeFailText } from '@/ui/cultivationText'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /** 功法区:各块共用同一份门类投影(gongfaCategories)与同一池条件(comprehendGongfa) */
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  const exchangeState = computed(() => player.wudaoExchangeState)
  const exchangeBlockedText = computed(() => {
    const state = exchangeState.value
    return exchangeFailText(state.lockedByRealm, state.dailyFull, formatGap(state.stoneShort))
  })

  const GONGFA_CAT_ORDER: GongfaType[] = ['main', 'sub', 'secret']

  function sealOf(type: GongfaType): string {
    return type === 'secret' ? '秘' : type === 'main' ? '主' : '辅'
  }

  /** 已习得功法按门类(主/辅/秘)分组,恒出三门;栏内已装配置顶,再按品质降序 */
  const gongfaCategories = computed(() =>
    GONGFA_CAT_ORDER.map(type => ({
      type,
      seal: sealOf(type),
      items: (Object.keys(cultivation.learned)
        .map(id => gongfaDef(id))
        .filter((d): d is GongfaDef => !!d && d.type === type)
      ).sort((a, b) => {
        const ea = Number(equipStateOf(a.id) !== '')
        const eb = Number(equipStateOf(b.id) !== '')
        return eb - ea || qualityDef(b.quality).rank - qualityDef(a.quality).rank
      })
    }))
  )

  const gongfaCat = ref<GongfaType>('main')
  const activeGongfaItems = computed(
    () => gongfaCategories.value.find(g => g.type === gongfaCat.value)?.items ?? []
  )

  /** 门类印章配色(非激活态) */
  /**
   * 未选中门类的方印底色。字色走墨色(见上一条判据:彩色字压同色淡底过不了 4.5),
   * 门类的区分交给色块与描边。
   */
  function gongfaCatSeal(type: GongfaType): string {
    return type === 'secret'
      ? 'border border-violet-ink/40 bg-violet-ink/15 text-ink'
      : type === 'main'
        ? 'border border-cinnabar/40 bg-cinnabar/10 text-ink'
        : 'border border-jade/40 bg-jade/15 text-ink'
  }

  /**
   * 激活态配色:整颗 tab 走 .seal-face,不用 text-paper。
   * text-paper 依纸色路由,而夜主题把 paper 翻成近黑(33 31 28),印底却是亮朱/亮紫/亮绿:
   * 实测朱印 3.83:1、内层 bg-paper/15 再降到 3.13:1,同一屏的 .btn-seal 是奶油字,两套脸。
   * .seal-face 把夜主题整面压成深朱并固定奶油字,与 .btn-seal / .world-seal 同源(AGENTS.md 明文)。
   * 只给这颗 tab 挂,不给里面的字形与「N 部」挂:类里有背景,挂到子节点就会在印面上再压两块深朱。
   */
  function gongfaCatActive(type: GongfaType): string {
    return type === 'secret' ? 'bg-violet-ink seal-face' : type === 'main' ? 'bg-cinnabar seal-face' : 'bg-jade seal-face'
  }

  /** WAI-ARIA tabs 键盘导航:左右键在门类间回绕,Home/End 直达首尾(与 InkTabs 同约定) */
  function onGongfaCatKeydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).getAttribute?.('role') !== 'tab') return
    let idx = GONGFA_CAT_ORDER.indexOf(gongfaCat.value)
    switch (e.key) {
      case 'ArrowLeft': idx -= 1; break
      case 'ArrowRight': idx += 1; break
      case 'Home': idx = 0; break
      case 'End': idx = GONGFA_CAT_ORDER.length - 1; break
      default: return
    }
    idx = (idx + GONGFA_CAT_ORDER.length) % GONGFA_CAT_ORDER.length
    e.preventDefault() // 别让方向键滚动页面
    const target = GONGFA_CAT_ORDER[idx]
    if (target === undefined) return
    gongfaCat.value = target
    ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[idx]?.focus()
  }

  const mainDef = computed(() => (cultivation.mainGongfa ? gongfaDef(cultivation.mainGongfa) : undefined))

  /**
   * 主修能否立升一层(只做主修)。成本走 `gongfaUpgradeCost`(含寒冥灵脉折扣),
   * 判据与 `upgradeGongfa` 的扣费前检查同一句。
   */
  const mainCanUpgrade = computed(() => {
    const def = mainDef.value
    if (!def) return false
    const cost = gongfaUpgradeCost(def.id)
    if (!cost) return false
    return resources.hasSmall('wudao', cost.wudao) && resources.hasSmall('page', cost.page)
  })

  /** 参悟池余量,与 comprehendGongfa 的池条件同源(minRealm ≤ 当前 + 1 且未习得) */
  const comprehendLeft = computed(
    () => GONGFA.filter(g => g.minRealm <= player.major + 1 && !cultivation.learned[g.id]).length
  )

  /** 选中门类的参悟池余量:同一池条件,多按门类过滤 */
  const poolLeft = computed(
    () => GONGFA.filter(g => g.type === gongfaCat.value && g.minRealm <= player.major + 1 && !cultivation.learned[g.id]).length
  )

  /** 参悟还差几页残页,与 comprehendGongfa 的消耗同源 */
  const pageShort = computed(() => Math.max(0, COMPREHEND_PAGE_COST - resources.page))

  const canComprehend = computed(() => comprehendLeft.value > 0 && pageShort.value === 0)

  function equipStateOf(id: string): string {
    if (cultivation.mainGongfa === id) return '主修'
    const idx = cultivation.subGongfa.indexOf(id)
    if (idx === -1) return ''
    // 藏经阁缩水/转世后槽位变少时,超出辅修槽位预算的词条不生效(cultivation.gongfaMods 只 slice 到预算),不标辅修/秘术
    if (idx >= dongfu.subGongfaSlots) return '超席'
    return gongfaDef(id)?.type === 'secret' ? '秘术' : '辅修'
  }

  /** 功行是否已至顶层 */
  function isFull(id: string): boolean {
    return (cultivation.learned[id] ?? 0) >= gongfaMaxLevel(gongfaDef(id))
  }

  /** 能否悟道:判据取自 gongfaBranches */
  function canEnlighten(id: string): boolean {
    return canEnlightenGongfa(id, cultivation.learned[id] ?? 0)
  }

  /** 已择分支的道名;未择、或旧档里已下线的分支 id,都算没有 */
  function branchName(id: string): string | undefined {
    const branchId = cultivation.gongfaBranch[id]
    return branchId ? gongfaBranchDef(branchId)?.name : undefined
  }

  function doExchange(): void {
    const ok = player.exchangeStoneForWudao()
    ui.toast(
      ok
        ? exchangeOkToast(WUDAO_EXCHANGE_GAIN)
        : exchangeFailText(
            exchangeState.value.lockedByRealm,
            exchangeState.value.dailyFull,
            formatGap(exchangeState.value.stoneShort)
          ),
      ok ? 'success' : 'warn'
    )
  }
</script>
