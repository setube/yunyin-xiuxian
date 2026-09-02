<template>
  <div class="space-y-3">
    <!-- 会话信息 -->
    <div class="card-ink px-4 py-3">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[15px] tracking-widest text-ink">
          {{ region?.name }}
          <span class="text-[11px] text-ink-faint">· {{ modeName }}</span>
        </p>
        <span class="tabular text-[12px] text-ink-soft">余 {{ formatDuration(timeLeft) }}</span>
      </div>
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        胜 {{ session?.wins ?? 0 }} 场 · 际遇 {{ session?.events ?? 0 }} 次 · 拾获 {{ session?.itemGain ?? 0 }} 件
      </p>
    </div>

    <!-- 战斗面板 -->
    <div class="card-ink relative overflow-hidden px-4 py-4">
      <!-- 敌方 -->
      <div class="relative" :class="[shakeCls.e, defeated === 'e' ? 'foe-defeated' : '']">
        <div class="flex items-center gap-2">
          <span
            class="grid h-10 w-10 place-items-center rounded-full border"
            :class="battle?.isBoss ? 'border-cinnabar/70 text-cinnabar bg-cinnabar/5' : 'border-ink/25 text-ink-soft bg-ink/4'"
          >
            <GameIcon :name="battle?.enemyIcon ?? 'paw'" :size="18" />
          </span>
          <div class="grow">
            <p class="flex items-center gap-1.5 font-kai text-[14px] text-ink">
              <template v-if="battle">{{ battle.enemyName }}</template>
              <template v-else>
                搜寻猎物中
                <span class="ink-dots text-ink-faint">
                  <span />
                  <span />
                  <span />
                </span>
              </template>
              <span v-if="battle?.isBoss" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">首领</span>
              <span v-if="isNemesisFoe" class="chip-ink border-cinnabar/80 bg-cinnabar/10 text-[9px] text-cinnabar">宿敌</span>
              <span v-for="t in shownTraits" :key="t" class="chip-ink border-violet-ink/50 text-[9px] text-violet-ink">
                {{ TRAIT_NAMES[t] }}
              </span>
              <span
                v-if="foeAdaptation"
                class="ml-auto text-[10px] font-normal text-gold-ink tabular"
                :title="foeAdaptation.reasons.join(';')"
              >
                {{ starsText(foeAdaptation.stars) }}
              </span>
            </p>
            <ProgressBar :value="ehp" color="var(--color-cinnabar)" :height="6" class="mt-1" />
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
        <button class="absolute right-1 -top-0.5 z-10 text-[10px] text-ink-faint active:text-ink" @click="skipPlayback">跳过播放 »</button>
        <div ref="logBox" class="h-48 space-y-1 overflow-y-auto rounded-md bg-ink/4 px-3 py-2">
          <p v-for="(entry, i) in displayed" :key="i" class="text-[12px] leading-relaxed" :class="KIND_COLOR[entry.t]">
            {{ entry.text }}
            <span v-if="entry.dmg" class="tabular" :class="entry.t === 'crit' ? 'text-cinnabar' : ''">{{ entry.dmg }}</span>
          </p>
          <p v-if="displayed.length === 0" class="pt-16 text-center text-[12px] text-ink-ghost">山风掠过,四下无声……</p>
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
            <ProgressBar :value="php" color="var(--color-jade)" :height="6" class="mt-1" />
          </div>
        </div>
        <span
          v-for="f in floats.filter(x => x.side === 'p')"
          :key="f.id"
          class="pointer-events-none absolute right-2 top-0 tabular font-kai"
          :class="f.crit ? 'animate-float-crit text-[17px] text-cinnabar' : 'animate-float-dmg text-[13px] text-cinnabar/80'"
        >
          {{ f.text }}
        </span>
      </div>
      <!-- 战斗后统计 + 分析入口 -->
      <p v-if="battleSummary" class="mt-2 flex items-center justify-center gap-2 text-center text-[10px] text-ink-faint tabular">
        {{ battleSummary }}
        <button v-if="lore" class="text-violet-ink active:opacity-60" @click="showLore = !showLore">
          {{ showLore ? '收起所知' : '此物所知 »' }}
        </button>
        <button v-if="analysis" class="text-azure active:opacity-60" @click="showAnalysis = !showAnalysis">
          {{ showAnalysis ? '收起分析' : '战斗分析 »' }}
        </button>
      </p>
      <!-- 此物所知(Phase 32.5:交手越多,战前看得越清楚) -->
      <div v-if="showLore && lore" class="mt-2 rounded-md bg-ink/4 px-3 py-2.5">
        <p class="flex items-center gap-2">
          <span class="font-kai text-[12px] tracking-wider text-ink">{{ battle?.enemyName }}</span>
          <span class="chip-ink border-violet-ink/50 text-[9px] text-violet-ink">{{ lore.stageName }}</span>
          <span v-if="lore.boosted" class="text-[10px] text-gold-ink">宿慧照见</span>
        </p>
        <p v-if="lore.elementName || lore.frame.length" class="mt-1 text-[11px] text-ink-soft">
          <span v-if="lore.elementName" class="mr-1.5 text-azure">{{ lore.elementName }}属</span>
          {{ lore.frame.join(' · ') }}
        </p>
        <p v-for="s in lore.skills" :key="s.name" class="mt-1 text-[11px] leading-relaxed text-ink-soft">
          ·
          <span class="text-ink">{{ s.name }}</span>
          ——{{ s.note }}
        </p>
        <p v-for="ph in lore.phases" :key="ph.at" class="mt-1 text-[11px] leading-relaxed text-cinnabar">
          · {{ ph.at }}时{{ ph.label }}
        </p>
        <p v-if="lore.archetype" class="mt-1.5 text-[11px] leading-relaxed text-gold-ink">{{ lore.archetype }}</p>
        <p v-if="lore.hint" class="mt-1.5 text-[10px] text-ink-ghost">{{ lore.hint }}</p>
      </div>
      <!-- 战斗分析(战败自动展开;硬核数据供研究) -->
      <div v-if="showAnalysis && analysis" class="mt-2 rounded-md bg-ink/4 px-3 py-2.5">
        <p class="font-kai text-[12px] tracking-wider" :class="battle?.result.win ? 'text-jade' : 'text-cinnabar'">
          {{ analysis.headline }}
        </p>
        <template v-if="analysis.findings.length">
          <p v-for="(f, i) in analysis.findings" :key="i" class="mt-1 text-[11px] leading-relaxed text-ink-soft">· {{ f.text }}</p>
        </template>
        <p v-if="analysis.directions.length" class="mt-1.5 text-[10px] text-ink-faint">
          可借力的方向(非唯一解):
          <span v-for="d in analysis.directions" :key="d.styleName" class="ml-1 text-violet-ink" :title="d.reason">
            {{ d.styleName }}
          </span>
        </p>
        <div v-if="analysis.dataRows.length" class="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-ink/10 pt-1.5">
          <p v-for="row in analysis.dataRows" :key="row.label" class="flex justify-between text-[10px] tabular">
            <span class="text-ink-ghost">{{ row.label }}</span>
            <span class="text-ink-soft">{{ row.value }}</span>
          </p>
        </div>
      </div>
    </div>

    <button class="btn-ghost w-full" @click="stopExploration('manual')">收兵回府</button>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch, onUnmounted } from 'vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { useSettingsStore } from '@/stores/settings'
  import { stopExploration } from '@/core/exploration'
  import { COMBAT_PLAYBACK_BASE_MS, COMBAT_PLAYBACK_MIN_MS, EXPLORE_MODES } from '@/data/constants'
  import { formatDuration } from '@/utils/format'
  import { useNow } from '@/composables/useNow'
  import { detectBuild } from '@/core/buildDetect'
  import { detectionAdaptation, enemyTraits, starsText, TRAIT_NAMES, type RegionEcology } from '@/core/buildAdvisor'
  import { analyzeBattle } from '@/core/battleAnalysis'
  import { isNemesis } from '@/core/worldMemory'
  import { playSfx } from '@/core/audio'
  import { enemyDef } from '@/data/enemies'
  import { enemyLoreView } from '@/ui/enemyLore'
  import type { CombatLogEntry } from '@/types'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

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

  let playTimer: number | undefined
  let floatSeq = 1

  const session = computed(() => adventure.session)
  const region = computed(() => adventure.currentRegion)
  const battle = computed(() => adventure.lastBattle)
  const timeLeft = computed(() => (session.value ? Math.max(0, (session.value.endsAt - now.value) / 1000) : 0))
  const modeName = computed(() => (session.value ? EXPLORE_MODES[session.value.mode].name : ''))

  /** 当前敌人的机制特性标签 */
  const foeTraits = computed(() => {
    const id = battle.value?.enemyId
    if (!id) return []
    const def = enemyDef(id)
    return def ? enemyTraits(def) : []
  })

  /** 此物所知(Phase 32.5)—— 战前情报由认知层决定,不是白送的 */
  const lore = computed(() => {
    const id = battle.value?.enemyId
    return id ? enemyLoreView(id) : null
  })

  /**
   * 认得它,才谈得上"知道它会怎么打"。
   * 交过一场手即达「眼熟」,所以这道门只挡第一次照面 —— 那一次本就该是未知的。
   */
  const foeKnown = computed(() => (lore.value?.stage ?? 0) >= 1)

  const shownTraits = computed(() => (foeKnown.value ? foeTraits.value : []))

  /** 宿敌标记:此敌曾败我 ≥3 次且尚未雪耻 */
  const isNemesisFoe = computed(() => {
    const id = battle.value?.enemyId
    return id ? isNemesis(player.nemeses, id) : false
  })

  /** 当前构筑对此敌的适配(战力之外的胜负参考) */
  const foeAdaptation = computed(() => {
    const b = battle.value
    if (!b || !foeKnown.value) return null
    const build = detectBuild(player.finalStats.mods)
    if (!build) return null
    const eco: RegionEcology = { burst: 0, multi: 0, pierce: 0, dodge: 0 }
    for (const t of foeTraits.value) eco[t] = 2
    return detectionAdaptation(build, eco, b.isBoss)
  })

  /** 战斗后统计行 */
  const battleSummary = computed(() => {
    const b = battle.value
    if (!b) return null
    const r = b.result
    return `此战 ${r.rounds} 回合 · 战后气血 ${Math.round(r.playerHpPct * 100)}% · ${r.win ? '胜' : '负'}`
  })

  // ---- 战斗分析(第三层信息) ----
  const showAnalysis = ref(false)
  const showLore = ref(false)

  const analysis = computed(() => {
    const b = battle.value
    if (!b) return null
    const build = detectBuild(player.finalStats.mods)
    return analyzeBattle(b.result, build?.style.id ?? null)
  })

  // 战败时自动展开分析;并按胜负配一声战果音
  watch(
    () => battle.value?.at,
    () => {
      if (!battle.value) return
      playSfx(battle.value.result.win ? 'win' : 'lose')
      if (!battle.value.result.win) showAnalysis.value = true
    }
  )

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
    if (playTimer !== undefined) {
      window.clearInterval(playTimer)
      playTimer = undefined
    }
  }

  function playBattle(instant = false): void {
    const b = battle.value
    if (!b) return
    stopPlayback()
    defeated.value = null
    const entries = b.result.log
    if (instant) {
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
    playTimer = window.setInterval(() => {
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
        setTimeout(() => {
          floats.value = floats.value.filter(f => f.id !== id)
        }, 900)
        triggerShake(entry.side === 'p' ? 'e' : 'p', entry.t === 'crit')
      }
      requestAnimationFrame(() => {
        logBox.value?.scrollTo({ top: logBox.value.scrollHeight })
      })
      idx += 1
    }, interval)
  }

  /** 受击方短促震颤(暴击更重);先清类、下一帧再挂,保证连击时动画也能重放 */
  function triggerShake(side: 'p' | 'e', hard: boolean): void {
    shakeCls.value = { ...shakeCls.value, [side]: '' }
    requestAnimationFrame(() => {
      shakeCls.value = { ...shakeCls.value, [side]: hard ? 'hit-shake-hard' : 'hit-shake' }
    })
  }

  /** 跳过播放,直接呈现战果 */
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
