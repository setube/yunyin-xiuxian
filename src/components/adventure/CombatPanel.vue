<template>
  <div class="space-y-3">
    <!-- 会话信息 -->
    <div class="card-ink px-4 py-3">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[15px] tracking-widest text-ink">
          {{ region?.name }}
          <span class="text-[11px] text-ink-faint">· {{ modeName }}</span>
        </p>
        <!-- 每秒走的倒计时须定宽,防抖动 -->
        <span class="tabular text-[12px] text-ink-soft">
          余 <span class="countdown-slot">{{ formatCountdown(timeLeft) }}</span>
          <!-- 同一 endsAt 换算成本地钟点 -->
          <span v-if="session && timeLeft > 0" class="ml-1 text-[10px] text-ink-faint">约 {{ formatClock(session.endsAt) }} 归</span>
        </span>
      </div>
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        {{ session ? sessionRecordText(session) : '胜 0 场' }} · 际遇 {{ session?.events ?? 0 }} 次 · 拾获 {{ session?.itemGain ?? 0 }} 件
        <!-- 连胜跨趟计,与本场胜场是两本账 -->
        <span v-if="streak" class="ml-1 text-gold-ink">
          · 连胜 {{ streak }}
          <template v-if="nextStreak">
            · 距 {{ nextStreak }} 连胜尚差 {{ nextStreak - streak }} 场
            <template v-if="nextReward">(奖:{{ nextReward }})</template>
          </template>
        </span>
        <!-- 同一 nextBattleAt 换算成钟点 -->
        <span v-if="huntIn > 0.4" class="text-ink-faint">
          · 下一场 {{ formatCountdown(huntIn) }}
          <span v-if="session" class="text-[10px]">(约 {{ formatClock(session.nextBattleAt) }})</span>
        </span>
      </p>
      <!-- 本次所得 -->
      <p v-if="gains" class="mt-0.5 text-[10px] text-ink-faint tabular">
        本次所得 · 灵石 <span class="text-gold-ink">+{{ gains.stone }}</span> · 修为
        <span class="text-jade">+{{ gains.exp }}</span>
      </p>
      <p v-if="bossHint" class="mt-0.5 text-[10px]" :class="bossSoon ? 'text-cinnabar' : 'text-gold-ink'">
        {{ bossHint }}
      </p>
    </div>

    <!-- 战斗面板 -->
    <div class="card-ink relative overflow-hidden px-4 py-4">
      <!-- 敌方 -->
      <div class="relative" :class="[shakeCls.e, defeated === 'e' ? 'foe-defeated' : '']">
        <!-- 图标与首行顶部对齐,名字换行时不下沉 -->
        <div class="flex items-start gap-2">
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-full border"
            :class="battle?.isBoss ? 'border-cinnabar/70 text-cinnabar bg-cinnabar/5' : 'border-ink/25 text-ink-soft bg-ink/4'"
          >
            <GameIcon :name="battle?.enemyIcon ?? 'paw'" :size="18" />
          </span>
          <div class="min-w-0 grow">
            <!-- 名字 + 星级一行,标签另起一行:标签数不定,同排会把名字挤断(名字最长 9 字) -->
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-kai text-[14px] text-ink">
              <template v-if="battle">
                <span data-foe-name class="whitespace-nowrap">{{ battle.enemyName }}</span>
              </template>
              <template v-else>
                <span class="whitespace-nowrap">寻敌中</span>
                <span class="ink-dots text-ink-faint">
                  <span />
                  <span />
                  <span />
                </span>
              </template>
              <span
                v-if="foeAdaptation"
                class="ml-auto shrink-0 text-[10px] font-normal text-gold-ink tabular"
                :title="foeAdaptation.reasons.join(';')"
              >
                {{ starsText(foeAdaptation.stars) }}
              </span>
            </p>
            <!-- 标签行:首领 / 宿敌 / 特性 -->
            <p
              v-if="battle && (battle.isBoss || isNemesisFoe || shownTraits.length)"
              class="mt-1 flex flex-wrap items-center gap-1.5"
            >
              <span v-if="battle.isBoss" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">首领</span>
              <span v-if="isNemesisFoe" class="chip-ink border-cinnabar/80 bg-cinnabar/10 text-[9px] text-ink">宿敌</span>
              <span v-for="t in shownTraits" :key="t" class="chip-ink border-violet-ink/50 text-[9px] text-violet-ink">
                {{ TRAIT_NAMES[t] }}
              </span>
            </p>
            <!--
              血条只画比例,读不出「还剩几成」—— 战报逐回合报伤害,而这条最该报的读数反而没有。
              条右补一个百分数:与条同读 ehp,不另算一份。
            -->
            <div class="mt-1 flex items-center gap-2">
              <ProgressBar :value="ehp" color="var(--color-cinnabar)" :height="6" class="min-w-0 flex-1" />
              <span class="w-8 shrink-0 text-right tabular text-[10px] text-cinnabar">{{ hpPercent(ehp) }}</span>
            </div>
            <!--
              敌我战力取开打那一刻的冻结快照(combat.snapPower + applyCombatRuleSnap,含规则改动);
              老战报缺 playerPower 时退回当前面板
            -->
            <p v-if="battle?.enemyPower" class="mt-1 text-[10px] text-ink-faint tabular">
              敌力 {{ formatGN(battle.enemyPower) }} · 我
              {{ formatGN(battle.playerPower ?? player.finalStats.power) }}
            </p>
          </div>
        </div>
        <span
          v-for="f in floats.filter(x => x.side === 'e')"
          :key="f.id"
          class="pointer-events-none absolute right-2 top-0 tabular font-kai"
          :class="f.crit ? 'animate-float-crit text-[17px] text-cinnabar' : 'animate-float-dmg text-[13px] text-ink-soft'"
        >
          {{ f.text }}
        </span>
      </div>

      <!-- 战报 -->
      <div class="relative mt-3">
        <button
          class="absolute right-1 -top-0.5 z-10 -m-2 rounded p-2 text-[10px] text-ink-faint active:text-ink active:opacity-60"
          @click="skipPlayback"
        >
          跳过播放 »
        </button>
        <div ref="logBox" class="h-48 space-y-1 overflow-y-auto rounded-md bg-ink/4 px-3 py-2">
          <!-- data-battle-log 挂在行上不挂外框:自检按行计数,外框里还有占位「暂无战报」 -->
          <p
            v-for="(entry, i) in displayed"
            :key="i"
            data-battle-log
            class="text-[12px] leading-relaxed"
            :class="KIND_COLOR[entry.t]"
          >
            {{ entry.text }}
            <span v-if="entry.dmg" class="tabular" :class="entry.t === 'crit' ? 'text-cinnabar' : ''">{{ entry.dmg }}</span>
          </p>
          <p v-if="displayed.length === 0" class="pt-16 text-center text-[12px] text-ink-faint">暂无战报</p>
        </div>
      </div>

      <!-- 我方 -->
      <div class="relative mt-3" :class="[shakeCls.p, defeated === 'p' ? 'foe-defeated' : '']">
        <div class="flex items-center gap-2">
          <span class="grid h-10 w-10 place-items-center rounded-full border border-azure/50 bg-azure/5 text-azure">
            <GameIcon name="user" :size="18" />
          </span>
          <div class="grow">
            <p class="font-kai text-[14px] text-ink">{{ player.name }}</p>
            <!-- 与我方血条同一把尺:条右补百分数,见上 -->
            <div class="mt-1 flex items-center gap-2">
              <ProgressBar :value="php" color="var(--color-jade)" :height="6" class="min-w-0 flex-1" />
              <span class="w-8 shrink-0 text-right tabular text-[10px] text-jade">{{ hpPercent(php) }}</span>
            </div>
          </div>
        </div>
        <span
          v-for="f in floats.filter(x => x.side === 'p')"
          :key="f.id"
          class="pointer-events-none absolute right-2 top-0 tabular font-kai"
          :class="f.crit ? 'animate-float-crit text-[17px] text-cinnabar' : 'animate-float-dmg text-[13px] text-cinnabar'"
        >
          {{ f.text }}
        </span>
      </div>
      <!-- 战后统计 / 本战所得 / 此物所知 / 战斗分析 -->
      <BattleIntelPanel />
    </div>

    <button class="btn-ghost w-full" @click="stopExploration('manual')">收兵回府</button>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch, onUnmounted } from 'vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { useSettingsStore } from '@/stores/settings'
  import { stopExploration, winsUntilRegionBoss, regionBossCleared } from '@/core/exploration'
  import { COMBAT_PLAYBACK_BASE_MS, COMBAT_PLAYBACK_MIN_MS, EXPLORE_MODES } from '@/data/constants'
  import { WIN_STREAK_REWARDS } from '@/data/earlyGame'
  import { formatClock, formatCountdown, formatGN } from '@/utils/format'
  import { hpPercent } from '@/ui/hpReadout'
  import { useNow } from '@/composables/useNow'
  import { gameClock } from '@/composables/useGameClock'
  import { detectBuild } from '@/core/buildDetect'
  import { detectionAdaptation, enemyTraits, starsText, TRAIT_NAMES, type RegionEcology } from '@/core/buildAdvisor'
  import { isNemesis } from '@/core/worldMemory'
  import { enemyDef } from '@/data/enemies'
  import { enemyLoreView } from '@/ui/enemyLore'
  import { sessionRecordText } from '@/ui/adventureText'
  import type { CombatLogEntry } from '@/types'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BattleIntelPanel from '@/components/adventure/BattleIntelPanel.vue'

  const adventure = useAdventureStore()
  const player = usePlayerStore()
  const settings = useSettingsStore()
  const now = useNow()

  const displayed = ref<CombatLogEntry[]>([])
  const php = ref(1)
  const ehp = ref(1)
  const floats = ref<{ id: number; text: string; side: 'p' | 'e'; crit: boolean }[]>([])
  const shakeCls = ref<{ p: string; e: string }>({ p: '', e: '' })
  const defeated = ref<'p' | 'e' | null>(null)
  const logBox = ref<HTMLElement | null>(null)

  /** 回放停表函数;走 gameClock,暂停时冻结 */
  let playTimer: (() => void) | undefined
  /** 浮字计时与逐帧任务:离页或换场时一并撤销,不回写已销毁组件 */
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  const pendingFrames = new Set<number>()
  let floatSeq = 1

  const session = computed(() => adventure.session)
  const region = computed(() => adventure.currentRegion)
  const battle = computed(() => adventure.lastBattle)
  const timeLeft = computed(() => (session.value ? Math.max(0, (session.value.endsAt - now.value) / 1000) : 0))
  const huntIn = computed(() => (session.value ? Math.max(0, (session.value.nextBattleAt - now.value) / 1000) : 0))
  const modeName = computed(() => (session.value ? EXPLORE_MODES[session.value.mode].name : ''))

  /** 本次历练已得:会话里累计的实际入账,非期望值 */
  const gains = computed(() => {
    const s = session.value
    if (!s) return null
    return { stone: formatGN(s.stoneGain), exp: formatGN(s.expGain) }
  })

  /** 连胜、下一档缺口与赏格:与奖励 toast 同读 player.winStreak + WIN_STREAK_REWARDS,只排格式不手写数 */
  const streak = computed(() => player.winStreak)
  const nextRewardRow = computed(() => WIN_STREAK_REWARDS.find(r => r.streak > streak.value) ?? null)
  const nextStreak = computed(() => nextRewardRow.value?.streak ?? null)
  const nextReward = computed(() => {
    const r = nextRewardRow.value
    if (!r) return null
    const parts: string[] = []
    if (r.stone > 0) parts.push(`${formatGN(r.stone)} 石`)
    if (r.wudao > 0) parts.push(`${r.wudao} 悟道点`)
    return parts.length ? parts.join(' · ') : null
  })

  /** 距区域之主还差几胜(已靖的地界不再提示) */
  const bossIn = computed(() => {
    const s = session.value
    const r = region.value
    if (!s || !r) return null
    return winsUntilRegionBoss(s.wins, regionBossCleared(r.id))
  })
  const bossSoon = computed(() => bossIn.value !== null && bossIn.value <= 0)
  const bossHint = computed(() => {
    const n = bossIn.value
    if (n === null) return null
    return n > 0 ? `距首领 ${n} 胜` : '下一战:首领'
  })

  /** 当前敌人的机制特性标签 */
  const foeTraits = computed(() => {
    const id = battle.value?.enemyId
    if (!id) return []
    const def = enemyDef(id)
    return def ? enemyTraits(def) : []
  })

  /** 此物所知:情报由认知层决定 */
  const lore = computed(() => {
    const id = battle.value?.enemyId
    return id ? enemyLoreView(id) : null
  })

  /** 第一次照面不露特性与星级;读开打快照(渲染时本战已入账),旧战报无快照才读当前认知 */
  const foeKnown = computed(() => battle.value?.foeKnown ?? (lore.value?.stage ?? 0) >= 1)

  const shownTraits = computed(() => (foeKnown.value ? foeTraits.value : []))

  /** 宿敌标记:此敌曾败我 ≥3 次且尚未雪耻 */
  const isNemesisFoe = computed(() => {
    const id = battle.value?.enemyId
    return id ? isNemesis(player.nemeses, id) : false
  })

  /** 当前构筑对此敌的适配 */
  const foeAdaptation = computed(() => {
    const b = battle.value
    if (!b || !foeKnown.value) return null
    const build = detectBuild(player.finalStats.mods)
    if (!build) return null
    const eco: RegionEcology = { burst: 0, multi: 0, pierce: 0, dodge: 0 }
    for (const t of foeTraits.value) eco[t] = 2
    return detectionAdaptation(build, eco, b.isBoss)
  })

  const KIND_COLOR: Record<CombatLogEntry['t'], string> = {
    atk: 'text-ink-soft',
    skill: 'text-azure',
    crit: 'text-cinnabar',
    shield: 'text-gold-ink',
    heal: 'text-jade',
    dodge: 'text-ink-faint',
    proc: 'text-violet-ink',
    info: 'text-ink-faint',
    win: 'text-jade font-kai',
    lose: 'text-cinnabar font-kai'
  }

  function stopPlayback(): void {
    playTimer?.()
    playTimer = undefined
    for (const timer of pendingTimers) clearTimeout(timer)
    for (const frame of pendingFrames) cancelAnimationFrame(frame)
    pendingTimers.clear()
    pendingFrames.clear()
  }

  /** 浮字到时自收;离页由 stopPlayback 撤销 */
  function scheduleFloatRemoval(id: number): void {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      floats.value = floats.value.filter(f => f.id !== id)
    }, 900)
    pendingTimers.add(timer)
  }

  /** 逐帧任务统一登记,卸载/换场时整批撤销 */
  function nextFrame(task: () => void): void {
    const frame = requestAnimationFrame(() => {
      pendingFrames.delete(frame)
      task()
    })
    pendingFrames.add(frame)
  }

  function playBattle(instant = false): void {
    const b = battle.value
    if (!b) return
    stopPlayback()
    defeated.value = null
    const entries = b.result.log
    // 减动效直接给结果,与 GauntletPanel 一致
    if (instant || settings.reduceMotion) {
      displayed.value = entries.slice(-100)
      const last = entries[entries.length - 1]
      php.value = last?.php ?? 1
      ehp.value = last?.ehp ?? 1
      defeated.value = b.result.win ? 'e' : 'p'
      return
    }
    displayed.value = []
    php.value = 1
    ehp.value = 1
    let idx = 0
    const interval = Math.max(COMBAT_PLAYBACK_MIN_MS, COMBAT_PLAYBACK_BASE_MS / settings.battleSpeed)
    // 走 gameClock:心跳停着(重置/导入确认)时回放同停
    playTimer = gameClock(() => {
      const entry = entries[idx]
      if (!entry) {
        stopPlayback()
        defeated.value = b.result.win ? 'e' : 'p'
        return
      }
      displayed.value = [...displayed.value.slice(-99), entry]
      php.value = entry.php
      ehp.value = entry.ehp
      if (entry.dmg) {
        const id = floatSeq
        floatSeq += 1
        floats.value = [
          ...floats.value.slice(-5),
          { id, text: `-${entry.dmg}`, side: entry.side === 'p' ? 'e' : 'p', crit: entry.t === 'crit' }
        ]
        scheduleFloatRemoval(id)
        triggerShake(entry.side === 'p' ? 'e' : 'p', entry.t === 'crit')
      }
      nextFrame(() => {
        logBox.value?.scrollTo({ top: logBox.value.scrollHeight })
      })
      idx += 1
    }, interval)
  }

  /** 受击震颤(暴击更重);先清类、下一帧再挂,连击时动画才能重放 */
  function triggerShake(side: 'p' | 'e', hard: boolean): void {
    shakeCls.value = { ...shakeCls.value, [side]: '' }
    nextFrame(() => {
      shakeCls.value = { ...shakeCls.value, [side]: hard ? 'hit-shake-hard' : 'hit-shake' }
    })
  }

  function skipPlayback(): void {
    playBattle(true)
  }

  watch(
    () => battle.value?.at,
    (at, oldAt) => {
      if (at !== undefined && at !== oldAt) playBattle(false)
    }
  )

  onMounted(() => {
    if (battle.value) playBattle(true)
  })

  onUnmounted(stopPlayback)
</script>
