<template>
  <div
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
        :class="row.suppressed ? 'bg-gold-ink/15 text-gold-ink' : row.canEnter ? 'bg-indigo-ink/10 text-indigo-ink' : 'bg-ink/6 text-ink-faint'"
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
            v-if="recall.prosperity !== 'chaos'"
            class="chip-ink text-[9px]"
            :class="recall.prosperity === 'flourish' ? 'border-azure/60 text-azure' : 'border-jade/60 text-jade'"
          >
            {{ prosperityName(recall.prosperity) }}
          </span>
        </p>
        <p class="mt-0.5 text-[11px] text-ink-faint">
          {{ REALMS[row.def.minRealm]?.name }}境相宜 ·
          <span :class="row.def.danger >= 4 ? 'text-cinnabar' : ''">{{ DANGER_NAMES[row.def.danger] }}</span>
          <span v-if="row.tooHard" class="ml-1 text-cinnabar">· 境界尚浅,恐有性命之忧</span>
          <!-- 复聚要说出「该怎么办」:旧主归来了,再历一程即可复靖 -->
          <span v-if="row.revived" class="ml-1 text-cinnabar">· 旧主归来,再历一程即可复靖</span>
          <!-- 掉落阶位与 generateEquipment 用的同一档(region.tier):「此界掉几阶」出发前就亮着。
               nowrap:320px 上这句曾被从空格处断行,数字与量词拆成两行(layout-check 抓的) -->
          <span class="ml-1 whitespace-nowrap text-ink-soft">· {{ produceTierText(row.def.tier) }}</span>
        </p>
        <!--
          敌人的「层级补偿」此前只落在数值里:玩家看到的只是一只小怪,打起来却像换了一身装备。
          此处与战后归因同源(regionFoeOrigin)—— 出行方式与灵兽之性那一半在出行弹窗里摊开。
        -->
        <p v-if="row.foeOrigin.parts.length" data-region-foe-origin class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
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
        @click="emit('depart', row.def)"
      >
        出发
      </button>
    </div>

    <!--
      镇压中的产出条:整行铺开、可换行。
      速率放在这里而不是右上角,长数字(1.2 亿灵石每小时 · 玄铁 12/时)才有地方舒展
    -->
    <div
      v-if="row.suppressed"
      data-region-action
      data-suppress-info
      class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gold-ink/10 px-2.5 py-1.5"
    >
      <span class="text-[11px] text-gold-ink tabular">自动产出 · {{ rateText }}</span>
      <!-- 镇压也在掉装备,阶位照旧取 region.tier(与 generateEquipment 同源);
           nowrap 同上:320 窄屏不许「4 阶」被拆成两行 -->
      <span class="whitespace-nowrap text-[10px] text-ink-faint tabular">{{ produceTierText(row.def.tier) }}</span>
      <!-- 守土之年:守得越久,兴衰越盛,产出随之上浮 -->
      <span class="text-[10px] text-ink-faint tabular">已守 {{ heldText }}</span>
      <!--
        镇守道韵与装备成长同属「守久了有什么好处」:从前卡面只讲灵石与物产,
        玩家看不到「压着这几处」在修为与装备上换来了什么。判据与结算同源
        (suppressionExpRate),不让卡片自己乘一遍区数 × 8%。
      -->
      <span v-if="daoText" class="text-[10px] text-azure tabular">道韵 {{ daoText }}</span>
      <span v-if="tenureLuck > 0" class="text-[10px] text-jade tabular">装备气运 +{{ tenureLuck.toFixed(1) }}</span>
      <!-- 复聚有确定期限,就该有倒计时:否则玩家只会看到镇压某天突然消失 -->
      <span class="text-[10px] tabular" :class="reviveNow <= 12 ? 'text-cinnabar' : 'text-ink-faint'">
        妖气 {{ reviveText(reviveNow) }}后复聚
      </span>
      <!-- 停取收益是次级动作:放在产出条里,不跟名字抢那一行 -->
      <button
        class="ml-auto inline-flex min-h-[28px] items-center px-1 text-[10px] text-ink-faint underline underline-offset-2 active:scale-90 active:text-ink"
        @click.stop="emit('toggle-suppress', row.def.id)"
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
      <span class="text-[10px] text-gold-ink tabular">{{ rateText }}</span>
      <button
        class="ml-auto chip-ink min-h-[28px] !text-[10px] active:scale-90"
        @click.stop="emit('toggle-suppress', row.def.id)"
      >
        转为镇压收益
      </button>
    </div>
    <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">
      <!-- 进得去:给全景;进不去且没被本世路线拦:给旧链的「先击败某主」。
           被本世路线拦时(下头 blockReason)只讲那一条 —— 两条理由并存会指向,
           玩家不知道该往哪走 -->
      <template v-if="row.canEnter">{{ row.def.desc }}</template>
      <template v-else-if="!row.blockReason">需先击败{{ prevRegionName }}之主,方可踏足此地。</template>
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
      <span v-else class="ml-1.5 text-ink-faint">尚无战绩</span>
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
        class="ml-auto inline-flex min-h-[28px] items-center text-[10px] text-ink-soft tabular active:scale-90"
        :title="row.adaptation.reasons.join(';')"
        :aria-expanded="adaptExpand"
        @click="adaptExpand = !adaptExpand"
      >
        适配
        <span class="text-gold-ink">{{ starsText(row.adaptation.stars) }}</span>
      </button>
    </div>
    <div v-if="adaptExpand && row.adaptation" class="mt-1">
      <p v-for="(r, i) in row.adaptation.reasons" :key="i" class="text-[10px] leading-relaxed text-ink-faint">· {{ r }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { RegionDef } from '@/types'
  import { DANGER_NAMES, regionDef } from '@/data/regions'
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
  const emit = defineEmits<{
    /** 出发:出行方式弹窗的开关留在宿主,卡片只交出「哪一处」 */
    depart: [region: RegionDef]
    /** 停取收益 / 转为镇压:确认与播报随本体(exchange 由宿主执行) */
    'toggle-suppress': [regionId: string]
  }>()

  const player = usePlayerStore()
  /**
   * 复聚倒计时与「已守多久」都按墙钟走,得有一枚每秒推进的读数。
   *
   * 此前这两处直接调 `Date.now()`,而所在 computed 只依赖 player 的那几个字段 ——
   * 玩家停在历练页不动时,exp 之类的变化不会让它们重算,倒计时便冻在进页那一刻:
   * 「妖气 71 时后复聚」可以挂一整天不动,「已守 3 时」也不会长大。
   */
  const now = useNow()

  /** 适配原因点按展开(移动端无 hover) */
  const adaptExpand = ref(false)

  /**
   * 兴衰随守土时长自己翻档。
   *
   * 此前 `recall` 在区域大表里一次性算好,卡片只读那份静态快照 —— 玩家停在
   * 历练页跨过 6 / 24 小时时,「稳定 / 繁盛」章与产出速率都冻住,直到别处
   * store 变化或重进页面。现在只让这张卡随每秒游戏钟重算兴衰。
   */
  const recall = computed(() => regionRecallFor(props.row.def.id, now.value))

  /** 产出行文案收进 core/suppress 的单源实现 —— 与「镇压达成」回执共用一份数字 */
  const rateText = computed(() => suppressRateLine(props.row.def.id, recall.value.prosperity))

  /**
   * 复聚剩余小时:整卡里唯一随时间变的一列。
   * 就地读 now(与 heldText 同依赖),不让每秒一跳的读数拖着地界表整表重算。
   *
   * 喂给 hoursUntilRevive 的是**结算用的那一份钟**(regionReviveClock:最后一次
   * 在当地战斗 / 镇压 / 靖平取最晚),不是单看 suppressedSince。从前这里只给镇压
   * 时刻,玩家还在守着打的地界会一路倒数到「0 时后复聚」并停在那儿,而结算按
   * 最后一次战斗判「还早」—— 倒计时与真实期限当场分叉。
   */
  const reviveNow = computed(() =>
    props.row.suppressed ? hoursUntilRevive(regionReviveClock(props.row.def.id), now.value) : 0
  )

  /** 已守时长(自镇压起算)—— 守得越久,兴衰越盛 */
  const heldText = computed(() => {
    const since = player.suppressedSince[props.row.def.id]
    if (since === undefined) return '—'
    const hours = Math.max(0, Math.floor((now.value - since) / 3_600_000))
    return hours < 24 ? `${hours} 时` : `${Math.floor(hours / 24)} 日`
  })

  /**
   * 镇守道韵:手上有几处镇压,这里就写那句 —— 判据来自 core/suppress 的
   * `suppressionExpRate`(与结算同一份),卡片自己不乘 8%。
   */
  const daoText = computed(() => {
    if (!props.row.suppressed) return ''
    const line = suppressDaoText(player.suppressedRegions.length)
    return line === '—' ? '' : line
  })

  /**
   * 老区装备气运:守满一天 +0.1(封顶 +0.8)—— 镇不足一天时不必印一个 +0.0。
   * 与结算读同一个 `suppressionEquipmentLuck`。
   */
  const tenureLuck = computed(() => {
    if (!props.row.suppressed) return 0
    const since = player.suppressedSince[props.row.def.id]
    return since === undefined ? 0 : suppressionEquipmentLuck(since, now.value)
  })

  const prevRegionName = computed(() =>
    props.row.def.requireCleared ? (regionDef(props.row.def.requireCleared)?.name ?? '') : ''
  )

  /** 复聚倒计时文案:一天以上说日,一天以内说时 */
  function reviveText(hours: number): string {
    if (hours >= 24) return `${Math.floor(hours / 24)} 日`
    return `${Math.max(0, Math.floor(hours))} 时`
  }
</script>
