<template>
  <BaseModal :open="inst !== undefined" :title="template?.name ?? ''" top @close="close">
    <div v-if="inst && template && resolved">
      <div class="flex items-center gap-2">
        <QualityTag :quality="inst.quality" />
        <span class="text-[11px] text-ink-faint">{{ EQUIP_SLOT_NAMES[template.slot] }} · {{ inst.tier }} 阶</span>
        <span v-if="inst.level > 0" class="text-[11px] text-gold-ink tabular">+{{ inst.level }}</span>
        <button class="ml-auto text-ink-faint active:scale-90" @click="toggleLock">
          <GameIcon :name="inst.locked ? 'lock' : 'unlock'" :size="15" />
        </button>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-faint">{{ template.desc }}</p>
      <div class="ink-divider my-3" />
      <p v-if="compareTarget" class="mb-1.5 text-[10px] text-ink-ghost tabular">对比当前佩戴:「{{ compareTarget.name }}」(绿升红降)</p>
      <div class="space-y-1.5">
        <p v-for="row in flatRows" :key="row.label" class="flex justify-between text-[13px]">
          <span class="text-ink-soft">{{ row.label }}</span>
          <span class="tabular text-ink">
            {{ row.value }}
            <span v-if="row.diff" class="ml-1 text-[11px]" :class="row.up ? 'text-jade' : 'text-cinnabar'">({{ row.diff }})</span>
          </span>
        </p>
        <p v-for="row in fixedModRows" :key="row.label" class="flex justify-between text-[13px]">
          <span class="text-ink-soft">{{ row.label }}</span>
          <span class="tabular text-azure">{{ row.value }}</span>
        </p>
      </div>
      <template v-if="resolved.affixLines.length">
        <div class="ink-divider my-3" />
        <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">词 条</p>
        <div v-for="(line, i) in resolved.affixLines" :key="i" class="mb-1.5 rounded-md bg-violet-ink/7 px-3 py-1.5">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-kai text-[12px] text-violet-ink">「{{ line.name }}」</span>
              <span class="ml-1 text-[12px] text-ink-soft">{{ line.desc }}</span>
            </div>
            <button
              v-if="canSealAffix(line.id)"
              class="ml-2 shrink-0 text-[10px] text-azure active:scale-90"
              @click="doSealAffix(line.id)"
            >
              封存
            </button>
            <span v-else-if="isAffixSealed(line.id)" class="ml-2 shrink-0 text-[10px] text-jade">已封存</span>
          </div>
        </div>
      </template>
      <template v-if="buildPreview">
        <div class="ink-divider my-3" />
        <p class="flex items-center justify-between text-[12px]">
          <span class="text-ink-faint">装备后流派</span>
          <span class="tabular">
            <template v-if="buildPreview.before">
              <span class="text-ink-soft">{{ buildPreview.before.displayName }} {{ Math.round(buildPreview.before.affinity * 100) }}%</span>
            </template>
            <template v-else><span class="text-ink-ghost">未成路</span></template>
            <span class="mx-1 text-ink-ghost">→</span>
            <template v-if="buildPreview.after">
              <span
                class="font-kai"
                :class="buildPreview.after.affinity >= (buildPreview.before?.affinity ?? 0) ? 'text-jade' : 'text-cinnabar'"
              >
                {{ buildPreview.after.displayName }} {{ Math.round(buildPreview.after.affinity * 100) }}%
              </span>
            </template>
            <template v-else><span class="text-cinnabar">流派散去</span></template>
          </span>
        </p>
      </template>
      <template v-if="upCost">
        <div class="ink-divider my-3" />
        <p class="flex items-center justify-between text-[12px] text-ink-faint">
          <span>强化 +{{ inst.level + 1 }} / 上限 {{ equipLevelCap() }}</span>
          <span class="tabular">器灵尘×{{ upCost.dust }} · 灵石 {{ formatGN(upCost.stone) }}</span>
        </p>
      </template>
      <!-- 修士实验室:反事实换装推演(真仙可用) -->
      <template v-if="canWhatIf">
        <div class="ink-divider my-3" />
        <button v-if="!whatIf" class="btn-ghost w-full !py-1.5 !text-[12px]" @click="runWhatIf">天机推演 · 若换此装,四天局面如何?</button>
        <template v-else>
          <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">天机推演</p>
          <p class="text-[11px] text-ink-soft tabular">
            构筑:{{ whatIf.buildBefore?.displayName ?? '未成路' }}
            <span class="text-ink-ghost">→</span>
            {{ whatIf.buildAfter?.displayName ?? '流派散去' }}
          </p>
          <div class="mt-1 space-y-0.5">
            <p v-for="w in whatIf.worlds" :key="w.name" class="flex justify-between text-[11px]">
              <span class="text-ink-faint">{{ w.name }}</span>
              <span class="tabular">
                <span class="text-ink-ghost">{{ w.beforeText }}</span>
                <span class="mx-1 text-ink-ghost">→</span>
                <span :class="w.trend === 'up' ? 'text-jade' : w.trend === 'down' ? 'text-cinnabar' : 'text-ink-soft'">
                  {{ w.afterText }}
                </span>
              </span>
            </p>
          </div>
          <p v-if="whatIf.modChanges.length" class="mt-1 text-[10px] text-azure tabular">
            主要变化:{{ whatIf.modChanges.map(c => `${c.label} ${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}%`).join(' · ') }}
          </p>
          <p class="mt-0.5 text-[10px] text-ink-ghost">推演只述局面,不替你定夺。</p>
        </template>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-col gap-2">
        <!-- 重铸与封存 (Phase 30.1) -->
        <template v-if="reforgeCostVal || sealCostVal">
          <div class="flex gap-2 text-[11px]">
            <button v-if="reforgeCostVal" class="btn-ghost flex-1 !py-1" @click="doReforge">
              重铸随机词条
              <span class="ml-1 tabular text-[10px] text-ink-faint">
                {{ formatGN(reforgeCostVal.stone) }} · 尘×{{ reforgeCostVal.dust }}
              </span>
            </button>
            <div v-if="sealCostVal" class="flex flex-1 items-center justify-center rounded-md border border-azure/20 bg-azure/5 px-2 py-1 text-azure">
              封存一词 {{ formatGN(sealCostVal) }}
            </div>
          </div>
          <p v-if="inst" class="text-center text-[10px] text-ink-ghost tabular">
            重铸次数 {{ inst.reforgeCount ?? 0 }}/10 · 已封存 {{ (inst.sealedAffixIds ?? []).length }}/{{ Math.max(0, inst.affixes.length - 1) }}
          </p>
        </template>
        <div class="flex gap-2">
          <button class="btn-seal flex-1" @click="toggleEquip">{{ isEquipped ? '卸 下' : '装 备' }}</button>
          <button v-if="upCost" class="btn-ghost flex-1" @click="doUpgrade">强 化</button>
          <button class="btn-ghost px-3" :disabled="isEquipped || inst?.locked" @click="doDecompose">
            <GameIcon name="trash" :size="15" />
          </button>
        </div>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { equipmentTemplate, EQUIP_SLOT_NAMES } from '@/data/equipment'
  import { resolveEquipStats } from '@/core/equipGen'
  import { decomposeEquipment, equipLevelCap, equipUpgradeCost, upgradeEquipment } from '@/core/forge'
  import { detectBuild } from '@/core/buildDetect'
  import { endgameUnlocked } from '@/core/endgameService'
  import { whatIfEquip, type WhatIfReport } from '@/core/lab'
  import { reforgeEquipment, reforgeCost, sealAffix, sealCost } from '@/core/reforge'
  import { usePlayerStore } from '@/stores/player'
  import { formatGN, formatPercent } from '@/utils/format'
  import { isZero, sub } from '@/utils/gnum'
  import type { AnyStatKey, GNum } from '@/types'
  import { STAT_NAMES } from '@/ui/statNames'
  import BaseModal from '@/components/common/BaseModal.vue'
  import QualityTag from '@/components/common/QualityTag.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const ui = useUiStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const template = computed(() => (inst.value ? equipmentTemplate(inst.value.templateId) : undefined))
  const resolved = computed(() => (inst.value ? resolveEquipStats(inst.value) : null))
  const isEquipped = computed(() => (inst.value && template.value ? inventory.equipped[template.value.slot] === inst.value.uid : false))
  const upCost = computed(() => (inst.value ? equipUpgradeCost(inst.value.uid) : null))

  // ---- 重铸与封存 (Phase 30.1) ----
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))

  function isAffixSealed(affixId: string): boolean {
    return (inst.value?.sealedAffixIds ?? []).includes(affixId)
  }

  function canSealAffix(affixId: string): boolean {
    return inst.value !== undefined && sealCostVal.value !== null && !isAffixSealed(affixId)
  }

  function doSealAffix(affixId: string): void {
    if (inst.value) sealAffix(inst.value.uid, affixId)
  }

  function doReforge(): void {
    if (inst.value) reforgeEquipment(inst.value.uid)
  }

  // ---- 修士实验室:反事实换装推演 ----
  const whatIf = ref<WhatIfReport | null>(null)
  const canWhatIf = computed(() => endgameUnlocked() && !isEquipped.value && inst.value !== undefined)

  function runWhatIf(): void {
    if (inst.value) whatIf.value = whatIfEquip(inst.value.uid)
  }

  watch(inst, () => {
    whatIf.value = null
  })

  /** 换装流派预览:契合度 当前 → 装备后 */
  const buildPreview = computed(() => {
    if (!inst.value || !template.value || isEquipped.value) return null
    const slot = template.value.slot
    const mods = { ...player.finalStats.mods }
    const applyDelta = (source: Record<string, number | undefined>, sign: 1 | -1): void => {
      for (const k in source) {
        const key = k as keyof typeof mods
        mods[key] = (mods[key] ?? 0) + sign * (source[k] ?? 0)
      }
    }
    const currentUid = inventory.equipped[slot]
    if (currentUid) {
      const currentItem = inventory.findItem(currentUid)
      if (currentItem) applyDelta(resolveEquipStats(currentItem).mods, -1)
    }
    applyDelta(resolveEquipStats(inst.value).mods, 1)
    const before = detectBuild(player.finalStats.mods)
    const after = detectBuild(mods)
    if (!before && !after) return null
    return { before, after }
  })

  const flatRows = computed(() => {
    const r = resolved.value
    if (!r) return []
    // 与当前佩戴同部位件对比(自身已佩则不对比)
    const cur = compareTarget.value
    const curFlats = cur ? resolveEquipStats(cur.item).flats : null
    const rows: { label: string; value: string; diff: string; up: boolean }[] = []
    const push = (label: string, mine: GNum, theirs: GNum | null): void => {
      if (isZero(mine) && (theirs === null || isZero(theirs))) return
      let diff = ''
      let up = true
      if (theirs !== null) {
        const d = sub(mine, theirs)
        up = d.m >= 0
        if (!isZero(d)) diff = `${up ? '+' : '-'}${formatGN({ m: Math.abs(d.m), e: d.e })}`
      }
      rows.push({ label, value: `+${formatGN(mine)}`, diff, up })
    }
    push('攻击', r.flats.attack, curFlats?.attack ?? null)
    push('防御', r.flats.defense, curFlats?.defense ?? null)
    push('生命', r.flats.maxHp, curFlats?.maxHp ?? null)
    return rows
  })

  /** 对比对象:同部位当前佩戴件 */
  const compareTarget = computed(() => {
    if (!inst.value || !template.value || isEquipped.value) return null
    const curUid = inventory.equipped[template.value.slot]
    if (!curUid || curUid === inst.value.uid) return null
    const item = inventory.findItem(curUid)
    if (!item) return null
    return { item, name: equipmentTemplate(item.templateId)?.name ?? '当前佩戴' }
  })

  const fixedModRows = computed(() => {
    const t = template.value
    if (!t?.fixedMods) return []
    return Object.entries(t.fixedMods).map(([k, v]) => ({
      label: STAT_NAMES[k as AnyStatKey] ?? k,
      value: `+${formatPercent(v as number)}`
    }))
  })

  function close(): void {
    ui.equipDetailUid = null
  }

  function toggleEquip(): void {
    if (!inst.value || !template.value) return
    if (isEquipped.value) {
      inventory.unequip(template.value.slot)
    } else {
      inventory.equip(inst.value.uid, template.value.slot)
    }
  }

  function doUpgrade(): void {
    if (inst.value) upgradeEquipment(inst.value.uid)
  }

  function doDecompose(): void {
    if (!inst.value) return
    if (decomposeEquipment(inst.value.uid)) close()
  }

  function toggleLock(): void {
    if (!inst.value) return
    inventory.replaceItem({ ...inst.value, locked: !inst.value.locked })
  }
</script>
