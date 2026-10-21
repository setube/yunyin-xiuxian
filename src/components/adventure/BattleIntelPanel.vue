<template>
  <!--
    战斗情报面板 —— 战后统计行 / 本战所得 / 此物所知 / 战斗分析。

    这四块只在这一处消费:战报统计、逐件拾获、敌人路数与败因归因。
    自取 store(与 cultivation/RetreatCard 同族先例),宿主 CombatPanel 留回放引擎
    (逐行投入 / 血条 / 浮伤 / 因果环)与敌我半卡 —— 那些与「这一战怎么打的」绑定,
    搬走只会让回放和情报各自读一份状态。
  -->
  <!-- 战斗后统计 + 分析入口 -->
  <p v-if="battleSummary" class="mt-2 flex items-center justify-center gap-2 text-center text-[10px] text-ink-faint tabular">
    {{ battleSummary }}
    <!--
      行内文字的按钮也得有 28px 触达区(见 layout-check 的判据):
      它们此前只有一个字高(实测 15px),拇指点不着 —— 用 min-h 撑起来,
      再用负外边距把这多出来的高度抵掉,视觉密度不变。
    -->
    <button
      v-if="lore"
      class="-my-2 inline-flex min-h-[28px] items-center px-1 text-violet-ink active:opacity-60"
      :aria-expanded="showLore"
      @click="showLore = !showLore"
    >
      {{ showLore ? '收起所知' : '此物所知 »' }}
    </button>
    <button
      v-if="analysis"
      class="-my-2 inline-flex min-h-[28px] items-center px-1 text-azure active:opacity-60"
      :aria-expanded="showAnalysis"
      @click="showAnalysis = !showAnalysis"
    >
      {{ showAnalysis ? '收起分析' : '战斗分析 »' }}
    </button>
  </p>
  <!-- 本战拾获明细:战报里原本只进件数,「得了什么」全靠猜 -->
  <p v-if="battleLoot.length" class="mt-1 text-center text-[10px] leading-relaxed text-ink-faint">
    <span class="text-gold-ink">本战所得</span>
    {{ battleLoot.join(' · ') }}
  </p>
  <!-- 此物所知(Phase 32.5:交手越多,战前看得越清楚) -->
  <div v-if="showLore && lore" class="mt-2 rounded-md bg-ink/4 px-3 py-2.5">
    <p class="flex items-center gap-2">
      <span class="font-kai text-[12px] tracking-wider text-ink">{{ battle?.enemyName }}</span>
      <span class="chip-ink border-violet-ink/50 text-[9px] text-violet-ink">{{ lore.stageName }}</span>
      <span v-if="lore.boosted" class="text-[10px] text-gold-ink">宿慧照见</span>
    </p>
    <p v-if="lore.elementName || lore.frame.length" class="mt-1 text-[11px] text-ink-soft">
      <span v-if="lore.elementName" class="mr-1.5 text-azure">{{ lore.elementName }}属</span>
      {{ lore.frame.join(' · ') }}
    </p>
    <p v-for="s in lore.skills" :key="s.name" class="mt-1 text-[11px] leading-relaxed text-ink-soft">
      ·
      <span class="text-ink">{{ s.name }}</span>
      ——{{ s.note }}
    </p>
    <p v-for="ph in lore.phases" :key="ph.at" class="mt-1 text-[11px] leading-relaxed text-cinnabar">
      · {{ ph.at }}时{{ ph.label }}
    </p>
    <p v-if="lore.archetype" class="mt-1.5 text-[11px] leading-relaxed text-gold-ink">
      <span v-if="lore.archetypeLabel" class="mr-1 rounded bg-gold-ink/10 px-1 py-0.5 text-[10px]">
        {{ lore.archetypeLabel }}
      </span>
      {{ lore.archetype }}
    </p>
    <!--
      距离下一层的情报给个实数:「再交手几阵」数不出来,「照面 X 记 · 还差 Y 记」能。
      与 noteEnemy 同一张门槛表(loreService),胜一记、败三记、首领倍算 ——
      那排小注就是它自己读出来的,不另抄。

      「下一层」以有效层为基准:宿慧照见(熟知修仙界)会把认知层抬过一档,
      界面上已经能看到的层不该再被点名「再攒几记可窥」—— 名字据此取舍,
      eff 已到顶时(照见把最高层都摊开了)再攒的只有「计数」,没有新层可窥。
    -->
    <p v-if="lore.progress && lore.progress.remain > 0" class="mt-1.5 text-[10px] leading-relaxed text-ink-faint tabular">
      照面 {{ lore.progress.seen }} 记,再攒
      <span class="text-violet-ink">{{ lore.progress.remain }}</span> 记
      <template v-if="lore.progress.nextName">可窥「{{ lore.progress.nextName }}」</template>
      <template v-else>可更深知它的路数</template>
      <span class="text-ink-faint">
        (胜一记 · 败计三<template v-if="lore.progress.isBoss"> · 首领倍算</template>)
      </span>
    </p>
  </div>
  <!-- 战斗分析(战败自动展开;硬核数据供研究) -->
  <div v-if="showAnalysis && analysis" class="mt-2 rounded-md bg-ink/4 px-3 py-2.5">
    <!-- 分析题首:朱/青别胜败,一落眼就知道这屏在答「为何这般」;与上方「此物所知」
         (记敌人的路数)是两回事,不再共用一套标题,层次便分得开 -->
    <p class="flex items-baseline gap-1.5">
      <span
        class="h-3 w-1 shrink-0 self-center rounded-sm"
        :class="battle?.result.win ? 'bg-jade' : 'bg-cinnabar'"
        aria-hidden="true"
      ></span>
      <span class="font-kai text-[12px] tracking-wider" :class="battle?.result.win ? 'text-jade' : 'text-cinnabar'">
        {{ analysis.headline }}
      </span>
      <span class="chip-ink border-ink/15 text-[9px]" :class="battle?.result.win ? 'text-jade' : 'text-cinnabar'">
        {{ battle?.result.win ? '胜因' : '败因' }}
      </span>
    </p>
    <!-- 败因逐条成列、句首一点,不再是一堵「·」糊成的墙 -->
    <ul v-if="analysis.findings.length" class="mt-1.5 space-y-1">
      <li v-for="(f, i) in analysis.findings" :key="i" class="flex gap-1.5 text-[11px] leading-relaxed text-ink-soft">
        <span class="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink/30" aria-hidden="true"></span>
        <span>{{ f.text }}</span>
      </li>
    </ul>
    <!-- 借力的方向:理由贴脸摆开 —— 方向的价值就在那条理由,收进 :title 就白给触屏了 -->
    <div v-if="analysis.directions.length" class="mt-2 rounded-md border border-violet-ink/15 bg-violet-ink/5 px-2.5 py-2">
      <p class="text-[10px] tracking-wide text-ink-faint">
        可借力的方向<span class="text-ink-faint">(非唯一解)</span>:
      </p>
      <ul class="mt-1 flex flex-col gap-1">
        <li v-for="d in analysis.directions" :key="d.styleName" class="flex flex-col">
          <span class="text-[11px] text-violet-ink">{{ d.styleName }}</span>
          <span class="text-[10px] leading-relaxed text-ink-faint">{{ d.reason }}</span>
        </li>
      </ul>
    </div>
    <!-- 硬核数据:整行让位给数值。标签占左侧定宽(不换行),数值折回整行剩余宽 ——
         窄屏上也不再与标签互踩、被挤成一线窄落;战局定数与战时账目分节读 -->
    <div v-if="analysis.dataRows.length" class="mt-2 border-t border-ink/10 pt-1.5">
      <div v-if="analysisSections.setup.length">
        <p class="text-[10px] tracking-wide text-ink-faint">战局定数</p>
        <div class="mt-0.5 space-y-0.5">
          <p v-for="row in analysisSections.setup" :key="row.label" class="flex items-baseline gap-3 text-[10px] tabular">
            <span class="min-w-[4.5rem] shrink-0 whitespace-nowrap text-ink-faint">{{ row.label }}</span>
            <span class="min-w-0 flex-1 text-right text-ink-soft">{{ row.value }}</span>
          </p>
        </div>
      </div>
      <div v-if="analysisSections.account.length" class="mt-1.5">
        <p class="text-[10px] tracking-wide text-ink-faint">战时账目</p>
        <div class="mt-0.5 space-y-0.5">
          <p v-for="row in analysisSections.account" :key="row.label" class="flex items-baseline gap-3 text-[10px] tabular">
            <span class="min-w-[4.5rem] shrink-0 whitespace-nowrap text-ink-faint">{{ row.label }}</span>
            <span class="min-w-0 flex-1 text-right text-ink-soft">{{ row.value }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { detectBuild } from '@/core/buildDetect'
  import { analyzeBattle } from '@/core/battleAnalysis'
  import { playSfx } from '@/core/audio'
  import { enemyLoreView } from '@/ui/enemyLore'

  const adventure = useAdventureStore()
  const player = usePlayerStore()

  const battle = computed(() => adventure.lastBattle)

  /** 本战拾获明细(旧存档/旧战报没有这一栏 → 空数组) */
  const battleLoot = computed(() => battle.value?.loot ?? [])

  /** 此物所知(Phase 32.5)—— 战前情报由认知层决定,不是白送的 */
  const lore = computed(() => {
    const id = battle.value?.enemyId
    return id ? enemyLoreView(id) : null
  })

  /** 战斗后统计行 */
  const battleSummary = computed(() => {
    const b = battle.value
    if (!b) return null
    const r = b.result
    // 结语只多四个字,却是每个玩家每场都会读到的一行:抢先 / 被抢先
    const first = r.firstMove ? (r.firstMove.playerFirst ? ' · 抢先' : ' · 被抢先') : ''
    return `此战 ${r.rounds} 回合 · 战后气血 ${Math.round(r.playerHpPct * 100)}% · ${r.win ? '胜' : '负'}${first}`
  })

  // ---- 战斗分析(第三层信息) ----
  const showAnalysis = ref(false)
  const showLore = ref(false)

  const analysis = computed(() => {
    const b = battle.value
    if (!b) return null
    const build = detectBuild(player.finalStats.mods)
    return analyzeBattle(b.result, build?.style.id ?? null)
  })

  /**
   * 数据行按语义分两节:
   * - 战局定数(先手 / 敌之加成)—— 开打前就定下的数,全是长句,该整行让位;
   * - 战时账目(其余)—— 逐项读账,短条更密。
   * 两个标签是 battleAnalysis 里钉死的字符串,这里只作分组,不碰模型。
   */
  const analysisSections = computed(() => {
    const a = analysis.value
    if (!a) return { setup: [], account: [] }
    const SETUP_LABELS = new Set(['先手', '敌之加成'])
    return {
      setup: a.dataRows.filter(r => SETUP_LABELS.has(r.label)),
      account: a.dataRows.filter(r => !SETUP_LABELS.has(r.label))
    }
  })

  // 战败时自动展开分析;并按胜负配一声战果音
  watch(
    () => battle.value?.at,
    () => {
      if (!battle.value) return
      playSfx(battle.value.result.win ? 'win' : 'lose')
      if (!battle.value.result.win) showAnalysis.value = true
    }
  )
</script>
