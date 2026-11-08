<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <template v-if="adventure.sessionActive">
      <CombatPanel />
    </template>

    <template v-else>
      <RouterLink to="/world" class="card-ink flex items-center gap-3 border-azure/30 px-4 py-3 active:scale-98">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-azure/15 text-azure">
          <GameIcon name="cloud" :size="18" />
        </span>
        <span class="min-w-0 grow">
          <span class="block font-kai text-[14px] tracking-[0.2em] text-ink">本世之界</span>
          <span class="block truncate text-[10px] leading-relaxed text-ink-faint">{{ worldBrief }}</span>
        </span>
        <span class="shrink-0 text-[11px] text-azure">观 象 →</span>
      </RouterLink>

      <SecretRealmCard />

      <SectionTitle title="历练" />
      <p class="text-[10px] leading-relaxed text-violet-ink">
        今日星象:{{ mansionName }} · 利<span class="text-gold-ink">{{ favoredWorldName }}</span> · 历练际遇
        <span class="tabular">+{{ mansionLuckPct }}%</span>
      </p>
      <p class="mt-1 flex items-center gap-2 text-[10px]">
        <!-- 名字要随可见文案走:已定向时可见文本是「星象定向 · 仙界 ▾」,写死一个静态名就对不上了 -->
        <button
          class="chip-ink min-h-[28px] text-azure"
          :aria-label="`星象定向${redirectActiveText} ▾`"
          :aria-expanded="mansionRedirectOpen"
          @click="mansionRedirectOpen = !mansionRedirectOpen"
        >
          星象定向{{ redirectActiveText }} ▾
        </button>
      </p>
      <div v-if="mansionRedirectOpen" class="mt-1.5 rounded border border-ink/10 bg-ink/4 p-2">
        <p class="text-[9px] leading-relaxed text-ink-faint">
          每次 {{ redirectCostText }} 灵石 · 今日限 {{ mansionRedirectMax }} 次
        </p>
        <div class="mt-1.5 flex flex-wrap gap-2">
          <button
            v-for="w in redirectRows"
            :key="w.id"
            class="chip-ink min-h-[28px]"
            :class="w.reason
              ? 'cursor-not-allowed border-ink/15 bg-ink/5 text-ink-faint'
              : w.id === effectiveWorldId ? 'text-gold-ink' : 'text-azure'"
            :disabled="w.reason !== null"
            :title="w.reason ?? `定向至${w.name}`"
            :aria-label="w.reason ? `${w.name} · ${w.reason}` : `定向至${w.name}`"
            @click="redirectTo(w.id)"
          >{{ w.name }}{{ w.id === effectiveWorldId ? ' ·' : '' }}</button>
        </div>
      </div>
      <p v-if="player.suppressedRegions.length > 0" class="text-[10px] text-gold-ink">
        已镇压 {{ player.suppressedRegions.length }} 处
        <span class="text-ink-faint">· {{ suppressDaoText(player.suppressedRegions.length) }}</span>
      </p>
      <!--
        途中档位。原先只是三个并排的 chip,各写一句「约每 N 程一次」——
        想比出哪档更常见,得先把三个数在脑子里排一下。
        core 的 tierChances 早算好了三档各自的发生概率,那个函数至今没有任何界面读过。
        这里把它画成一根分段条:一段有多长,就是这档占多少(见 ui/eventTierBar)。
      -->
      <div class="text-[10px]">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-ink-faint">途中{{ cnNumber(EVENT_TIERS.length) }}档</span>
          <span v-if="tierBase" class="text-ink-faint">
            最常见 <span :style="{ color: tierBase.color }">{{ tierBase.name }}</span>
          </span>
        </div>
        <div class="tier-bar mt-1" role="img" :aria-label="tierBarLabel">
          <span
            v-for="s in tierSegs"
            :key="s.id"
            class="tier-bar__seg"
            :style="{ left: `${s.start * 100}%`, width: `${s.length * 100}%`, background: s.color }"
          />
        </div>
        <p class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span v-for="s in tierSegs" :key="s.id" class="inline-flex items-center gap-1">
            <i class="tier-bar__dot" :style="{ background: s.color }" aria-hidden="true" />
            <span :style="{ color: s.color }">{{ s.name }}</span>
            <span class="text-ink-faint tabular">
              {{ tierOddsText(s.id, chainPending, tierAnyChance) }}
            </span>
            <span v-if="tierRarity[s.id]" class="text-ink-faint">· {{ tierRarity[s.id] }}</span>
          </span>
        </p>
      </div>
      <!-- 镇压规则只留一行总纲,逐项「当前值 / 需≤阈值」在地界行 -->
      <p class="text-[10px] leading-relaxed text-ink-faint">
        镇压门槛:胜 {{ SUPPRESS_THRESHOLDS.minWins }} 场 · 均 ≤{{ SUPPRESS_THRESHOLDS.maxAvgRounds }} 回合 ·
        受伤 ≤{{ Math.round(SUPPRESS_THRESHOLDS.maxAvgDamageTaken * 100) }}%;资格限本世 ·
        {{ REVIVE_AFTER_HOURS }} 时后妖气复聚 · 道韵修为每区 +{{ Math.round(SUPPRESS_EXP_PER_REGION * 100) }}%,封顶
        +{{ Math.round(SUPPRESS_EXP_MAX * 100) }}%
      </p>
      <div class="space-y-2.5">
        <template v-for="group in groupedRows" :key="group.world.id">
          <div class="flex items-center gap-2 pt-1">
            <!-- 界域印:与境界谱同一枚(见 ui/worldMark),历练按界域分组时先认得出这是哪一界 -->
            <WorldSeal :world="group.world.id" />
            <span class="font-kai text-[11px] tracking-[0.3em] text-ink-soft">{{ group.world.name }}</span>
            <span class="h-px grow bg-ink/10" />
            <span class="text-[10px] text-ink-faint">{{ group.rows.length }} 处</span>
          </div>
        <RegionCard
          v-for="row in group.rows"
          :key="row.def.id"
          :row="row"
          @depart="chooseMode"
          @toggle-suppress="toggleSuppress"
        />
        </template>
      </div>
    </template>

    <ExploreModeDialog :region="modeTarget" @close="modeTarget = null" @choose="begin" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import type { ExploreMode, RegionDef, WorldId } from '@/types'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useResourcesStore } from '@/stores/resources'
  import { regionDef } from '@/data/regions'
  import { WORLDS } from '@/data/realms'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import RegionCard from '@/components/adventure/RegionCard.vue'
  import ExploreModeDialog from '@/components/adventure/ExploreModeDialog.vue'
  import CombatPanel from '@/components/adventure/CombatPanel.vue'
  import { effectiveFavoredWorld, todayMansion, mansionLuckPercent, currentGameDay } from '@/core/astronomy'
  import { mansionRedirectCheck } from '@/core/mansionRedirect'
  import { worldDef } from '@/data/realms'
  import WorldSeal from '@/components/common/WorldSeal.vue'
  import { worldView } from '@/core/mortalWorldService'
  import { isRetreating } from '@/core/earlyGameService'
  import { endgameBusy } from '@/core/endgameActivity'
  import { useEndgameStore } from '@/stores/endgame'
  import { MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX } from '@/data/constants'
  import { exploreEventChance, startExploration } from '@/core/exploration'
  import { EVENT_TIERS, tierChances, tierOddsText } from '@/core/eventTier'
  import { dominantTier, rarityRatio, tierSegments } from '@/ui/eventTierBar'
  import { pendingChainStages } from '@/core/eventEngine'
  import { SUPPRESS_EXP_MAX, SUPPRESS_EXP_PER_REGION, SUPPRESS_THRESHOLDS, suppressDaoText } from '@/core/suppress'
  import { REVIVE_AFTER_HOURS } from '@/core/worldMemory'
  import { gn } from '@/utils/gnum'
  import { cnNumber, formatGN } from '@/utils/format'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { useRegionRows } from '@/composables/useRegionRows'

  const adventure = useAdventureStore()
  const route = useRoute()
  const router = useRouter()
  const player = usePlayerStore()
  const ui = useUiStore()
  const resources = useResourcesStore()
  const endgame = useEndgameStore()

  /** 地界投影与分组:事实取自 `useRegionRows`(区域卡与「出发前预览」共用同一份),本页只摆出来 */
  const { groupedRows } = useRegionRows()

  /** 出行方式弹窗:开关留宿主,预览与三档账随弹窗本体 */
  const modeTarget = ref<RegionDef | null>(null)

  /** 有没有缘在续:三档此刻的稀度取决于它(引擎先掷奇缘、再掷机缘,剩下才是际遇) */
  const chainPending = computed(() => pendingChainStages(player.major).length > 0)

  /** 途中各档的实际概率:与事件引擎逐步同源(core/eventTier.tierChances),本页不另算 */
  const tierAnyChance = computed(() => exploreEventChance(adventure.session?.regionId ?? '', player.finalStats.mods))
  const tierChancesNow = computed(() => tierChances(chainPending.value, tierAnyChance.value))
  const tierSegs = computed(() => tierSegments(tierChancesNow.value))
  const tierBase = computed(() => dominantTier(tierSegs.value))
  /** 每档相对最常见那档稀多少;常见那档自身不报 */
  const tierRarity = computed(() =>
    Object.fromEntries(tierSegs.value.map(s => [s.id, rarityRatio(s, tierBase.value)])) as Record<string, string>
  )
  /** 读屏名:把条上三段说成一句话,不让图形独占信息 */
  const tierBarLabel = computed(() =>
    tierSegs.value.map(s => `${s.name} ${tierOddsText(s.id, chainPending.value, tierAnyChance.value)}`).join(" · ")
  )

  const worldBrief = computed(() => {
    const w = adventure.mortalWorld
    if (!w) return '此世未成'
    const view = worldView(w, id => id)
    return view.title
  })

  /** 今日值日之宿:只报宿名(方位 / 分野 / 所宜整句在界域志) */
  const mansionName = computed(() => todayMansion().fullName)
  /** 今日所利界域(有效口径):有生效定向走定向,否则随值日之宿 */
  const effectiveWorldId = computed(() => effectiveFavoredWorld())
  const favoredWorldName = computed(() => worldDef(effectiveWorldId.value).name)
  /** 值日之宿所利的百分数:单一来源 astronomy,历练页与界域志共用 */
  const mansionLuckPct = computed(() => mansionLuckPercent())

  const mansionRedirectOpen = ref(false)
  const redirectCostText = formatGN(gn(MANSION_REDIRECT_COST))
  const mansionRedirectMax = MANSION_REDIRECT_MAX
  const redirectActiveText = computed(() => {
    const mr = player.mansionRedirect
    return mr && mr.worldId === effectiveWorldId.value ? ` · ${worldDef(mr.worldId).name}` : ''
  })
  function redirectTo(id: WorldId): void {
    const ok = player.redirectFavoredWorld(id)
    const name = worldDef(id).name
    // 失败时状态没变,拒因直接读上面那一份算好的行,不再重算一次
    const reason = ok ? null : (redirectRows.value.find(r => r.id === id)?.reason ?? null)
    ui.toast(ok ? `已定向至${name}` : reason ?? '定向未成', ok ? 'info' : 'warn')
  }
  /**
   * 四枚定向钮各自能否按下、按不下时的拒因。
   *
   * 原先每枚钮在模板里调 `redirectReason(w.id)` 三次(类名 / disabled / title 与 aria-label),
   * 四枚共十二次;而 `mansionRedirectCheck` 每次都要构造一个灵石成本 GNum 并比较。
   * 现一次算齐,模板只读字段 —— 与 TrialPanel / 道痕面板那些同一种改法。
   */
  const redirectRows = computed(() =>
    WORLDS.map(w => ({
      ...w,
      reason: mansionRedirectCheck(currentGameDay(), player.mansionRedirect, w.id, resources.spiritStone).reason
    }))
  )

  /** 从本世之界页带回来的地界:直接打开出行方式弹窗(模式选择只此一处实现) */
  onMounted(() => {
    const go = route.query.go
    if (typeof go !== 'string') return
    const r = regionDef(go)
    if (r) modeTarget.value = r
    router.replace({ path: '/adventure' })
  })

  function chooseMode(region: RegionDef): void {
    // 闭关期间不许外出历练:开模式窗前就拒,startExploration 只兜底
    if (isRetreating()) {
      ui.toast('闭关中', 'warn')
      return
    }
    // 在途远征/秘境:与 core 同一判据 endgameBusy,拒因不另抄。
    // 历练会话不在此列:进得来本页就说明没在历练
    const busy = endgameBusy(endgame.worldRun, player.secretRealm, null)
    if (busy) {
      ui.toast(busy.reason, 'warn')
      return
    }
    modeTarget.value = region
  }

  function begin(mode: ExploreMode): void {
    if (!modeTarget.value) return
    if (startExploration(modeTarget.value.id, mode)) {
      modeTarget.value = null
    }
  }

  /** 停取收益 / 转为镇压收益:资格保留,可随时切回 */
  function toggleSuppress(regionId: string): void {
    const r = regionDef(regionId)
    const name = r?.name ?? '此地'
    if (player.suppressedRegions.includes(regionId)) {
      player.unsuppressRegion(regionId)
      ui.toast(`${name}已停取收益`, 'info')
    } else {
      player.suppressRegion(regionId)
      ui.toast(`${name}已镇压`, 'success')
    }
  }
</script>
