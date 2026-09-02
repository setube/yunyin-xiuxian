<template>
  <BaseModal :open="def !== undefined" :title="def?.name ?? ''" @close="close">
    <div v-if="def">
      <div class="flex items-center gap-2">
        <QualityTag :quality="def.quality" />
        <span class="chip-ink border-ink/30 text-ink-soft">{{ GONGFA_TYPE_NAMES[def.type] }}</span>
        <span v-if="def.element" class="chip-ink" :style="{ color: ELEMENTS[def.element].color }">
          {{ ELEMENTS[def.element].name }}属性
        </span>
        <!-- Phase 32.2:同源功法参悟时更易撞见(倾向,非独占;无此灵根照样学得到) -->
        <span v-if="sameRoot" class="chip-ink border-gold-ink/40 text-gold-ink" title="与你的灵根同源,藏经阁参悟时更易撞见">同源</span>
        <span v-if="learned" class="ml-auto tabular text-[12px] text-gold-ink">第 {{ level }}/{{ def.maxLevel }} 层</span>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-faint">{{ def.desc }}</p>
      <p v-if="def.minRealm > player.major" class="mt-1 text-[11px] text-cinnabar">需更高境界方可参悟其精义</p>
      <div class="ink-divider my-3" />
      <template v-if="learned">
        <div class="space-y-1.5">
          <p v-for="row in modRows" :key="row.label" class="flex justify-between text-[13px]">
            <span class="text-ink-soft">{{ row.label }}</span>
            <span class="tabular text-azure">{{ row.value }}</span>
          </p>
          <p v-if="def.skill" class="flex justify-between text-[13px]">
            <span class="text-ink-soft">附带神通「{{ def.skill.name }}」</span>
            <span class="tabular text-cinnabar">{{ Math.round(def.skill.mult * 100) }}% 威力</span>
          </p>
        </div>
        <p v-if="upCost" class="mt-3 text-right text-[11px] text-ink-faint tabular">
          进修需 悟道点×{{ upCost.wudao }} · 残页×{{ upCost.page }}
        </p>
        <!-- Phase 31 A3:满级悟道,择一分支。文案须自解释——给什么、要不要慎重,按下之前就得看见 -->
        <div v-if="fullLevel && branches.length" class="mt-3">
          <p class="mb-1 font-kai text-[12px] tracking-[0.2em] text-ink-faint">功 行 圆 满 · 悟 道</p>
          <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">
            此功已修至顶层,可就其中一条道走到底,永久追加下方词条(转世不失)。
            <span class="text-cinnabar">道分歧路,一经择定终身不改。</span>
          </p>
          <div v-if="branchPicked" class="rounded-md bg-paper-deep/70 px-3 py-2">
            <p>
              <span class="font-kai text-[13px] text-gold-ink">{{ branchPicked.name }}</span>
              <span class="ml-2 text-[11px] text-ink-faint">{{ branchPicked.desc }}</span>
            </p>
            <p class="tabular mt-0.5 text-[11px] text-azure">{{ modText(branchPicked.mods) }}</p>
          </div>
          <div v-else class="space-y-1.5">
            <button
              v-for="b in branches"
              :key="b.id"
              class="flex w-full items-center justify-between gap-2 rounded-md border border-ink/20 px-3 py-2 text-left active:scale-98"
              @click="choose(b.id)"
            >
              <span class="min-w-0">
                <span class="font-kai text-[13px] text-ink">{{ b.name }}</span>
                <span class="ml-2 text-[11px] text-ink-faint">{{ b.desc }}</span>
                <span class="tabular mt-0.5 block text-[11px] text-azure">{{ modText(b.mods) }}</span>
              </span>
              <span class="shrink-0 text-[10px] text-azure">择此道 →</span>
            </button>
          </div>
        </div>
        <!-- 满级却无分支:也要交代一句,免得玩家满世界找入口 -->
        <p v-else-if="fullLevel" class="mt-3 text-[11px] text-ink-faint">此功已修至顶层,一以贯之,别无歧路可择。</p>
      </template>
      <p v-else class="text-[12px] text-ink-faint">尚未习得此功法。</p>
    </div>
    <template v-if="learned" #footer>
      <div class="flex gap-2">
        <button v-if="def?.type === 'main'" class="btn-seal flex-1" :disabled="isMain" @click="setMain">
          {{ isMain ? '主修中' : '设为主修' }}
        </button>
        <button v-else class="btn-seal flex-1" @click="toggleSub">
          {{ isSub ? '卸下辅修' : '设为辅修' }}
        </button>
        <button v-if="upCost" class="btn-ghost flex-1" @click="def && upgradeGongfa(def.id)">进 修</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { gongfaDef, GONGFA_TYPE_NAMES } from '@/data/gongfa'
  import { ELEMENTS } from '@/data/linggen'
  import { branchesFor, gongfaBranchDef } from '@/data/gongfaBranches'
  import { gongfaUpgradeCost, upgradeGongfa } from '@/core/gongfaService'
  import { gongfaAffinity, rootElements } from '@/core/linggenAffinity'
  import { gongfaModsAt } from '@/stores/cultivation'
  import { formatPercent } from '@/utils/format'
  import { STAT_NAMES } from '@/ui/statNames'
  import type { AnyStatKey, StatMods } from '@/types'
  import BaseModal from '@/components/common/BaseModal.vue'
  import QualityTag from '@/components/common/QualityTag.vue'

  const ui = useUiStore()
  const cultivation = useCultivationStore()
  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  const def = computed(() => (ui.gongfaDetailId ? gongfaDef(ui.gongfaDetailId) : undefined))
  const level = computed(() => (def.value ? (cultivation.learned[def.value.id] ?? 0) : 0))
  const learned = computed(() => level.value > 0)
  const upCost = computed(() => (def.value ? gongfaUpgradeCost(def.value.id) : null))

  /** 与灵根同源?判据直接取自参悟权重函数,标签与实际权重不可能分叉 */
  const sameRoot = computed(() => gongfaAffinity(def.value?.element, rootElements(player.linggen?.roots)) > 1)

  const modRows = computed(() => {
    if (!def.value || !learned.value) return []
    const mods = gongfaModsAt(def.value.id, level.value)
    return Object.entries(mods).map(([k, v]) => ({
      label: STAT_NAMES[k as AnyStatKey] ?? k,
      value: `+${formatPercent(v as number)}`
    }))
  })

  const isMain = computed(() => def.value && cultivation.mainGongfa === def.value.id)
  const isSub = computed(() => def.value && cultivation.subGongfa.includes(def.value.id))

  // Phase 31 A3:满级悟道分支
  const fullLevel = computed(() => (def.value ? level.value >= (def.value.maxLevel ?? 9) : false))
  const branches = computed(() => (def.value ? branchesFor(def.value.id) : []))
  const branchPicked = computed(() => {
    if (!def.value) return undefined
    const id = cultivation.gongfaBranch[def.value.id]
    return id ? gongfaBranchDef(id) : undefined
  })

  /** 把词条表摊成一行可读文案 —— 择道给什么,得在按下之前就摆在眼前 */
  function modText(mods: StatMods): string {
    return Object.entries(mods)
      .map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} +${formatPercent(v as number)}`)
      .join(' · ')
  }

  function choose(branchId: string): void {
    if (!def.value) return
    if (cultivation.chooseBranch(def.value.id, branchId)) {
      ui.toast(`已悟道「${gongfaBranchDef(branchId)?.name ?? ''}」`, 'rare')
    }
  }

  function close(): void {
    ui.gongfaDetailId = null
  }

  function setMain(): void {
    if (def.value) cultivation.equipMain(def.value.id)
  }

  function toggleSub(): void {
    if (!def.value) return
    const ok = cultivation.toggleSub(def.value.id, dongfu.subGongfaSlots)
    if (!ok) ui.toast(`辅修栏已满(${dongfu.subGongfaSlots} 个,升级藏经阁可扩容)`, 'warn')
  }
</script>
