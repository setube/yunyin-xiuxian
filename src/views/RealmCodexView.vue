<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="flex items-center gap-2">
      <RouterLink to="/character" class="-my-1.5 py-1.5 text-[12px] text-ink-faint active:text-ink-soft">← 人物</RouterLink>
      <span class="text-[11px] text-ink-faint">·</span>
      <span class="text-[12px] text-ink-soft">界域志</span>
    </div>

    <SectionTitle title="界域志" hint="境界名从哪来,一路读下去" />
    <InkTabs v-model="codexTab" :tabs="CODEX_TABS" />

    <template v-if="codexTab === 'realm'">
    <!-- 界域与境界:逐境写明出处与承接 -->
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
            <span v-if="cell.index === player.major" class="text-[9px] text-cinnabar">此刻在此</span>
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ cell.def.desc }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ cell.def.lore }}</p>
          <!-- 此境所据何典:把「境界 → 原典」这条来路直接摆在该境底下 -->
          <p v-if="classicsOf(cell.def.id).length" class="mt-1 text-[10px] text-ink-faint">
            所据:{{ classicsOf(cell.def.id).map(c => `《${c.title}》`).join(' ') }}
          </p>
        </div>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'classics'">
    <!-- 典籍:境界名背后的原典 -->
    <SectionTitle title="典籍" hint="所述者传统道教、佛教、道家与丹道之书" />
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
    <!-- 周易:读过之后可以真的问一卦 -->
    <SectionTitle title="周易" :hint="`${cnNumber(TRIGRAMS.length)}卦为体,${cnNumber(HEXAGRAMS.length)}卦为用`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        「易」不是书斋里的摆设:八卦各主一事之势,重卦由上下相叠 ——
        下卦为身,上卦为境,故一卦之力是内外相济的两股。摇得之卦在身,过时自散。
      </p>

      <!-- 在身之卦 -->
      <div v-if="currentReading" class="mt-3 rounded-md bg-paper-deep/50 px-3 py-2.5">
        <p class="flex flex-wrap items-center gap-2">
          <span class="font-kai text-[16px] tracking-widest text-cinnabar">{{ currentReading.hexagram.name }}卦</span>
          <span class="text-[10px] text-ink-faint tabular">
            上{{ currentReading.upper.name }}{{ currentReading.upper.symbol }} · 下{{ currentReading.lower.name
            }}{{ currentReading.lower.symbol }}
          </span>
          <span v-if="currentReading.changed" class="chip-ink !text-[9px]">之{{ currentReading.changed.name }}</span>
          <span class="ml-auto text-[10px] tabular text-ink-faint">{{ remainText }}</span>
        </p>
        <div class="mt-1.5 space-y-0.5 font-kai text-[12px] tracking-[0.2em] text-ink-soft">
          <p v-for="(bar, i) in drawnLines" :key="i">{{ bar }}</p>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{{ currentReading.hexagram.gist }}</p>
        <p v-for="(line, i) in counsel" :key="`c${i}`" class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ line }}</p>
        <p class="mt-1.5 text-[11px] text-azure">在身之力:{{ powerText }}</p>
      </div>

      <div class="mt-2.5 flex items-center gap-2">
        <button
          class="btn-ghost !py-1.5 !text-[12px]"
          :disabled="!!player.activeDivination"
          @click="ask"
        >
          {{ player.activeDivination ? '卦在身,待其自过' : `问 卦(悟道点 ${DIVINATION_COST})` }}
        </button>
        <span class="text-[10px] leading-relaxed text-ink-faint">
          卜以决疑,不疑何卜 —— 一事不二卜,卦力随动爻而盛,亦随时而尽。
        </span>
      </div>
    </section>

    <!-- 八卦 -->
    <section class="card-ink divide-y divide-ink/7 px-4">
      <div v-for="t in TRIGRAMS" :key="t.id" class="flex items-start gap-2 py-2.5">
        <span class="w-[52px] shrink-0 font-kai text-[15px] text-ink">{{ t.symbol }} {{ t.name }}</span>
        <span class="w-[56px] shrink-0 text-[10px] text-ink-faint">象{{ t.image }} · {{ t.nature }}</span>
        <span class="min-w-0 grow text-[11px] leading-relaxed text-ink-soft">{{ t.gist }}</span>
        <span class="shrink-0 text-[10px] text-jade">宜{{ t.good }}</span>
        <span class="shrink-0 text-[10px] text-cinnabar/80">忌{{ t.bad }}</span>
      </div>
    </section>

    <!-- 六十四卦:全表可查,但不必时时铺开 -->
    <section class="card-ink px-4 py-3">
      <button class="flex w-full items-center justify-between text-left" @click="showAllHex = !showAllHex">
        <span class="font-kai text-[13px] tracking-wider text-ink">{{ cnNumber(HEXAGRAMS.length) }}卦</span>
        <span class="text-[10px] text-azure">{{ showAllHex ? '收起' : `展开查看 ${HEXAGRAMS.length} 卦 →` }}</span>
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
    <!-- 紫微:一世之格,与周易的「一时之机」分工 -->
    <SectionTitle title="紫微" :hint="`${cnNumber(PALACES.length)}宫定一世之格,与问卦分工`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        紫微斗数本当以生辰起五行局再安诸星,游戏内没有生辰 ——
        故此门只取**{{ cnNumber(PALACES.length) }}宫所主**与**{{ cnNumber(STARS.length) }}主星的星性**,按灵根与轮回归属安星:是取象义,不是排盘。
        卦是一时之机(可问、有时限),命是一世之格(常驻、转世重算,力薄为底色)。
      </p>
      <p class="mt-2 font-kai text-[13px] leading-relaxed text-ink">{{ fateLordLineText }}</p>
      <p class="mt-1 text-[11px] text-azure">命格之力:{{ fateModsText }}</p>
      <div class="mt-2.5 divide-y divide-ink/6">
        <div v-for="row in fateRows" :key="row.palace.id" class="flex items-baseline gap-2 py-1.5">
          <span class="w-14 shrink-0 font-kai text-[12px] text-ink-soft">{{ row.palace.name }}</span>
          <span class="w-24 shrink-0 text-[11px] text-cinnabar/90">{{ row.starNames }}</span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-faint">{{ row.palace.domain }} · {{ row.palace.use }}</span>
        </div>
      </div>
      <div class="mt-2 border-t border-ink/10 pt-2">
        <p class="text-[10px] text-ink-faint">{{ cnNumber(STARS.length) }}主星</p>
        <p v-for="s in STARS" :key="s.id" class="mt-1 text-[11px] leading-relaxed text-ink-soft">
          <span class="font-kai text-ink">{{ s.name }}</span>
          <span class="text-ink-faint"> · {{ s.nature }} · {{ s.gist }}</span>
        </p>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'xiang'">
    <!-- 星象:二十八宿值日,利一方界域 -->
    <SectionTitle title="星象" :hint="`${cnNumber(MANSIONS.length)}宿值日,分野为读、四象为用`" />
    <section class="card-ink px-4 py-3">
      <p class="font-kai text-[13px] leading-relaxed text-ink">{{ mansionLine }}</p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">
        分野依《晋书·天文志》(诸家小异)只作来历读 —— 游戏里的地界不是九州。
        管用的是下面这条**游戏约定**:{{ cnNumber(IMAGES.length) }}象配{{ cnNumber(WORLDS.length) }}界({{ imageWorldMap }}),
        值日之宿所属之象,所配界域今日历练际遇更易(乘在历练际遇上 +{{ Math.round(MANSION_EVENT_LUCK * 100) }}%),他处不加。
      </p>
      <p class="mt-1.5 text-[11px] text-azure">
        今日利 <span class="text-gold-ink">{{ favoredWorldName }}</span> —— 与天时不同:天时是全境之气,星象只利一方。
      </p>
      <button class="mt-2 w-full text-left text-[10px] text-azure" @click="showAllMansions = !showAllMansions">
        {{ showAllMansions ? `收起${cnNumber(MANSIONS.length)}宿` : `展开查看 ${MANSIONS.length} 宿 →` }}
      </button>
      <div v-if="showAllMansions" class="mt-2 divide-y divide-ink/6">
        <template v-for="img in IMAGES" :key="img.id">
          <p class="pt-2 text-[10px] text-ink-faint">{{ img.direction }}方 {{ img.name }} · 所配{{ worldName(img.world) }}</p>
          <div v-for="m in mansionsOf(img.id)" :key="m.name" class="flex items-baseline gap-2 py-1.5">
            <span class="w-12 shrink-0 font-kai text-[13px] text-ink">{{ m.name }}</span>
            <span class="w-20 shrink-0 text-[10px] text-ink-faint">{{ m.fullName }}</span>
            <span class="w-12 shrink-0 text-[10px] text-ink-faint">{{ m.domain }}</span>
            <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ m.good }}</span>
          </div>
        </template>
      </div>
    </section>
    </template>

    <template v-if="codexTab === 'qimen'">
    <!-- 奇门:九宫八门,择门而入 -->
    <SectionTitle title="奇门" :hint="`九宫${cnNumber(GATES.length)}门,择门而入`" />
    <section class="card-ink px-4 py-3">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        {{ cnNumber(GATES.length) }}门依洛书九宫排布:{{ luoshuGatesText }}。
        远征启程前可择一门入界 —— 不是与天道立契(那换的是道源),
        择门改的是这一趟的**打法**:续航、抢攻、守拙或速决。
      </p>
      <div class="mt-2.5 divide-y divide-ink/6">
        <div v-for="g in GATES" :key="g.id" class="flex items-start gap-2 py-2">
          <span class="w-12 shrink-0 font-kai text-[13px]" :class="g.kind === '凶' ? 'text-cinnabar' : g.kind === '吉' ? 'text-jade' : 'text-ink-soft'">
            {{ g.fullName }}
          </span>
          <span class="w-20 shrink-0 text-[10px] text-ink-faint tabular">{{ g.gua }}{{ g.direction }} · {{ g.palace }}宫 · {{ g.kind }}</span>
          <span class="min-w-0 text-[11px] leading-relaxed text-ink-soft">{{ g.gist }}</span>
        </div>
      </div>
      <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
        八门并非新的规则,只是换了打法 —— 不择门时,一切与从前无异。
      </p>
    </section>
    </template>

    <template v-if="codexTab === 'todo' && PLANNED_SCHOOLS.length">
      <SectionTitle title="待续" hint="已在构思、尚未成书的门类" />
      <section class="card-ink divide-y divide-ink/7 px-4">
      <div v-for="p in PLANNED_SCHOOLS" :key="p.name" class="flex items-start gap-2 py-2.5">
        <span class="w-[104px] shrink-0 font-kai text-[12px] text-ink-soft">{{ p.name }}</span>
        <span class="text-[11px] leading-relaxed text-ink-faint">{{ p.note }}</span>
      </div>
      <p class="py-2.5 text-[10px] leading-relaxed text-ink-faint">
        已有构思、尚未成书的门类 —— 待它接好,自会带典籍与玩法入此册。
      </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useGameStore } from '@/stores/game'
  import { useUiStore } from '@/stores/ui'
  import { REALMS, WORLDS, realmDef } from '@/data/realms'
  import { CLASSICS, PLANNED_SCHOOLS, classicsForRealm } from '@/data/classics'
  import { HEXAGRAMS, TRIGRAMS, trigramDef } from '@/data/yijing'
  import { DIVINATION_COST, drawLines, readingCounsel, readingFromState } from '@/core/divination'
  import { askDivination } from '@/core/divinationService'
  import { PALACES, STARS } from '@/data/ziwei'
  import { fateLordLine } from '@/core/fate'
  import { IMAGES, MANSIONS, type ImageId } from '@/data/xiangxiu'
  import { GATES } from '@/data/qimen'
  import { cnNumber } from '@/utils/format'
  import { MANSION_EVENT_LUCK, favoredWorld, todayMansion, todayMansionLine } from '@/core/astronomy'
  import { worldDef } from '@/data/realms'
  import type { WorldId } from '@/types'
  import { modsText } from '@/ui/statNames'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'

  const player = usePlayerStore()
  const game = useGameStore()
  const ui = useUiStore()

  /** 分册:六门各占一册 —— 页越长越该分,免得一路拉到底找不着北 */
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

  /** 在身之卦:读一次心跳,过期的卦才会自己消失(与 player 的判定同一个办法) */
  const currentReading = computed(() => {
    void game.totalPlaySec
    const state = player.activeDivination
    return state ? readingFromState(state) : null
  })
  const drawnLines = computed(() => (currentReading.value ? drawLines(currentReading.value) : []))
  const counsel = computed(() => (currentReading.value ? readingCounsel(currentReading.value) : []))
  const powerText = computed(() => (currentReading.value ? modsText(player.divinationMods) : ''))
  const remainText = computed(() => {
    void game.totalPlaySec
    const state = player.activeDivination
    if (!state) return ''
    const ms = Math.max(0, state.expiresAt - Date.now())
    const m = Math.floor(ms / 60_000)
    const sec = Math.floor((ms % 60_000) / 1000)
    return m > 0 ? `尚余 ${m} 分 ${sec} 秒` : `尚余 ${sec} 秒`
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

  // 命格:一世不变的一张盘(转世重算),故不必计时,直接读 player 的派生值
  const fateLordLineText = computed(() => fateLordLine(player.fateChart))
  const fateModsText = computed(() => modsText(player.fateMods))
  const fateRows = computed(() =>
    player.fateChart.palaces.map(p => ({
      palace: p.palace,
      starNames: p.stars.map(s => `${s.name}(${s.nature})`).join('、')
    }))
  )

  // 星象:值日之宿与所利界域(由游戏日派生,随心跳刷新)
  const showAllMansions = ref(false)
  const mansionLine = computed(() => todayMansionLine())
  const favoredWorldName = computed(() => worldDef(favoredWorld(todayMansion())).name)
  function worldName(id: WorldId): string {
    return worldDef(id).name
  }
  function mansionsOf(image: ImageId) {
    return MANSIONS.filter(m => m.image === image)
  }

  /**
   * 洛书九宫的排布句 —— **从 GATES 表推出来,不手写**。
   *
   * 这句话本质是一张地图(哪一门坐哪一宫、朝哪一方),手写一份就等于把
   * 八门的方向抄了第二遍:改门的位置或加一门,句子会开始说假话。
   * 中五无门是九宫的固有事实(不是一张门),故由循环补出。
   */
  const luoshuGatesText = computed(() =>
    Array.from({ length: 9 }, (_, i) => {
      const palace = i + 1
      const gate = GATES.find(g => g.palace === palace)
      return gate ? `${gate.gua}${cnNumber(palace)}${gate.direction}${gate.fullName}` : `中${cnNumber(palace)}无门`
    }).join('、')
  )

  /** 四象各配哪一界 —— 游戏约定写在 IMAGES 表里,这句只是把它读出来 */
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

  /** 此境所据的原典(来自典籍表,不在视图里手写) */
  function classicsOf(realmId: string) {
    return classicsForRealm(realmId)
  }
</script>
