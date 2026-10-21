<template>
  <!-- 功法 -->
  <section>
    <!-- 玩家反馈:看功法列表时只报残页,悟道点要开弹窗才看得见 —— 这里一并报 -->
    <SectionTitle title="功法" :hint="`残页 ${resources.page} · 悟道点 ${formatGN(resources.wudao)}`" />
    <!-- 悟道兑换(Phase C-1):后期灵石过剩时,限量换悟道点再投进修/炼化 -->
    <div
      v-if="player.major >= WUDAO_EXCHANGE_MIN_MAJOR"
      class="mb-2 flex items-center justify-between gap-3 rounded border border-gold-ink/30 bg-gold-ink/5 px-3 py-2"
    >
      <div class="min-w-0">
        <p class="text-[11px] text-ink">灵石 → 悟道 · 后期限量</p>
        <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
          今日已兑 {{ player.wudaoExchangeToday }} / {{ WUDAO_EXCHANGE_PER_DAY }} 次 · 次耗
          {{ formatGN(gn(WUDAO_EXCHANGE_PRICE_BASE)) }} 灵石得 {{ WUDAO_EXCHANGE_GAIN }} 点
        </p>
      </div>
      <button
        class="chip-ink shrink-0 !text-[10px]"
        :disabled="!player.canExchangeWudao"
        :title="player.canExchangeWudao ? undefined : exchangeBlockedText"
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
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cinnabar/10 font-kai text-cinnabar">主</span>
        <span class="min-w-0 grow">
          <span class="flex items-center gap-1.5">
            <span class="min-w-0 truncate font-kai text-[14px] text-ink">{{ mainDef.name }}</span>
            <!-- 已择分支在卡面就报出来:否则玩家要开详情才知道这一门走的是哪条道 -->
            <span
              v-if="branchName(mainDef.id)"
              class="min-w-0 shrink truncate rounded bg-gold-ink/10 px-1.5 py-0.5 text-[10px] text-gold-ink"
            >
              {{ branchName(mainDef.id) }}
            </span>
            <span
              v-else-if="canEnlighten(mainDef.id)"
              class="shrink-0 rounded bg-azure/10 px-1.5 py-0.5 text-[10px] text-azure"
            >
              待悟道
            </span>
            <!-- 「攒够了」的信号提到卡面:否则玩家得逐部点开详情,才知道升得动哪一部 -->
            <span v-if="mainCanUpgrade" class="shrink-0 rounded bg-jade/10 px-1.5 py-0.5 text-[10px] text-jade">可升层</span>
          </span>
          <span class="block text-[11px] text-ink-faint">
            第 {{ cultivation.learned[mainDef.id] }} 层 · {{ qualityDef(mainDef.quality).name }}
          </span>
        </span>
        <GameIcon name="flame" :size="15" class="text-cinnabar" />
      </button>

      <!--
        门类分段切换:主修/辅修/秘术 三选一,只渲染选中门类 ——
        辅修一按即见,不再埋在长笺里;选中门类单类展示、栏头不再粘顶互相叠压。
      -->
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
          <!-- 门类小印章:与列表行同一块语言,激活时压成纸上字,暗色下仍可辨 -->
          <span
            class="grid h-5 w-5 place-items-center rounded font-kai text-[11px]"
            :class="gongfaCat === g.type ? 'bg-paper/15 text-paper' : gongfaCatSeal(g.type)"
          >{{ g.seal }}</span>
          <span>{{ GONGFA_TYPE_NAMES[g.type] }}</span>
          <span class="text-[10px]" :class="gongfaCat === g.type ? 'text-paper/60' : 'text-ink-faint'">{{ g.items.length }} 部</span>
        </button>
      </div>

      <!--
        逐门参悟池余量:藏经阁是「花残页赌一部没见过的」,只报全局余量时,
        玩家分不清想补的那一门到底还剩几部 —— 与 comprehendGongfa 同一池条件。
      -->
      <p class="px-1 text-[10px] leading-relaxed text-ink-faint">
        <template v-if="poolLeft > 0">此门已习 {{ activeGongfaItems.length }} 部 · 参悟池尚余 {{ poolLeft }} 部</template>
        <template v-else>此门此境已收全,待更高境界再探</template>
      </p>

      <!-- 选中门类的已习得列表:单类一屏,栏内按品质降序 -->
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
          <!-- 门类印章:与主修卡「主」字同一块语言,辅/秘一眼可辨 -->
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md font-kai text-[13px]"
            :class="gongfaCatSeal(def.type)"
          >{{ sealOf(def.type) }}</span>
          <!-- 品质染名的功法名 -->
          <span class="min-w-0 grow truncate font-kai text-[13px]" :style="{ color: qualityDef(def.quality).color }">{{ def.name }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">{{ cultivation.learned[def.id] }} 层</span>
          <!-- Phase 31 A3:已选分支显示道名;确有歧路可择时才招手,否则只报「圆满」 -->
          <span v-if="branchName(def.id)" class="max-w-24 shrink-0 truncate rounded bg-gold-ink/10 px-1.5 py-0.5 text-[10px] text-gold-ink">
            {{ branchName(def.id) }}
          </span>
          <span v-else-if="canEnlighten(def.id)" class="shrink-0 rounded bg-azure/10 px-1.5 py-0.5 text-[10px] text-azure">待悟道 →</span>
          <span v-else-if="isFull(def.id)" class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px] text-ink-faint">圆满</span>
          <span class="shrink-0 text-[10px]" :class="equipStateOf(def.id) ? 'text-jade' : 'text-ink-faint'">
            {{ equipStateOf(def.id) || '未装配' }}
          </span>
        </button>
        <p v-if="activeGongfaItems.length === 0" class="px-2.5 py-5 text-center text-[10px] text-ink-faint">
          {{ learnedCount === 0 ? '尚无一部习得之法 —— 于下方藏经阁参悟,点亮道途' : '此门尚无习得功法 —— 参悟或将它转为此门,功法便在此现身。' }}
        </p>
      </div>

      <!--
        参悟池还剩几部也报出来:藏经阁是「花残页赌一部没见过的」,
        玩家看不到池子还有多大,就无从判断这一注值不值。
        付不起残页时置灰并写差多少 —— 点下去只换来一句 toast,不如按前就说清。
      -->
      <button class="btn-ghost w-full" :disabled="!canComprehend" @click="comprehendGongfa()">
        于藏经阁参悟功法(残页×{{ COMPREHEND_PAGE_COST }})
        <span v-if="comprehendLeft === 0" class="ml-1 text-[10px] text-ink-faint">· {{ gongfaAllLearnedToast() }}</span>
        <span v-else-if="pageShort > 0" class="ml-1 text-[10px] text-ink-faint">· 尚差 {{ pageShort }} 残页</span>
        <span v-else class="ml-1 text-[10px] text-ink-faint">· 池中尚有 {{ comprehendLeft }} 部未参</span>
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
  import { gn } from '@/utils/gnum'
  import { GONGFA, gongfaDef, gongfaMaxLevel, GONGFA_TYPE_NAMES } from '@/data/gongfa'
  import type { GongfaDef, GongfaType } from '@/types'
  import { canEnlighten as canEnlightenGongfa, gongfaBranchDef } from '@/data/gongfaBranches'
  import {
    COMPREHEND_PAGE_COST,
    WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, WUDAO_EXCHANGE_GAIN, WUDAO_EXCHANGE_PRICE_BASE
  } from '@/data/constants'
  import { formatGN } from '@/utils/format'
  import { gongfaAllLearnedToast } from '@/ui/gongfaText'
  import { exchangeOkToast, exchangeFailText } from '@/ui/cultivationText'
  import { qualityDef } from '@/data/qualities'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 功法区 —— 自 CultivationView 迁入。
   *
   * 悟道兑换、主修卡、门类切换、已习列表与参悟按钮同属一域,且共用同一份
   * 门类投影(gongfaCategories)与同一池条件(comprehendGongfa)。拆出后
   * 宿主不再替它持有分类、参悟余量与可升层判据。
   */
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  const exchangeState = computed(() => player.wudaoExchangeState)
  const exchangeBlockedText = computed(() => {
    const state = exchangeState.value
    return exchangeFailText(state.lockedByRealm, state.dailyFull, formatGN(state.stoneShort))
  })

  const GONGFA_CAT_ORDER: GongfaType[] = ['main', 'sub', 'secret']

  function sealOf(type: GongfaType): string {
    return type === 'secret' ? '秘' : type === 'main' ? '主' : '辅'
  }

  /** 已习得功法按门类(主/辅/秘)分组、栏内已装配的置顶再按品质降序 —— 恒出三门供切换,选中门类单类展示 */
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

  /** 门类切换(主修/辅修/秘术):只展示选中门类,不再三栏粘顶叠压 */
  const gongfaCat = ref<GongfaType>('main')
  const activeGongfaItems = computed(
    () => gongfaCategories.value.find(g => g.type === gongfaCat.value)?.items ?? []
  )
  const learnedCount = computed(() => gongfaCategories.value.reduce((n, g) => n + g.items.length, 0))

  /** 门类小印章的配色(非激活态;与主修卡「主」字同一块语言) */
  function gongfaCatSeal(type: GongfaType): string {
    return type === 'secret'
      ? 'bg-violet-ink/15 text-violet-ink'
      : type === 'main'
        ? 'bg-cinnabar/10 text-cinnabar'
        : 'bg-jade/15 text-jade'
  }

  /** 激活态的整块配色:沿用该门类的印章色填充,让选中门类与周围彩色印章同一套语言 */
  function gongfaCatActive(type: GongfaType): string {
    return type === 'secret'
      ? 'bg-violet-ink text-paper'
      : type === 'main'
        ? 'bg-cinnabar text-paper'
        : 'bg-jade text-paper'
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
      default: return // 其它键不干预
    }
    idx = (idx + GONGFA_CAT_ORDER.length) % GONGFA_CAT_ORDER.length // 左右键到两端回绕
    e.preventDefault() // 别让方向键顺带滚动页面
    const target = GONGFA_CAT_ORDER[idx]
    if (target === undefined) return
    gongfaCat.value = target
    ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[idx]?.focus()
  }

  const mainDef = computed(() => (cultivation.mainGongfa ? gongfaDef(cultivation.mainGongfa) : undefined))

  /**
   * 主修能不能立升一层 —— 把「现在就能变强」的信号提到列表层。
   *
   * 升层是主动消费(悟道点 + 残页),没有层内进度可画;从前玩家攒够了也看不出
   * 哪部功法升得动,要一部部点开详情才知道。成本走 `gongfaUpgradeCost` 同源
   * (含寒冥灵脉折扣),判据与 `upgradeGongfa` 的扣费前检查同一句,不另立口径。
   * 只做主修:书目行每行都亮会太密,完整成本账仍在详情层。
   */
  const mainCanUpgrade = computed(() => {
    const def = mainDef.value
    if (!def) return false
    const cost = gongfaUpgradeCost(def.id)
    if (!cost) return false
    return resources.hasSmall('wudao', cost.wudao) && resources.hasSmall('page', cost.page)
  })

  /** 参悟池里还剩几部 —— 与 comprehendGongfa 的池条件同源(minRealm ≤ 当前 + 1 且未习得) */
  const comprehendLeft = computed(
    () => GONGFA.filter(g => g.minRealm <= player.major + 1 && !cultivation.learned[g.id]).length
  )

  /** 选中门类池里还剩几部 —— 同一池条件,只多按门类过滤 */
  const poolLeft = computed(
    () => GONGFA.filter(g => g.type === gongfaCat.value && g.minRealm <= player.major + 1 && !cultivation.learned[g.id]).length
  )

  /** 参悟还差几页残页 —— 与 comprehendGongfa 的消耗同源,付不起就置灰并写差 */
  const pageShort = computed(() => Math.max(0, COMPREHEND_PAGE_COST - resources.page))

  /** 池里还有货且残页够 —— 才能点参悟 */
  const canComprehend = computed(() => comprehendLeft.value > 0 && pageShort.value === 0)

  function equipStateOf(id: string): string {
    if (cultivation.mainGongfa === id) return '主修'
    const idx = cultivation.subGongfa.indexOf(id)
    if (idx === -1) return ''
    // 超出洞府辅修槽位预算的伴生功法:词条已不生效(cultivation.gongfaMods 只 slice 到预算),
    // 别还标成 辅修/秘术 让玩家以为它在加 —— 藏书楼缩水/转世后槽位变少就会走到这
    if (idx >= dongfu.subGongfaSlots) return '超席'
    return gongfaDef(id)?.type === 'secret' ? '秘术' : '辅修'
  }

  /** 功行是否已至顶层 */
  function isFull(id: string): boolean {
    return (cultivation.learned[id] ?? 0) >= gongfaMaxLevel(gongfaDef(id))
  }

  /** 是否真能悟道(判据取自 gongfaBranches,界面提示与实际可选项同源) */
  function canEnlighten(id: string): boolean {
    return canEnlightenGongfa(id, cultivation.learned[id] ?? 0)
  }

  /** 已择分支的道名;未择、或旧存档留着一个已下线的分支 id,都算没有 */
  function branchName(id: string): string | undefined {
    const branchId = cultivation.gongfaBranch[id]
    return branchId ? gongfaBranchDef(branchId)?.name : undefined
  }

  /** 悟道兑换(Phase C-1):后期限量灵石→悟道点 */
  function doExchange(): void {
    const ok = player.exchangeStoneForWudao()
    ui.toast(
      ok
        ? exchangeOkToast(WUDAO_EXCHANGE_GAIN)
        : exchangeFailText(
            exchangeState.value.lockedByRealm,
            exchangeState.value.dailyFull,
            formatGN(exchangeState.value.stoneShort)
          ),
      ok ? 'success' : 'warn'
    )
  }
</script>
