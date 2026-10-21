<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 未至真仙 -->
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">天 界</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">
        天门紧闭,仙光垂落而不可及。
        <br />
        修至
        <span class="text-cinnabar">真仙境</span>
        ,方见此界真容。
      </p>
    </div>

    <template v-else>
      <!-- 道源(Phase 30.9:生命周期标签 + 用途说明入口) -->
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">天 界</p>
        <div class="flex items-center gap-2">
          <span class="chip-ink border-cinnabar/50 text-[9px] text-cinnabar">此世消耗</span>
          <button class="group flex items-end gap-1 text-left active:scale-97 active:opacity-60" aria-label="道源,点开看用途与来处" @click="openDaoSourceDialog()">
            <span>
              <span class="block text-[10px] leading-tight text-ink-faint">叩问天道·试一试</span>
              <span class="block tabular font-kai text-[17px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
            </span>
            <span class="mb-px text-[13px] leading-tight text-ink-faint transition-transform group-active:translate-x-0.5">›</span>
          </button>
        </div>
      </div>

      <!-- 页签:长卷分册 -->
      <InkTabs v-model="celTab" :tabs="celTabRows" />

      <template v-if="celTab === 'dao'">
        <!-- 道途 -->
        <section>
          <SectionTitle title="道途" hint="此生一诺,来世另择" />
          <div v-if="currentDao" class="card-ink mt-2 px-4 py-3">
            <p class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-md bg-cinnabar/90 font-kai text-[20px] seal-face">
                {{ currentDao.seal }}
              </span>
              <span class="font-kai text-[16px] tracking-widest text-ink">{{ currentDao.name }}</span>
            </p>
            <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">{{ currentDao.desc }}</p>
            <p v-for="(r, i) in currentDao.ruleText" :key="i" class="mt-0.5 text-[11px] text-azure">· {{ r }}</p>
            <p v-for="(r, i) in currentDao.deepText" :key="`d${i}`" class="mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
            <p v-if="swordInfo" class="mt-1.5 text-[11px] text-violet-ink tabular">
              当前剑意 {{ swordInfo.layers }}/{{ SWORD_PURITY_MAX_LAYERS }} 层({{
                swordInfo.checks
                  .filter(c => c.ok)
                  .map(c => c.name)
                  .join('、') || '尚无一纯'
              }})
            </p>
            <p v-if="daoStory" class="mt-1.5 font-kai text-[11px] leading-relaxed text-ink-soft">「{{ daoStory }}」</p>
          </div>
          <div v-else class="mt-2 grid grid-cols-2 gap-2.5">
            <button v-for="dao in DAO_PATHS" :key="dao.id" class="card-ink px-3 py-3 text-left active:scale-98" @click="pickDao(dao.id)">
              <p class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-cinnabar/85 font-kai text-[16px] seal-face">
                  {{ dao.seal }}
                </span>
                <span class="font-kai text-[14px] tracking-widest text-ink">{{ dao.name }}</span>
              </p>
              <p class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">{{ dao.desc }}</p>
              <p v-for="(r, i) in dao.ruleText" :key="i" class="mt-0.5 text-[10px] text-azure">· {{ r }}</p>
              <p v-for="(r, i) in dao.deepText" :key="`d${i}`" class="mt-0.5 text-[10px] text-gold-ink">◈ {{ r }}</p>
            </button>
          </div>
        </section>

        <!-- 天道熔炉 / 器魂:两处入口 -->
        <section class="space-y-2">
          <button
            class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
            @click="furnaceOpen = true"
          >
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar/85 font-kai text-[19px] seal-face">炉</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">天道熔炉</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">前尘俗物,皆可熔作道源</span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>

          <button class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98" @click="goSouls()">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-ink/85 font-kai text-[19px] seal-face">魂</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">器 魂</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
                凡器承不住天道,只余形意 · 已凝 {{ endgame.activeSouls.length }}/{{ SOUL_SLOTS }}
              </span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>
        </section>
      </template>

      <ExpeditionPanel v-else-if="celTab === 'exped'" @report="openReport" />

      <template v-else-if="celTab === 'trial'">
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

      <template v-else>
        <MarksPanel @report="openReport" />
      </template>
    </template>


    <!-- 战报(远征终局 / 试炼 / 变数) -->
    <BattleReportDialog :report="expedition" :player-name="player.name" @close="expedition = null" />

    <!-- 天道熔炉(弹窗本体在 components/celestial/FurnaceDialog.vue,含首次凝道果弹窗) -->
    <FurnaceDialog :open="furnaceOpen" @close="furnaceOpen = false" />

    <!-- 道途选择确认:一世只此一次,点了就锁到转世 -->
    <BaseModal :open="pendingDao !== undefined" title="定下道途" @close="pendingDaoId = null">
      <template v-if="pendingDao">
        <p class="font-kai text-[14px] tracking-wider text-ink">{{ pendingDao.name }}</p>
        <p class="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{{ pendingDao.desc }}</p>
        <p v-for="(r, i) in pendingDao.ruleText" :key="i" class="mt-0.5 text-[11px] text-azure">· {{ r }}</p>
        <p v-for="(r, i) in pendingDao.deepText" :key="`confirm-${i}`" class="mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
        <p class="mt-3 border-l-2 border-cinnabar/60 pl-2 text-[11px] text-cinnabar">道途既定,此世不再更改;误选须待兵解转世方能重择</p>
      </template>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="pendingDaoId = null">再想想</button>
          <button class="btn-seal flex-1 !bg-cinnabar-deep" @click="confirmDao">道心已定</button>
        </div>
      </template>
    </BaseModal>

    <!-- Phase 30.9 S2:道源说明弹窗 -->
    <BaseModal :open="daoSourceDialogOpen" title="道源" @close="daoSourceDialogOpen = false">
      <div class="space-y-3 text-[12px] leading-relaxed">
        <p class="text-ink-soft">{{ daoSourceDialog().intro }}</p>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">用途</p>
          <p class="text-ink-faint">{{ daoSourceDialog().usages.join(' · ') }}</p>
        </div>
        <div>
          <p class="font-kai text-[12px] tracking-wider text-ink">获取</p>
          <p class="text-ink-faint">{{ daoSourceDialog().gains.join(' · ') }}</p>
        </div>
        <p class="border-l-2 border-cinnabar/60 pl-2 text-[11px] text-cinnabar">
          {{ daoSourceDialog().lifecycle }}
        </p>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="daoSourceDialogOpen = false">知道了</button>
      </template>
    </BaseModal>

    <!-- Phase 30.9 S4:首次登真仙·终局导览(弹窗本体在 components/celestial/TutorialDialog.vue) -->
    <TutorialDialog :open="tutorialOpen" @close="tutorialOpen = false" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { usePlayerStore } from '@/stores/player'
  import { useInventoryStore } from '@/stores/inventory'
  import { useEndgameStore } from '@/stores/endgame'
  import { SOUL_SLOTS } from '@/data/souls'
  import { CELESTIAL_WORLDS, DAO_PATHS, TRIALS, daoPathDef } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { MUTATORS, mutatorDef } from '@/data/mutators'
  import { todayChallenge, undertakeDaily } from '@/core/dailyChallenge'
  import { challengeTrial, chooseDaoPath, endgameUnlocked } from '@/core/endgameService'
  import { currentDaoNarrative } from '@/core/identity'
  import {
    challengeMutation,
    MUTATION_BASE_REWARD,
    MUTATION_ENTRY_COST,
    MUTATION_FIGHTS,
    rollMutators
  } from '@/core/expedition'
  import { detectBuild } from '@/core/buildDetect'
  import { foeOriginLines } from '@/core/battleAnalysis'
  import { BUILD_PROFILES } from '@/core/buildSim'
  import { swordPurity, SWORD_PURITY_MAX_LAYERS } from '@/core/daoDepth'
  import {
    CHALLENGE_ENTRY_COST,
    CHALLENGE_MAX_MUTATORS,
    undertakeChallenge,
    verifyChallenge,
    type ChallengeDraft,
    type ChallengeVerdict
  } from '@/core/challenge'
  import { cnNumber, formatNum } from '@/utils/format'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import BattleReportDialog, { type ReportView } from '@/components/celestial/BattleReportDialog.vue'
  import FurnaceDialog from '@/components/celestial/FurnaceDialog.vue'
  import TutorialDialog from '@/components/celestial/TutorialDialog.vue'
  import MarksPanel from '@/components/celestial/MarksPanel.vue'
  import ExpeditionPanel from '@/components/celestial/ExpeditionPanel.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import {
    daoSourceDialog,
    shouldShowEndgameTutorial,
    markEndgameTutorialSeen,
    markResourceDialogSeen
  } from '@/core/resourceGuidance'

  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const endgame = useEndgameStore()

  const unlocked = computed(() => endgameUnlocked())

  const router = useRouter()
  function goSouls(): void {
    router.push({ name: 'souls' })
  }

  // Phase 30.9:道源说明弹窗 / 首次终局教学(熔炉与道果在 components/celestial/FurnaceDialog.vue)
  const daoSourceDialogOpen = ref(false)
  const furnaceOpen = ref(false)
  const tutorialOpen = ref(false)
  // 首次进入天界(已解锁且未见过教学):自动弹终局导览
  watch(
    () => unlocked.value,
    v => {
      if (v && shouldShowEndgameTutorial()) {
        tutorialOpen.value = true
        markEndgameTutorialSeen()
      }
    },
    { immediate: true }
  )
  function openDaoSourceDialog(): void {
    daoSourceDialogOpen.value = true
    markResourceDialogSeen()
  }

  const currentDao = computed(() => (endgame.daoPath ? daoPathDef(endgame.daoPath) : undefined))

  // ---- 页签:长卷分册(远征在途时落在远征册) ----
  type CelTab = 'dao' | 'exped' | 'trial' | 'marks'
  const celTab = ref<CelTab>(endgame.worldRun ? 'exped' : 'dao')
  const CEL_TABS: { id: CelTab; label: string }[] = [
    { id: 'dao', label: '道途' },
    { id: 'exped', label: '远征' },
    { id: 'trial', label: '试炼' },
    { id: 'marks', label: '道痕' }
  ]

  /** 页签行:远征在途时挂朱点提醒 */
  const celTabRows = computed(() => CEL_TABS.map(t => ({ ...t, dot: t.id === 'exped' && !!endgame.worldRun })))

  /** 挑战书立约要避开在途远征(远征册自己另有同一份 run) */
  const run = computed(() => endgame.worldRun)

  /** 剑道:当前剑意层数与纯度构成 */
  const swordInfo = computed(() => {
    if (endgame.daoPath !== 'sword') return null
    return swordPurity(player.finalStats.mods, inventory.currentArtifacts.length, detectBuild(player.finalStats.mods))
  })

  /** 道途选择二段式:先弹确认,再落一子。道途一世只定一次,误触即被锁死到转世 */
  const pendingDaoId = ref<(typeof DAO_PATHS)[number]['id'] | null>(null)
  const pendingDao = computed(() => (pendingDaoId.value ? daoPathDef(pendingDaoId.value) : undefined))

  function pickDao(id: (typeof DAO_PATHS)[number]['id']): void {
    pendingDaoId.value = id
  }

  function confirmDao(): void {
    if (pendingDaoId.value) chooseDaoPath(pendingDaoId.value)
    pendingDaoId.value = null
  }

  // ---- 战报弹窗(形状见 BattleReportDialog 导出的 ReportView) ----
  const expedition = ref<ReportView | null>(null)

  /**
   * 开战报 —— 判定归因只此一处。
   *
   * 远征的文案带玩家自己的构筑厚度(见 core/gauntlet.celestialJudgementLines),
   * 试炼/变数/忆战/重写/挑战没有那一份,就照敌人快照上的来源说明讲
   * (worldFoeSnap 一路带下来)。两条路给的都是同一件事:这一战为什么变难。
   */
  function openReport(o: {
    title: string
    cleared: boolean
    markText: string
    rows: ReportView['rows']
    reward: number
    judgementLines?: string[]
  }): void {
    expedition.value = { ...o, judgementLines: o.judgementLines ?? foeOriginLines(o.rows[0]?.foe?.origin) }
  }

  // ---- 天道变数 ----
  const mutationDraw = ref<string[]>([])
  const mutationRows = computed(() => mutationDraw.value.map(id => mutatorDef(id)).filter(m => m !== undefined))

  function goMutation(): void {
    const result = challengeMutation(mutationDraw.value)
    if (!result) return
    mutationDraw.value = []
    openReport({
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
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  /** 道途行为叙事(本世道痕 ≥2 则方语) */
  const daoStory = computed(() => currentDaoNarrative())

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
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

  // ---- 今日天道 & 今昔之比 ----
  const daily = computed(() => (unlocked.value && endgame.daoPath ? todayChallenge() : null))
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
      openReport({
        title: result.title,
        cleared: result.report.cleared,
        markText: result.markText,
        rows: result.report.rows,
        reward: result.rewardDaoSource
      })
    }
  }

</script>
