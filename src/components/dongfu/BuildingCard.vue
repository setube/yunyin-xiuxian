<template>
  <div class="card-ink flex flex-col px-3 py-3" :class="[flashing ? 'card-flash' : '', featured ? 'px-4 py-3.5' : '']" @animationend.self="flashing = false">
    <div class="flex items-start gap-2.5">
      <span
        class="relative grid shrink-0 place-items-center rounded-md transition-colors"
        :class="[sealCls, featured ? 'h-11 w-11' : 'h-9 w-9']"
      >
        <GameIcon :name="props.def.icon" :size="featured ? 22 : 18" />
        <GameIcon v-if="locked" name="lock" :size="9" class="absolute -bottom-0.5 -right-0.5 rounded-full bg-paper p-[1px] text-gold-ink" />
      </span>
      <div class="min-w-0 grow">
        <!-- 名字独占整行:徽标与名字同行时,窄卡上名字会折成两行 -->
        <p
          class="truncate font-kai leading-snug"
          :class="[featured ? 'text-[15px]' : 'text-[14px]', level > 0 ? 'text-ink' : 'text-ink-soft']"
          :title="props.def.name"
        >
          {{ props.def.name }}
        </p>
        <!-- flex-wrap 不可去:窄卡(320 下内宽约 115px)放不下两签时,justify-between 会把左侧文字压成逐字竖排 -->
        <p class="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span
            :key="level"
            class="shrink-0 tabular text-[10px] animate-ink-pop"
            :class="level > 0 ? (atMax ? 'text-gold-ink' : atGateCap ? 'text-amber-ink' : 'text-ink-faint') : 'text-ink-faint'"
          >
            {{ level > 0 ? `${level}/${cap} 级` : '未启用' }}
          </span>
          <span
            v-if="atMax"
            class="shrink-0 rounded border border-gold-ink/40 bg-gold-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-ink"
          >圆满</span>
          <span
            v-else-if="atGateCap"
            class="shrink-0 rounded border border-amber-ink/40 bg-amber-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-ink"
          >辖限</span>
          <span
            v-else-if="locked"
            class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px] leading-none text-ink-faint"
          >需{{ gateName }}境</span>
        </p>
      </div>
    </div>
    <p class="mt-2 grow text-[11px] leading-relaxed text-ink-faint">
      {{ level > 0 ? props.def.effectText(level) : props.def.desc }}
    </p>
    <!-- 词条另起一行,不写进 effectText -->
    <p v-if="modLine" class="mt-1 text-[11px] leading-relaxed text-azure tabular">{{ modLine }}</p>
    <p v-if="nextGain" class="mt-1 text-[10px] leading-relaxed text-ink-faint">
      再进净得:<span class="tabular text-azure">{{ nextGain }}</span>
    </p>
    <p v-if="beastCompanionName" class="mt-1 flex items-center gap-1 text-[10px] text-jade">
      <GameIcon name="paw" :size="11" />相伴 · {{ beastCompanionName }}
    </p>
    <p v-if="studyStatusLine" class="mt-1 flex items-center gap-1 text-[10px] text-gold-ink">
      <GameIcon name="book" :size="11" />{{ studyStatusLine }}
    </p>
    <button class="btn-ghost mt-2 w-full !py-1.5 !text-[12px]" :disabled="!info.canUpgrade" @click="upgradeBuilding(props.def.id)">
      <!--
        每个「数 + 量词」各自 nowrap,只在分隔符处换行(窄屏会在数字与「石」之间断行)。
        外层 span 不可去:btn-ghost 是 flex 容器,散落的文本节点会各成 flex item 竖着堆。
      -->
      <template v-if="info.canUpgrade">
        <span class="leading-tight">
          <span class="whitespace-nowrap">{{ buildingActLabel(level) }} ·</span>
          <span class="whitespace-nowrap">{{ formatGN(info.stone) }} 石</span>
          <span v-if="info.ore > 0" class="whitespace-nowrap">· {{ info.ore }} 铁</span>
        </span>
      </template>
      <template v-else>
        <!-- 圆满/辖限头部已有彩签,按钮只给短态 -->
        <span v-if="locked" class="inline-flex items-center gap-1.5"><GameIcon name="lock" :size="11" />{{ info.reason }}</span>
        <template v-else>{{ atMax ? peakLabel() : atGateCap ? '辖于洞府' : info.reason }}</template>
      </template>
    </button>
    <!--
      连升行:与强化连升/祭炼连升同一套。
      flex-wrap + 文本保底宽不可去:窄卡(320 下内宽约 113px)上双钮已近满宽,flex-1 文本会被压成 0 宽竖排。

      两态正文用同一段:确认态原先只写「连升 N 级 · 灵石 X · 玄铁 Y」一行,
      而未确认态有「累积净得」「逐条预览」好几行 —— 一点「连 升」,这一段从 88.6px 缩到 52.5px,
      下面所有卡整体上移 36px(375 宽实测)。须知情的正是按下那一下,故正文两态相同;
      确认态只是把「连 升」换成「再想想 + 连 升」两枚,位置与高度都不动。
    -->
    
    <div v-if="plan.levels >= 2" class="mt-2 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
      <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
        连升至 <span class="font-kai text-[11px] text-cinnabar">第 {{ level + plan.levels }} 级</span>
        <span class="mt-0.5 block text-[9px] text-ink-faint tabular">
          共耗 <span class="whitespace-nowrap">灵石 {{ formatGN(plan.stone) }}</span><span
            v-if="plan.ore > 0"
            class="whitespace-nowrap"
          > · 玄铁 {{ plan.ore }} 块</span>
        </span>
        <span v-if="batchGain" class="mt-0.5 block text-[9px] text-jade tabular">累积净得:{{ batchGain }}</span>
        <span v-if="batchPreview.lines.length" class="mt-0.5 block text-[9px] leading-snug">
          <span v-for="line in batchPreview.lines" :key="line" class="block text-ink-soft">{{ line }}</span>
        </span>
      </p>
      <!--
        钮组整段右对齐成一行:两态都是「一行高」。若跟着正文挤同一行,
        320 宽下确认态那两枚放不下会折行 —— 段高从 88.6 涨到 113.4(实测),
        与「缩到 52.5」同为一类跳动,只是方向相反。
      -->
      <div class="flex w-full shrink-0 justify-end gap-1.5">
        <button v-if="batchArm" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchArm = false">再想想</button>
        <button v-if="batchArm" class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="runBatch()">连 升</button>
        <button v-else class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchArm = true">连 升</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { BuildingDef, StatMods } from '@/types'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { petDef } from '@/data/pets'
  import { pillDef } from '@/data/pills'
  import GameIcon from '@/components/common/GameIcon.vue'
  import {
    buildingUpgradeInfo,
    buildingUpgradePreview,
    buildingBatchPlan,
    upgradeBuilding,
    upgradeBuildingBatch
  } from '@/core/buildingService'
  import { studyEta } from '@/core/loreService'
  import { modsText } from '@/data/statNames'
  import { buildingActLabel, buildingGateRealmName } from '@/ui/buildingText'
  import { peakLabel } from '@/ui/peakLabel'
  import { formatDuration, formatGN } from '@/utils/format'

  const props = withDefaults(defineProps<{ def: BuildingDef; featured?: boolean }>(), { featured: false })

  const dongfu = useDongfuStore()

  const level = computed(() => dongfu.levels[props.def.id] ?? 0)
  /** 实际可达上限:洞府全局闸门与品类上限取小 */
  const cap = computed(() => dongfu.buildingCap(props.def.id))
  const info = computed(() => buildingUpgradeInfo(props.def.id))
  /** 连升计划:预览与执行同源 */
  const plan = computed(() => buildingBatchPlan(props.def.id))
  /** 连升整段预览:与 plan 同一步数(effectText 同源) */
  const batchPreview = computed(() =>
    buildingUpgradePreview(props.def.id, level.value, cap.value, Math.max(1, plan.value.levels))
  )
  /** 连升二步确认态;升级落成自动复位(见下方 watch) */
  const batchArm = ref(false)
  function runBatch(): void {
    batchArm.value = false
    upgradeBuildingBatch(props.def.id) // toast 由服务报
  }
  /** 未建且被境界闸门锁着(资源不足另走缺口句,不算锁) */
  const locked = computed(() => level.value === 0 && player.major < props.def.unlockRealm)
  /** 境界闸名:unlockRealm 即 REALMS 下标(见 buildingText) */
  const gateName = computed(() => buildingGateRealmName(props.def.unlockRealm))
  const player = usePlayerStore()
  const beastCompanionName = computed(() =>
    props.def.id === 'beast' && player.petId ? petDef(player.petId)?.name : undefined
  )
  /** 藏经阁(只 library)翻检线:读数与开炉页同一份 studyEta */
  const studyStatusLine = computed(() => {
    if (props.def.id !== 'library') return ''
    const eta = studyEta()
    if (!eta) return ''
    if (!eta.readingId && !eta.nextIsNew) return '暂无新方'
    if (eta.readingId) {
      const name = pillDef(eta.readingId)?.name ?? '某方'
      return `研读「${name}」· 约 ${formatDuration(eta.nextInSec)}`
    }
    return `翻检新方 · 约 ${formatDuration(eta.nextInSec)}`
  })
  const atMax = computed(() => level.value > 0 && level.value >= props.def.maxLevel)
  /** 被洞府辖限:未到品类上限,但已到 mansion 抬的档 */
  const atGateCap = computed(() => level.value > 0 && !atMax.value && level.value >= cap.value)
  const sealCls = computed(() => {
    if (locked.value) return 'bg-gold-ink/8 text-gold-ink'
    return level.value > 0 ? 'bg-cinnabar/10 text-cinnabar' : 'bg-ink/5 text-ink-faint'
  })
  const modLine = computed(() => {
    if (level.value <= 0 || !props.def.mods) return ''
    return modsText(props.def.mods(level.value))
  })

  /** 第 from 级到第 to 级的词条净得(mods 为累计值) */
  function deltaModsText(from: number, to: number): string {
    if (!props.def.mods) return ''
    const cur: StatMods = from > 0 ? props.def.mods(from) : {}
    const nxt = props.def.mods(to)
    const delta: StatMods = {}
    for (const k of Object.keys(nxt) as (keyof StatMods)[]) {
      const diff = (nxt[k] ?? 0) - (cur[k] ?? 0)
      if (typeof diff === 'number' && diff !== 0) delta[k] = diff
    }
    return modsText(delta)
  }

  const nextGain = computed(() => {
    if (!props.def.mods || level.value >= props.def.maxLevel || !info.value.canUpgrade) return ''
    return deltaModsText(level.value, level.value + 1)
  })

  const batchGain = computed(() => {
    if (!props.def.mods || !plan.value || plan.value.levels < 2) return ''
    return deltaModsText(level.value, level.value + plan.value.levels)
  })

  // 整卡金光一闪,动画播完自清
  const flashing = ref(false)
  watch(level, (nv, ov) => {
    if (nv > ov) flashing.value = true
    batchArm.value = false
  })
</script>
