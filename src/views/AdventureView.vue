<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 历练中 -->
    <template v-if="adventure.sessionActive">
      <CombatPanel />
    </template>

    <!-- 选择区域 -->
    <template v-else>
      <!-- 短期秘境(Phase 31 S3):一次性、随机规则、3 层探索 -->
      <div v-if="realmUnlocked" class="card-ink flex items-center gap-3 border-violet-ink/30 px-4 py-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-ink/15 text-violet-ink">
          <GameIcon name="sparkles" :size="18" />
        </span>
        <div class="min-w-0 grow">
          <p class="font-kai text-[14px] tracking-[0.2em] text-ink">
            秘 境
            <span v-if="realmState" class="ml-1 text-[11px] text-violet-ink">· {{ realmState.layer }} 层行进中</span>
          </p>
          <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
            进入一次、规则随机、结束后消失。适合想找点新鲜刺激的时候。
          </p>
          <p v-if="realmState" class="mt-1 text-[10px] text-azure">规则:{{ realmState.rules.join(' · ') }}</p>
        </div>
        <button v-if="!realmState" class="btn-seal shrink-0 px-3! py-1.5! text-[12px]!" @click="enterRealm()">探 秘</button>
        <button v-else class="btn-ghost shrink-0 px-3! py-1.5! text-[12px]!" @click="abandonRealm()">离 开</button>
      </div>

      <SectionTitle title="历练" hint="行万里路,炼一颗心" />
      <div class="space-y-2.5">
        <div
          v-for="row in visibleRows"
          :key="row.def.id"
          class="card-ink px-4 py-3"
          :class="{ 'opacity-70': !row.unlocked, 'border-gold-ink/30! bg-gold-ink/5': row.suppressed }"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-md"
              :class="row.suppressed ? 'bg-gold-ink/15 text-gold-ink' : row.unlocked ? 'bg-indigo-ink/10 text-indigo-ink' : 'bg-ink/6 text-ink-ghost'"
            >
              <GameIcon :name="row.suppressed ? 'shield-check' : row.unlocked ? row.def.icon : 'lock'" :size="18" />
            </span>
            <div class="min-w-0 grow">
              <p class="flex items-center gap-2">
                <span class="font-kai text-[15px] tracking-wider text-ink">{{ row.def.name }}</span>
                <span v-if="row.suppressed && !row.revived" class="chip-ink border-gold-ink/60 text-[9px] text-gold-ink">已镇压</span>
                <span v-else-if="row.revived" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">妖气复聚</span>
                <span v-else-if="row.cleared" class="chip-ink border-jade/60 text-[9px] text-jade">已靖</span>
                <!-- 世界记忆(Phase 30.9):区域兴衰状态 -->
                <span
                  v-if="!row.suppressed && row.recall.prosperity !== 'chaos'"
                  class="chip-ink text-[9px]"
                  :class="row.recall.prosperity === 'flourish' ? 'border-azure/60 text-azure' : 'border-jade/60 text-jade'"
                >
                  {{ prosperityName(row.recall.prosperity) }}
                </span>
              </p>
              <p class="mt-0.5 text-[11px] text-ink-faint">
                {{ REALMS[row.def.minRealm]?.name }}境相宜 ·
                <span :class="row.def.danger >= 4 ? 'text-cinnabar' : ''">{{ DANGER_NAMES[row.def.danger] }}</span>
                <span v-if="row.tooHard" class="ml-1 text-cinnabar">· 境界尚浅,恐有性命之忧</span>
              </p>
            </div>
            <button v-if="row.unlocked && (!row.suppressed || row.revived)" class="btn-seal shrink-0 px-4! py-2! text-[13px]!" @click="chooseMode(row.def)">出发</button>
            <div v-else-if="row.suppressed" class="shrink-0 text-right">
              <span class="block text-[11px] text-gold-ink">
                自动产出中 · {{ rateText(row.def) }}/时
              </span>
              <button
                class="mt-1 text-[10px] text-ink-faint underline underline-offset-2 active:text-ink"
                @click.stop="unsuppress(row.def.id)"
              >
                解除镇压,再历此地
              </button>
            </div>
          </div>
          <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">
            <template v-if="row.unlocked">{{ row.def.desc }}</template>
            <template v-else>需先击败{{ prevRegionName(row.def) }}之主,方可踏足此地。</template>
          </p>
          <div v-if="row.unlocked && (row.chips.length || row.adaptation)" class="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              v-for="chip in row.chips"
              :key="chip.trait"
              class="chip-ink text-[10px]!"
              :class="chip.level >= 3 ? 'border-cinnabar/50 text-cinnabar' : 'border-ink/25 text-ink-faint'"
            >
              {{ chip.name }}·{{ ECO_LEVEL_NAMES[chip.level] }}
            </span>
            <span v-if="row.adaptation" class="ml-auto text-[10px] text-ink-soft tabular" :title="row.adaptation.reasons.join(';')">
              适配
              <span class="text-gold-ink">{{ starsText(row.adaptation.stars) }}</span>
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- 模式选择 + 战斗前预览 -->
    <BaseModal :open="modeTarget !== null" :title="modeTarget?.name ?? ''" @close="modeTarget = null">
      <!-- 适配预览 -->
      <div v-if="preview" class="mb-3 rounded-md bg-ink/4 px-3 py-2.5">
        <template v-if="preview.mine && currentBuild">
          <p class="flex items-center justify-between text-[12px]">
            <span class="text-ink-soft">
              当前构筑:
              <span class="font-kai text-ink">{{ currentBuild.displayName }}</span>
            </span>
            <span class="tabular text-gold-ink">{{ starsText(preview.mine.stars) }}</span>
          </p>
          <p v-for="(r, i) in preview.mine.reasons" :key="i" class="mt-0.5 text-[10px] text-ink-faint">{{ r }}</p>
        </template>
        <p v-else class="text-[11px] text-ink-faint">尚未成流派,此地对各路数一视同仁。</p>
        <div class="ink-divider my-2" />
        <p class="text-[10px] text-ink-faint">此地相性(机制契合度,并非胜率):</p>
        <p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span v-for="rec in preview.recs" :key="rec.style.id" class="text-[11px] text-ink-soft tabular">
            {{ rec.style.name }}
            <span class="text-gold-ink">{{ starsText(rec.adaptation.stars) }}</span>
          </span>
        </p>
        <p class="mt-1.5 text-[10px] text-ink-ghost tabular">
          战力 {{ formatGN(player.finalStats.power) }} · 装备成色、词条与临场随机仍定成败
        </p>
      </div>
      <p class="text-[12px] text-ink-faint">此行欲作何打算?</p>
      <div class="mt-3 space-y-2">
        <button
          v-for="m in MODE_LIST"
          :key="m.id"
          class="flex w-full items-center justify-between rounded-lg border border-ink/20 px-4 py-3 text-left active:scale-98 active:bg-ink/5"
          @click="begin(m.id)"
        >
          <span>
            <span class="font-kai text-[14px] tracking-widest text-ink">{{ EXPLORE_MODES[m.id].name }}</span>
            <span class="ml-2 text-[11px]" :class="m.id === 'risky' ? 'text-cinnabar' : 'text-ink-faint'">{{ m.risk }}</span>
          </span>
          <span class="text-right text-[11px] text-ink-faint tabular">
            {{ formatDuration(EXPLORE_MODES[m.id].durationSec) }}
            <br />
            收益 ×{{ EXPLORE_MODES[m.id].rewardMult }}
          </span>
        </button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ExploreMode, RegionDef } from '@/types'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { REGIONS, regionDef, DANGER_NAMES } from '@/data/regions'
  import { REALMS } from '@/data/realms'
  import { EXPLORE_MODES } from '@/data/constants'
  import { startExploration } from '@/core/exploration'
  import { stoneByTier } from '@/core/formulas'
  import { regionRecallFor, prosperityName, isReviving } from '@/core/worldMemory'
  import { createSecretRealm, abandonRealm, currentRealm, realmUnlock } from '@/core/secretRealm'
  import { detectBuild } from '@/core/buildDetect'
  import { detectionAdaptation, ecologyChips, ECO_LEVEL_NAMES, recommendForRegion, regionEcology, starsText } from '@/core/buildAdvisor'
  import { formatDuration, formatGN } from '@/utils/format'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import CombatPanel from '@/components/adventure/CombatPanel.vue'

  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const ui = useUiStore()

  const modeTarget = ref<RegionDef | null>(null)

  const MODE_LIST: { id: ExploreMode; risk: string }[] = [
    { id: 'normal', risk: '安稳' },
    { id: 'deep', risk: '小险' },
    { id: 'risky', risk: '大凶' }
  ]

  const currentBuild = computed(() => detectBuild(player.finalStats.mods))

  // Phase 31 S3 短期秘境
  const realmUnlocked = computed(() => realmUnlock())
  const realmState = computed(() => currentRealm())

  function enterRealm(): void {
    if (!realmUnlocked.value) {
      ui.toast('元婴境方可踏足秘境', 'warn')
      return
    }
    if (realmState.value) {
      ui.toast('秘境已在途中', 'info')
      return
    }
    createSecretRealm()
    ui.toast('秘境开启——规则随机,三朝探宝,量力而行。', 'rare')
  }

  const regionRows = computed(() =>
    REGIONS.map(r => {
      const eco = regionEcology(r)
      const suppressed = player.suppressedRegions.includes(r.id)
      const recall = regionRecallFor(r.id)
      const revived = suppressed && isReviving(player.suppressedSince[r.id], Date.now())
      return {
        def: r,
        unlocked: adventure.unlocked.includes(r.id),
        cleared: adventure.cleared.includes(r.id),
        suppressed,
        revived,
        recall,
        tooHard: r.minRealm > player.major,
        // 第一层信息:只保留最强的两个生态标签
        chips: ecologyChips(eco).slice(0, 2),
        adaptation: currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
      }
    })
  )

  /** 出发预览:当前构筑适配 + 推荐方向 */
  const preview = computed(() => {
    if (!modeTarget.value) return null
    const eco = regionEcology(modeTarget.value)
    const mine = currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
    const recs = recommendForRegion(modeTarget.value).slice(0, 2)
    return { mine, recs }
  })

  /** 只展示到「第一个未解锁」为止再多一个,保持神秘感 */
  const visibleRows = computed(() => {
    const rows = regionRows.value
    const firstLocked = rows.findIndex(r => !r.unlocked)
    return firstLocked < 0 ? rows : rows.slice(0, firstLocked + 1)
  })

  function chooseMode(region: RegionDef): void {
    modeTarget.value = region
  }

  function begin(mode: ExploreMode): void {
    if (!modeTarget.value) return
    if (startExploration(modeTarget.value.id, mode)) {
      modeTarget.value = null
    }
  }

  function prevRegionName(r: RegionDef): string {
    return r.requireCleared ? (regionDef(r.requireCleared)?.name ?? '') : ''
  }

  /** 解除镇压,恢复主动历练 */
  function unsuppress(regionId: string): void {
    player.unsuppressRegion(regionId)
    const r = regionDef(regionId)
    ui.toast(`你已解除对${r?.name ?? '此地'}的镇压,此方妖邪再度骚动`, 'info')
  }

  /** 镇压区域每小时灵石产出速率(展示给玩家) */
  function rateText(r: RegionDef): string {
    const yieldPerHour = stoneByTier(r.tier, 150) // SUPPRESS_YIELD_PER_HOUR.stoneMultiplier
    return formatGN(yieldPerHour)
  }
</script>
