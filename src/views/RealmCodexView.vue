<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="flex items-center gap-2">
      <RouterLink to="/character" class="-my-1.5 py-1.5 text-[12px] text-ink-faint active:text-ink-soft">← 人物</RouterLink>
      <span class="text-[11px] text-ink-faint">·</span>
      <span class="text-[12px] text-ink-soft">界域志</span>
    </div>

    <SectionTitle title="界域志" />
    <InkTabs v-model="codexTab" :tabs="CODEX_TABS" />

    <template v-if="codexTab === 'realm'">
    <section v-for="row in worldRows" :key="row.world.id" class="card-ink px-4 py-3">
      <div class="flex items-baseline gap-2">
        <span class="font-kai text-[15px] tracking-[0.25em] text-ink">{{ row.world.name }}</span>
        <span class="text-[10px] text-ink-faint">第 {{ row.world.start + 1 }}–{{ row.world.end + 1 }} 境</span>
      </div>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ row.world.desc }}</p>
      <div class="mt-2 space-y-2">
        <div
          v-for="cell in row.realms"
          :key="cell.def.id"
          class="rounded-md px-2.5 py-2"
          :class="cell.index === player.major ? 'bg-cinnabar/8' : 'bg-paper-deep/50'"
        >
          <p class="flex items-center gap-2">
            <span
              class="font-kai text-[14px] tracking-wider"
              :class="cell.index === player.major ? 'text-cinnabar' : cell.index < player.major ? 'text-ink-soft' : 'text-ink-faint'"
            >
              {{ cell.def.name }}
            </span>
            <span class="chip-ink !text-[9px]">{{ cell.def.basis }}</span>
            <span v-if="cell.index === player.major" class="text-[9px] text-cinnabar">当前</span>
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ cell.def.desc }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ cell.def.lore }}</p>
          <p v-if="classicsOf(cell.def.id).length" class="mt-1 text-[10px] text-ink-faint">
            所据:{{ classicsOf(cell.def.id).map(c => `《${c.title}》`).join(' ') }}
          </p>
        </div>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'classics'">
    <SectionTitle title="典籍" />
    <section class="space-y-2">
      <article v-for="c in CLASSICS" :key="c.id" class="card-ink px-4 py-3">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-kai text-[14px] text-ink">《{{ c.title }}》</span>
          <span class="chip-ink !text-[9px]">{{ c.school }}</span>
          <span class="text-[10px] text-ink-faint">{{ c.source }}</span>
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-soft">{{ c.gist }}</p>
        <p v-if="c.realms.length" class="mt-1 text-[10px] text-ink-faint">
          相涉:{{ c.realms.map(id => realmName(id)).join('、') }}
        </p>
      </article>
    </section>
    </template>

    <template v-if="codexTab === 'yi'">
    <SectionTitle title="周易" :hint="`${cnNumber(TRIGRAMS.length)}卦 · ${cnNumber(HEXAGRAMS.length)}卦`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">下卦为身,上卦为境;卦力为两卦之和,限时。</p>

      <div v-if="currentReading" class="mt-3 rounded-md bg-paper-deep/50 px-3 py-2.5">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-kai text-[16px] tracking-widest text-cinnabar">{{ currentReading.hexagram.name }}卦</span>
          <span class="text-[10px] text-ink-faint tabular">
            上{{ currentReading.upper.name }}{{ currentReading.upper.symbol }} · 下{{ currentReading.lower.name
            }}{{ currentReading.lower.symbol }}
          </span>
          <span v-if="currentReading.changed" class="chip-ink !text-[9px]">之{{ currentReading.changed.name }}</span>
          <span class="ml-auto text-[10px] tabular text-ink-faint">
            尚余 <span class="countdown-slot">{{ remainCountdown }}</span>
          </span>
        </p>
        <div class="mt-1.5 space-y-0.5 font-kai text-[12px] tracking-[0.2em] text-ink-soft">
          <p v-for="(bar, i) in drawnLines" :key="i">{{ bar }}</p>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{{ currentReading.hexagram.gist }}</p>
        <p v-for="(line, i) in counsel" :key="`c${i}`" class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ line }}</p>
        <p class="mt-1.5 text-[11px] text-azure">在身之力:{{ powerText }}</p>
      </div>

      <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          class="btn-ghost shrink-0 whitespace-nowrap !py-1.5 !text-[12px]"
          :disabled="askDisabled"
          @click="ask"
        >
          {{ askLabel }}
        </button>
        <span class="text-[10px] leading-relaxed text-ink-faint">动爻越多,卦力越盛</span>
      </div>
    </section>

    <section class="card-ink divide-y divide-ink/6 px-4">
      <div v-for="t in TRIGRAMS" :key="t.id" class="flex items-start gap-2 py-2.5">
        <span class="w-[52px] shrink-0 font-kai text-[15px] text-ink">{{ t.symbol }} {{ t.name }}</span>
        <span class="w-[56px] shrink-0 text-[10px] text-ink-faint">象{{ t.image }} · {{ t.nature }}</span>
        <span class="min-w-0 grow text-[11px] leading-relaxed text-ink-soft">{{ t.gist }}</span>
        <span class="shrink-0 text-[10px] text-jade">宜{{ t.good }}</span>
        <span class="shrink-0 text-[10px] text-cinnabar">忌{{ t.bad }}</span>
      </div>
    </section>

    <section class="card-ink px-4 py-3">
      <button class="flex w-full items-center justify-between text-left" :aria-expanded="showAllHex" @click="showAllHex = !showAllHex">
        <span class="font-kai text-[13px] tracking-wider text-ink">{{ cnNumber(HEXAGRAMS.length) }}卦</span>
        <span class="text-[10px] text-azure">{{ showAllHex ? '收起' : '展开' }}</span>
      </button>
      <div v-if="showAllHex" class="mt-2 max-h-72 divide-y divide-ink/6 overflow-y-auto">
        <div v-for="x in HEXAGRAMS" :key="x.order" class="flex items-baseline gap-2 py-2">
          <span class="w-6 shrink-0 tabular text-[10px] text-ink-faint">{{ x.order }}</span>
          <span class="w-14 shrink-0 font-kai text-[13px] text-ink">{{ x.name }}</span>
          <span class="w-16 shrink-0 text-[10px] text-ink-faint tabular">
            {{ trigramDef(x.upper)?.symbol }}{{ trigramDef(x.lower)?.symbol }}
          </span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ x.gist }}</span>
        </div>
      </div>
    </section>

    </template>

    <template v-if="codexTab === 'ziwei'">
    <SectionTitle title="紫微" :hint="`${cnNumber(PALACES.length)}宫`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">按灵根与轮回安星 · 常驻 · 转世重算</p>
      <p class="mt-2 font-kai text-[13px] leading-relaxed text-ink">{{ fateLordLineText }}</p>
      <p class="mt-1 text-[11px] text-azure">命格之力:{{ fateModsText }}</p>
      <div class="mt-2.5 divide-y divide-ink/6">
        <div v-for="row in fateRows" :key="row.palace.id" class="flex items-baseline gap-2 py-1.5">
          <span class="w-14 shrink-0 font-kai text-[12px] text-ink-soft">{{ row.palace.name }}</span>
          <span class="w-24 shrink-0 text-[11px] text-cinnabar">{{ row.starNames }}</span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-faint">{{ row.palace.domain }} · {{ row.palace.use }}</span>
        </div>
      </div>
      <div class="mt-2 border-t border-ink/10 pt-2">
        <p class="text-[10px] text-ink-faint">{{ cnNumber(STARS.length) }}主星</p>
        <div v-for="s in STARS" :key="s.id" class="mt-1 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
          <span class="min-w-0 flex-1">
            <span class="font-kai text-ink">{{ s.name }}</span>
            <span class="text-ink-faint"> · {{ s.nature }} · {{ s.gist }}</span>
          </span>
          <button
            class="shrink-0 cursor-pointer text-[10px]"
            :class="
              player.fateFocus === s.id
                ? 'font-kai text-gold-ink'
                : focusShort > 0
                  ? 'cursor-not-allowed text-ink-faint'
                  : 'text-azure'
            "
            :disabled="player.fateFocus !== s.id && focusShort > 0"
            @click="focusStar(s.id)"
          >
            {{
              player.fateFocus === s.id
                ? '已显化'
                : focusShort > 0
                  ? `点化 · 灵石尚差 ${formatGap(focusShortGN)}`
                  : `点化 · 灵石 ${focusCostText}`
            }}
          </button>
        </div>
        <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">点化:限一星 · 其力二倍 · 余星不变</p>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'xiang'">
    <SectionTitle title="星象" :hint="`${cnNumber(MANSIONS.length)}宿值日`" />
    <section class="card-ink px-4 py-3">
      <p class="font-kai text-[13px] leading-relaxed text-ink">{{ mansionLine }}</p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
        {{ cnNumber(IMAGES.length) }}象配{{ cnNumber(WORLDS.length) }}界:{{ imageWorldMap }}。值日之宿所属之象,所配界域历练际遇 +{{ mansionLuckPercent() }}%。
      </p>
      <p class="mt-1.5 text-[11px] text-azure">
        今日利 <span class="text-gold-ink">{{ favoredWorldName }}</span>
      </p>
      <button class="-my-1 mt-2 w-full py-2 text-left text-[10px] text-azure" @click="showAllMansions = true">
        {{ cnNumber(MANSIONS.length) }}宿 →
      </button>
    </section>
    <BaseModal :open="showAllMansions" :title="`${cnNumber(MANSIONS.length)}宿`" @close="showAllMansions = false">
      <div class="divide-y divide-ink/6">
        <template v-for="img in IMAGES" :key="img.id">
          <p class="pt-2 text-[10px] text-ink-faint">{{ img.direction }}方 {{ img.name }} · 所配{{ worldName(img.world) }}</p>
          <!-- 定宽按最长内容收(宿名 1 字、全名 3 字、分野 2 字):320 宽下所宜 6 字仍单行 -->
          <div v-for="m in mansionsOf(img.id)" :key="m.name" class="flex items-baseline gap-2 py-1.5">
            <span class="w-5 shrink-0 font-kai text-[13px] text-ink">{{ m.name }}</span>
            <span class="w-10 shrink-0 text-[10px] text-ink-faint">{{ m.fullName }}</span>
            <span class="w-7 shrink-0 text-[10px] text-ink-faint">{{ m.domain }}</span>
            <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ m.good }}</span>
          </div>
        </template>
      </div>
    </BaseModal>
    </template>

    <template v-if="codexTab === 'qimen'">
    <SectionTitle title="奇门" :hint="`九宫${cnNumber(GATES.length)}门`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        洛书九宫:{{ luoshuGatesText }}。择门:远征启程前,仅限本趟。
      </p>
      <!-- 九宫盘:八门各居一宫,中五无门;吉/平/凶靠边框形态区分(见 ui/gateBoard) -->
      <div class="gate-board mx-auto mt-2.5 max-w-64">
        <div
          v-for="cell in codexBoard"
          :key="cell.palace"
          class="gate-palace"
          :class="[cell.gate ? `gate-kind-${gateKindMark(cell.gate.kind).shape}` : 'gate-palace--void']"
        >
          <span class="gate-palace__no">{{ cell.palace }}</span>
          <template v-if="cell.gate">
            <span
              class="font-kai text-[15px] leading-none"
              :class="cell.gate.kind === '凶' ? 'text-cinnabar' : cell.gate.kind === '吉' ? 'text-jade' : 'text-ink-soft'"
            >
              {{ cell.gate.name }}
            </span>
            <span class="text-[9px] leading-none text-ink-faint">{{ cell.gate.gua }}{{ cell.gate.direction }}</span>
          </template>
          <span v-else class="text-[9px] leading-none text-ink-faint">无门</span>
        </div>
      </div>
      <div class="mt-2.5 divide-y divide-ink/6">
        <div v-for="g in GATES" :key="g.id" class="flex items-start gap-2 py-2">
          <span class="w-12 shrink-0 font-kai text-[13px]" :class="g.kind === '凶' ? 'text-cinnabar' : g.kind === '吉' ? 'text-jade' : 'text-ink-soft'">
            {{ g.fullName }}
          </span>
          <span class="w-20 shrink-0 text-[10px] text-ink-faint tabular">{{ g.gua }}{{ g.direction }} · {{ g.palace }}宫 · {{ g.kind }}</span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">
            {{ g.gist }}
            <!-- 与结算同源:这一行是进 resolveCombat 的数 -->
            <span class="mt-0.5 block tabular text-[10px] text-ink-faint">{{ gateRuleSummary(g.rules) }}</span>
          </span>
        </div>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'todo' && PLANNED_SCHOOLS.length">
      <SectionTitle title="待续" />
      <section class="card-ink divide-y divide-ink/6 px-4">
      <div v-for="p in PLANNED_SCHOOLS" :key="p.name" class="flex items-start gap-2 py-2.5">
        <span class="w-[104px] shrink-0 font-kai text-[12px] text-ink-soft">{{ p.name }}</span>
        <span class="text-[11px] leading-relaxed text-ink-faint">{{ p.note }}</span>
      </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useResourcesStore } from '@/stores/resources'
  import { REALMS, WORLDS, realmDef } from '@/data/realms'
  import { CLASSICS, PLANNED_SCHOOLS, classicsForRealm } from '@/data/classics'
  import { HEXAGRAMS, TRIGRAMS, trigramDef } from '@/data/yijing'
  import {
    DIVINATION_COST,
    divinationActiveAt,
    drawLines,
    readingCounsel,
    readingFromState,
    readingMods
  } from '@/core/divination'
  import { askDivination } from '@/core/divinationService'
  import { PALACES, STARS } from '@/data/ziwei'
  import { fateLordLine } from '@/core/fate'
  import { IMAGES, MANSIONS, type ImageId } from '@/data/xiangxiu'
  import { GATES } from '@/data/qimen'
  import { gateKindMark, palaceBoard } from '@/ui/gateBoard'
  import { gateRuleSummary } from '@/core/gateRuleText'
  import { cnNumber, formatCountdown, formatGN, formatGap } from '@/utils/format'
  import { gn, gnZero, subClamp } from '@/utils/gnum'
  import { STAR_FOCUS_COST_BASE } from '@/data/constants'
  import { mansionLuckPercent, effectiveFavoredWorld, todayMansionLine } from '@/core/astronomy'
  import { worldDef } from '@/data/realms'
  import type { WorldId } from '@/types'
  import { modsText } from '@/data/statNames'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import { useNow } from '@/composables/useNow'

  const player = usePlayerStore()
  const ui = useUiStore()
  const resources = useResourcesStore()
  const now = useNow()

  type CodexTab = 'realm' | 'classics' | 'yi' | 'ziwei' | 'xiang' | 'qimen' | 'todo'
  const CODEX_TABS: { id: CodexTab; label: string }[] = [
    { id: 'realm', label: '界域' },
    { id: 'classics', label: '典籍' },
    { id: 'yi', label: '周易' },
    { id: 'ziwei', label: '紫微' },
    { id: 'xiang', label: '星象' },
    { id: 'qimen', label: '奇门' }
  ]
  const codexTab = ref<CodexTab>('realm')

  const showAllHex = ref(false)

  /** 在身之卦:读 1 秒游戏钟,与服务端同一判据 divinationActiveAt */
  const currentState = computed(() => divinationActiveAt(player.divination, now.value))
  const currentReading = computed(() => {
    const state = currentState.value
    return state ? readingFromState(state) : null
  })
  const drawnLines = computed(() => (currentReading.value ? drawLines(currentReading.value) : []))
  const counsel = computed(() => (currentReading.value ? readingCounsel(currentReading.value) : []))
  const powerText = computed(() => (currentReading.value ? modsText(readingMods(currentReading.value)) : ''))
  const remainCountdown = computed(() => {
    const state = currentState.value
    return state ? formatCountdown(Math.max(0, Math.ceil((state.expiresAt - now.value) / 1000))) : ''
  })

  /** 判据与 askDivination 的 hasSmall 同一本账 */
  const askShort = computed(() => Math.max(0, DIVINATION_COST - resources.wudao))
  const askDisabled = computed(() => !!currentState.value || askShort.value > 0)
  const askLabel = computed(() => {
    if (currentState.value) return '卦在身'
    if (askShort.value > 0) return `问卦 · 悟道点尚差 ${askShort.value}`
    return `问 卦(悟道点 ${DIVINATION_COST})`
  })

  function ask(): void {
    const out = askDivination()
    if (!out.ok) {
      ui.toast(out.reason ?? '未成卦', 'warn')
      return
    }
    const r = out.reading!
    ui.toast(`得「${r.hexagram.name}」卦${r.changed ? `,之${r.changed.name}` : ''}`, 'info')
  }

  // 命格一世不变(转世重算),不必计时
  const fateLordLineText = computed(() => fateLordLine(player.fateChart))
  const fateModsText = computed(() => modsText(player.fateMods))

  /** 点化主星的灵石单价,文案与扣费同源 */
  const focusCost = gn(STAR_FOCUS_COST_BASE)
  const focusCostText = formatGN(focusCost)
  /** 点化尚差灵石,付得起为 0;指数感知减法,跨数量级不会报错差额 */
  const focusShortGN = computed(() => (resources.hasStone(focusCost) ? gnZero() : subClamp(focusCost, resources.spiritStone)))
  const focusShort = computed(() => focusShortGN.value.m)
  function focusStar(id: string): void {
    const name = STARS.find(s => s.id === id)?.name ?? id
    if (player.fateFocus === id) {
      ui.toast(`「${name}」已显化`, 'info')
      return
    }
    if (focusShort.value > 0) {
      ui.toast(`灵石尚差 ${formatGap(focusShortGN.value)}`, 'warn')
      return
    }
    const ok = player.focusFateStar(id)
    ui.toast(ok ? `已点化「${name}」` : '灵石不足', ok ? 'info' : 'warn')
  }
  const fateRows = computed(() =>
    player.fateChart.palaces.map(p => ({
      palace: p.palace,
      starNames: p.stars.map(s => `${s.name}(${s.nature})`).join('、')
    }))
  )

  // 值日之宿与所利界域由游戏日派生,随心跳刷新
  const showAllMansions = ref(false)
  const mansionLine = computed(() => todayMansionLine())
  const favoredWorldName = computed(() => worldDef(effectiveFavoredWorld()).name)
  function worldName(id: WorldId): string {
    return worldDef(id).name
  }
  function mansionsOf(image: ImageId) {
    return MANSIONS.filter(m => m.image === image)
  }

  /** 洛书九宫排布句:从 GATES 表推出,不手写;中五无门由循环补出 */
  /** 图鉴的九宫盘:与远征择门同读一份排布 */
  const codexBoard = palaceBoard()

  const luoshuGatesText = computed(() =>
    Array.from({ length: 9 }, (_, i) => {
      const palace = i + 1
      const gate = GATES.find(g => g.palace === palace)
      return gate ? `${gate.gua}${cnNumber(palace)}${gate.direction}${gate.fullName}` : `中${cnNumber(palace)}无门`
    }).join('、')
  )

  const imageWorldMap = computed(() => IMAGES.map(i => `${i.direction}配${worldName(i.world)}`).join('、'))

  const worldRows = computed(() =>
    WORLDS.map(w => ({
      world: w,
      realms: REALMS.map((def, index) => ({ def, index })).filter(c => c.index >= w.start && c.index <= w.end)
    }))
  )

  function realmName(id: string): string {
    const idx = REALMS.findIndex(r => r.id === id)
    return idx >= 0 ? realmDef(idx).name : id
  }

  function classicsOf(realmId: string) {
    return classicsForRealm(realmId)
  }
</script>
