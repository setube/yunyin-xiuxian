<template>
  <!-- 进行中的远征 -->
  <section v-if="run && runWorld">
    <SectionTitle :title="`远征 · ${runWorld.name}`" :hint="runPact ? `契约「${runPact.name}」` : '未立契约'" />
    <div class="card-ink mt-2 px-4 py-3">
      <div class="mb-2 flex items-center gap-1.5">
        <template v-for="(s, i) in RUN_STAGES" :key="s">
          <span v-if="i > 0" class="h-px min-w-3 grow transition-colors" :class="i <= run.layer ? 'bg-cinnabar/45' : 'bg-ink/15'" />
          <span
            class="flex items-center gap-1 text-[10px]"
            :class="i < run.layer ? 'text-ink-soft' : i === run.layer ? 'font-kai text-cinnabar' : 'text-ink-faint'"
          >
            <span
              class="inline-block h-1.5 w-1.5 rounded-full"
              :class="i < run.layer ? 'bg-ink-soft/70' : i === run.layer ? 'bg-cinnabar animate-breathe' : 'border border-ink/30'"
            />
            {{ s }}
          </span>
        </template>
      </div>
      <p class="text-[11px] text-ink-faint tabular">
        已历 {{ run.rows.length }} 战 · 沿途道源 +{{ run.bonus }} · 携血 {{ Math.round(run.carriedHpPct * 100) }}%
        <template v-if="run.winStacks && (endgame.daoPath === 'sword' || endgame.daoPath === 'slaughter')">
          · {{ endgame.daoPath === 'sword' ? '剑意' : '杀意' }} {{ run.winStacks }} 层
        </template>
      </p>
      <div class="mt-1.5 space-y-1">
        <p v-for="(row, i) in run.rows" :key="i" class="flex justify-between text-[11px]">
          <span :class="row.win ? 'text-ink-soft' : 'text-cinnabar'">
            第{{ i + 1 }}战 {{ row.foeName }} · {{ row.win ? '胜' : '负' }}
          </span>
          <span class="tabular text-ink-faint">{{ row.rounds }}回合 · 余血{{ Math.round(row.hpLeftPct * 100) }}%</span>
        </p>
      </div>
      <div class="ink-divider my-2.5" />
      <!-- 择路 -->
      <template v-if="run.layer < EXPEDITION_ROUTE_LAYERS && currentNodes">
        <p class="mb-1.5 text-[11px] text-ink-faint">第 {{ run.layer + 1 }} 重 · 两径择一</p>
        <div class="stagger-in grid grid-cols-2 gap-2">
          <button
            v-for="(node, i) in currentNodes"
            :key="node.id"
            class="rounded-md border border-ink/15 bg-paper-deep/60 px-2.5 py-2 text-left active:scale-98"
            @click="pickNode(i as 0 | 1)"
          >
            <p class="font-kai text-[13px] text-ink">{{ node.name }}</p>
            <p class="mt-0.5 text-[10px] text-ink-faint">{{ node.desc }}</p>
            <p class="mt-1 text-[10px] text-cinnabar">险:{{ node.riskText }}</p>
            <p class="text-[10px] text-gold-ink tabular">道源 +{{ node.bonus }}</p>
            <p v-if="nodePreviews[i]" class="mt-0.5 text-[10px] text-violet-ink">天机:{{ nodePreviews[i]!.winText }}</p>
          </button>
        </div>
      </template>
      <!-- 界主 -->
      <template v-else-if="run.layer === EXPEDITION_GUARDIAN_LAYER">
        <p class="mb-1.5 text-[11px] text-ink-faint">界主临阵</p>
        <p v-if="guardianPreview" class="mb-1.5 text-[10px] text-violet-ink">
          天机:{{ guardianPreview.winText }} · {{ guardianPreview.skillLines.join(' / ') }}
        </p>
        <button class="btn-seal w-full !py-2 !text-[13px] pulse-ready animate-glow-pulse" @click="fightBoss">
          决战 · {{ runWorld.guardian.name }}
        </button>
      </template>
      <button
        v-if="!abandonConfirm"
        class="btn-ghost mt-2 w-full !py-2 !text-[11px] !text-ink-faint"
        @click="abandonConfirm = true"
      >
        中道而返(道源不退)
      </button>
      <div v-else class="mt-2 grid grid-cols-2 gap-2">
        <button class="btn-ghost !py-2 !text-[11px] !text-ink-soft" @click="abandonConfirm = false">再想想</button>
        <button class="btn-seal !py-2 !text-[11px]" @click="abandonRun">
          确认返还(不可逆)
        </button>
      </div>
    </div>
  </section>

  <!-- 特殊世界 -->
  <section>
    <SectionTitle title="特殊规则世界" />
    <div class="mt-2 space-y-2.5">
      <div v-for="world in CELESTIAL_WORLDS" :key="world.id" class="card-ink px-4 py-3">
        <p class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-indigo-ink font-kai text-[15px] seal-face">
            {{ world.seal }}
          </span>
          <span class="font-kai text-[15px] tracking-widest text-ink">{{ world.name }}</span>
          <span v-if="endgame.worldClears[world.id]" class="chip-ink border-jade/60 text-[9px] text-jade">
            已破 ×{{ endgame.worldClears[world.id] }}
          </span>
          <span class="ml-auto tabular text-[11px] text-ink-faint">入界+{{ cnNumber(EXPEDITION_ROUTE_LAYERS) }}重+界主</span>
        </p>
        <!-- 敌人按本界锚点层级定标(见 gauntlet.celestialAnchor),未至此境受境界压制(守关者额外增伤) -->
        <p class="mt-0.5 text-[10px]" :class="player.major < anchorMajorOf(world.anchorTier) ? 'text-cinnabar' : 'text-ink-faint'">
          此界宜 {{ REALMS[anchorMajorOf(world.anchorTier)]?.name ?? '' }} 及以上
          <template v-if="player.major < anchorMajorOf(world.anchorTier)"> · 受境界压制</template>
        </p>
        <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ world.desc }}</p>
        <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
          <span v-for="(r, i) in world.ruleText" :key="i">{{ r }}</span>
        </p>
        <button
          class="btn-seal mt-2.5 w-full !py-2 !text-[13px]"
          :disabled="busy !== null || endgame.daoSource < world.entryCost"
          :title="busy?.reason ?? (endgame.daoSource < world.entryCost ? `道源尚差 ${daoSourceShortText(world.entryCost, endgame.daoSource)}` : undefined)"
          @click="openPrep(world.id)"
        >
          {{ busy ? busy.reason : endgame.daoSource < world.entryCost ? `启 程(道源尚差 ${daoSourceShortText(world.entryCost, endgame.daoSource)} · 需 ${world.entryCost} · 余 ${formatNum(endgame.daoSource)})` : `启 程(道源 ${world.entryCost} · 余 ${formatNum(endgame.daoSource)} · 破界底赏 ${world.rewardDaoSource})` }}
        </button>
      </div>

      <!-- 虚界之门:程序化生成 + 裁判过审 -->
      <div class="card-ink border border-violet-ink/25 px-4 py-3">
        <p class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-violet-ink font-kai text-[15px] seal-face">
            {{ endgame.voidWorld?.seal ?? '虚' }}
          </span>
          <span class="font-kai text-[15px] tracking-widest text-ink">
            虚界之门
            <template v-if="endgame.voidWorld">· {{ endgame.voidWorld.name }}</template>
          </span>
          <span v-if="endgame.worldClears['void']" class="chip-ink border-jade/60 text-[9px] text-jade">
            已破 ×{{ endgame.worldClears['void'] }}
          </span>
        </p>
        <template v-if="endgame.voidWorld">
          <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{{ endgame.voidWorld.desc }}</p>
          <p class="mt-1 flex flex-wrap gap-x-3 text-[10px] text-violet-ink">
            <span v-for="(r, i) in endgame.voidWorld.ruleText" :key="i">{{ r }}</span>
          </p>
          <p class="mt-1 text-[10px] text-ink-faint">
            盘踞:{{ endgame.voidWorld.foes.map(f => f.name).join('、') }} · 界主「{{ endgame.voidWorld.guardian.name }}」
          </p>
          <div class="mt-2.5 flex gap-2">
            <button
              class="btn-seal flex-1 !py-2 !text-[13px]"
              :disabled="busy !== null || endgame.daoSource < endgame.voidWorld.entryCost"
              :title="busy?.reason ?? (endgame.daoSource < endgame.voidWorld.entryCost ? `道源尚差 ${daoSourceShortText(endgame.voidWorld.entryCost, endgame.daoSource)}` : undefined)"
              @click="openPrep('void')"
            >
              {{ busy ? busy.reason : endgame.daoSource < endgame.voidWorld.entryCost ? `启 程(道源尚差 ${daoSourceShortText(endgame.voidWorld.entryCost, endgame.daoSource)} · 需 ${endgame.voidWorld.entryCost} · 余 ${formatNum(endgame.daoSource)})` : `启 程(道源 ${endgame.voidWorld.entryCost} · 余 ${formatNum(endgame.daoSource)} · 破界底赏 ${endgame.voidWorld.rewardDaoSource})` }}
            </button>
            <button
              class="btn-ghost !px-3 !text-[12px]"
              :disabled="busy !== null || endgame.daoSource < VOID_REROLL_COST"
              :title="busy?.reason ?? (endgame.daoSource < VOID_REROLL_COST ? `道源尚差 ${daoSourceShortText(VOID_REROLL_COST, endgame.daoSource)}` : undefined)"
              @click="rerollVoidWorld()"
            >{{ endgame.daoSource < VOID_REROLL_COST ? `再窥(尚差${daoSourceShortText(VOID_REROLL_COST, endgame.daoSource)})` : `再窥(${VOID_REROLL_COST})` }}</button>
          </div>
        </template>
        <template v-else>
          <button
            class="btn-ghost mt-2.5 w-full !py-2 !text-[12px]"
            :disabled="busy !== null || endgame.daoSource < VOID_REROLL_COST"
            :title="busy?.reason ?? (endgame.daoSource < VOID_REROLL_COST ? `道源尚差 ${daoSourceShortText(VOID_REROLL_COST, endgame.daoSource)}` : undefined)"
            @click="rerollVoidWorld()"
          >
            {{ endgame.daoSource < VOID_REROLL_COST ? `窥探虚界(尚差${daoSourceShortText(VOID_REROLL_COST, endgame.daoSource)})` : `窥探虚界(道源 ${VOID_REROLL_COST})` }}
          </button>
        </template>
      </div>
    </div>
  </section>

  <!-- 远征准备:择契 -->
  <BaseModal :open="prepWorld !== null" :title="prepWorld ? `远征 · ${prepWorld.name}` : ''" @close="prepWorldId = null">
    <template v-if="prepWorld">
      <p class="text-[11px] leading-relaxed text-ink-faint">立契</p>
      <div class="mt-2 space-y-1.5">
        <button
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
          :class="prepPact === null ? 'bg-jade/10 border border-jade/40' : 'bg-paper-deep/60 border border-transparent'"
          :aria-pressed="prepPact === null"
          @click="prepPact = null"
        >
          <span class="text-[12px] text-ink-soft">不立契约</span>
          <span class="ml-auto text-[10px] text-ink-faint">道源 ×1.0</span>
        </button>
        <button
          v-for="pact in PACTS"
          :key="pact.id"
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left"
          :class="[
            pactMark(pact.id) ? `pact-weight-${pactMark(pact.id)!.weight}` : '',
            prepPact === pact.id ? 'bg-cinnabar/10 border border-cinnabar/40' : 'bg-paper-deep/60 border border-transparent'
          ]"
          :aria-pressed="prepPact === pact.id"
          :aria-label="pactMark(pact.id)?.label ?? pact.name"
          @click="prepPact = pact.id"
        >
          <!-- 印 + 契纹并排:六张契形状各不相同,不必逐个读倍数 -->
          <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-ink/80 font-kai text-[11px] text-paper">{{ pact.seal }}</span>
          <span
            v-if="pactMark(pact.id)"
            class="pact-crest h-4 w-4 shrink-0 text-ink-faint"
            :class="`pact-crest--${pactMark(pact.id)!.crest}`"
            aria-hidden="true"
          />
          <span class="min-w-0">
            <span class="block font-kai text-[12px] text-ink">{{ pact.name }}</span>
            <span class="block text-[10px] text-ink-faint">{{ pact.ruleText }}</span>
          </span>
        </button>
      </div>
      <!-- 奇门遁甲:择门免费,不碰道源倍数。八门按洛书九宫摆位 —— 九宫是位置信息,竖排读不出来 -->
      <div class="mt-3 flex items-baseline justify-between gap-2">
        <p class="text-[11px] leading-relaxed text-ink-faint">奇门 · 择门入界 · 免费</p>
        <button
          class="shrink-0 rounded-md border px-2 py-1 text-[10px]"
          :class="prepGate === null ? 'border-jade/40 bg-jade/10 text-ink-soft' : 'border-ink/20 text-ink-faint'"
          :aria-pressed="prepGate === null"
          @click="prepGate = null"
        >
          常道
        </button>
      </div>
      <div class="gate-board mt-1.5">
        <button
          v-for="cell in palaceBoard()"
          :key="cell.palace"
          class="gate-palace text-center"
          :class="[
            cell.gate ? '' : 'gate-palace--void',
            cell.gate ? `gate-kind-${gateKindMark(cell.gate.kind).shape}` : '',
            cell.gate && prepGate === cell.gate.id ? 'gate-palace--picked' : ''
          ]"
          :disabled="!cell.gate"
          :aria-pressed="cell.gate ? prepGate === cell.gate.id : undefined"
          :aria-label="cell.gate ? `${cell.gate.fullName}(${cell.gate.kind}) · ${cell.gate.palace}宫` : `第 ${cell.palace} 宫无门`"
          :title="
            cell.gate
              ? `${cell.gate.fullName}(${cell.gate.kind}) · ${cell.gate.gua}${cell.gate.direction}${cell.gate.palace}宫 —— ${cell.gate.desc}`
              : undefined
          "
          @click="cell.gate && (prepGate = cell.gate.id)"
        >
          <span class="gate-palace__no">{{ cell.palace }}</span>
          <template v-if="cell.gate">
            <span class="font-kai text-[15px] leading-none" :class="cell.gate.kind === '凶' ? 'text-cinnabar' : cell.gate.kind === '吉' ? 'text-jade' : 'text-ink-soft'">
              {{ cell.gate.name }}
            </span>
            <span class="text-[9px] leading-none text-ink-faint">{{ cell.gate.kind }}</span>
          </template>
          <span v-else class="text-[9px] leading-none text-ink-faint">无门</span>
        </button>
      </div>
      <p v-if="selectedGate" class="mt-1.5 rounded-md bg-paper-deep/70 px-3 py-2 text-[10px] leading-relaxed text-ink-soft">
        <span class="font-kai text-ink">{{ selectedGate.fullName }}</span>
        <span class="text-ink-faint"> · {{ selectedGate.gua }}{{ selectedGate.direction }}{{ selectedGate.palace }}宫 · {{ selectedGate.kind }}</span>
        <br />
        {{ selectedGate.desc }}
        <!-- 数值与结算同源(进 resolveCombat 的数);上一句只是散文 -->
        <br />
        <span class="tabular text-ink-faint">{{ gateRuleSummary(selectedGate.rules) }}</span>
        <br />
        <span class="text-ink-faint">{{ selectedGate.gist }}</span>
      </p>
      <div v-if="prepForecast" class="mt-2.5 rounded-md bg-paper-deep/70 px-3 py-2">
        <p class="flex items-center justify-between text-[11px]">
          <span class="font-kai text-ink-soft">天道推演</span>
          <span class="tabular text-ink-soft">此行 {{ prepForecast.difficulty }}</span>
        </p>
        <p class="mt-0.5 flex items-center justify-between text-[10px] text-ink-faint">
          <span>
            构筑相性
            <span class="text-gold-ink">{{ prepForecast.stars }}</span>
          </span>
          <span>可行流派 {{ prepForecast.viableStyles }}/{{ BUILD_PROFILES.length }}</span>
        </p>
        <!-- 敌方判定(道之理解 / 境界压制):文案与数值同源 core/gauntlet.celestialJudgementLines,界面不另编 -->
        <p v-for="(line, i) in prepForecast.judgementLines" :key="i" class="mt-0.5 text-[10px] leading-relaxed text-cinnabar">
          {{ line }}
        </p>
      </div>
      <p v-if="prepPreview" class="mt-2 text-[10px] leading-relaxed text-violet-ink">
        天机透视 · 入界之敌:{{ prepPreview.skillLines.join(' / ') }} —— {{ prepPreview.winText }}
      </p>
      <p v-if="prepPreview?.riskLines.length" class="mt-1 text-[10px] leading-relaxed text-cinnabar">
        危局:{{ prepPreview.riskLines.join(';') }}
      </p>
    </template>
    <template #footer>
      <button class="btn-seal w-full" @click="depart">启 程{{ selectedPact ? `(携「${selectedPact.name}」)` : '' }}</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useEndgameStore } from '@/stores/endgame'
  import { useAdventureStore } from '@/stores/adventure'
  import { REALMS } from '@/data/realms'
  import { tierMajor } from '@/core/formulas'
  import { CELESTIAL_WORLDS, EXPEDITION_GUARDIAN_LAYER, EXPEDITION_ROUTE_LAYERS } from '@/data/endgame'
  import { PACTS, pactDef } from '@/data/pacts'
  import { pactMark } from '@/ui/pactMark'
  import { gateDef } from '@/data/qimen'
  import { gateKindMark, palaceBoard } from '@/ui/gateBoard'
  import { gateRuleSummary } from '@/core/gateRuleText'
  import {
    abandonExpedition,
    challengeGuardian,
    chooseRouteNode,
    forecastExpedition,
    previewFight,
    rerollVoidWorld,
    resolveWorld,
    startWorldExpedition,
    VOID_REROLL_COST,
    type StepOutcome
  } from '@/core/expedition'
  import { BUILD_PROFILES } from '@/core/buildSim'
  import { cnNumber, formatNum } from '@/utils/format'
  import { daoSourceShortText } from '@/core/daoSource'
  import { endgameBusy } from '@/core/endgameActivity'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import type { ReportView } from '@/components/celestial/BattleReportDialog.vue'

  /**
   * 远征册:在途行程 / 特殊规则世界 / 虚界之门 + 准备弹窗;确认态归本册,宿主不代管。
   * 开战结果经 emit('report') 交宿主统一判定归因(openReport 只此一处)。
   */
  const emit = defineEmits<{ report: [ReportView] }>()
  const player = usePlayerStore()
  const endgame = useEndgameStore()
  const adventure = useAdventureStore()
  const busy = computed(() => endgameBusy(endgame.worldRun, player.secretRealm, adventure.session))

  /** 锚点层级所在境界;「此界宜 X 及以上」用它,不在模板里手写境界名 */
  function anchorMajorOf(anchorTier: number): number {
    return tierMajor(anchorTier)
  }

  /** 行程点列:择路各重 + 界主,层数与 EXPEDITION_* 同源 */
  const RUN_STAGES = [
    ...Array.from({ length: EXPEDITION_ROUTE_LAYERS }, (_, i) => `${cnNumber(i + 1)}重`),
    '界主'
  ]

  // ---- 远征准备 ----
  const prepWorldId = ref<string | null>(null)
  const prepPact = ref<string | null>(null)
  /** 奇门遁甲:所择之门(常道 = null) */
  const prepGate = ref<string | null>(null)
  const selectedGate = computed(() => (prepGate.value ? gateDef(prepGate.value) : undefined))
  const prepWorld = computed(() => (prepWorldId.value ? resolveWorld(prepWorldId.value) : null))
  const selectedPact = computed(() => (prepPact.value ? pactDef(prepPact.value) : undefined))
  const prepPreview = computed(() =>
    prepWorld.value
      ? previewFight(prepWorld.value.foes[0]!, undefined, undefined, {
          worldId: prepWorldId.value!,
          pactId: prepPact.value,
          gateId: prepGate.value
        })
      : null
  )
  /** 天道赌约:整程预估 */
  const prepForecast = computed(() =>
    prepWorldId.value ? forecastExpedition(prepWorldId.value, prepPact.value, prepGate.value) : null
  )

  function openPrep(id: string): void {
    prepWorldId.value = id
    prepPact.value = null
  }

  // ---- 进行中远征 ----
  const run = computed(() => endgame.worldRun)
  const runWorld = computed(() => (run.value ? (resolveWorld(run.value.worldId) ?? null) : null))
  const runPact = computed(() => (run.value?.pactId ? pactDef(run.value.pactId) : undefined))
  const currentNodes = computed(() => {
    if (!run.value || !runWorld.value || run.value.layer >= EXPEDITION_GUARDIAN_LAYER) return null
    return runWorld.value.routes[run.value.layer] ?? null
  })
  const nodePreviews = computed(() => (currentNodes.value ? currentNodes.value.map(n => previewFight(n.foe, n)) : []))
  const guardianPreview = computed(() => (run.value?.layer === EXPEDITION_GUARDIAN_LAYER && runWorld.value ? previewFight(runWorld.value.guardian) : null))

  function handleOutcome(outcome: StepOutcome | null, title: string): void {
    if (!outcome || outcome.type === 'advance') return
    const rows = outcome.finalRows ?? [outcome.row]
    emit('report', {
      title,
      cleared: outcome.type === 'cleared',
      markText:
        outcome.type === 'cleared'
          ? `全程 ${rows.length} 战功成`
          : outcome.type === 'pactBroken'
            ? `契约崩碎于第 ${rows.length} 战`
            : `止步第 ${rows.length} 战`,
      rows,
      reward: outcome.rewardDaoSource,
      judgementLines: outcome.judgementLines
    })
  }

  function depart(): void {
    if (!prepWorld.value) return
    const title = prepWorld.value.name
    const outcome = startWorldExpedition(prepWorld.value.id, prepPact.value, prepGate.value)
    if (outcome) prepWorldId.value = null
    handleOutcome(outcome, title)
  }

  /** 战报标题须在开战前取:被逐/出界会把 worldRun 清成 null */
  function titleOfRun(): string {
    return runWorld.value?.name ?? '远征'
  }

  function pickNode(i: 0 | 1): void {
    const title = titleOfRun()
    handleOutcome(chooseRouteNode(i), title)
  }

  function fightBoss(): void {
    const title = titleOfRun()
    handleOutcome(challengeGuardian(), title)
  }

  /** 中道而返二步确认:沿途道源与推进全失,留一记殁痕 */
  const abandonConfirm = ref(false)
  function abandonRun(): void {
    abandonConfirm.value = false
    abandonExpedition()
  }
</script>
