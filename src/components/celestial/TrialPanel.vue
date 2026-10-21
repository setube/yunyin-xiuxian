<template>
  <!-- 试炼册:今日天道 + 天道变数 + 天道试炼 + 天道挑战书 -->
  <!-- 今日天道:程序生成的每日挑战 -->
  <section v-if="daily">
    <SectionTitle title="今日天道" hint="日出而题,日落而息" />
    <div class="card-ink mt-2 px-4 py-3">
      <p class="flex items-center gap-2">
        <span class="font-kai text-[14px] tracking-widest text-ink">{{ dailyWorld?.name }}</span>
        <span class="tabular text-[11px] text-ink-soft">{{ daily.verdict.difficulty }} · 可行 {{ daily.verdict.viable }}/{{ BUILD_PROFILES.length }}</span>
        <span class="ml-auto tabular text-[11px] text-gold-ink">赏 {{ daily.verdict.reward }}</span>
      </p>
      <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
        <span v-for="m in dailyMutators" :key="m!.id">◇ {{ m!.name }}:{{ m!.text }}</span>
        <span v-if="dailyPact" class="text-cinnabar">契·{{ dailyPact.name }}</span>
      </p>
      <button
        class="btn-seal mt-2 w-full !py-2 !text-[12px]"
        :disabled="endgame.dailyDoneDay === daily.day || (endgame.dailyDoneDay !== daily.day && endgame.daoSource < CHALLENGE_ENTRY_COST)"
        :title="endgame.dailyDoneDay !== daily.day && endgame.daoSource < CHALLENGE_ENTRY_COST ? '道源不足' : undefined"
        @click="goDaily"
      >
        {{
          endgame.dailyDoneDay === daily.day
            ? '今日已成,明日再会'
            : endgame.daoSource < CHALLENGE_ENTRY_COST
              ? `应 战(道源不足:需 ${CHALLENGE_ENTRY_COST},余 ${formatNum(endgame.daoSource)})`
              : `应 战(道源 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
        }}
      </button>
    </div>
  </section>

  <!-- 天道变数 -->
  <section>
    <SectionTitle title="天道变数" hint="规则随机,每探一次天机便换一副面孔" />
    <div class="card-ink mt-2 px-4 py-3">
      <template v-if="mutationDraw.length">
        <p v-for="m in mutationRows" :key="m!.id" class="text-[11px] text-violet-ink">◇ {{ m!.name }}:{{ m!.text }}</p>
        <div class="mt-2 flex gap-2">
          <button
            class="btn-seal flex-1 !py-2 !text-[12px]"
            :disabled="endgame.daoSource < MUTATION_ENTRY_COST"
            :title="endgame.daoSource < MUTATION_ENTRY_COST ? '道源不足' : undefined"
            @click="goMutation"
          >
            {{
              endgame.daoSource < MUTATION_ENTRY_COST
                ? `应 战(道源不足:需 ${MUTATION_ENTRY_COST},余 ${formatNum(endgame.daoSource)})`
                : `应 战(道源 ${MUTATION_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)} · 破解得 ${MUTATION_BASE_REWARD})`
            }}
          </button>
          <button class="btn-ghost !px-3 !text-[12px]" @click="mutationDraw = rollMutators()">再探</button>
        </div>
      </template>
      <template v-else>
        <p class="text-[11px] leading-relaxed text-ink-faint">天道无常,规则无定。窥探本次变数,再决定是否应战——{{ cnNumber(MUTATION_FIGHTS) }}连战,规则叠加。</p>
        <button class="btn-ghost mt-2 w-full !py-2 !text-[12px]" @click="mutationDraw = rollMutators()">窥探变数</button>
      </template>
    </div>
  </section>

  <!-- 天道试炼 -->
  <section>
    <SectionTitle title="天道试炼" hint="极限构筑的证道之地" />
    <div class="mt-2 space-y-2.5">
      <div v-for="trial in TRIALS" :key="trial.id" class="card-ink px-4 py-3">
        <p class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-gold-ink/85 font-kai text-[15px] seal-face">
            {{ trial.seal }}
          </span>
          <span class="font-kai text-[15px] tracking-widest text-ink">{{ trial.name }}</span>
          <span v-if="endgame.trialRecords[trial.id]" class="ml-auto tabular text-[10px] text-gold-ink">
            最佳 {{ endgame.trialRecords[trial.id]!.bestRounds }} 回合
          </span>
        </p>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ trial.desc }}</p>
        <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
          <span v-for="(r, i) in trial.ruleText" :key="i">{{ r }}</span>
        </p>
        <button
          class="btn-ghost mt-2.5 w-full !py-2 !text-[13px]"
          :disabled="endgame.daoSource < trial.entryCost"
          :title="endgame.daoSource < trial.entryCost ? '道源不足' : undefined"
          @click="goTrial(trial.id)"
        >
          {{
            endgame.daoSource < trial.entryCost
              ? `应 试(道源不足:需 ${trial.entryCost},余 ${formatNum(endgame.daoSource)})`
              : `应 试(道源 ${trial.entryCost} · 余 ${formatNum(endgame.daoSource)} · 功成得 ${trial.rewardDaoSource})`
          }}
        </button>
      </div>
    </div>
  </section>

  <!-- 天道挑战书:玩家定规则,天道定难度与赏格 -->
  <section>
    <!-- 天界秘境:真仙起,道源代价,与远征/试炼并列的一阶一次性内容 -->
    <SecretRealmCard gate="celestial" />

    <SectionTitle title="天道挑战书" hint="你定规则,天道定赏" />
    <div class="card-ink mt-2 px-4 py-3">
      <p class="text-[11px] text-ink-faint">选界 · 叠变数(至多 {{ CHALLENGE_MAX_MUTATORS }} 条)· 立契 · 命名。天道观你出题之难,赏格随之而定,绝无虚价。</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="w in CELESTIAL_WORLDS"
          :key="w.id"
          class="chip-ink !py-1.5"
          :class="draft.worldId === w.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
          @click="setDraftWorld(w.id)"
        >
          {{ w.name }}
        </button>
      </div>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          v-for="m in MUTATORS"
          :key="m.id"
          class="chip-ink !py-1.5"
          :class="draft.mutatorIds.includes(m.id) ? 'border-violet-ink text-violet-ink' : 'border-ink/25 text-ink-faint'"
          :title="m.text"
          :aria-pressed="draft.mutatorIds.includes(m.id)"
          @click="toggleDraftMutator(m.id)"
        >
          {{ m.name }}
        </button>
      </div>
      <!-- 变数已选的,把效果正文亮出来 —— 手机没有 hover,赌约规则得看得见 -->
      <p v-if="selectedMutators.length" class="mt-1 text-[10px] leading-relaxed text-violet-ink">
        {{ selectedMutators.map(m => `${m.name}：${m.text}`).join('；') }}
      </p>
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
          v-for="p in PACTS"
          :key="p.id"
          class="chip-ink !py-1.5"
          :class="draft.pactId === p.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
          :title="p.ruleText"
          :aria-pressed="draft.pactId === p.id"
          @click="setDraftPact(p.id)"
        >
          {{ p.name }}
        </button>
      </div>
      <p v-if="challengePact" class="mt-1 text-[10px] leading-relaxed text-ink-soft">
        立约「{{ challengePact.name }}」：{{ challengePact.ruleText }}
      </p>
      <input
        v-model="draft.name"
        maxlength="8"
        class="mt-2 w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-1.5 font-kai text-[13px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
        placeholder="为此挑战书命名(如《无盾求生》)"
      />
      <div
        v-if="challengeVerdict"
        class="mt-2 rounded-md px-3 py-2"
        :class="challengeVerdict.ok ? 'bg-paper-deep/70' : 'bg-cinnabar/10'"
      >
        <p v-if="challengeVerdict.ok" class="flex items-center justify-between text-[11px]">
          <span class="text-ink-soft">天道受此约:{{ challengeVerdict.difficulty }} · 可行流派 {{ challengeVerdict.viable }}/{{ BUILD_PROFILES.length }}</span>
          <span class="tabular text-gold-ink">赏 道源 {{ challengeVerdict.reward }}</span>
        </p>
        <p v-else class="text-[11px] text-cinnabar">{{ challengeVerdict.reason }}</p>
      </div>
      <div class="mt-2 flex gap-2">
        <button class="btn-ghost flex-1 !py-2 !text-[12px]" @click="doVerify">验 约</button>
        <button
          class="btn-seal flex-1 !py-2 !text-[12px]"
          :disabled="!challengeVerdict?.ok || run !== null || endgame.daoSource < CHALLENGE_ENTRY_COST"
          :title="endgame.daoSource < CHALLENGE_ENTRY_COST ? '道源不足' : undefined"
          @click="doUndertake"
        >
          {{
            endgame.daoSource < CHALLENGE_ENTRY_COST
              ? `立 约(道源不足:需 ${CHALLENGE_ENTRY_COST},余 ${formatNum(endgame.daoSource)})`
              : `立 约(道源 ${CHALLENGE_ENTRY_COST} · 余 ${formatNum(endgame.daoSource)})`
          }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useEndgameStore } from '@/stores/endgame'
  import { CELESTIAL_WORLDS, TRIALS } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { MUTATORS, mutatorDef } from '@/data/mutators'
  import { todayChallenge, undertakeDaily } from '@/core/dailyChallenge'
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
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import type { ReportView } from '@/components/celestial/BattleReportDialog.vue'

  /**
   * 试炼册 —— 今日天道 / 天道变数 / 天道试炼 / 天道挑战书。
   *
   * 自 CelestialView 拆出:这四节只读 endgame 与各自的草稿态,变数抽取、挑战书草稿、
   * 验约结果都只属于这一册,宿主不再代管 mutationDraw 与 draft。
   * 开战结果仍经 emit('report') 交宿主统一判定归因(openReport 只此一处)。
   */
  const emit = defineEmits<{ report: [ReportView] }>()
  const endgame = useEndgameStore()
  /** 挑战书立约要避开在途远征(与远征册同一份 worldRun) */
  const run = computed(() => endgame.worldRun)

  // ---- 今日天道 ----
  const daily = computed(() => (endgame.daoPath ? todayChallenge() : null))
  const dailyWorld = computed(() => (daily.value ? celestialWorldDefLocal(daily.value.draft.worldId) : null))
  const dailyMutators = computed(() =>
    daily.value ? daily.value.draft.mutatorIds.map(id => mutatorDef(id)).filter(m => m !== undefined) : []
  )
  const dailyPact = computed(() => (daily.value?.draft.pactId ? pactDef(daily.value.draft.pactId) : undefined))

  function celestialWorldDefLocal(id: string) {
    return CELESTIAL_WORLDS.find(w => w.id === id)
  }

  function goDaily(): void {
    // 用当下现取,不拿可能已跨午夜的缓存 daily.value(其 day 来自非响应式 todayChallenge,
    // 驻足跨日仍是昨天那题):应战落闸与题面都要是今天的
    const current = todayChallenge()
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
  /** 已选变数(把效果正文亮到行内,移动端不靠 hover) */
  const selectedMutators = computed(() => MUTATORS.filter(m => draft.value.mutatorIds.includes(m.id)))
  const challengePact = computed(() => (draft.value.pactId ? pactDef(draft.value.pactId) ?? null : null))

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
