<template>
  <div
    data-region-card
    class="card-ink px-4 py-3"
    :class="{ 'opacity-70': !row.canEnter, '!border-gold-ink/30 bg-gold-ink/5': row.suppressed }"
  >
    <!--
      第一行只放图标 + 名字 + 标签 + 一个短动作。
      长信息(产出速率 / 守土时长 / 复聚倒计时)一律下移成整行:同排会把名字挤成竖排,且横向溢出检测抓不到。
    -->
    <div class="flex items-start gap-3">
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-md"
        :class="row.suppressed ? 'bg-gold-ink/15 text-gold-ink' : row.canEnter ? 'bg-indigo-ink/10 text-indigo-ink' : 'bg-ink/6 text-ink-faint'"
      >
        <GameIcon :name="row.suppressed ? 'shield-check' : row.canEnter ? row.def.icon : 'lock'" :size="18" />
      </span>
      <div data-region-head class="min-w-0 grow">
        <!-- 标签可换行,不挤名字 -->
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span data-region-name class="font-kai text-[15px] tracking-wider text-ink">{{ row.def.name }}</span>
          <span v-if="row.suppressed && !row.revived" class="chip-ink border-gold-ink/60 text-[9px] text-gold-ink">已镇压</span>
          <span v-else-if="row.revived" class="chip-ink border-cinnabar/60 text-[9px] text-cinnabar">妖气复聚</span>
          <span v-else-if="row.cleared" class="chip-ink border-jade/60 text-[9px] text-jade">已靖</span>
          <!-- 区域兴衰 -->
          <span
            v-if="recall.prosperity !== 'chaos'"
            class="chip-ink text-[9px]"
            :class="recall.prosperity === 'flourish' ? 'border-azure/60 text-azure' : 'border-jade/60 text-jade'"
          >
            {{ prosperityName(recall.prosperity) }}
          </span>
        </p>
        <p class="mt-0.5 text-[11px] text-ink-faint">
          {{ REALMS[row.def.minRealm]?.name }}境相宜 ·
          <!--
            危险度是 1~5 的可数量,原先只写成两个字:「凶险」与「大凶」差多少,
            得先记住五个词的次序(见 ui/dangerMark)。沿用本世地界页那套点阵。
          -->
          <span
            class="danger-pips"
            :class="{ 'danger-pips--severe': danger.severe }"
            role="img"
            :aria-label="`危险度 ${danger.label}`"
            :title="`危险度 ${danger.label}`"
          >
            <i v-for="(on, i) in dangerPips(danger)" :key="i" :class="{ on }" />
          </span>
          <span :class="danger.severe ? 'text-cinnabar' : ''">{{ danger.name }}</span>
          <span v-if="row.tooHard" class="ml-1 text-cinnabar">· 境界未到</span>
          <!-- 复聚状态读落盘的 adventure.revived -->
          <span v-if="row.revived" class="ml-1 text-cinnabar">· 旧主归来</span>
          <!-- 掉落阶位与 generateEquipment 同一档(region.tier);nowrap 防 320px 下数字与量词断行(layout-check 抓的) -->
          <span class="ml-1 whitespace-nowrap text-ink-soft">· {{ produceTierText(row.def.tier) }}</span>
        </p>
        <!-- 敌人层级补偿,与战后归因同源(regionFoeOrigin);出行方式与灵兽之性那一半在出行弹窗 -->
        <p v-if="row.foeOrigin.parts.length" data-region-foe-origin class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
          此地之敌:{{ foeOriginPartsText(row.foeOrigin) }}
        </p>
      </div>
      <!-- 「已靖」只是标记,不封路 -->
      <button
        v-if="row.canEnter && !row.suppressed"
        data-region-action
        class="btn-seal shrink-0 !px-4 !py-2 !text-[13px]"
        @click="emit('depart', row.def)"
      >
        出发
      </button>
    </div>

    <!-- 镇压中的产出条:整行、可换行,长数字才放得下 -->
    <div
      v-if="row.suppressed"
      data-region-action
      data-suppress-info
      class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gold-ink/10 px-2.5 py-1.5"
    >
      <span class="text-[11px] text-gold-ink tabular">自动产出 · {{ rateText }}</span>
      <!-- 镇压同样掉装备,阶位同取 region.tier;nowrap 同上 -->
      <span class="whitespace-nowrap text-[10px] text-ink-faint tabular">{{ produceTierText(row.def.tier) }}</span>
      <span class="text-[10px] text-ink-faint tabular">已守 {{ heldText }}</span>
      <span v-if="daoText" class="text-[10px] text-azure tabular">道韵 {{ daoText }}</span>
      <span v-if="tenureLuck > 0" class="text-[10px] text-jade tabular">装备气运 +{{ tenureLuck.toFixed(1) }}</span>
      <span class="text-[10px] tabular" :class="reviveNow <= 12 ? 'text-cinnabar' : 'text-ink-faint'">
        妖气 {{ reviveText(reviveNow) }}后复聚
      </span>
      <!-- 次级动作放产出条里,不占名字那一行 -->
      <button
        class="ml-auto inline-flex min-h-[28px] items-center px-1 text-[10px] text-ink-faint underline underline-offset-2 active:scale-90 active:text-ink"
        @click.stop="emit('toggle-suppress', row.def.id)"
      >
        停取收益
      </button>
    </div>

    <!-- 已取得镇压资格:转收益入口同样整行,不挤「出发」 -->
    <div
      v-else-if="row.canEnter && row.qualified"
      data-region-action
      class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink/4 px-2.5 py-1.5"
    >
      <span class="text-[10px] text-ink-faint">已取得镇压资格</span>
      <span class="text-[10px] text-gold-ink tabular">{{ rateText }}</span>
      <button
        class="ml-auto chip-ink min-h-[28px] !text-[10px] active:scale-90"
        @click.stop="emit('toggle-suppress', row.def.id)"
      >
        转为镇压收益
      </button>
    </div>
    <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">
      <!-- 被本世路线拦时(blockReason)只讲那一条,不与「需击败某主」并存 -->
      <template v-if="row.canEnter">{{ row.def.desc }}</template>
      <template v-else-if="!row.blockReason">需击败{{ prevRegionName }}之主</template>
    </p>
    <!-- 镇压资格进度:三条判据的当前值与阈值,未达标项标红 -->
    <p
      v-if="row.canEnter && !row.suppressed && !row.qualified"
      class="mt-1 text-[10px] leading-relaxed tabular"
    >
      <span class="text-ink-soft">镇压资格</span>
      <span class="ml-1" :class="row.progress.winsOk ? 'text-jade' : 'text-ink-soft'">
        {{ row.progress.wins }}/{{ row.progress.needWins }} 胜
      </span>
      <template v-if="row.progress.hasStats">
        <span class="ml-1.5" :class="row.progress.roundsOk ? 'text-ink-faint' : 'text-cinnabar'">
          均 {{ row.progress.avgRounds.toFixed(1) }} 回合(需≤{{ row.progress.maxAvgRounds }})
        </span>
        <span class="ml-1.5" :class="row.progress.damageOk ? 'text-ink-faint' : 'text-cinnabar'">
          均受伤 {{ Math.round(row.progress.avgDamagePct * 100) }}%(需≤{{ Math.round(row.progress.maxAvgDamagePct * 100) }}%)
        </span>
      </template>
      <span v-else class="ml-1.5 text-ink-faint">暂无战绩</span>
    </p>
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
      <!-- min-h-[28px] 是排版自检的触达下限;无理由可展时只报星级,不留点了没反应的按钮 -->
      <button
        v-if="row.adaptation && row.adaptation.reasons.length"
        class="ml-auto inline-flex min-h-[28px] items-center text-[10px] text-ink-soft tabular active:scale-90"
        :title="row.adaptation.reasons.join(';')"
        :aria-expanded="adaptExpand"
        @click="adaptExpand = !adaptExpand"
      >
        适配
        <span class="text-gold-ink">{{ starsText(row.adaptation.stars) }}</span>
      </button>
      <span v-else-if="row.adaptation" class="ml-auto inline-flex min-h-[28px] items-center text-[10px] text-ink-soft tabular">
        适配
        <span class="text-gold-ink">{{ starsText(row.adaptation.stars) }}</span>
      </span>
    </div>
    <div v-if="adaptExpand && row.adaptation?.reasons.length" class="mt-1">
      <p v-for="(r, i) in row.adaptation.reasons" :key="i" class="text-[10px] leading-relaxed text-ink-faint">· {{ r }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { RegionDef } from '@/types'
  import { regionDef } from '@/data/regions'
  import { dangerMark, dangerPips } from '@/ui/dangerMark'
  import { REALMS } from '@/data/realms'
  import { ECO_LEVEL_NAMES, starsText } from '@/core/buildAdvisor'
  import { foeOriginPartsText } from '@/core/battleAnalysis'
  import { suppressDaoText, suppressionEquipmentLuck, suppressRateLine } from '@/core/suppress'
  import { hoursUntilRevive, prosperityName, regionRecallFor, regionReviveClock } from '@/core/worldMemory'
  import { usePlayerStore } from '@/stores/player'
  import { useNow } from '@/composables/useNow'
  import { produceTierText } from '@/ui/produceText'
  import GameIcon from '@/components/common/GameIcon.vue'
  import type { RegionRow } from '@/composables/useRegionRows'

  const props = defineProps<{ row: RegionRow }>()
  /** 危险度形制(见 ui/dangerMark);在脚本里算一次,模板不反复调同一个函数 */
  const danger = computed(() => dangerMark(props.row.def.danger))
  const emit = defineEmits<{
    /** 出发;出行方式弹窗的开关在宿主 */
    depart: [region: RegionDef]
    /** 停取收益 / 转为镇压,由宿主执行 */
    'toggle-suppress': [regionId: string]
  }>()

  const player = usePlayerStore()
  /** 每秒推进的读数:复聚倒计时与已守时长靠它重算,直接调 `Date.now()` 不会触发 computed 重算 */
  const now = useNow()

  /** 适配原因点按展开(移动端无 hover) */
  const adaptExpand = ref(false)

  /** 兴衰随 now 就地重算,不读区域大表的静态快照(否则跨 6 / 24 小时不翻档) */
  const recall = computed(() => regionRecallFor(props.row.def.id, now.value))

  /** 产出行文案走 core/suppress 的单源实现,与「镇压达成」回执同一份数字 */
  const rateText = computed(() => suppressRateLine(props.row.def.id, recall.value.prosperity))

  /**
   * 复聚剩余小时:就地读 now,不进地界表(免每秒整表重算)。
   * 钟须用结算那一份 regionReviveClock(当地战斗 / 镇压 / 靖平取最晚),不能只看 suppressedSince。
   */
  const reviveNow = computed(() =>
    props.row.suppressed ? hoursUntilRevive(regionReviveClock(props.row.def.id), now.value) : 0
  )

  /** 已守时长,自镇压起算 */
  const heldText = computed(() => {
    const since = player.suppressedSince[props.row.def.id]
    if (since === undefined) return '—'
    const hours = Math.max(0, Math.floor((now.value - since) / 3_600_000))
    return hours < 24 ? `${hours} 时` : `${Math.floor(hours / 24)} 日`
  })

  /** 镇守道韵:文案走 core/suppress,判据与结算的 `suppressionExpRate` 同一份,卡片不自乘 8% */
  const daoText = computed(() => {
    if (!props.row.suppressed) return ''
    const line = suppressDaoText(player.suppressedRegions.length)
    return line === '—' ? '' : line
  })

  /** 老区装备气运:与结算读同一个 `suppressionEquipmentLuck`;不足一天为 0,不显示 */
  const tenureLuck = computed(() => {
    if (!props.row.suppressed) return 0
    const since = player.suppressedSince[props.row.def.id]
    return since === undefined ? 0 : suppressionEquipmentLuck(since, now.value)
  })

  const prevRegionName = computed(() =>
    props.row.def.requireCleared ? (regionDef(props.row.def.requireCleared)?.name ?? '') : ''
  )

  function reviveText(hours: number): string {
    if (hours >= 24) return `${Math.floor(hours / 24)} 日`
    return `${Math.max(0, Math.floor(hours))} 时`
  }
</script>
