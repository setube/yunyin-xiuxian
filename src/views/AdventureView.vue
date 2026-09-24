<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 历练中 -->
    <template v-if="adventure.sessionActive">
      <CombatPanel />
    </template>

    <!-- 选择区域 -->
    <template v-else>
      <!-- 本世之界:链接入口,详情另开一页。历练地图仍在下方,照旧可走 -->
      <RouterLink to="/world" class="card-ink flex items-center gap-3 border-azure/30 px-4 py-3 active:scale-99">
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
        <span class="text-gold-ink">{{ favoredWorldName }}</span>
        ,在其地历练际遇更易(他处不加)。
      </p>
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
          {{ t.name }} · {{ tierOddsText(t.id, chainPending) }}
        </span>
      </p>
      <!--
        镇压规则压成一行:地界行里已经逐项写着「当前值 / 需≤阈值」,
        这里只交代一句总纲(四条长句堆在列表前面就是一堵文字墙)。
      -->
      <p class="text-[10px] leading-relaxed text-ink-faint">
        镇压门槛:{{ SUPPRESS_THRESHOLDS.minFights }} 战 · 均
        {{ SUPPRESS_THRESHOLDS.maxAvgRounds }} 回合 · 受伤 ≤{{ Math.round(SUPPRESS_THRESHOLDS.maxAvgDamageTaken * 100) }}%;
        资格永久,守满 {{ REVIVE_AFTER_HOURS }} 小时妖气复聚。
      </p>
      <div class="space-y-2.5">
        <template v-for="group in groupedRows" :key="group.world.id">
          <div class="flex items-center gap-2 pt-1">
            <span class="font-kai text-[11px] tracking-[0.3em] text-ink-soft">{{ group.world.name }}</span>
            <span class="h-px grow bg-ink/10" />
            <span class="text-[10px] text-ink-ghost">{{ group.rows.length }} 处</span>
          </div>
        <div
          v-for="row in group.rows"
          :key="row.def.id"
          data-region-card
          class="card-ink px-4 py-3"
          :class="{ 'opacity-70': !row.canEnter, '!border-gold-ink/30 bg-gold-ink/5': row.suppressed }"
        >
          <!--
            第一行只放「图标 + 名字 + 标签 + 一个短动作」。

            产出速率、守土时长、复聚倒计时这些**长信息一律下移成整行** —— 从前它们和名字挤在同一行,
            右侧那一列 `shrink-0` 把左边的名字压到只剩一个字宽,「青云山麓」当场变成竖排,
            标签还会盖到产出字上(无头浏览器量的「横向溢出」抓不到这种挤压:它不溢出,只是挤)。
          -->
          <div class="flex items-start gap-3">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-md"
              :class="row.suppressed ? 'bg-gold-ink/15 text-gold-ink' : row.canEnter ? 'bg-indigo-ink/10 text-indigo-ink' : 'bg-ink/6 text-ink-ghost'"
            >
              <GameIcon :name="row.suppressed ? 'shield-check' : row.canEnter ? row.def.icon : 'lock'" :size="18" />
            </span>
            <div data-region-head class="min-w-0 grow">
              <!-- 标签与名字同排但**可换行**:窄屏上宁可标签绕到下一行,也不许把名字挤成竖排 -->
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span data-region-name class="font-kai text-[15px] tracking-wider text-ink">{{ row.def.name }}</span>
                <span v-if="row.suppressed && !row.revived" class="chip-ink border-gold-ink/60 text-[9px] text-gold-ink">已镇压</span>
                <span v-else-if="row.revived" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">妖气复聚</span>
                <span v-else-if="row.cleared" class="chip-ink border-jade/60 text-[9px] text-jade">已靖</span>
                <!-- 世界记忆(Phase 30.9):区域兴衰状态 -->
                <span
                  v-if="row.recall.prosperity !== 'chaos'"
                  class="chip-ink text-[9px]"
                  :class="row.recall.prosperity === 'flourish' ? 'border-azure/60 text-azure' : 'border-jade/60 text-jade'"
                >
                  {{ prosperityName(row.recall.prosperity) }}
                </span>
              </p>
              <p class="mt-0.5 text-[11px] text-ink-faint">
                {{ REALMS[row.def.minRealm]?.name }}境相宜 ·
                <span :class="row.def.danger >= 4 ? 'text-cinnabar' : ''">{{ DANGER_NAMES[row.def.danger] }}</span>
                <span v-if="row.tooHard" class="ml-1 text-cinnabar">· 境界尚浅,恐有性命之忧</span>
              </p>
              <!--
                敌人的「层级补偿」此前只落在数值里:玩家看到的只是一只小怪,打起来却像换了一身装备。
                此处与战后归因同源(regionFoeOrigin)—— 出行方式与灵兽之性那一半在出行弹窗里摊开。
              -->
              <p v-if="row.foeOrigin.parts.length" data-region-foe-origin class="mt-0.5 text-[10px] leading-relaxed text-ink-ghost">
                此地之敌:{{ foeOriginPartsText(row.foeOrigin) }}
              </p>
            </div>
            <!--
              已通关的地界仍可再历 —— 「已靖」只是标记,不是封路。
              首领已清之后进去仍能刷杂兵、拾遗、碰机缘
            -->
            <button
              v-if="row.canEnter && !row.suppressed"
              data-region-action
              class="btn-seal shrink-0 !px-4 !py-2 !text-[13px]"
              @click="chooseMode(row.def)"
            >
              出发
            </button>
          </div>

          <!--
            镇压中的产出条:整行铺开、可换行。
            速率放在这里而不是右上角,长数字(1.2 亿灵石/时 · 玄铁 12/时)才有地方舒展
          -->
          <div
            v-if="row.suppressed"
            data-region-action
            data-suppress-info
            class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gold-ink/10 px-2.5 py-1.5"
          >
            <span class="text-[11px] text-gold-ink tabular">自动产出 · {{ rateText(row.def, row.recall) }}</span>
            <!-- 守土之年:守得越久,兴衰越盛,产出随之上浮 -->
            <span class="text-[10px] text-ink-faint tabular">已守 {{ heldText(row.def.id) }}</span>
            <!-- 复聚有确定期限,就该有倒计时:否则玩家只会看到镇压某天突然消失 -->
            <span class="text-[10px] tabular" :class="row.reviveInHours <= 12 ? 'text-cinnabar' : 'text-ink-faint'">
              妖气 {{ reviveText(row.reviveInHours) }}后复聚
            </span>
            <!-- 停取收益是次级动作:放在产出条里,不跟名字抢那一行 -->
            <button
              class="ml-auto inline-flex min-h-[28px] items-center px-1 text-[10px] text-ink-faint underline underline-offset-2 active:scale-95 active:text-ink"
              @click.stop="unsuppress(row.def.id)"
            >
              停取收益,改去历练
            </button>
          </div>

          <!--
            已取得镇压资格、眼前正在历练的地界:转收益的入口与产出同样整行铺开,
            不去挤右上角那枚「出发」
          -->
          <div
            v-else-if="row.canEnter && row.qualified"
            data-region-action
            class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink/4 px-2.5 py-1.5"
          >
            <span class="text-[10px] text-ink-faint">已取得镇压资格</span>
            <span class="text-[10px] text-gold-ink tabular">{{ rateText(row.def, row.recall) }}</span>
            <button
              class="ml-auto chip-ink min-h-[28px] !text-[10px] active:scale-95"
              @click.stop="suppress(row.def.id)"
            >
              转为镇压收益
            </button>
          </div>
          <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">
            <template v-if="row.canEnter">{{ row.def.desc }}</template>
            <template v-else>需先击败{{ prevRegionName(row.def) }}之主,方可踏足此地。</template>
          </p>
          <!--
            镇压资格进度:只显示「能不能镇压」时,玩家打够了场数却压不住,
            只能猜自己差在哪 —— 这里把三条判据的当前值与阈值并排摆出来,未达标项标红
          -->
          <p
            v-if="row.canEnter && !row.suppressed && !row.qualified"
            class="mt-1 text-[10px] leading-relaxed tabular"
          >
            <span class="text-ink-soft">镇压资格</span>
            <span class="ml-1" :class="row.progress.fightsOk ? 'text-jade' : 'text-ink-soft'">
              {{ row.progress.fights }}/{{ row.progress.needFights }} 战
            </span>
            <template v-if="row.progress.hasStats">
              <span class="ml-1.5" :class="row.progress.roundsOk ? 'text-ink-faint' : 'text-cinnabar'">
                均 {{ row.progress.avgRounds.toFixed(1) }} 回合(需≤{{ row.progress.maxAvgRounds }})
              </span>
              <span class="ml-1.5" :class="row.progress.damageOk ? 'text-ink-faint' : 'text-cinnabar'">
                均受伤 {{ Math.round(row.progress.avgDamagePct * 100) }}%(需≤{{ Math.round(row.progress.maxAvgDamagePct * 100) }}%)
              </span>
            </template>
            <span v-else class="ml-1.5 text-ink-ghost">尚无战绩</span>
          </p>
          <!-- 进不去时,理由指向眼下就能去的那一段,不让玩家自己排先后 -->
          <p v-if="row.blockReason" class="mt-1 text-[11px] text-cinnabar">{{ row.blockReason }}</p>
          <div v-if="row.canEnter && (row.chips.length || row.adaptation)" class="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              v-for="chip in row.chips"
              :key="chip.trait"
              class="chip-ink !text-[10px]"
              :class="chip.level >= 3 ? 'border-cinnabar/50 text-cinnabar' : 'border-ink/25 text-ink-faint'"
            >
              {{ chip.name }}·{{ ECO_LEVEL_NAMES[chip.level] }}
            </span>
            <!-- 适配原因点按展开:手机没有 hover,得知道自己为什么被看好/看衰 -->
            <!-- min-h-[28px] 是排版自检的尺子:展开按钮此前只有 15px 高,拇指点不着 -->
            <button
              v-if="row.adaptation"
              class="ml-auto inline-flex min-h-[28px] items-center text-[10px] text-ink-soft tabular active:scale-95"
              :title="row.adaptation.reasons.join(';')"
              :aria-expanded="adaptExpand === row.def.id"
              @click="adaptExpand = adaptExpand === row.def.id ? null : row.def.id"
            >
              适配
              <span class="text-gold-ink">{{ starsText(row.adaptation.stars) }}</span>
            </button>
          </div>
          <div v-if="adaptExpand === row.def.id && row.adaptation" class="mt-1">
            <p v-for="(r, i) in row.adaptation.reasons" :key="i" class="text-[10px] leading-relaxed text-ink-faint">· {{ r }}</p>
          </div>
        </div>
        </template>
      </div>
    </template>

    <!-- 模式选择 + 战斗前预览 -->
    <BaseModal :open="modeTarget !== null" :title="modeTarget?.name ?? ''" @close="modeTarget = null">
      <!-- 适配预览 -->
      <div v-if="preview" class="mb-3 rounded-md bg-ink/4 px-3 py-2.5">
        <template v-if="preview.mine && currentBuild">
          <p class="flex items-center justify-between text-[12px]">
            <span class="text-ink-soft">
              当前构筑:
              <span class="font-kai text-ink">{{ currentBuild.displayName }}</span>
            </span>
            <span class="tabular text-gold-ink">{{ starsText(preview.mine.stars) }}</span>
          </p>
          <p v-for="(r, i) in preview.mine.reasons" :key="i" class="mt-0.5 text-[10px] text-ink-faint">{{ r }}</p>
        </template>
        <p v-else class="text-[11px] text-ink-faint">尚未成流派,此地对各路数一视同仁。</p>
        <div class="ink-divider my-2" />
        <p class="text-[10px] text-ink-faint">此地相性(机制契合度,并非胜率):</p>
        <p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span v-for="rec in preview.recs" :key="rec.style.id" class="text-[11px] text-ink-soft tabular">
            {{ rec.style.name }}
            <span class="text-gold-ink">{{ starsText(rec.adaptation.stars) }}</span>
          </span>
        </p>
        <p class="mt-1.5 text-[10px] text-ink-ghost tabular">
          战力 {{ formatGN(player.finalStats.power) }} · 装备成色、词条与临场随机仍定成败
        </p>
      </div>
      <p class="text-[12px] text-ink-faint">此行欲作何打算?</p>
      <p class="mt-1 text-[10px] leading-relaxed text-ink-ghost">行程论这一程走多久;「历练遇敌」只令同程妖踪更密,不能缩地成寸。</p>
      <div class="mt-3 space-y-2">
        <button
          v-for="m in MODE_LIST"
          :key="m.id"
          class="flex w-full items-center justify-between rounded-lg border border-ink/20 px-4 py-3 text-left active:scale-98 active:bg-ink/5"
          @click="begin(m.id)"
        >
          <span>
            <span class="font-kai text-[14px] tracking-widest text-ink">{{ EXPLORE_MODES[m.id].name }}</span>
            <span class="ml-2 text-[11px]" :class="m.id === 'risky' ? 'text-cinnabar' : 'text-ink-faint'">{{ m.risk }}</span>
          </span>
          <!--
            收益一直是亮着的,危险却是暗的:三档里敌人差了 2.1 倍,玩家却只看得到钱。
            两个数并排摆出来,「要不要涉险」才是个可算的账。
          -->
          <span class="text-right text-[11px] text-ink-faint tabular">
            {{ departText(m.id) }}
          </span>
        </button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import type { ExploreMode, RegionDef, RegionRecall } from '@/types'
  import { useAdventureStore } from '@/stores/adventure'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { REGIONS, regionDef, DANGER_NAMES } from '@/data/regions'
  import { worldOf, type WorldDef } from '@/data/realms'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import SecretRealmCard from '@/components/adventure/SecretRealmCard.vue'
  import { todayMansion, favoredWorld, todayMansionLine } from '@/core/astronomy'
  import { worldDef } from '@/data/realms'
  import { canEnterRegion, entryBlockReason, worldView } from '@/core/mortalWorldService'
  import { isRetreating } from '@/core/earlyGameService'
  import { REALMS } from '@/data/realms'
  import { EXPLORE_MODES } from '@/data/constants'
  import {
    exploreBattleGapSec,
    exploreDurationSec,
    exploreRewardMult,
    explorationFoeDanger,
    regionFoeOrigin,
    startExploration
  } from '@/core/exploration'
  import { currentRegionEvent } from '@/core/regionEvent'
  import { modOf } from '@/core/statsCalc'
  import { departButtonText } from '@/ui/adventureText'
  import { EVENT_TIERS, tierOddsText } from '@/core/eventTier'
  import { pendingChainStages } from '@/core/eventEngine'
  import { foeOriginPartsText } from '@/core/battleAnalysis'
  import { SUPPRESS_THRESHOLDS, suppressRateFor, suppressionProgress } from '@/core/suppress'
  import { REVIVE_AFTER_HOURS, hoursUntilRevive, regionRecallFor, prosperityName, isReviving, prosperityYieldMult } from '@/core/worldMemory'
  import { mulN } from '@/utils/gnum'
  import { detectBuild } from '@/core/buildDetect'
  import { detectionAdaptation, ecologyChips, ECO_LEVEL_NAMES, recommendForRegion, regionEcology, starsText } from '@/core/buildAdvisor'
  import { formatGN } from '@/utils/format'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import CombatPanel from '@/components/adventure/CombatPanel.vue'

  const adventure = useAdventureStore()
  const route = useRoute()
  const router = useRouter()
  const player = usePlayerStore()
  const ui = useUiStore()

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
  const favoredWorldName = computed(() => worldDef(favoredWorld(todayMansion())).name)
  /** 区域适配原因点按展开(移动端无 hover) */
  const adaptExpand = ref<string | null>(null)

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

  const MODE_LIST: { id: ExploreMode; risk: string }[] = [
    { id: 'normal', risk: '安稳' },
    { id: 'deep', risk: '小险' },
    { id: 'risky', risk: '大凶' }
  ]

  const currentBuild = computed(() => detectBuild(player.finalStats.mods))

  const regionRows = computed(() =>
    REGIONS.map(r => {
      const eco = regionEcology(r)
      const suppressed = player.suppressedRegions.includes(r.id)
      const recall = regionRecallFor(r.id)
      const revived = suppressed && isReviving(player.suppressedSince[r.id], Date.now())
      return {
        def: r,
        // 旧链:这处地界是否**已被发现** —— 决定列表可见性、锁图标与简介
        unlocked: adventure.unlocked.includes(r.id),
        // 统一准入谓词:此刻**能否进去** —— 决定出发按钮。
        // 两者必须分开:visibleRows 按「已发现」截断列表,
        // 若拿准入当可见性,路线上未轮到的地界会把后面能进的一并藏掉
        canEnter: canEnterRegion(r.id),
        blockReason: entryBlockReason(r.id),
        cleared: adventure.cleared.includes(r.id),
        suppressed,
        revived,
        /** 是否取得过镇压资格(取得即永久,此后可自由在历练/收益之间切换) */
        qualified: player.suppressQualified.includes(r.id),
        recall,
        /** 镇压资格进度(三条判据的当前值/阈值) */
        progress: suppressionProgress(player.regionStats[r.id]),
        /** 距妖气复聚还剩几小时(未镇压为 0) */
        reviveInHours: suppressed ? hoursUntilRevive(player.suppressedSince[r.id]) : 0,
        tooHard: r.minRealm > player.major,
        /** 此地之敌的加成来源(层级补偿 × 地界凶险;出行方式那一档另算) */
        foeOrigin: regionFoeOrigin(r),
        // 第一层信息:只保留最强的两个生态标签
        chips: ecologyChips(eco).slice(0, 2),
        adaptation: currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
      }
    })
  )

  /** 出发预览:当前构筑适配 + 推荐方向 */
  const preview = computed(() => {
    if (!modeTarget.value) return null
    const eco = regionEcology(modeTarget.value)
    const mine = currentBuild.value ? detectionAdaptation(currentBuild.value, eco) : null
    const recs = recommendForRegion(modeTarget.value).slice(0, 2)
    return { mine, recs }
  })

  /**
   * 只展示到「第一个既未发现、也进不去」为止再多一个,保持神秘感。
   *
   * 截断条件必须带上 canEnter:本世路线的首段可能排在地界表靠后的位置,
   * 若只按旧链截断,它会被挡在可见范围外 —— 实测新号因此整页 0 个出发按钮
   */
  const visibleRows = computed(() => {
    const rows = regionRows.value
    const firstLocked = rows.findIndex(r => !r.unlocked && !r.canEnter)
    return firstLocked < 0 ? rows : rows.slice(0, firstLocked + 1)
  })

  /**
   * 按界域分组展示:人间界/仙界/神界/混沌海的历练地界各自成段,便于在高界导航。
   *
   * 展示序 = 倒序(玩家反馈:「历练列表应该倒序排列,每次都要往下活动很久」)。
   * 进阶路线上每次新解锁的地界排在最上 —— 高界玩家常年只在列表底部那两格的苦,
   * 就是「新地界追着玩家跑」而不是要玩家去捞它。判定截断(visibleRows)仍在
   * **数据序**(由低到高)上算:谜一样的「下一个地界」谁也不提前剧透,
   * 只是摆出来的时候反着排罢了。
   */
  const groupedRows = computed(() => {
    const groups: { world: WorldDef; rows: typeof regionRows.value }[] = []
    for (const row of [...visibleRows.value].reverse()) {
      const world = worldOf(row.def.minRealm)
      const hit = groups.find(g => g.world.id === world.id)
      if (hit) hit.rows.push(row)
      else groups.push({ world, rows: [row] })
    }
    return groups
  })

  function departText(mode: ExploreMode): string {
    const region = modeTarget.value
    if (!region) return ''
    const eventId = currentRegionEvent(region.id)?.eventId ?? null
    const danger = explorationFoeDanger({
      tier: region.tier,
      mode,
      regionDanger: region.danger,
      petId: player.petId,
      eventId
    }).total
    return departButtonText({
      durationSec: exploreDurationSec(mode, player.petId),
      rewardMult: exploreRewardMult(mode, eventId),
      dangerMult: danger,
      battleGapSec: exploreBattleGapSec(modOf(player.finalStats.mods, 'explorationSpeed'))
    })
  }

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

  function prevRegionName(r: RegionDef): string {
    return r.requireCleared ? (regionDef(r.requireCleared)?.name ?? '') : ''
  }

  /** 停取收益,恢复主动历练(资格保留,随时可一键切回) */
  function unsuppress(regionId: string): void {
    player.unsuppressRegion(regionId)
    const r = regionDef(regionId)
    ui.toast(`${r?.name ?? '此地'}已停取镇压收益,重新成为历练之地`, 'info')
  }

  /** 已取得镇压资格者:一键切回收益态 —— 镇压过就是镇压过,不必再打满二十场 */
  function suppress(regionId: string): void {
    player.suppressRegion(regionId)
    const r = regionDef(regionId)
    ui.toast(`你重掌${r?.name ?? '此地'}——镇压依旧,收益自取`, 'success')
  }

  /**
   * 镇压区域每小时产出(灵石 + 该地界物产)。
   *
   * 速率取自 suppress.ts 的唯一实现(从前这里手抄 150 并注释「= stoneMultiplier」,
   * 常量一改界面就开始撒谎),并乘上当前兴衰系数 —— 显示的数与真正入账的数同源。
   */
  function rateText(r: RegionDef, recall: RegionRecall): string {
    const rate = suppressRateFor(r.id)
    if (!rate) return '—'
    const mult = prosperityYieldMult(recall.prosperity)
    const stone = `${formatGN(mulN(rate.stonePerHour, mult))}灵石/时`
    if (!rate.resource) return stone
    const perHour = Math.max(1, Math.round(rate.resource.perHour * mult))
    return `${stone} · ${rate.resource.name}${perHour}/时`
  }

  /** 复聚倒计时文案:一天以上说日,一天以内说时 */
  function reviveText(hours: number): string {
    if (hours >= 24) return `${Math.floor(hours / 24)} 日`
    return `${Math.max(0, Math.floor(hours))} 时`
  }

  /** 已守时长(自镇压起算)—— 守得越久,兴衰越盛 */
  function heldText(regionId: string): string {
    const since = player.suppressedSince[regionId]
    if (since === undefined) return '—'
    const hours = Math.max(0, Math.floor((Date.now() - since) / 3_600_000))
    return hours < 24 ? `${hours} 时` : `${Math.floor(hours / 24)} 日`
  }
</script>
