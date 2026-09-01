<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 境界与突破(修为圆满时整卡蓄势充能) -->
    <div class="card-ink px-4 py-4" :class="player.expFull ? 'card-charged' : ''">
      <div class="text-center">
        <p class="font-kai text-[30px] tracking-[0.3em] text-ink">{{ player.realm.name }}</p>
        <p class="mt-0.5 font-kai text-[14px] tracking-[0.4em] text-cinnabar">{{ player.subName }}</p>
        <p class="mt-1 text-[11px] text-ink-faint">{{ player.realm.desc }}</p>
      </div>
      <div class="mt-4">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <span>修为 +{{ formatRate(player.cultPerSec) }}</span>
          <span>{{ formatGN(player.exp) }} / {{ formatGN(player.expReq) }}</span>
        </div>
        <div :class="player.expFull ? 'bar-charged' : ''">
          <ProgressBar :value="player.expProgress" color="var(--color-cinnabar)" :height="8" />
        </div>
      </div>
      <div class="mt-3">
        <div class="mb-1 flex justify-between text-[11px] text-ink-faint tabular">
          <span>灵气 +{{ formatRate(player.qiRegenPerSec) }}</span>
          <span>{{ formatNum(Math.floor(resources.qi)) }} / {{ formatNum(player.qiCapValue) }}</span>
        </div>
        <ProgressBar :value="resources.qi / Math.max(1, player.qiCapValue)" color="var(--color-azure)" :height="8" />
      </div>

      <div class="ink-divider my-4" />
      <div class="flex items-center justify-between text-[12px] text-ink-soft">
        <span>下一步:{{ btInfo.targetLabel }}</span>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <div class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
          <p class="text-[10px] text-ink-faint">突破成功率</p>
          <p class="tabular text-[16px] font-kai leading-tight" :class="btInfo.rate >= 0.7 ? 'text-jade' : 'text-cinnabar'">
            {{ btInfo.rateText }}
          </p>
        </div>
        <div class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
          <p class="text-[10px] text-ink-faint">渡劫成功率</p>
          <p v-if="btInfo.tribRate !== null" class="tabular text-[16px] font-kai leading-tight" :class="btInfo.tribRate >= 0.7 ? 'text-jade' : 'text-violet-ink'">
            {{ formatPercent(btInfo.tribRate, 0) }}
          </p>
          <p v-else class="text-[16px] font-kai leading-tight text-ink-ghost">非大关</p>
        </div>
      </div>
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        耗灵气 {{ formatNum(btInfo.qiCost) }}
        <template v-if="btInfo.needTribulation">
          ·
          <span class="text-violet-ink">此乃大关,需渡天劫</span>
        </template>
        <template v-else-if="btInfo.isMajor">· 大境界之槛</template>
      </p>
      <button
        class="btn-seal mt-3 w-full py-3!"
        :class="{ 'animate-glow-pulse pulse-ready': btInfo.ready }"
        :disabled="!btInfo.ready"
        @click="attemptBreakthrough()"
      >
        {{ btInfo.ready ? (btInfo.needTribulation ? '引 劫 突 破' : '尝 试 突 破') : btInfo.reason }}
      </button>
    </div>

    <!-- 状态 -->
    <section v-if="activeBuffs.length">
      <SectionTitle title="状态" />
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="b in activeBuffs"
          :key="b.def!.id"
          type="button"
          class="chip-ink transition-transform active:scale-95"
          :class="b.def!.kind === 'injury' ? 'border-cinnabar/60 text-cinnabar' : 'border-jade/60 text-jade'"
          @click="ui.buffDetailId = b.def!.id"
        >
          <GameIcon :name="b.def!.icon" :size="11" />
          {{ b.def!.name }} {{ formatDuration(b.remain) }}
        </button>
      </div>
    </section>

    <!-- 丹药速服 -->
    <section v-if="quickPills.length">
      <SectionTitle title="以药辅道" />
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="p in quickPills"
          :key="p.def!.id"
          class="card-ink flex items-center gap-2 px-3 py-2 text-left active:scale-98"
          @click="usePill(p.def!.id)"
        >
          <GameIcon :name="p.def!.icon" :size="16" :style="{ color: qualityDef(p.def!.quality).color }" />
          <span class="min-w-0 grow">
            <span class="block truncate font-kai text-[12px] text-ink">{{ p.def!.name }}</span>
            <span class="block text-[10px] text-ink-faint">存 {{ p.count }}</span>
          </span>
          <span class="text-[11px] text-jade">服用</span>
        </button>
      </div>
    </section>

    <!-- 功法 -->
    <section>
      <SectionTitle title="功法" :hint="`残页 ${resources.page}`" />
      <div class="mt-2 space-y-2">
        <!-- 主修 -->
        <button
          v-if="mainDef"
          class="card-ink flex w-full items-center gap-3 px-3.5 py-3 text-left active:scale-99"
          @click="ui.gongfaDetailId = mainDef.id"
        >
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cinnabar/10 font-kai text-cinnabar">主</span>
          <span class="min-w-0 grow">
            <span class="block truncate font-kai text-[14px] text-ink">{{ mainDef.name }}</span>
            <span class="block text-[11px] text-ink-faint">
              第 {{ cultivation.learned[mainDef.id] }} 层 · {{ qualityDef(mainDef.quality).name }}
            </span>
          </span>
          <GameIcon name="flame" :size="15" class="text-cinnabar/70" />
        </button>

        <!-- 已习得列表(限高滚动,功法过多不撑爆页面) -->
        <div class="card-ink max-h-64 divide-y divide-ink/7 overflow-y-auto px-1">
          <button
            v-for="def in learnedList"
            :key="def!.id"
            class="flex w-full items-center gap-3 px-2.5 py-2.5 text-left active:bg-ink/4"
            @click="ui.gongfaDetailId = def!.id"
          >
            <span class="font-kai text-[13px]" :style="{ color: qualityDef(def!.quality).color }">{{ def!.name }}</span>
            <span class="text-[10px] text-ink-faint">{{ cultivation.learned[def!.id] }} 层</span>
            <!-- Phase 31 A3:满级可悟道,已选分支则显示分支名 -->
            <span v-if="cultivation.gongfaBranch[def!.id]" class="text-[10px] text-gold-ink">
              {{ gongfaBranchDef(cultivation.gongfaBranch[def!.id])?.name }}
            </span>
            <span v-else-if="cultivation.learned[def!.id] >= (def!.maxLevel ?? 9)" class="text-[10px] text-azure">可悟道</span>
            <span class="ml-auto text-[10px]" :class="equipStateOf(def!.id) ? 'text-jade' : 'text-ink-ghost'">
              {{ equipStateOf(def!.id) || '未装配' }}
            </span>
          </button>
        </div>

        <button class="btn-ghost w-full" @click="comprehendGongfa()">于藏经阁参悟功法(残页×{{ COMPREHEND_PAGE_COST }})</button>
      </div>
    </section>

    <GongfaDialog />
    <BuffDialog />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import { attemptBreakthrough, breakthroughInfo } from '@/core/breakthrough'
  import { comprehendGongfa } from '@/core/gongfaService'
  import { usePill } from '@/core/pillService'
  import { useNow } from '@/composables/useNow'
  import { gongfaDef } from '@/data/gongfa'
  import { gongfaBranchDef } from '@/data/gongfaBranches'
  import { buffDef } from '@/data/buffs'
  import { pillDef } from '@/data/pills'
  import { COMPREHEND_PAGE_COST } from '@/data/constants'
  import { formatDuration, formatGN, formatNum, formatPercent, formatRate } from '@/utils/format'
  import { qualityDef } from '@/data/qualities'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import GongfaDialog from '@/components/cultivation/GongfaDialog.vue'
  import BuffDialog from '@/components/cultivation/BuffDialog.vue'

  const player = usePlayerStore()
  const resources = useResourcesStore()
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()
  const now = useNow()

  const btInfo = computed(() => breakthroughInfo())

  const activeBuffs = computed(() =>
    cultivation.buffs
      .map(b => ({ def: buffDef(b.defId), remain: Math.max(0, (b.endsAt - now.value) / 1000) }))
      .filter(x => x.def !== undefined)
  )

  const learnedList = computed(() =>
    Object.keys(cultivation.learned)
      .map(id => gongfaDef(id))
      .filter(d => d !== undefined)
      .sort((a, b) => qualityDef(b!.quality).rank - qualityDef(a!.quality).rank)
  )

  const mainDef = computed(() => (cultivation.mainGongfa ? gongfaDef(cultivation.mainGongfa) : undefined))

  /** 修行相关丹药快捷栏 */
  const quickPills = computed(() =>
    Object.entries(inventory.pills)
      .map(([id, count]) => ({ def: pillDef(id), count }))
      .filter(x => x.def !== undefined && x.count > 0)
      .filter(x => x.def!.kind === 'buff' || x.def!.instant?.expReqPct || x.def!.instant?.qiPct)
      .slice(0, 4)
  )

  function equipStateOf(id: string): string {
    if (cultivation.mainGongfa === id) return '主修'
    if (cultivation.subGongfa.includes(id)) return '辅修'
    return ''
  }
</script>
