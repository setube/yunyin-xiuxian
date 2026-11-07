<template>
  <BaseModal :open="report !== null" :title="report?.title ?? ''" @close="emit('close')">
    <template v-if="report">
      <p class="font-kai text-[13px] tracking-wider" :class="report.cleared ? 'text-jade' : 'text-cinnabar'">
        {{ report.markText }}
      </p>

      <!-- 战斗过程:与历练同样逐回合播放 -->
      <div class="mt-2">
        <GauntletPanel :rows="report.rows" :player-name="playerName" />
      </div>

      <!--
        逐场摘要:限高滚动,不撑到弹窗 82vh 上限。
        每行一根余血条 — 一串连战里真正决定「还能不能走下一重」的是余血的走势,
        而文字把它写成了十来个互不相干的百分数(见 ui/fightStreak)。
      -->
      <div class="mt-2 max-h-40 space-y-1 overflow-y-auto">
        <p
          v-for="(row, i) in report.rows"
          :key="i"
          class="flex items-center justify-between gap-2 rounded bg-paper-deep/70 px-3 py-1.5 text-[12px]"
        >
          <span class="min-w-0 shrink" :class="row.win ? 'text-ink-soft' : 'text-cinnabar'">
            第{{ i + 1 }}战 · {{ row.foeName }} · {{ row.win ? '胜' : '负' }}
          </span>
          <span class="flex shrink-0 items-center gap-1.5">
            <span class="fight-bar" :class="{ 'fight-bar--worst': marks[i]?.worst }" aria-hidden="true">
              <span class="fight-bar-fill" :style="{ width: `${marks[i]?.barPct ?? 0}%` }" />
            </span>
            <span class="tabular text-[11px] text-ink-faint">
              {{ row.rounds }} 回合 · 余血 {{ Math.round(row.hpLeftPct * 100) }}%
            </span>
          </span>
        </p>
      </div>
      <!-- 敌方判定(道之理解 / 境界压制)与战前预估同源;只报来源与倍率,不附劝导 -->
      <div v-if="report.judgementLines?.length" class="mt-2 rounded-md bg-cinnabar/5 px-3 py-2">
        <p class="font-kai text-[11px] tracking-widest text-cinnabar">此战之判</p>
        <p v-for="(line, i) in report.judgementLines" :key="i" class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
          {{ line }}
        </p>
      </div>
      <p v-if="report.reward > 0" class="mt-2 text-[12px] text-gold-ink tabular">
        <GameIcon name="sparkles" :size="12" class="inline" />
        道源 +{{ report.reward }}
      </p>
    </template>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 卷</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { CombatantSnap } from '@/types'
  import { fightMarks } from '@/ui/fightStreak'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GauntletPanel from '@/components/celestial/GauntletPanel.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 战报弹窗:远征终局 / 天道试炼 / 天道变数 / 忆战 / 重写 / 挑战共用,行形状与判词区须一致。
   * 判定文案由宿主算好传入(`openReport` 的 foeOriginLines)。
   */
  export interface ReportView {
    title: string
    cleared: boolean
    markText: string
    /** 逐场摘要;`foe` 为该场敌人的加成来源(旧记录可能没有) */
    rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number; foe?: CombatantSnap }[]
    reward: number
    judgementLines?: string[]
  }

  const props = defineProps<{
    report: ReportView | null
    /** 玩家道号(战报左栏) */
    playerName: string
  }>()

  const emit = defineEmits<{ close: [] }>()

  /** 逐场余血柱:满血为顶,败下来的那一场另标(见 ui/fightStreak) */
  const marks = computed(() => fightMarks(props.report?.rows ?? []))
</script>
