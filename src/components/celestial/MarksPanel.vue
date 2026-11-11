<template>
  <section>
    <SectionTitle title="道痕" :hint="`${endgame.marks.length} 则`" />
    <div class="mt-2 flex items-center justify-between px-1">
      <p class="text-[10px] tabular text-ink-faint">
        纪元 {{ RULESET_VERSION }} · 变更 {{ RULESET_CHANGELOG.length }} 回
      </p>
      <button class="-my-1 py-2 font-kai text-[10px] text-azure active:scale-90" @click="openEra(null)">
        纪元变迁史 →
      </button>
    </div>
    <div v-if="legacy.length" class="card-ink mt-2 px-4 py-3">
      <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">今昔之比</p>
      <div v-for="lc in legacy" :key="lc.targetName" class="mb-2 last:mb-0">
        <p class="text-[12px] text-ink-soft tabular">
          {{ lc.targetName }}:第{{ lc.earlyLife }}世({{ lc.earlyBuild }}){{ lc.earlyText }}
          <span class="mx-1 text-ink-faint">→</span>
          第{{ lc.lateLife }}世({{ lc.lateBuild }})
          <span class="text-jade">{{ lc.lateText }}</span>
        </p>
        <p v-if="lc.diffLines.length" class="text-[10px] text-azure tabular">{{ lc.diffLines.join(' · ') }}</p>
      </div>
    </div>
    <div v-if="endgame.marks.length" class="card-ink mt-2 max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
      <!-- 行键按痕本身:新痕插头部,用行号会让确认态错位 -->
      <div
        v-for="row in markRows"
        :key="`${row.mark.at}|${row.mark.targetId}|${row.mark.life}`"
        class="flex items-center gap-2 py-2"
      >
        <span class="shrink-0 font-kai text-[11px] text-ink-faint">第{{ row.mark.life }}世</span>
        <!-- 道途符纹:与天界「道途」页同一套(见 ui/daoMark),历世翻看时认得出是哪条路。
             符纹画在独立的小方徽里,不压在道名上。 -->
        <span class="flex shrink-0 items-center gap-1">
          <span
            v-if="row.path"
            class="dao-crest h-3.5 w-3.5 shrink-0"
            :class="`dao-crest--${row.path.crest}`"
            :style="{ color: row.path.tone }"
            aria-hidden="true"
          />
          <span class="text-[11px] text-violet-ink">{{ row.pathName }}</span>
        </span>
        <span class="min-w-0 truncate font-kai text-[12px]" :class="row.mark.cleared ? 'text-ink' : 'text-ink-faint'">
          {{ row.mark.targetName }}{{ row.mark.cleared ? '·破' : '·殁' }}
        </span>
        <span class="ml-auto shrink-0 tabular text-[10px] text-ink-faint">{{ row.mark.rounds }} 回合 · {{ row.mark.buildName }}</span>
        <!--
          这枚「变」的印面只有一个字,读屏原先只念「旧纪 v2」—— 听不出点下去会发生什么。
          它开的是「天道已变」那扇弹窗(记着这一条道痕录于哪一版规则、之后改过什么),
          故名字按「按这个字会看到什么」写:沿革 + 旧纪 + 现在。
        -->
        <button
          v-if="isStaleRuleset(row.mark.ruleset)"
          class="shrink-0 min-h-[28px] rounded border border-cinnabar/50 bg-cinnabar/10 px-1 py-0.5 font-kai text-[9px] text-ink active:scale-90"
          :aria-label="`变 · 旧纪 ${row.mark.ruleset} · 今为 ${RULESET_VERSION}`"
          :title="`旧纪 ${row.mark.ruleset} · 今为 ${RULESET_VERSION}`"
          @click="openEra(row.mark)"
        >
          变
        </button>
        <button
          v-if="row.mark.replay"
          class="shrink-0 min-h-[28px] rounded border border-gold-ink/40 px-1.5 py-0.5 font-kai text-[10px] text-gold-ink active:scale-90"
          :disabled="busy !== null"
          :class="{ 'cursor-not-allowed border-ink/15 text-ink-faint': busy !== null }"
          :aria-label="busy ? busy.reason : '忆战'"
          :title="busy ? busy.reason : '忆战'"
          @click="goReplay(row.mark)"
        >
          忆
        </button>
        <!-- 重写花道源:代价写在按钮上(不靠 hover),二步确认 -->
        <template v-if="row.mark.cleared && row.mark.replay && rewriteConfirm === row.mark">
          <button
            class="shrink-0 min-h-[28px] rounded border border-cinnabar/50 bg-cinnabar/10 px-2 py-1 font-kai text-[10px] text-ink active:scale-90"
            @click="rewriteConfirm = null"
          >
            再想想
          </button>
          <button
            class="shrink-0 min-h-[28px] rounded bg-cinnabar px-2 py-1 font-kai text-[10px] seal-face active:scale-90"
            @click="doRewrite(row.mark)"
          >
            确认重写
          </button>
        </template>
        <button
          v-else-if="row.mark.cleared && row.mark.replay"
          class="shrink-0 min-h-[28px] rounded border border-cinnabar/40 px-2 py-1 font-kai text-[10px] text-cinnabar active:scale-90 disabled:border-ink/15 disabled:text-ink-faint"
          :disabled="busy !== null || endgame.daoSource < REWRITE_ENTRY_COST"
          :title="busy ? busy.reason : endgame.daoSource < REWRITE_ENTRY_COST ? `道源尚差 ${daoSourceShortText(REWRITE_ENTRY_COST, endgame.daoSource)}` : '重写'"
          @click="rewriteConfirm = row.mark"
        >
          {{ busy ? `写(${busy.reason})` : endgame.daoSource < REWRITE_ENTRY_COST ? `写(道源尚差 ${daoSourceShortText(REWRITE_ENTRY_COST, endgame.daoSource)})` : `写(道源${REWRITE_ENTRY_COST} · 破${row.mark.rounds} 回合)` }}
        </button>
      </div>
    </div>
    <p v-else class="card-ink mt-2 px-4 py-5 text-center">
      <span class="empty-seal" aria-hidden="true">白</span>
      <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无道痕</span>
    </p>
  </section>

  <BaseModal :open="eraOpen" title="天道已变" @close="eraOpen = false">
    <p v-if="eraMark" class="text-[11px] leading-relaxed text-ink-soft">
      录于纪元 <span class="tabular text-cinnabar">{{ eraMark.ruleset }}</span> · 今为
      <span class="tabular">{{ RULESET_VERSION }}</span>
    </p>
    <p v-else class="text-[11px] leading-relaxed text-ink-soft">只记规则变更</p>
    <div class="mt-2.5 space-y-2">
      <div v-for="c in eraChanges" :key="c.version" class="card-ink px-3 py-2">
        <p class="font-kai text-[12px] tabular text-cinnabar">纪元 {{ c.version }}</p>
        <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ c.note }}</p>
      </div>
      <p v-if="!eraChanges.length" class="card-ink px-3 py-3 text-center text-[11px] text-ink-faint">
        {{ eraMark ? '此后无变更' : '暂无变更' }}
      </p>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEndgameStore } from '@/stores/endgame'
