<template>
  <div class="space-y-3">
    <!-- 会话信息 -->
    <div class="card-ink px-4 py-3">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[15px] tracking-widest text-ink">
          {{ region?.name }}
          <span class="text-[11px] text-ink-faint">· {{ modeName }}</span>
        </p>
        <!-- 每秒在走的倒计时同样要定宽:与状态面板同一类抖动,修就修干净 -->
        <span class="tabular text-[12px] text-ink-soft">
          余 <span class="countdown-slot">{{ formatCountdown(timeLeft) }}</span>
          <!--
            倒计时给「还剩多久」,这句给「几时归」—— 同一分 endsAt,翻译成本地钟点,
            玩家不用倒着心算 00:27:31 是几点几分,得空了知道几时回来收一趟
          -->
          <span v-if="session && timeLeft > 0" class="ml-1 text-[10px] text-ink-faint">约 {{ formatClock(session.endsAt) }} 归</span>
        </span>
      </div>
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        {{ session ? sessionRecordText(session) : '胜 0 场' }} · 际遇 {{ session?.events ?? 0 }} 次 · 拾获 {{ session?.itemGain ?? 0 }} 件
        <!--
          本场「胜 N 场」是一趟历练里的账,连胜是跨趟的「还没输过」—— 两本账。
          连胜只在 3/5/10 的奖励 toast 里现身过一次,平时是多少、距下一档还剩几场,
          玩家是看不见的:把活数挂回眼前,顺手报清下一档的缺口。
        -->
        <span v-if="streak" class="ml-1 text-gold-ink">
          · 连胜 {{ streak }}
          <template v-if="nextStreak">
            · 距 {{ nextStreak }} 连胜尚差 {{ nextStreak - streak }} 场
            <template v-if="nextReward">(奖:{{ nextReward }})</template>
          </template>
        </span>
        <!-- 下一场也讲「几时」:同一分 nextBattleAt 翻译成钟点,和归时那句一个承诺 -->
        <span v-if="huntIn > 0.4" class="text-ink-faint">
          · 下一场 {{ formatCountdown(huntIn) }}
          <span v-if="session" class="text-[10px]">(约 {{ formatClock(session.nextBattleAt) }})</span>
        </span>
      </p>
      <!-- 本次所得:石头与修为此前只在挂机总结里出现,在线历练中玩家看不到这一趟赚了什么 -->
      <p v-if="gains" class="mt-0.5 text-[10px] text-ink-faint tabular">
        本次所得 · 灵石 <span class="text-gold-ink">+{{ gains.stone }}</span> · 修为
        <span class="text-jade">+{{ gains.exp }}</span><template v-if="gains.itemText"> · 拾获 <span class="text-azure">{{ gains.itemText }}</span> 件</template>
      </p>
      <!-- 目标感:未靖的地界,打完十胜就该遇首领;不给提示的话玩家不知道还要打多久 -->
      <p v-if="bossHint" class="mt-0.5 text-[10px]" :class="bossSoon ? 'text-cinnabar' : 'text-gold-ink'">
        {{ bossHint }}
      </p>
    </div>

    <!-- 战斗面板 -->
    <div class="card-ink relative overflow-hidden px-4 py-4">
      <!-- 敌方 -->
      <div class="relative" :class="[shakeCls.e, defeated === 'e' ? 'foe-defeated' : '']">
        <!-- 图标与首行文字顶部对齐:名字+标签换行时,图标不该跟着往下沉 -->
        <div class="flex items-start gap-2">
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-full border"
            :class="battle?.isBoss ? 'border-cinnabar/70 text-cinnabar bg-cinnabar/5' : 'border-ink/25 text-ink-soft bg-ink/4'"
          >
            <GameIcon :name="battle?.enemyIcon ?? 'paw'" :size="18" />
          </span>
          <div class="min-w-0 grow">
            <!--
              名字 + 适配星级一行,**标签另起一行**。

              从前名字、首领/宿敌、特性、星级全挤在同一行 nowrap 的 flex 里:
              名字最长 9 字(「残魂·堕落冰魄仙子」)、特性最多 3 个,窄屏上名字被挤成两行、
              标签压在一起。标签数量不定,让它跟名字抢宽度就永远会有下一档挤法 ——
              干脆分层:第一行只答「这是谁、我打它多合适」,第二行只答「它有什么路数」。
            -->
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
            <!-- 标签行:首领 / 宿敌 / 敌人路数(特性)—— 有几个就排几个,放不下就在这一行里换行 -->
            <p
              v-if="battle && (battle.isBoss || isNemesisFoe || shownTraits.length)"
              class="mt-1 flex flex-wrap items-center gap-1.5"
            >
              <span v-if="battle.isBoss" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">首领</span>
              <span v-if="isNemesisFoe" class="chip-ink border-cinnabar/80 bg-cinnabar/10 text-[9px] text-cinnabar">宿敌</span>
              <span v-for="t in shownTraits" :key="t" class="chip-ink border-violet-ink/50 text-[9px] text-violet-ink">
                {{ TRAIT_NAMES[t] }}
              </span>
            </p>
            <ProgressBar :value="ehp" color="var(--color-cinnabar)" :height="6" class="mt-1" />
            <!--
              敌力亮出来:星级只答「合适不合适」,这枚数答「悬殊多少」。
              两侧都是**开打那一刻**从同一对有效快照折出的冻结数(combat.snapPower +
              applyCombatRuleSnap),规则改过就按改过后的算 —— 战后换装不会让「我」飘走,
              逆旅契/道途生效也不是摆设。老战报缺 playerPower 时退回当前面板,只作兜底
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
          <!--
            data-battle-log 挂在**行**上(不是外面那层框):自检要数「这场到底出了几行」,
            而框里还有一行占位文案「山风掠过,四下无声……」—— 挂在框上会把它一起数进去。
            为什么要数行而不是数关键词:暴击那行只写「会心一击」,一击定胜负的战斗
            五个关键词一个不沾,曾被误判成「回放没出内容」。
          -->
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
          <p v-if="displayed.length === 0" class="pt-16 text-center text-[12px] text-ink-faint">山风掠过,四下无声……</p>
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
          :class="f.crit ? 'animate-float-crit text-[17px] text-cinnabar' : 'animate-float-dmg text-[13px] text-cinnabar'"
        >
          {{ f.text }}
        </span>
      </div>
      <!-- 战后统计 / 本战所得 / 此物所知 / 战斗分析:四块只此一处消费,随本体迁出 -->
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

  /** 回放的收表函数(gameClock 收口:暂停冻结) */
  let playTimer: (() => void) | undefined
  let floatSeq = 1

  const session = computed(() => adventure.session)
  const region = computed(() => adventure.currentRegion)
  const battle = computed(() => adventure.lastBattle)
  const timeLeft = computed(() => (session.value ? Math.max(0, (session.value.endsAt - now.value) / 1000) : 0))
  const huntIn = computed(() => (session.value ? Math.max(0, (session.value.nextBattleAt - now.value) / 1000) : 0))
  const modeName = computed(() => (session.value ? EXPLORE_MODES[session.value.mode].name : ''))

  /** 本次历练已得(灵石/修为/拾获件数)—— 取自会话里如实累计的入账数,不是期望值 */
  const gains = computed(() => {
    const s = session.value
    if (!s) return null
    return { stone: formatGN(s.stoneGain), exp: formatGN(s.expGain), itemText: s.itemGain > 0 ? String(s.itemGain) : null }
  })

  /**
   * 连胜、下一档的缺口,与那一档的赏格:与奖励 toast 读同一本账
   * (player.winStreak + WIN_STREAK_REWARDS),只差一个 milestone 时跳过一次
   * (比如连胜 9 时「距 10」还在),满了 10 无话可说。赏格取自表里那一行,
   * 只排格式不手写数 —— 到账的 toast 另走 streakRewardText,同一本账。
   */
  const streak = computed(() => player.winStreak)
  const nextRewardRow = computed(() => WIN_STREAK_REWARDS.find(r => r.streak > streak.value) ?? null)
  const nextStreak = computed(() => nextRewardRow.value?.streak ?? null)
  /** 赏格预览:数字取自 WIN_STREAK_REWARDS 那一行,只排格式,不手写数 */
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
    return n > 0 ? `距此地之主还差 ${n} 胜` : '此地之主将现 —— 下一战即是首领'
  })

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
  }

  function playBattle(instant = false): void {
    const b = battle.value
    if (!b) return
    stopPlayback()
    defeated.value = null
    const entries = b.result.log
    // 减动效:同 GauntletPanel —— 直接给结果不逐条播,开关对两处战斗回放一视同仁
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
    // 回放是已结算战局的演出:心跳停着(重置/导入确认)就该跟着停
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
