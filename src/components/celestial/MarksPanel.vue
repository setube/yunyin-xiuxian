<template>
  <!-- 道痕 -->
  <section>
    <SectionTitle title="道痕" :hint="`历代修行履历 · ${endgame.marks.length} 则`" />
    <div class="mt-2 flex items-center justify-between px-1">
      <p class="text-[10px] tabular text-ink-faint">
        天道历 {{ RULESET_VERSION }} 世 · 天地规矩易过 {{ RULESET_CHANGELOG.length }} 回
      </p>
      <button class="-my-1 py-2 font-kai text-[10px] text-azure active:scale-90" @click="openEra(null)">
        纪元变迁史 →
      </button>
    </div>
    <!-- 今昔之比:与过去的自己对话 -->
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
      <!-- 行键按痕本身(落痕时刻 + 目标 + 世数):新痕插头部时,旧行仍认得出自己,
           确认态不跟着行号错位 -->
      <div
        v-for="mark in endgame.marks"
        :key="`${mark.at}|${mark.targetId}|${mark.life}`"
        class="flex items-center gap-2 py-2"
      >
        <span class="shrink-0 font-kai text-[11px] text-ink-faint">第{{ mark.life }}世</span>
        <span class="shrink-0 text-[11px] text-violet-ink">{{ mark.daoPathId ? daoPathDef(mark.daoPathId)?.name : '无道' }}</span>
        <span class="min-w-0 truncate font-kai text-[12px]" :class="mark.cleared ? 'text-ink' : 'text-ink-faint'">
          {{ mark.targetName }}{{ mark.cleared ? '·破' : '·殁' }}
        </span>
        <span class="ml-auto shrink-0 tabular text-[10px] text-ink-faint">{{ mark.rounds }}回合 · {{ mark.buildName }}</span>
        <button
          v-if="isStaleRuleset(mark.ruleset)"
          class="shrink-0 min-h-[28px] rounded border border-cinnabar/50 bg-cinnabar/10 px-1 py-0.5 font-kai text-[9px] text-cinnabar active:scale-90"
          :title="`录于旧纪 ${mark.ruleset},天道已变`"
          @click="openEra(mark)"
        >
          变
        </button>
        <button
          v-if="mark.replay"
          class="shrink-0 min-h-[28px] rounded border border-gold-ink/40 px-1.5 py-0.5 font-kai text-[10px] text-gold-ink active:scale-90"
          :disabled="busy !== null"
          :class="{ 'cursor-not-allowed border-ink/15 text-ink-faint': busy !== null }"
          :title="busy ? busy.reason : '以当年的构筑重打此战'"
          @click="goReplay(mark)"
        >
          忆
        </button>
        <!-- 重写要花道源,代价内联在按钮上(不再是 hover 专属),触控面放大,并加一步确认 -->
        <template v-if="mark.cleared && mark.replay && rewriteConfirm === mark">
          <button
            class="shrink-0 min-h-[28px] rounded border border-cinnabar/50 bg-cinnabar/10 px-2 py-1 font-kai text-[10px] text-cinnabar active:scale-90"
            @click="rewriteConfirm = null"
          >
            再想想
          </button>
          <button
            class="shrink-0 min-h-[28px] rounded bg-cinnabar px-2 py-1 font-kai text-[10px] seal-face active:scale-90"
            @click="doRewrite(mark)"
          >
            确认重写
          </button>
        </template>
        <button
          v-else-if="mark.cleared && mark.replay"
          class="shrink-0 min-h-[28px] rounded border border-cinnabar/40 px-2 py-1 font-kai text-[10px] text-cinnabar active:scale-90 disabled:border-ink/15 disabled:text-ink-faint"
          :disabled="busy !== null || endgame.daoSource < REWRITE_ENTRY_COST"
          :title="busy ? busy.reason : endgame.daoSource < REWRITE_ENTRY_COST ? `道源尚差 ${daoSourceShortText(REWRITE_ENTRY_COST, endgame.daoSource)}` : '以今日之你重打此战,快过旧我之回合即【胜于旧我】'"
          @click="rewriteConfirm = mark"
        >
          {{ busy ? `写($busy.kind === 'expedition' ? '远征在途' : busy.kind === 'exploration' ? '历练在途' : '身在秘境'})` : endgame.daoSource < REWRITE_ENTRY_COST ? `写(尚差${daoSourceShortText(REWRITE_ENTRY_COST, endgame.daoSource)})` : `写(道源${REWRITE_ENTRY_COST} · 破${mark.rounds}回合)` }}
        </button>
      </div>
    </div>
    <p v-else class="card-ink mt-2 px-4 py-5 text-center">
      <span class="empty-seal" aria-hidden="true">白</span>
      <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">此页尚白</span>
      <span class="mt-1 block text-[10px] leading-relaxed text-ink-faint">你在天界的每一战,都会留下痕迹</span>
    </p>
  </section>

  <!-- 天道已变:旧纪道痕为何不能按老眼光看 -->
  <BaseModal :open="eraOpen" title="天道已变" @close="eraOpen = false">
    <p v-if="eraMark" class="text-[11px] leading-relaxed text-ink-soft">
      此战录于规则纪元 <span class="tabular text-cinnabar">{{ eraMark.ruleset }}</span>,今为
      <span class="tabular">{{ RULESET_VERSION }}</span>。同界同契,当年的你依当年的规矩取胜 ——
      如今再忆,规矩已换。
    </p>
    <p v-else class="text-[11px] leading-relaxed text-ink-soft">
      纪元变迁,只记改了规矩的大事变;寻常增减,不记在此册。
    </p>
    <div class="mt-2.5 space-y-2">
      <div v-for="c in eraChanges" :key="c.version" class="card-ink px-3 py-2">
        <p class="font-kai text-[12px] tabular text-cinnabar">纪元 {{ c.version }}</p>
        <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ c.note }}</p>
      </div>
      <p v-if="!eraChanges.length" class="card-ink px-3 py-3 text-center text-[11px] text-ink-faint">
        {{ eraMark ? '此后天道未再改过规矩 —— 当年的打法,今日依旧算数。' : '尚无变更记录。' }}
      </p>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEndgameStore } from '@/stores/endgame'