import { RULESET_CHANGELOG, RULESET_VERSION, isStaleRuleset, rulesetChangesSince } from '@/data/ruleset'
import { daoPathDef } from '@/data/endgame'
import { daoMark } from '@/ui/daoMark'
import { legacyComparisons } from '@/core/compare'
import { replayMark, rewriteMark, REWRITE_ENTRY_COST } from '@/core/endgameService'
import { endgameBusy } from '@/core/endgameActivity'
import { daoSourceShortText } from '@/core/daoSource'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import SectionTitle from '@/components/common/SectionTitle.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import type { ReportView } from '@/components/celestial/BattleReportDialog.vue'

/**
 * 道痕面板:历世履历 / 今昔之比 / 忆战与重写 / 规则纪元变迁。
 * 战报只 emit('report'),由宿主 openReport 统一判定归因,不自己拼 foeOriginLines。
 */
const emit = defineEmits<{ report: [ReportView] }>()
const endgame = useEndgameStore()
/** 在途判据(远征/秘境/历练):与 replayMark / rewriteMark 同一份判据与拒因,前置到按钮 */
const busy = computed(() =>
  endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)
)

// ---- 忆战 ----
function goReplay(mark: (typeof endgame.marks)[number]): void {
  const result = replayMark(mark)
  if (result) {
    emit('report', {
      title: result.title,
      cleared: result.report.cleared,
      markText: result.markText,
      rows: result.report.rows,
      reward: 0
    })
  }
}

// ---- 重写此痕 ----
/**
 * 道痕行:道途符纹、道名各算一次。
 *
 * 同一个行里 `daoMark(mark.daoPathId)` 被调 4 次(有无判断、符纹类名、色 ×2),
 * 而 `daoPathDef` 还要再查一次名字。与 TrialPanel / 丹匣 / 器魂页同法。
 */
const markRows = computed(() =>
  endgame.marks.map(mark => {
    const path = mark.daoPathId ? daoMark(mark.daoPathId) : undefined
    return {
      mark,
      path,
      pathName: mark.daoPathId ? (daoPathDef(mark.daoPathId)?.name ?? '') : '无道'
    }
  })
)

/**
 * 重写确认态:记道痕对象引用,不记行号(新痕插头部,重写本身也补一条新痕)。
 * 列表重建则自动回落未武装。
 */
const rewriteConfirm = ref<(typeof endgame.marks)[number] | null>(null)
function goRewrite(mark: (typeof endgame.marks)[number]): void {
  const result = rewriteMark(mark)
  if (result) {
    emit('report', {
      title: result.title,
      cleared: result.report.cleared,
      markText: result.markText,
      rows: result.report.rows,
      reward: 0
    })
  }
}
function doRewrite(mark: (typeof endgame.marks)[number]): void {
  rewriteConfirm.value = null
  goRewrite(mark)
}

const legacy = computed(() => legacyComparisons(endgame.marks))

// 规则纪元:变迁史同出一源,视图不手抄
const eraOpen = ref(false)
const eraMark = ref<(typeof endgame.marks)[number] | null>(null)
const eraChanges = computed(() => (eraMark.value ? rulesetChangesSince(eraMark.value.ruleset) : RULESET_CHANGELOG))
function openEra(mark: (typeof endgame.marks)[number] | null): void {
  eraMark.value = mark
  eraOpen.value = true
}
</script>
