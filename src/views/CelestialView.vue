<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">天 界</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">需<span class="text-cinnabar">真仙境</span></p>
    </div>

    <template v-else>
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">天 界</p>
        <div class="flex items-center gap-2">
          <span class="chip-ink border-cinnabar/50 text-[9px] text-cinnabar">此世消耗</span>
          <button class="group flex items-end gap-1 text-left active:scale-97 active:opacity-60" aria-label="道源说明" @click="openDaoSourceDialog()">
            <span>
              <span class="block text-[10px] leading-tight text-ink-faint">道源</span>
              <span class="block tabular font-kai text-[17px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
            </span>
            <span class="mb-px text-[13px] leading-tight text-ink-faint transition-transform group-active:translate-x-0.5">›</span>
          </button>
        </div>
      </div>

      <InkTabs v-model="celTab" :tabs="celTabRows" />

      <template v-if="celTab === 'dao'">
        <section>
          <SectionTitle title="道途" hint="一世一择" />
          <div v-if="currentDao" class="card-ink relative mt-2 overflow-hidden px-4 py-3">
            <!-- 道途形制:卡角一枚本道道纹(剑锋/回环/三横/交刃),四道不必比色也分得开 -->
            <span
              v-if="currentMark"
              class="dao-crest pointer-events-none absolute right-1 top-1 h-20 w-20"
              :class="`dao-crest--${currentMark.crest}`"
              :style="{ color: currentMark.tone }"
              aria-hidden="true"
            />
            <p class="relative flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-md bg-cinnabar font-kai text-[20px] seal-face">
                {{ currentDao.seal }}
              </span>
              <span class="font-kai text-[16px] tracking-widest text-ink">{{ currentDao.name }}</span>
            </p>
            <p class="relative mt-2 text-[11px] leading-relaxed text-ink-faint">{{ currentDao.desc }}</p>
            <p v-for="(r, i) in currentDao.ruleText" :key="i" class="relative mt-0.5 text-[11px] text-azure">· {{ r }}</p>
            <p v-for="(r, i) in currentDao.deepText" :key="`d${i}`" class="relative mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
            <p v-if="swordInfo" class="relative mt-1.5 text-[11px] text-violet-ink tabular">
              剑意 {{ swordInfo.layers }}/{{ SWORD_PURITY_MAX_LAYERS }} 层<template v-if="swordInfo.layers > 0">({{
                swordInfo.checks
                  .filter(c => c.ok)
                  .map(c => c.name)
                  .join('、')
              }})</template>
            </p>
            <p v-if="daoStory" class="relative mt-1.5 font-kai text-[11px] leading-relaxed text-ink-soft">「{{ daoStory }}」</p>
          </div>
          <div v-else class="mt-2 grid grid-cols-2 gap-2.5">
            <button
              v-for="dao in DAO_PATHS"
              :key="dao.id"
              class="card-ink relative overflow-hidden px-3 py-3 text-left active:scale-98"
              @click="pickDao(dao.id)"
            >
              <!-- 四道各有道纹:择道是最不可逆的一步,四张卡得先长得不一样 -->
              <span
                v-if="daoMarkOf(dao.id)"
                class="dao-crest pointer-events-none absolute right-1 top-1 h-12 w-12"
                :class="`dao-crest--${daoMarkOf(dao.id)!.crest}`"
                :style="{ color: daoMarkOf(dao.id)!.tone }"
                aria-hidden="true"
              />
              <p class="relative flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-md bg-cinnabar font-kai text-[16px] seal-face">
                  {{ dao.seal }}
                </span>
                <span class="font-kai text-[14px] tracking-widest text-ink">{{ dao.name }}</span>
              </p>
              <p class="relative mt-1.5 text-[10px] leading-relaxed text-ink-faint">{{ dao.desc }}</p>
              <p v-for="(r, i) in dao.ruleText" :key="i" class="relative mt-0.5 text-[10px] text-azure">· {{ r }}</p>
              <p v-for="(r, i) in dao.deepText" :key="`d${i}`" class="relative mt-0.5 text-[10px] text-gold-ink">◈ {{ r }}</p>
            </button>
          </div>
        </section>

        <section class="space-y-2">
          <button
            class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
            @click="furnaceOpen = true"
          >
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[19px] seal-face">炉</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">天道熔炉</span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>

          <button class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98" @click="goSouls()">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-ink font-kai text-[19px] seal-face">魂</span>
            <span class="min-w-0 flex-1">
              <span class="block font-kai text-[14px] tracking-widest text-ink">器 魂</span>
              <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
                已凝 {{ endgame.activeSouls.length }}/{{ SOUL_SLOTS }}
              </span>
            </span>
            <span class="shrink-0 text-[12px] text-ink-faint">›</span>
          </button>
        </section>
      </template>

      <ExpeditionPanel v-else-if="celTab === 'exped'" @report="openReport" />

      <TrialPanel v-else-if="celTab === 'trial'" @report="openReport" />

      <template v-else>
        <MarksPanel @report="openReport" />
      </template>
    </template>


    <BattleReportDialog :report="expedition" :player-name="player.name" @close="expedition = null" />

    <!-- 天道熔炉(含首次凝道果弹窗) -->
    <FurnaceDialog :open="furnaceOpen" @close="furnaceOpen = false" />

    <BaseModal :open="pendingDao !== undefined" title="定下道途" @close="pendingDaoId = null">
      <template v-if="pendingDao">
        <p class="flex items-center gap-2">
          <span class="grid h-7 w-7 place-items-center rounded-md bg-cinnabar font-kai text-[13px] seal-face">{{ pendingDao.seal }}</span>
          <span class="font-kai text-[14px] tracking-wider text-ink">{{ pendingDao.name }}</span>
          <span
            v-if="pendingMark"
            class="dao-crest h-5 w-5 shrink-0"
            :class="`dao-crest--${pendingMark.crest}`"
            :style="{ color: pendingMark.tone }"
            aria-hidden="true"
          />
        </p>
        <p class="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{{ pendingDao.desc }}</p>
        <p v-for="(r, i) in pendingDao.ruleText" :key="i" class="mt-0.5 text-[11px] text-azure">· {{ r }}</p>
        <p v-for="(r, i) in pendingDao.deepText" :key="`confirm-${i}`" class="mt-0.5 text-[11px] text-gold-ink">◈ {{ r }}</p>
        <p class="mt-3 border-l-2 border-cinnabar/60 pl-2 text-[11px] text-cinnabar">此世不可更改 · 转世可重择</p>
      </template>
      <template #footer>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1" @click="pendingDaoId = null">再想想</button>
          <button class="btn-seal flex-1 !bg-cinnabar-deep" @click="confirmDao">确认择道</button>
        </div>
      </template>
    </BaseModal>

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
  import { DAO_PATHS, daoPathDef } from '@/data/endgame'
  import { daoMark } from '@/ui/daoMark'
  import { chooseDaoPath, endgameUnlocked } from '@/core/endgameService'
  import { currentDaoNarrative } from '@/core/identity'
  import { detectBuild } from '@/core/buildDetect'
  import { foeOriginLines } from '@/core/battleAnalysis'
  import { swordPurity, SWORD_PURITY_MAX_LAYERS } from '@/core/daoDepth'
  import { formatNum } from '@/utils/format'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import BattleReportDialog, { type ReportView } from '@/components/celestial/BattleReportDialog.vue'
  import FurnaceDialog from '@/components/celestial/FurnaceDialog.vue'
  import TutorialDialog from '@/components/celestial/TutorialDialog.vue'
  import MarksPanel from '@/components/celestial/MarksPanel.vue'
  import ExpeditionPanel from '@/components/celestial/ExpeditionPanel.vue'
  import TrialPanel from '@/components/celestial/TrialPanel.vue'
  import SectionTitle from '@/components/common/SectionTitle.vue'
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

  const daoSourceDialogOpen = ref(false)
  const furnaceOpen = ref(false)
  const tutorialOpen = ref(false)
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
  /** 当前道途的形制;未择道或旧档野 id 时为 undefined,不挂符纹 */
  const currentMark = computed(() => (endgame.daoPath ? daoMark(endgame.daoPath) : undefined))
  function daoMarkOf(id: string) {
    return daoMark(id)
  }

  type CelTab = 'dao' | 'exped' | 'trial' | 'marks'
  const celTab = ref<CelTab>(endgame.worldRun ? 'exped' : 'dao')
  const CEL_TABS: { id: CelTab; label: string }[] = [
    { id: 'dao', label: '道途' },
    { id: 'exped', label: '远征' },
    { id: 'trial', label: '试炼' },
    { id: 'marks', label: '道痕' }
  ]

  const celTabRows = computed(() => CEL_TABS.map(t => ({ ...t, dot: t.id === 'exped' && !!endgame.worldRun })))

  /** 剑道:当前剑意层数与纯度构成 */
  const swordInfo = computed(() => {
    if (endgame.daoPath !== 'sword') return null
    return swordPurity(player.finalStats.mods, inventory.currentArtifacts.length, detectBuild(player.finalStats.mods))
  })

  /** 道途选择二段式:先弹确认;一世只定一次,误触即锁死到转世 */
  const pendingDaoId = ref<(typeof DAO_PATHS)[number]['id'] | null>(null)
  const pendingDao = computed(() => (pendingDaoId.value ? daoPathDef(pendingDaoId.value) : undefined))
  const pendingMark = computed(() => (pendingDaoId.value ? daoMark(pendingDaoId.value) : undefined))

  function pickDao(id: (typeof DAO_PATHS)[number]['id']): void {
    pendingDaoId.value = id
  }

  function confirmDao(): void {
    if (pendingDaoId.value) chooseDaoPath(pendingDaoId.value)
    pendingDaoId.value = null
  }

  const expedition = ref<ReportView | null>(null)

  /**
   * 开战报,判定归因只此一处:远征带构筑厚度(见 core/gauntlet.celestialJudgementLines);
   * 试炼/变数/忆战/重写/挑战照敌人快照上的来源说明(worldFoeSnap 一路带下来)。
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

  /** 道途行为叙事(本世道痕 ≥2 则方语) */
  const daoStory = computed(() => currentDaoNarrative())

</script>
