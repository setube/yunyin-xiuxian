<template>
  <!-- 模式选择 + 战斗前预览 -->
  <BaseModal :open="region !== null" :title="region?.name ?? ''" @close="emit('close')">
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
      <p class="text-[10px] text-ink-faint">此地与你的路数合不合(未必等于胜算):</p>
      <p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span v-for="rec in preview.recs" :key="rec.style.id" class="text-[11px] text-ink-soft tabular">
          {{ rec.style.name }}
          <span class="text-gold-ink">{{ starsText(rec.adaptation.stars) }}</span>
        </span>
      </p>
      <p class="mt-1.5 text-[10px] text-ink-faint tabular">
        战力 {{ formatGN(player.finalStats.power) }} · 装备成色、词条与临场随机仍定成败
      </p>
    </div>
    <!--
      灵兽之性折进了下面三档的「遇险 ×N / 行程」里,却不说是它干的 ——
      换伙伴的决定点在这里,把它的跟脚照实摊开(departButtonText 同表)
    -->
    <p v-if="petTripLine" class="mb-2 text-[10px] leading-relaxed text-violet-ink tabular">{{ petTripLine }}</p>
    <p class="mb-2 text-[10px] leading-relaxed text-ink-faint tabular">
      途中三档:奇缘 {{ tierOddsText('qiyuan', chainPending, departEventChance) }} · 机缘 {{ tierOddsText('jiyuan', chainPending, departEventChance) }} · 际遇 {{ tierOddsText('jingyu', chainPending, departEventChance) }}
    </p>
    <p class="text-[12px] text-ink-faint">此行欲作何打算?</p>
    <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">行程论这一程走多久;「历练遇敌」只令同程妖踪更密,不能缩地成寸。</p>
    <div class="mt-3 space-y-2">
      <button
        v-for="m in MODE_LIST"
        :key="m.id"
        class="flex w-full items-center justify-between rounded-lg border border-ink/20 px-4 py-3 text-left active:scale-98 active:bg-ink/5"
        @click="emit('choose', m.id)"
      >
        <span>
          <span class="font-kai text-[14px] tracking-widest text-ink">{{ EXPLORE_MODES[m.id].name }}</span>
          <span class="ml-2 text-[11px]" :class="m.id === 'risky' || m.id === 'prolonged' ? 'text-cinnabar' : 'text-ink-faint'">{{ m.risk }}</span>
        </span>
        <!--
          收益一直是亮着的,危险却是暗的:三档里敌人差了 2.1 倍,玩家却只看得到钱。
          两个数并排摆出来,「要不要涉险」才是个可算的账。
        -->
        <span class="text-right text-[11px] text-ink-faint tabular">
          {{ departText(m.id) }}
          <span class="block text-[10px] text-gold-ink">{{ departReward(m.id) }}</span>
        </span>
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { ExploreMode, RegionDef } from '@/types'
  import { usePlayerStore } from '@/stores/player'
  import { EXPLORE_MODES } from '@/data/constants'
  import {
    exploreBattleGapSec,
    exploreDurationSec,
    exploreEventChance,
    exploreRewardMult,
    explorationFoeDanger
  } from '@/core/exploration'
  import { currentRegionEvent } from '@/core/regionEvent'
  import { expectedWinReward } from '@/core/loot'
  import { modOf } from '@/core/statsCalc'
  import { pendingChainStages } from '@/core/eventEngine'
  import { tierOddsText } from '@/core/eventTier'
  import { detectBuild } from '@/core/buildDetect'
  import { detectionAdaptation, recommendForRegion, regionEcology, starsText } from '@/core/buildAdvisor'
  import { petDef } from '@/data/pets'
  import { personalityEffects } from '@/core/petPersonality'
  import { departButtonText, petTraitTripLine } from '@/ui/adventureText'
  import { formatGN } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'

  const props = defineProps<{ region: RegionDef | null }>()
  const emit = defineEmits<{
    close: []
    choose: [mode: ExploreMode]
  }>()

  const player = usePlayerStore()

  const MODE_LIST: { id: ExploreMode; risk: string }[] = [
    { id: 'normal', risk: '安稳' },
    { id: 'deep', risk: '小险' },
    { id: 'risky', risk: '大凶' },
    { id: 'prolonged', risk: '极险' }
  ]

  const currentBuild = computed(() => detectBuild(player.finalStats.mods))

  /**
   * 有没有缘在续 —— 三档的稀度**此刻**是多少,取决于这个。
   *
   * 引擎的掷法是先掷奇缘(闸门 0.3,且必须真有该走的下一程)、再掷机缘、
   * 剩下才是际遇;故「际遇约每 6 程」只在无缘在续时成立(有缘在续时约每 9 程,
   * 那三成去了奇缘)。档位胶囊按当前状态显示,而不是报一组永远同时成立的数。
   */
  const chainPending = computed(() => pendingChainStages(player.major).length > 0)

  /**
   * 出发前的当境三档实算率:与途中的「途中三档」同一条乘链(星象/福缘/区域事件
   * eventMult),但按选中地域算 —— 决策点就该看见它,不必等上路才见。
   */
  const departEventChance = computed(() => exploreEventChance(props.region?.id ?? '', player.finalStats.mods))

  /** 出发预览:当前构筑适配 + 推荐方向 */
  const preview = computed(() => {
    if (!props.region) return null
    const eco = regionEcology(props.region)
    const mine = currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
    const recs = recommendForRegion(props.region).slice(0, 2)
    return { mine, recs }
  })

  /** 灵兽之性折进这一行的账(遇险/行程/掉宝/护持,与结算同表) —— 有伴才有一行 */
  const petTripLine = computed(() => {
    if (!player.petId) return ''
    const def = petDef(player.petId)
    if (!def) return ''
    return petTraitTripLine(def.name, personalityEffects(player.petId))
  })

  function departText(mode: ExploreMode): string {
    const region = props.region
    if (!region) return ''
    const eventId = currentRegionEvent(region.id)?.eventId ?? null
    const danger = explorationFoeDanger({
      tier: region.tier,
      mode,
      regionDanger: region.danger,
      petId: player.petId,
      eventId
    }).total
    return departButtonText({
      durationSec: exploreDurationSec(mode, player.petId),
      rewardMult: exploreRewardMult(mode, eventId),
      dangerMult: danger,
      battleGapSec: exploreBattleGapSec(modOf(player.finalStats.mods, 'explorationSpeed'))
    })
  }

  /** 一胜的期望所得(与 afterWin 同公式的均值):给「收益 ×Y」补一把尺子 */
  function departReward(mode: ExploreMode): string {
    const region = props.region
    if (!region) return ''
    const eventId = currentRegionEvent(region.id)?.eventId ?? null
    const r = expectedWinReward(region, exploreRewardMult(mode, eventId))
    return `一胜约 ${formatGN(r.stone)} 石 · ${formatGN(r.exp)} 修为`
  }
</script>
