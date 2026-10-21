<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 历练中 -->
    <template v-if="adventure.sessionActive">
      <CombatPanel />
    </template>

    <!-- 选择区域 -->
    <template v-else>
      <!-- 本世之界:链接入口,详情另开一页。历练地图仍在下方,照旧可走 -->
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

      <SectionTitle title="历练" hint="行万里路,炼一颗心" />
      <p class="text-[10px] leading-relaxed text-violet-ink">
        今日星象:{{ mansionLine }} —— 利
        <span class="text-gold-ink">{{ favoredWorldName }}</span
        >,在其地历练际遇<span class="tabular" title="秘境等其他活动不受此加成">+{{ mansionLuckPct }}%</span>(他处不加)。
      </p>
      <p class="mt-1 flex items-center gap-2 text-[10px]">
        <button class="chip-ink min-h-[28px] text-azure" aria-label="星象值日定向" @click="mansionRedirectOpen = !mansionRedirectOpen">
          星象定向{{ redirectActiveText }} ▾
        </button>
      </p>
      <div v-if="mansionRedirectOpen" class="mt-1.5 rounded border border-ink/10 bg-ink/4 p-2">
        <p class="text-[9px] leading-relaxed text-ink-faint">
          把今日所利界域定向到所选(每次耗 {{ redirectCostText }} 灵石;今日限 {{ mansionRedirectMax }} 次,
          达上限当日不再允许继续改向,已定向之界保持生效——付费不白费)。
        </p>
        <div class="mt-1.5 flex flex-wrap gap-2">
          <button
            v-for="w in WORLDS"
            :key="w.id"
            class="chip-ink min-h-[28px]"
            :class="redirectReason(w.id)
              ? 'cursor-not-allowed border-ink/15 bg-ink/5 text-ink-faint'
              : w.id === effectiveWorldId ? 'text-gold-ink' : 'text-azure'"
            :disabled="redirectReason(w.id) !== null"
            :title="redirectReason(w.id) ?? `今日定向到「${w.name}」`"
            :aria-label="redirectReason(w.id) ? `${w.name} · ${redirectReason(w.id)}` : `今日定向到「${w.name}」`"
            @click="redirectTo(w.id)"
          >{{ w.name }}{{ w.id === effectiveWorldId ? ' ·' : '' }}</button>
        </div>
      </div>
      <p v-if="player.suppressedRegions.length > 0" class="text-[10px] text-gold-ink">
        镇压收益中 {{ player.suppressedRegions.length }} 处 —— 与历练互不冲突,可同时收取;一次只能历练一处。
      </p>
      <!--
        途中三档:际遇 / 奇缘 / 机缘。
        从前它们在弹窗里长得一模一样(标题都叫「际遇」),低概率的机缘等于白设了稀有度。
        这三枚胶囊把档位、稀有度与一句话摆在**出发之前**,名字与概率全部取自 core/eventTier,
        与事件引擎真正掷的那条乘法链同源(见 data/constants 那段)。
      -->
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
        <span class="text-ink-faint">途中三档:</span>
        <span v-for="t in EVENT_TIERS" :key="t.id" class="chip-ink text-[10px]" :style="{ color: t.color }">
          {{ t.name }} · {{ tierOddsText(t.id, chainPending, exploreEventChance(adventure.session?.regionId ?? '', player.finalStats.mods)) }}
        </span>
      </p>
      <!--
        镇压规则压成一行:地界行里已经逐项写着「当前值 / 需≤阈值」,
        这里只交代一句总纲(四条长句堆在列表前面就是一堵文字墙)。
      -->
      <p class="text-[10px] leading-relaxed text-ink-faint">
        镇压门槛:胜 {{ SUPPRESS_THRESHOLDS.minWins }} 场 · 均
        {{ SUPPRESS_THRESHOLDS.maxAvgRounds }} 回合 · 受伤 ≤{{ Math.round(SUPPRESS_THRESHOLDS.maxAvgDamageTaken * 100) }}%;
        资格永久,守满 {{ REVIVE_AFTER_HOURS }} 小时妖气复聚。
      </p>
      <div class="space-y-2.5">
        <template v-for="group in groupedRows" :key="group.world.id">
          <div class="flex items-center gap-2 pt-1">
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

    <!-- 模式选择 + 战斗前预览:开关留宿主,预览与三档账随弹窗本体 -->
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
  import { effectiveFavoredWorld, todayMansionLine, mansionLuckPercent, currentGameDay } from '@/core/astronomy'
  import { worldDef } from '@/data/realms'
  import { worldView } from '@/core/mortalWorldService'
  import { isRetreating } from '@/core/earlyGameService'
  import { MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX } from '@/data/constants'
  import { exploreEventChance, startExploration } from '@/core/exploration'
  import { EVENT_TIERS, tierOddsText } from '@/core/eventTier'
  import { pendingChainStages } from '@/core/eventEngine'
  import { SUPPRESS_THRESHOLDS } from '@/core/suppress'
  import { REVIVE_AFTER_HOURS } from '@/core/worldMemory'
  import { gn } from '@/utils/gnum'
  import { formatGN } from '@/utils/format'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { useRegionRows } from '@/composables/useRegionRows'

  const adventure = useAdventureStore()
  const route = useRoute()
  const router = useRouter()
  const player = usePlayerStore()
  const ui = useUiStore()
  const resources = useResourcesStore()

  /**
   * 地界投影与分组 —— 本页只负责把它们摆出来,事实取自 `useRegionRows`
   * (区域卡与「出发前预览」各自消费同一份投影)。
   */
  const { groupedRows } = useRegionRows()

  /** 出行方式弹窗的开关留宿主:卡片只交出「哪一处」,预览与三档账随弹窗本体 */
  const modeTarget = ref<RegionDef | null>(null)

  /**
   * 有没有缘在续 —— 三档的稀度**此刻**是多少,取决于这个。
   *
   * 引擎的掷法是先掷奇缘(闸门 0.3,且必须真有该走的下一程)、再掷机缘、
   * 剩下才是际遇;故「际遇约每 6 程」只在无缘在续时成立(有缘在续时约每 9 程,
   * 那三成去了奇缘)。档位胶囊按当前状态显示,而不是报一组永远同时成立的数。
   */
  const chainPending = computed(() => pendingChainStages(player.major).length > 0)

  /** 顶部链接的一句话:说清这一世是什么世界 */
  const worldBrief = computed(() => {
    const w = adventure.mortalWorld
    if (!w) return '此世气象未明,一观便知'
    const view = worldView(w, id => id)
    return view.title
  })

  /** 今日星象:值日之宿所利界域,由此知今日该往哪一片地界走 */
  const mansionLine = computed(() => todayMansionLine())
  /** 今日所利界域(有效口径):有生效定向走定向,否则随值日之宿 */
  const effectiveWorldId = computed(() => effectiveFavoredWorld())
  const favoredWorldName = computed(() => worldDef(effectiveWorldId.value).name)
  /** 值日之宿所利的百分数:一处来源(astronomy),历练页与界域志共此一枚 */
  const mansionLuckPct = computed(() => mansionLuckPercent())

  /** 星象值日定向的展示与动作(Phase A-2) */
  const mansionRedirectOpen = ref(false)
  const redirectCostText = formatGN(gn(MANSION_REDIRECT_COST))
  const mansionRedirectMax = MANSION_REDIRECT_MAX
  /** 按钮上标注当前定向状态:今日已定向到某界则点名 */
  const redirectActiveText = computed(() => {
    const mr = player.mansionRedirect
    return mr && mr.worldId === effectiveWorldId.value ? ` · ${worldDef(mr.worldId).name}` : ''
  })
  function redirectTo(id: WorldId): void {
    const ok = player.redirectFavoredWorld(id)
    const name = worldDef(id).name
    ui.toast(ok ? `今日定向到「${name}」` : '今日次数已尽 / 已定向此界 / 灵石不足', ok ? 'info' : 'warn')
  }
  /** 该界此刻能否定向:不能则给出一句原因。判据与 redirectFavoredWorld 同一套(见 player.ts),
   *  但改在点击前置灰标出 —— 灵石不足/次数已尽/已定向此界不该缩成一个点了没反应的死按钮。 */
  function redirectReason(w: WorldId): string | null {
    const day = currentGameDay()
    const cur = player.mansionRedirect
    if (cur && cur.gameDay === day) {
      if (cur.worldId === w) return '已定向此界'
      if (cur.count >= mansionRedirectMax) return '今日次数已尽'
    }
    if (!resources.hasStone(gn(MANSION_REDIRECT_COST))) return '灵石不足'
    return null
  }

  /**
   * 从本世之界页带回来的地界 —— 直接打开出行方式弹窗。
   *
   * 模式选择连着适配预览与流派推荐,只此一处实现;
   * 世界页只负责把「去哪」交回来
   */
  onMounted(() => {
    const go = route.query.go
    if (typeof go !== 'string') return
    const r = regionDef(go)
    if (r) modeTarget.value = r
    router.replace({ path: '/adventure' })
  })

  function chooseMode(region: RegionDef): void {
    /*
     * 闭关期间不许外出历练 —— 这条早该在这里说。
     *
     * 此前只由 startExploration 兜底:玩家点了「出发」,模式窗照开,三选一之后才被告知
     * 「你正在闭关静修」——话是对的,但让人先白走一步。同一句拒绝,越早说越好。
     */
    if (isRetreating()) {
      ui.toast('你正在闭关静修,心无旁骛,暂勿外出历练', 'warn')
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

  /** 停取收益 / 转为镇压收益:资格保留,随时可一键切回 */
  function toggleSuppress(regionId: string): void {
    const r = regionDef(regionId)
    const name = r?.name ?? '此地'
    if (player.suppressedRegions.includes(regionId)) {
      player.unsuppressRegion(regionId)
      ui.toast(`${name}已停取镇压收益,重新成为历练之地`, 'info')
    } else {
      player.suppressRegion(regionId)
      ui.toast(`你重掌${name}——镇压依旧,收益自取`, 'success')
    }
  }
</script>
