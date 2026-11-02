<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="card-ink px-4 py-4" :class="player.expFull ? 'card-charged' : ''">
      <div class="flex flex-col items-center gap-3">
        <CultivationOrb :active="retreating" :full="player.expFull" :progress="player.expProgress">
          <span class="font-kai text-[18px]">道</span>
        </CultivationOrb>
        <div class="text-center">
          <p class="font-kai text-[11px] tracking-[0.5em] text-ink-faint">{{ player.worldName }}</p>
          <p class="font-kai text-[30px] tracking-[0.3em] text-ink">{{ player.realm.name }}</p>
          <p class="mt-0.5 font-kai text-[14px] tracking-[0.4em] text-cinnabar">{{ player.subName }}</p>
          <p class="mt-1 text-[11px] text-ink-faint">{{ player.realm.desc }}</p>
          <!-- 这一境的出处(典籍 / 网文常用 / 道家本源) -->
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
            「{{ player.realm.basis }}」{{ player.realm.lore }}
          </p>
        </div>
      </div>
      <div class="mt-4">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <button class="-my-1 py-1.5 text-left active:opacity-60" @click="showCultBreakdown = true">
            修为 +{{ formatRate(player.cultPerSec) }}
            <!-- 与「灵气充盈约 X」那行互斥:一个报「还没到」,一个标「已经到了」(判据同 player.qiRich) -->
            <span v-if="player.qiRich" class="ml-1 rounded bg-jade/10 px-1 py-0.5 align-middle text-[9px] leading-none text-jade">
              灵气充盈
            </span>
            <span class="ml-0.5 text-[9px] text-ink-faint">来路 →</span>
          </button>
          <span>
            {{ formatGN(player.expFull ? player.expReq : player.exp) }} / {{ formatGN(player.expReq) }}
            <span v-if="player.expFull && player.expOverflow.m > 0" class="text-jade">
              · 积余 {{ formatGN(player.expOverflow) }}
            </span>
          </span>
        </div>
        <!-- 突破只扣这一境所需(advanceRealm 只减 expReq),积余带着走 -->
        <p v-if="player.expFull && player.expOverflow.m > 0" class="mt-0.5 text-right text-[9px] text-ink-faint">
          积余突破后保留
        </p>
        <div :class="player.expFull ? 'bar-charged' : ''">
        <ProgressBar :value="player.expProgress" color="var(--color-cinnabar)" :height="8" />
      </div>
      <p v-if="!player.expFull && expEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
        修为圆满约 {{ expEtaText }}
      </p>
      </div>
      <div class="mt-3">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <button class="-my-1 py-1.5 text-left active:opacity-60" @click="showQiBreakdown = true">
            灵气 +{{ formatRate(player.qiRegenPerSec) }}
            <span class="ml-0.5 text-[9px] text-ink-faint">来路 →</span>
          </button>
          <span title="灵气">
            {{ formatNum(Math.floor(Math.min(resources.qi, player.qiCapValue))) }} / {{ formatNum(player.qiCapValue) }}
            <span v-if="resources.qi > player.qiCapValue" class="text-azure">
              · 积余 {{ formatNum(Math.floor(resources.qi)) }} / {{ formatNum(player.qiBankCapValue) }}
            </span>
          </span>
        </div>
        <ProgressBar
          :value="Math.min(1, resources.qi / Math.max(1, player.qiCapValue))"
          color="var(--color-azure)"
          :height="8"
        />
        <!-- 未过灵气充盈线时报「充盈」(qiRich / QI_RICH_BONUS 同源),过了才报回满;两行互斥 -->
        <p v-if="qiRichEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          灵气充盈约 {{ qiRichEtaText }}<span class="text-ink-soft">(修为 +{{ qiRichBonusPct }})</span>
        </p>
        <p v-else-if="resources.qi < player.qiCapValue && qiEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          灵气回满约 {{ qiEtaText }}
        </p>
        <!-- 积余段:灵气越过标称容量 -->
        <p v-else-if="qiBankEtaText" class="mt-1 text-right text-[10px] text-ink-faint tabular">
          积余蓄满约 {{ qiBankEtaText }}
        </p>
        <button
          v-if="repair.injured"
          type="button"
          class="btn-seal mt-2 w-full !py-2 !text-[12px]"
          :disabled="!repair.affordable"
          @click="repairWithQi()"
        >
          {{ repairActLabel(repair.affordable, formatNum(repair.cost), formatGap(repair.shortfall)) }}
        </button>
      </div>

      <BreakthroughCard />
    </div>

    <section>
      <SectionTitle title="仙路" :hint="`已至 ${player.major + 1}/${REALMS.length} 境`" />
      <div class="card-ink mt-2 px-4 py-3">
        <RealmLadder :major="player.major" />
      </div>
    </section>

    <RetreatCard />


    <section>
      <SectionTitle title="状态" />
      <div v-if="activeBuffs.length" class="mt-2 flex flex-wrap gap-2">
        <!-- 倒数文本必须定宽(formatCountdown 逐位补零 + 固定宽度槽位),否则每秒刷新时整排胶囊会抖 -->
        <button
          v-for="b in activeBuffs"
          :key="b.def!.id"
          type="button"
          class="chip-ink !py-1.5 tabular transition-transform active:scale-90"
          :class="b.def!.kind === 'injury' ? 'border-cinnabar/60 text-cinnabar' : 'border-jade/60 text-jade'"
          @click="ui.buffDetailId = b.def!.id"
        >
          <GameIcon :name="b.def!.icon" :size="11" />
          {{ b.def!.name }}
          <span class="countdown-slot">{{ formatCountdown(b.remain) }}</span>
        </button>
      </div>
      <!-- 无状态时只报状态词,区域不整段消失 -->
      <div v-else class="mt-2 flex items-center gap-2 rounded-md border border-dashed border-ink/15 bg-ink/4 px-3 py-2">
        <GameIcon name="sparkles" :size="12" class="shrink-0 text-ink-faint" />
        <span class="text-[10px] leading-relaxed text-ink-faint">暂无状态</span>
      </div>
    </section>

    <section v-if="quickPills.length">
      <SectionTitle title="以药辅道" />
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="p in quickPills"
          :key="p.def!.id"
          class="card-ink flex items-center gap-2 px-3 py-2 text-left active:scale-98"
          :style="{ borderLeft: `2px solid ${pillQualityColor(p.def!)}` }"
          :disabled="p.overflow === 'full'"
          :aria-label="p.overflow === 'full' ? `${p.def!.name} · 药力已顶满` : undefined"
          @click="usePill(p.def!.id)"
        >
          <GameIcon :name="p.def!.icon" :size="16" :style="{ color: pillQualityColor(p.def!) }" />
          <span class="min-w-0 grow">
            <span class="block truncate font-kai text-[12px] text-ink">{{ p.def!.name }}</span>
            <span class="block text-[10px] text-ink-faint">存 {{ p.count }}</span>
          </span>
          <span class="text-[11px]" :class="p.overflow === 'full' ? 'text-cinnabar' : 'text-jade'">
            {{ p.overflow === 'full' ? '已顶' : '服用' }}
          </span>
        </button>
      </div>
    </section>

    <GongfaSection />

    <GongfaDialog />
    <BuffDialog />

    <BaseModal :open="showCultBreakdown" title="修为 · 来路" @close="showCultBreakdown = false">
      <div class="rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p class="text-ink-soft">
          基础 <span class="whitespace-nowrap">{{ formatRate(cultBase) }}</span>({{ player.realm.name }}{{ player.subName }}{{ player.linggen ? `·${player.linggen.gradeName}` : '' }})
          × (1 + <span class="tabular text-azure">{{ formatPercent(cultMultiplier) }}</span>)
          = <span class="whitespace-nowrap tabular text-cinnabar">{{ formatRate(player.cultPerSec) }}</span>
        </p>
        <p v-for="row in cultSources" :key="row.name" class="mt-0.5 flex justify-between">
          <span class="text-ink-faint">{{ row.name }}</span>
          <span class="tabular" :class="row.value > 0 ? 'text-azure' : 'text-cinnabar'">
            {{ signedPercent(row.value) }}
          </span>
        </p>
      </div>
    </BaseModal>

    <BaseModal :open="showQiBreakdown" title="灵气 · 来路" @close="showQiBreakdown = false">
      <div class="rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p class="text-ink-soft">
          上限:基础 <span class="whitespace-nowrap">{{ formatNum(qiBase) }}</span>({{ player.realm.name }}{{ player.subName }})
          <span v-if="qiArrayPct"> × 聚灵阵 +{{ qiArrayPct }}%</span>
          <span v-if="qiCapPct"> × 其余加成 +{{ formatPercent(qiCapPct) }}</span>
          = <span class="whitespace-nowrap tabular text-azure">{{ formatNum(player.qiCapValue) }}</span>
        </p>
        <p class="mt-1 text-ink-soft">
          回复:基础 <span class="whitespace-nowrap">{{ formatRate(qiRegenBase) }}</span> × (1 + <span class="tabular text-azure">{{ formatPercent(qiRegenMult) }}</span>) = <span class="whitespace-nowrap tabular text-cinnabar">{{ formatRate(player.qiRegenPerSec) }}</span>
        </p>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useDongfuStore } from '@/stores/dongfu'
  import CultivationOrb from '@/components/common/CultivationOrb.vue'
  import BreakthroughCard from '@/components/cultivation/BreakthroughCard.vue'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import { isRetreating } from '@/core/earlyGameService'
  import { baseCultPerSec, baseQiRegen, qiCap } from '@/core/formulas'
  import { modOf } from '@/core/statsCalc'
  import { expEtaSec, qiBankEtaSec, qiEtaSec, qiRichEtaSec } from '@/core/progress'
  import { usePill } from '@/core/pillService'
  import { buffOverflowOf, type BuffOverflow } from '@/core/buffCap'
  import { qiRepairView, repairWithQi } from '@/core/qiRepair'
  import { useNow } from '@/composables/useNow'
  import { buffDef } from '@/data/buffs'
  import { pillDef, pillQualityColor, pillRank } from '@/data/pills'
  import { QI_RICH_BONUS } from '@/data/constants'
  import { formatCountdown, formatDuration, formatGap, formatGN, formatNum, formatPercent, formatRate } from '@/utils/format'
  import { signedPercent } from '@/data/statNames'
  import { repairActLabel } from '@/ui/cultivationText'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import RealmLadder from '@/components/cultivation/RealmLadder.vue'
  import { REALMS } from '@/data/realms'
  import GameIcon from '@/components/common/GameIcon.vue'
  import GongfaDialog from '@/components/cultivation/GongfaDialog.vue'
  import GongfaSection from '@/components/cultivation/GongfaSection.vue'
  import BuffDialog from '@/components/cultivation/BuffDialog.vue'
  import RetreatCard from '@/components/cultivation/RetreatCard.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const player = usePlayerStore()
  const resources = useResourcesStore()
  const dongfu = useDongfuStore()

  /** 修炼速度来路:基础(境界/层) × (1 + 各来源之和);来源取自 finalStats.breakdown,与人物页属性明细同源 */
  const showCultBreakdown = ref(false)
  const cultBase = computed(() => baseCultPerSec(player.major, player.sub))
  const cultSources = computed(() =>
    player.finalStats.breakdown
      .map(r => ({ name: r.name, value: r.mods.cultivationSpeed ?? 0 }))
      .filter(r => r.value !== 0)
  )
  const cultMultiplier = computed(() => modOf(player.finalStats.mods, 'cultivationSpeed'))
  /** 修为圆满的估算时长文案(空白即不显示,见 core/progress.expEtaSec) */
  const expEtaText = computed(() => {
    const sec = expEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气回满的估算时长文案(空白即不显示,见 core/progress.qiEtaSec) */
  const qiEtaText = computed(() => {
    const sec = qiEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 距「灵气充盈」的估算时长文案;已到则不报 */
  const qiRichEtaText = computed(() => {
    const sec = qiRichEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气积余段的「蓄满」估算(空白即不显示,见 core/progress.qiBankEtaSec) */
  const qiBankEtaText = computed(() => {
    const sec = qiBankEtaSec()
    return sec > 0 ? formatDuration(sec) : ''
  })
  /** 灵气充盈的修为加成,取自常数 */
  const qiRichBonusPct = computed(() => formatPercent(QI_RICH_BONUS))

  /**
   * 灵气上限/恢复来路,与灵气条读同一份数:
   * 上限 = qiCap(境界,层) × dongfu.qiCapMult × (1 + finalStats 词条),floor 后入面板;回复 = baseQiRegen(境界) × (1 + 词条)。
   * 聚灵阵未建或词条为空时对应因子不渲染,乘积不变。
   */
  const showQiBreakdown = ref(false)
  const qiBase = computed(() => qiCap(player.major, player.sub))
  const qiArrayPct = computed(() => {
    const pct = (dongfu.qiCapMult - 1) * 100
    return pct > 0 ? Math.round(pct) : 0
  })
  const qiCapPct = computed(() => modOf(player.finalStats.mods, 'qiCapPct'))
  const qiRegenBase = computed(() => baseQiRegen(player.major))
  const qiRegenMult = computed(() => modOf(player.finalStats.mods, 'qiRegen'))
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()

  const now = useNow()

  // 是否闭关中:只给法球点亮(闭关卡本体在 components/cultivation/RetreatCard.vue)
  const retreating = computed(() => isRetreating())

  /** 灵气疗伤(修复)状态:负伤时才出现入口 */
  const repair = computed(() => qiRepairView())

  const activeBuffs = computed(() =>
    cultivation.buffs
      .map(b => ({ def: buffDef(b.defId), remain: Math.max(0, (b.endsAt - now.value) / 1000) }))
      .filter(x => x.def !== undefined)
  )

  /**
   * 修行丹药快捷栏,按品质降序。增益丹顶满时置灰并写「已顶」,与丹药详情、usePill 的 buffOverflowOf 同源;
   * 判据读 useNow,与结算同钟。
   */
  const quickPills = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => {
        const def = pillDef(id)
        const overflow: BuffOverflow | null =
          def?.kind === 'buff' && def.buffId
            ? buffOverflowOf(cultivation.buffs, def.buffId, now.value)
            : null
        return { def, count, overflow }
      })
      .filter(x => x.def !== undefined && x.count > 0)
      .filter(x => x.def!.kind === 'buff' || x.def!.instant?.expSecs || x.def!.instant?.expFixed || x.def!.instant?.qiPct)
      .sort((a, b) => pillRank(b.def!) - pillRank(a.def!))
      .slice(0, 4)
  )

</script>