import { RULESET_CHANGELOG, RULESET_VERSION, isStaleRuleset, rulesetChangesSince } from '@/data/ruleset'
import { daoPathDef } from '@/data/endgame'
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
 * 道痕面板 —— 历世履历 / 今昔之比 / 忆战与重写 / 规则纪元变迁。
 *
 * 自 CelestialView 拆出:这一册只读 endgame.marks 与本册自己的两个浮层状态,
 * 宿主不再代管 rewriteConfirm 与纪元弹窗。战报仍由宿主统一 openReport 判定归因,
 * 故这里只 emit('report'),不自己拼 foeOriginLines。
 */
const emit = defineEmits<{ report: [ReportView] }>()
const endgame = useEndgameStore()
/**
 * 在途判据(远征/秘境/历练):忆战与重写都要独占一项在途终局活动,
 * 核心(replayMark / rewriteMark)本就会拒 —— 但按钮若一直亮着,玩家只能靠
 * 一次点击换来一句「远征在途」。这里把同一份判据(含同一句拒因)前置到按钮上。
 */
const busy = computed(() =>
  endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)
)

// ---- 忆战:与过去的自己重临此界 ----
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

// ---- 重写此痕:以今日之你,快过当年 ----
/**
 * 重写确认态(按道痕这一条本身,不按行号)。
 *
 * 道痕表是「新痕插在头部」,而重写本身就会补一条新痕 —— 若按行号记,
 * 列表一变(重写、远征归来、切页后重新读档)确认态就会落到**另一条**道痕上,
 * 玩家点「确认重写」时花的是那条的道源,不是他挑的那条。
 * 记对象引用:同一条痕在列表里挪位也认得出,列表重建则自动回落未武装。
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

// 规则纪元:旧纪道痕为何与今日不可同日而语(纪元变迁史同出一源,视图不手抄)
const eraOpen = ref(false)
const eraMark = ref<(typeof endgame.marks)[number] | null>(null)
const eraChanges = computed(() => (eraMark.value ? rulesetChangesSince(eraMark.value.ruleset) : RULESET_CHANGELOG))
function openEra(mark: (typeof endgame.marks)[number] | null): void {
  eraMark.value = mark
  eraOpen.value = true
}
</script>
