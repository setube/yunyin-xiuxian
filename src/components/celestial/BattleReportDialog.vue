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

      <!-- 逐场摘要:场次多时限高滚动,不把弹窗撑到 82vh 上限 -->
      <div class="mt-2 max-h-40 space-y-1 overflow-y-auto">
        <p
          v-for="(row, i) in report.rows"
          :key="i"
          class="flex items-center justify-between rounded bg-paper-deep/70 px-3 py-1.5 text-[12px]"
        >
          <span :class="row.win ? 'text-ink-soft' : 'text-cinnabar'">
            第{{ i + 1 }}战 · {{ row.foeName }} · {{ row.win ? '胜' : '负' }}
          </span>
          <span class="tabular text-[11px] text-ink-faint">{{ row.rounds }}回合 · 余血{{ Math.round(row.hpLeftPct * 100) }}%</span>
        </p>
      </div>
      <!--
        输也要输得明白:敌人一侧的判定(道之理解 / 境界压制)与战前预估同源,
        连同「怎么办」一并写在这里 —— 战报不是判决书,是下一次出发的依据。
      -->
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
  import type { CombatantSnap } from '@/types'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GauntletPanel from '@/components/celestial/GauntletPanel.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 战报弹窗 —— 远征终局 / 天道试炼 / 天道变数 / 忆战 / 重写 / 挑战共用同一形状。
   *
   * 抽出来只为一件事:这四类战报的**行形状与判词区**必须逐字一致,
   * 各写一份迟早有一处漏掉判词或改了回合口径。判定文案本身仍由宿主算好传进来
   * (`openReport` 里那一处 foeOriginLines),本组件只管照着画。
   */
  export interface ReportView {
    title: string
    cleared: boolean
    markText: string
    /** 逐场摘要;`foe` 带着那一场敌人的加成来源(旧记录可能没有) */
    rows: { foeName: string; win: boolean; rounds: number; hpLeftPct: number; foe?: CombatantSnap }[]
    reward: number
    judgementLines?: string[]
  }

  defineProps<{
    report: ReportView | null
    /** 玩家道号 —— 战报左侧那一栏的名号 */
    playerName: string
  }>()

  const emit = defineEmits<{ close: [] }>()
</script>
