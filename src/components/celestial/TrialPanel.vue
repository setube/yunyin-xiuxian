<template>
  <!-- 今日天道:程序生成的每日挑战 -->
  <section v-if="daily">
    <SectionTitle title="今日天道" hint="午夜重置" />
    <div class="card-ink mt-2 px-4 py-3">
      <p class="flex items-center gap-2">
        <span class="font-kai text-[14px] tracking-widest text-ink">{{ dailyWorld?.name }}</span>
        <span class="tabular text-[11px] text-ink-soft">{{ daily.verdict.difficulty }} · 可行 {{ daily.verdict.viable }}/{{ BUILD_PROFILES.length }}</span>
        <span class="ml-auto tabular text-[11px] text-gold-ink">赏 {{ daily.verdict.reward }}</span>
      </p>
      <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
        <span v-for="m in dailyMutators" :key="m!.id" class="inline-flex items-center gap-1">
          <!-- 轴纹:这条变数落在哪条主题轴上,形状可数(见 ui/mutatorTheme) -->
          <span
            class="axis-glyph h-3.5 w-3.5 shrink-0"
            :class="`axis-glyph--${themeMark(m!.id).glyph}`"
            aria-hidden="true"
          />
          {{ m!.name }}:{{ m!.text }}
        </span>
        <span v-if="dailyPact" class="text-cinnabar">契·{{ dailyPact.name }}</span>
      </p>
      <button
        class="btn-seal mt-2 w-full !py-2 !text-[12px]"
        :disabled="endgame.dailyDoneDay === daily.day || busy !== null || endgame.daoSource < CHALLENGE_ENTRY_COST"
        :title="busy?.reason ?? (endgame.dailyDoneDay !== daily.day && endgame.daoSource < CHALLENGE_ENTRY_COST ? `道源尚差 ${daoSourceShortText(CHALLENGE_ENTRY_COST, endgame.daoSource)}` : undefined)"
        @click="goDaily"
      >
        {{
          endgame.dailyDoneDay === daily.day
            ? '今日已完成'
            : busy
              ? `应 战(${busy.reason})`
              : endgame.daoSource < CHALLENGE_ENTRY_COST
                ? `应 战(道源尚差 ${daoSourceShortText(CHALLENGE_ENTRY_COST, endgame.daoSource)} · 需 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
                : `应 战(道源 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
        }}
      </button>
    </div>
  </section>

  <section>
    <SectionTitle title="天道变数" hint="规则随机" />
    <div class="card-ink mt-2 px-4 py-3">
      <template v-if="mutationDraw.length">
        <p v-for="m in mutationRows" :key="m!.id" class="flex items-center gap-1.5 text-[11px] text-violet-ink">
          <span
            class="axis-glyph h-3.5 w-3.5 shrink-0"
            :class="`axis-glyph--${themeMark(m!.id).glyph}`"
            :title="themeMark(m!.id).identity"
            aria-hidden="true"
          />
          {{ m!.name }}:{{ m!.text }}
        </p>
        <div class="mt-2 flex gap-2">
          <button
            class="btn-seal flex-1 !py-2 !text-[12px]"
            :disabled="busy !== null || endgame.daoSource < MUTATION_ENTRY_COST"
            :title="busy?.reason ?? (endgame.daoSource < MUTATION_ENTRY_COST ? `道源尚差 ${daoSourceShortText(MUTATION_ENTRY_COST, endgame.daoSource)}` : undefined)"
            @click="goMutation"
          >
            {{
              busy
                ? `应 战(${busy.reason})`
                : endgame.daoSource < MUTATION_ENTRY_COST
                  ? `应 战(道源尚差 ${daoSourceShortText(MUTATION_ENTRY_COST, endgame.daoSource)} · 需 ${MUTATION_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
                  : `应 战(道源 ${MUTATION_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)} · 破解得 ${MUTATION_BASE_REWARD})`
            }}
          </button>
          <button class="btn-ghost !px-3 !text-[12px]" @click="mutationDraw = rollMutators()">再探</button>
        </div>
      </template>
      <template v-else>
        <p class="text-[11px] leading-relaxed text-ink-faint">{{ cnNumber(MUTATION_FIGHTS) }}连战 · 规则叠加</p>
        <button class="btn-ghost mt-2 w-full !py-2 !text-[12px]" @click="mutationDraw = rollMutators()">窥探变数</button>
      </template>
    </div>
  </section>

  <section>
    <SectionTitle title="天道试炼" />
    <div class="mt-2 space-y-2.5">
      <div v-for="row in trialRows" :key="row.def.id" class="card-ink px-4 py-3">
        <p class="flex items-center gap-2">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gold-ink font-kai text-[15px] seal-face">
            {{ row.def.seal }}
          </span>
          <span class="font-kai text-[15px] tracking-widest text-ink">{{ row.def.name }}</span>
          <!-- 战纹:连战几场就几枚,七/四/五各有自己的枚数 -->
          <span
            class="trial-fights shrink-0"
            role="img"
            :aria-label="row.mark.label"
          >
            <!-- 只画这一场真有的枚数:它说的是「连战几场」,不是「还剩几场」——
                 画满七格留空槽会读成「还差几场才打满」 -->
            <i v-for="n in row.mark.fights" :key="n" class="on" />
          </span>
          <span v-if="endgame.trialRecords[row.def.id]" class="ml-auto tabular text-[10px] text-gold-ink">
            最佳 {{ endgame.trialRecords[row.def.id]!.bestRounds }} 回合
          </span>
        </p>
        <!-- 恢复档与层阶:一条说场间能回几成,一条说站在梯子的哪一段 -->
        <div class="mt-1.5 flex items-center gap-2">
          <span
            class="trial-recover shrink-0"
            :class="`trial-recover--${row.mark.recovery}`"
            role="img"
            :aria-label="row.recoveryLabel"
          >
            <i v-for="n in 3" :key="n" />
          </span>
          <span class="shrink-0 text-[10px] text-ink-faint">{{ row.recoveryLabel }}</span>
          <!--
            这条轴原先只有一个点、两端无字:「23 阶」读不出它站在全谱的哪一段。
            两端各标一个数,点才有参照(见 ui/trialMark.tierSpan)。
          -->
          <span class="flex min-w-0 flex-1 items-center gap-1">
            <span class="shrink-0 tabular text-[9px] leading-none text-ink-faint">{{ tierLimits.lo }}</span>
            <span class="trial-tier min-w-0 flex-1" :style="{ '--tier-pos': row.tierPct }" aria-hidden="true" />
            <span class="shrink-0 tabular text-[9px] leading-none text-ink-faint">{{ tierLimits.hi }}</span>
          </span>
          <span class="shrink-0 tabular text-[10px] text-ink-faint">{{ row.mark.tier }} 阶</span>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ row.def.desc }}</p>
        <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
          <span v-for="(r, i) in row.def.ruleText" :key="i">{{ r }}</span>
        </p>
        <button
          class="btn-ghost mt-2.5 w-full !py-2 !text-[13px]"
          :disabled="busy !== null || endgame.daoSource < row.def.entryCost"
          :title="busy?.reason ?? (endgame.daoSource < row.def.entryCost ? `道源尚差 ${daoSourceShortText(row.def.entryCost, endgame.daoSource)}` : undefined)"
          @click="goTrial(row.def.id)"
        >
          {{
            busy
              ? `应 试(${busy.reason})`
              : endgame.daoSource < row.def.entryCost
                ? `应 试(道源尚差 ${daoSourceShortText(row.def.entryCost, endgame.daoSource)} · 需 ${row.def.entryCost} · 余 ${formatNum(endgame.daoSource)})`
                : `应 试(道源 ${row.def.entryCost} · 余 ${formatNum(endgame.daoSource)} · 功成得 ${row.def.rewardDaoSource})`
          }}
        </button>
      </div>
    </div>
  </section>

  <!-- 天道挑战书:玩家定规则,天道定难度与赏格 -->
  <section>
    <!-- 天界秘境:真仙起,道源代价 -->
    <SecretRealmCard gate="celestial" />

    <SectionTitle title="天道挑战书" />
    <div class="card-ink mt-2 px-4 py-3">
      <p class="text-[11px] text-ink-faint">变数至多 {{ CHALLENGE_MAX_MUTATORS }} 条</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="w in CELESTIAL_WORLDS"
          :key="w.id"
          class="chip-ink !py-1.5"
          :class="draft.worldId === w.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
          :aria-pressed="draft.worldId === w.id"
          @click="setDraftWorld(w.id)"
        >
          {{ w.name }}
        </button>
      </div>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          v-for="m in MUTATORS"
          :key="m.id"
          class="chip-ink flex items-center gap-1 !py-1.5"
          :class="draft.mutatorIds.includes(m.id) ? 'border-violet-ink text-violet-ink' : 'border-ink/25 text-ink-faint'"
          :title="`${themeMark(m.id).identity} · ${m.text}`"
          :aria-pressed="draft.mutatorIds.includes(m.id)"
          @click="toggleDraftMutator(m.id)"
        >
          <!-- 轴纹:先看出这一条属于哪条轴,再读规则 -->
          <span
            class="axis-glyph h-3.5 w-3.5 shrink-0"
            :class="`axis-glyph--${themeMark(m.id).glyph}`"
            aria-hidden="true"
          />
          {{ m.name }}
        </button>
      </div>
      <p v-if="selectedMutators.length" class="mt-1 text-[10px] leading-relaxed text-violet-ink">
        {{ selectedMutators.map(m => `${m.name}:${m.text}`).join('；') }}
      </p>
      <!-- 同轴几条:落在同一轴上的越多,这一趟的打法就越极端,此前只能靠玩家自己数 -->
      <p v-if="selectedThemeRow" class="mt-0.5 text-[10px] text-ink-faint">{{ selectedThemeRow }}</p>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          class="chip-ink !py-1.5"
          :class="draft.pactId === null ? 'border-jade text-jade' : 'border-ink/25 text-ink-faint'"
          :aria-pressed="draft.pactId === null"
          @click="setDraftPact(null)"
        >
          不立契
        </button>
        <button
          v-for="row in pactRows"
          :key="row.def.id"
          class="chip-ink !py-1.5"
          :class="[row.mark ? `pact-weight-${row.mark.weight}` : '', draft.pactId === row.def.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint']"
          :title="row.def.ruleText"
          :aria-label="row.mark?.label ?? row.def.name"
          :aria-pressed="draft.pactId === row.def.id"
          @click="setDraftPact(row.def.id)"
        >
          <!-- 契纹:同一套形状语言,挑战书与远征择契读得通 -->
          <span
            v-if="row.mark"
            class="pact-crest mr-1 inline-block h-3 w-3 align-[-2px]"
            :class="`pact-crest--${row.mark.crest}`"
            aria-hidden="true"
          />
          {{ row.def.name }}
        </button>
      </div>
      <p v-if="challengePact" class="mt-1 text-[10px] leading-relaxed text-ink-soft">
        立约「{{ challengePact.name }}」:{{ challengePact.ruleText }}
      </p>
      <input
        v-model="draft.name"
        maxlength="8"
        aria-label="挑战书名"
        class="mt-2 w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-1.5 font-kai text-[13px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
        placeholder="挑战书名"
      />
      <div
        v-if="challengeVerdict"
        class="mt-2 rounded-md px-3 py-2"
        :class="challengeVerdict.ok ? 'bg-paper-deep/70' : 'bg-cinnabar/10'"
      >
        <p v-if="challengeVerdict.ok" class="flex items-center justify-between text-[11px]">
          <span class="text-ink-soft">已受约 · {{ challengeVerdict.difficulty }} · 可行流派 {{ challengeVerdict.viable }}/{{ BUILD_PROFILES.length }}</span>
          <span class="tabular text-gold-ink">赏 道源 {{ challengeVerdict.reward }}</span>
        </p>
        <p v-else class="text-[11px] text-cinnabar">{{ challengeVerdict.reason }}</p>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button class="btn-ghost w-full !py-2 !text-[12px]" @click="doVerify">验 约</button>
        <button
          class="btn-seal w-full !py-2 !text-[12px]"
          :disabled="!challengeVerdict?.ok || busy !== null || endgame.daoSource < CHALLENGE_ENTRY_COST"
          :title="challengeBlockText"
          @click="doUndertake"
        >
          {{ challengeButtonText }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useEndgameStore } from '@/stores/endgame'
  import { usePlayerStore } from '@/stores/player'
  import { CELESTIAL_WORLDS, TRIALS } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { pactMark } from '@/ui/pactMark'
  import { MUTATORS, mutatorDef } from '@/data/mutators'
  import { themeBreakdown, themeMark } from '@/ui/mutatorTheme'
  import { RECOVERY_LABEL, tierPosition, tierSpan, trialMark } from '@/ui/trialMark'
  import { todayChallengeAsync, undertakeDaily } from '@/core/dailyChallenge'
  import type { DailyChallenge } from '@/core/dailyChallenge'
  import { useWallNow } from '@/composables/useWallClock'
  import { localDayNum } from '@/utils/time'
  import {
    challengeMutation,
    MUTATION_BASE_REWARD,
    MUTATION_ENTRY_COST,
    MUTATION_FIGHTS,
    rollMutators
  } from '@/core/expedition'
  import { challengeTrial } from '@/core/endgameService'
  import {
    CHALLENGE_ENTRY_COST,
    CHALLENGE_MAX_MUTATORS,
    undertakeChallenge,
    verifyChallenge,
    type ChallengeDraft,
    type ChallengeVerdict
  } from '@/core/challenge'
  import { BUILD_PROFILES } from '@/core/buildSim'
  import { cnNumber, formatNum } from '@/utils/format'
  import { daoSourceShortText } from '@/core/daoSource'
  import { useAdventureStore } from '@/stores/adventure'
  import { endgameBusy } from '@/core/endgameActivity'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import type { ReportView } from '@/components/celestial/BattleReportDialog.vue'

  /**
   * 试炼册:今日天道 / 天道变数 / 天道试炼 / 天道挑战书;草稿态归本册,宿主不代管。
   * 开战结果经 emit('report') 交宿主统一判定归因(openReport 只此一处)。
   */
  const emit = defineEmits<{ report: [ReportView] }>()
  const endgame = useEndgameStore()

  // ---- 今日天道 ----
  // 题面随本地午夜更替;日号 computed 只在跨日时变,daily 不会每秒重跑天道裁判
  const wallNow = useWallNow()
  const wallDay = computed(() => localDayNum(wallNow.value))
  /*
   * 今日天道要跑天道裁判:单次 verifyChallenge 实测 54ms(六流派 × 8 场),
   * 候选上限 32 —— 最坏 1728ms,实测切到本页签量到 231ms 的长任务。
   * 故改为挂载后异步算,期间 daily 为 null(界面本来就有「无今日天道」那一档)。
   */
  const daily = ref<DailyChallenge | null>(null)
  watch(
    () => [endgame.daoPath, wallDay.value] as const,
    async ([daoPath, day]) => {
      if (!daoPath) {
        daily.value = null
        return
      }
      const got = await todayChallengeAsync(day)
      // 期间可能又换了一天,只认最新那次
      if (wallDay.value === day) daily.value = got
    },
    { immediate: true }
  )
  const dailyWorld = computed(() => (daily.value ? celestialWorldDefLocal(daily.value.draft.worldId) : null))
  const dailyMutators = computed(() =>
    daily.value ? daily.value.draft.mutatorIds.map(id => mutatorDef(id)).filter(m => m !== undefined) : []
  )
  const dailyPact = computed(() => (daily.value?.draft.pactId ? pactDef(daily.value.draft.pactId) : undefined))

  /** 层阶轴的两端:三场试炼里最低与最高的锚点阶,轴上那个点才有参照 */
  const tierLimits = tierSpan()

  /**
   * 天道试炼与契约的行:每行的形制在 setup 里各算一次。
   *
   * `TRIALS` / `PACTS` 是静态数据,`trialMark` / `pactMark` 也是纯函数 ——
   * 而模板里一个渲染周期要调 trialMark 7 次(标签、枚数、恢复档 ×2、层阶 ×2)、
   * pactMark 5 次(契重、读屏说法、有无判断、契纹类名),同一种东西算好几遍,
   * 且模板里读不出「这几处说的是同一个 mark」。
   *
   * 铁律与仓库既有做法一致:纯函数在 setup 里算一次,模板只读字段。
   */
  const pactRows = PACTS.map(p => ({ def: p, mark: pactMark(p.id) }))

  const trialRows = TRIALS.map(t => {
    const mark = trialMark(t)
    return {
      def: t,
      mark,
      recoveryLabel: RECOVERY_LABEL[mark.recovery],
      tierPct: `${tierPosition(mark.tier) * 100}%`
    }
  })

  function celestialWorldDefLocal(id: string) {
    return CELESTIAL_WORLDS.find(w => w.id === id)
  }

  async function goDaily(): Promise<void> {
    // 现取当日题,不用 daily.value 缓存:驻足跨午夜时它可能仍是昨天那题
    const current = await todayChallengeAsync()
    if (!current) return
    const result = undertakeDaily(current)
    if (result) {
      emit('report', {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  // ---- 天道变数 ----
  const mutationDraw = ref<string[]>([])
  const mutationRows = computed(() => mutationDraw.value.map(id => mutatorDef(id)).filter(m => m !== undefined))

  function goMutation(): void {
    const result = challengeMutation(mutationDraw.value)
    if (!result) return
    mutationDraw.value = []
    emit('report', {
      title: '天道变数',
      cleared: result.report.cleared,
      markText: result.report.cleared ? `${cnNumber(MUTATION_FIGHTS)}战全捷,共 ${result.report.totalRounds} 回合` : `止步第 ${result.report.fightsWon + 1} 战`,
      rows: result.report.rows,
      reward: result.rewardDaoSource
    })
  }

  // ---- 试炼 ----
  function goTrial(id: string): void {
    const result = challengeTrial(id)
    if (result) {
      emit('report', {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  // ---- 天道挑战书 ----
  const draft = ref<ChallengeDraft>({ worldId: CELESTIAL_WORLDS[0]!.id, mutatorIds: [], pactId: null, name: '' })
  const challengeVerdict = ref<ChallengeVerdict | null>(null)
  /** 已选变数:效果正文亮到行内,移动端不靠 hover */
  const selectedMutators = computed(() => MUTATORS.filter(m => draft.value.mutatorIds.includes(m.id)))

  /** 已选变数的主题分布;只有一条时不报(一条谈不上「落在哪轴」) */
  const selectedThemeRow = computed(() => {
    const ids = draft.value.mutatorIds
    if (ids.length < 2) return ''
    const parts = themeBreakdown(ids).map(t => `${t.identity}×${t.count}`)
    return parts.join(' · ')
  })
  const challengePact = computed(() => (draft.value.pactId ? pactDef(draft.value.pactId) ?? null : null))
  const busy = computed(() => endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session))
  const challengeBlockText = computed(() => {
    if (busy.value) return busy.value.reason
    if (!challengeVerdict.value?.ok) return '未受约'
    if (endgame.daoSource < CHALLENGE_ENTRY_COST) {
      return `道源尚差 ${daoSourceShortText(CHALLENGE_ENTRY_COST, endgame.daoSource)}`
    }
    return undefined
  })
  const challengeButtonText = computed(() => {
    // 拒因取 endgameBusy 的 reason,不按 kind 另写一份 —— 改词只需改 core 一处
    if (busy.value) return `立 约(${busy.value.reason})`
    if (!challengeVerdict.value?.ok) return '立 约(未受约)'
    if (endgame.daoSource < CHALLENGE_ENTRY_COST) {
      return `立 约(道源尚差 ${daoSourceShortText(CHALLENGE_ENTRY_COST, endgame.daoSource)} · 需 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
    }
    return `立 约(道源 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
  })

  function setDraftWorld(id: string): void {
    draft.value = { ...draft.value, worldId: id }
    challengeVerdict.value = null
  }

  function setDraftPact(id: string | null): void {
    draft.value = { ...draft.value, pactId: id }
    challengeVerdict.value = null
  }

  function toggleDraftMutator(id: string): void {
    const has = draft.value.mutatorIds.includes(id)
    if (!has && draft.value.mutatorIds.length >= CHALLENGE_MAX_MUTATORS) return
    draft.value = {
      ...draft.value,
      mutatorIds: has ? draft.value.mutatorIds.filter(m => m !== id) : [...draft.value.mutatorIds, id]
    }
    challengeVerdict.value = null
  }

  function doVerify(): void {
    challengeVerdict.value = verifyChallenge(draft.value)
  }

  function doUndertake(): void {
    if (!challengeVerdict.value?.ok) return
    const result = undertakeChallenge(draft.value, challengeVerdict.value)
    challengeVerdict.value = null
    if (result) {
      emit('report', {
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }
</script>
