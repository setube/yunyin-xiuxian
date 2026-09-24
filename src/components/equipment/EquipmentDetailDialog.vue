<template>
  <BaseModal :open="inst !== undefined" :title="template?.name ?? ''" top @close="close">
    <div v-if="inst && template && resolved">
      <div class="flex items-center gap-2">
        <QualityTag :quality="inst.quality" />
        <!-- 界域 + 阶位:同一句「23 阶」在人间界与仙界完全不是一回事,故写清是哪一界 -->
        <span class="text-[11px] text-ink-faint">
          {{ EQUIP_SLOT_NAMES[template.slot] }} · {{ worldNameOfTier(inst.tier) }} · {{ inst.tier }} 阶
        </span>
        <span v-if="inst.level > 0" class="text-[11px] text-gold-ink tabular">+{{ inst.level }}</span>
        <button
          class="-m-1.5 flex min-h-[28px] min-w-[28px] items-center justify-center p-1.5 text-ink-faint active:scale-90"
          :aria-label="inst.locked ? '解锁' : '锁定'"
          @click="toggleLock"
        >
          <GameIcon :name="inst.locked ? 'lock' : 'unlock'" :size="15" />
        </button>
      </div>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-faint">{{ template.desc }}</p>
      <!-- 装备标记(玩家反馈:同名装备想按不同流派区分) -->
      <div class="mt-2 flex items-center gap-2">
        <input
          v-model="noteDraft"
          :maxlength="4"
          placeholder="加个标记区分流派(≤4字)"
          class="min-w-0 grow rounded-md border border-ink/15 bg-paper-deep/60 px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-ghost focus:border-azure"
          @change="applyNote"
        />
        <button v-if="noteDraft" class="-my-1 px-1 py-1 text-[11px] text-ink-faint active:opacity-60" @click="clearNote">清除</button>
      </div>
      <!--
        共鸣是机制而非数值,但装备卡片此前一个字都不提:玩家在「要不要换掉这件」时,
        看不到它身上拴着一条会断的机制(见 core/equipSet)。
      -->
      <p v-if="setInfo" class="mt-1.5 text-[11px] leading-relaxed">
        <span class="font-kai" :class="setInfo.active ? 'text-jade' : 'text-violet-ink'">
          共鸣「{{ setInfo.def.name }}」{{ setInfo.count }}/{{ setInfo.def.required }}
        </span>
        <span class="ml-1 text-ink-faint">{{ setInfo.def.effectDesc }}</span>
      </p>
      <div class="ink-divider my-3" />
      <p v-if="compareTarget" class="mb-1.5 text-[10px] text-ink-faint tabular">对比当前佩戴:「{{ compareTarget.name }}」(绿升红降)</p>
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
        <!--
          条数上限按品质给(凡品 0~1 · 神品 6~9),这是玩家最该看见的一件事:
          一件装备的"上限"就在它的品质里,而重铸可以重掷条数 —— 只有把它摊在明面上,
          「要不要为这件洗下去」才算得清。
        -->
        <p class="mb-1.5 flex items-baseline justify-between font-kai text-[12px] tracking-[0.3em] text-ink-faint">
          <span>词 条</span>
          <span class="text-[10px] tracking-normal tabular">
            {{ inst.affixes.length }} / {{ affixCap }} 条
            <span class="ml-1 text-ink-ghost">({{ qualityName }}上限)</span>
          </span>
        </p>
        <!--
          词条一条一行:名目与稀有度在左、效果在右、**数值单独加粗**(见 resolveEquipStats
          的 before/value/after)。一件神品能挂九条,所以这一列要能扫:
          左边一列名目对齐、右边一列数字对齐,行与行之间不夹长度不一的句子。

          分成九行之后,原来「一条一个色块」的排法会把整张卡片压塌 ——
          色块摞起来,装备本身的层次反而看不见。改成整体一块底 + 行间细分隔线,
          稀有度交给左侧那道色边(与名目同色):一眼看得出哪条是撞上的大运,
          又不至于九块颜色抢戏。
        -->
        <ul class="overflow-hidden rounded-md bg-violet-ink/6">
          <li
            v-for="(line, i) in resolved.affixLines"
            :key="line.id"
            class="flex items-center gap-2 py-1.5 pl-2 pr-1.5"
            :class="i > 0 ? 'border-t border-violet-ink/12' : ''"
            :style="{ borderLeft: `2px solid ${AFFIX_RARITY_META[line.rarity].color}` }"
          >
            <span class="shrink-0 font-kai text-[12px]" :style="{ color: AFFIX_RARITY_META[line.rarity].color }">
              「{{ line.name }}」
            </span>
            <span class="shrink-0 text-[9px] opacity-80" :style="{ color: AFFIX_RARITY_META[line.rarity].color }">
              {{ AFFIX_RARITY_META[line.rarity].name }}
            </span>
            <span class="ml-auto min-w-0 text-right text-[11px] leading-snug text-ink-soft">
              {{ line.before }}<span class="tabular font-medium text-ink">{{ line.value }}</span>{{ line.after }}
            </span>
            <button
              v-if="canSealAffix(line.id)"
              class="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-azure active:scale-90 active:opacity-60"
              :aria-label="`封存词条${line.name}`"
              @click="doSealAffix(line.id)"
            >
              封存
            </button>
            <span v-else-if="isAffixSealed(line.id)" class="shrink-0 text-jade" role="img" aria-label="这条词条已封存">
              <GameIcon name="lock" :size="12" />
            </span>
          </li>
        </ul>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-ghost">
          排序:稀有度(传世 → 常见)→ 掷点;左侧色边即这一条的成色
        </p>
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
        <p class="mt-1 text-[11px] tabular text-azure">{{ equipNextLevelText(inst.level) }}</p>
      </template>
      <p v-if="salvage" class="mt-1 flex items-center justify-between text-[11px] text-ink-ghost">
        <span>分解返还{{ inst.level > 0 ? `(${salvageRefundPhrase()})` : '' }}</span>
        <span class="tabular">
          器灵尘×{{ salvage.dust }}
          <template v-if="!isZero(salvage.stone)"> · 灵石 {{ formatGN(salvage.stone) }}</template>
        </span>
      </p>
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
          <p class="mt-0.5 text-[10px] text-ink-faint">推演只述局面,不替你定夺。</p>
        </template>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-col gap-2">
        <!-- 重铸与封存 (Phase 30.1) -->
        <template v-if="reforgeCostVal || sealCostVal">
          <div class="flex gap-2 text-[11px]">
            <button v-if="reforgeCostVal" class="btn-ghost flex-1 !py-1" @click="doReforge">
              重铸词条
              <span class="ml-1 tabular text-[10px] text-ink-faint">
                {{ formatGN(reforgeCostVal.stone) }} · 尘×{{ reforgeCostVal.dust }}
              </span>
            </button>
            <div v-if="sealCostVal" class="flex flex-1 items-center justify-center rounded-md border border-azure/20 bg-azure/5 px-2 py-1 text-azure">
              封存一词 {{ formatGN(sealCostVal) }}
            </div>
          </div>
          <!--
            重铸到底做什么,得在按下之前说清:条数与数值一并重掷(封存的不动),
            不限次数、成本只随「阶数」与「封存数」走 —— 与旧版"越洗越贵、上限十次"不同。
          -->
          <p v-if="reforgeCostVal" class="text-center text-[10px] leading-relaxed text-ink-faint">
            重掷未封存的词条:条数(≤{{ affixCap }} 条)与数值一并重掷,封存的不动 · 不限次数,成本随阶数与封存数走
          </p>
          <p v-if="inst" class="text-center text-[10px] text-ink-ghost tabular">
            已重铸 {{ inst.reforgeCount ?? 0 }} 次 · 已封存 {{ (inst.sealedAffixIds ?? []).length }}/{{ sealCapacity(inst) }}
          </p>
        </template>
        <div class="flex gap-2">
          <button class="btn-seal flex-1" @click="toggleEquip">{{ isEquipped ? '卸 下' : '装 备' }}</button>
          <button v-if="upCost" class="btn-ghost flex-1" @click="doUpgrade">强 化</button>
          <!-- 分解二步确认:一件淬养过的装备(强化/封存/重铸)误触垃圾桶不该直接没 -->
          <template v-if="decomposeArm !== inst?.uid">
            <button
              class="btn-ghost px-3"
              :disabled="isEquipped || inst?.locked"
              aria-label="分解这件装备"
              @click="decomposeArm = inst?.uid ?? null"
            >
              <GameIcon name="trash" :size="15" />
            </button>
          </template>
          <template v-else>
            <button class="btn-seal !px-2.5 !text-[11px]" @click="doDecompose">分解?</button>
            <button class="btn-ghost px-2 text-[11px] text-ink-faint" @click="decomposeArm = null">算了</button>
          </template>
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
  import { equipSetDef, setCounts } from '@/core/equipSet'
  import { worldNameOfTier } from '@/core/formulas'
  import { resolveEquipStats } from '@/core/equipGen'
  import { decomposeEquipment, equipLevelCap, equipUpgradeCost, upgradeEquipment } from '@/core/forge'
  import { salvageOf, salvageRefundPhrase } from '@/core/salvage'
  import { detectBuild } from '@/core/buildDetect'
  import { endgameUnlocked } from '@/core/endgameService'
  import { whatIfEquip, type WhatIfReport } from '@/core/lab'
  import { reforgeEquipment, reforgeCost, sealAffix, sealCapacity, sealCost } from '@/core/reforge'
  import { qualityDef } from '@/data/qualities'
  import { usePlayerStore } from '@/stores/player'
  import { formatGN } from '@/utils/format'
  import { isZero, sub } from '@/utils/gnum'
  import type { AnyStatKey, GNum } from '@/types'
  import { AFFIX_RARITY_META, STAT_NAMES, statValueText } from '@/ui/statNames'
  import { equipNextLevelText } from '@/ui/equipText'
  import BaseModal from '@/components/common/BaseModal.vue'
  import QualityTag from '@/components/common/QualityTag.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const ui = useUiStore()
  const inventory = useInventoryStore()
  const player = usePlayerStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))

  /** 装备标记(玩家反馈:同名装备想按不同流派区分)。草稿随当前件走,空串 = 清除 */
  const noteDraft = ref('')
  watch(
    () => inst.value?.note,
    (n, old) => {
      // 只在来源变化时同步草稿;自己写回(applyNote)引发的同一值回灌不迭代
      if (n === noteDraft.value || n === old) return
      noteDraft.value = n ?? ''
    },
    { immediate: true }
  )

  function applyNote(): void {
    if (!inst.value) return
    const note = noteDraft.value.trim()
    inventory.replaceItem({ ...inst.value, note: note.length > 0 ? note.slice(0, 4) : undefined })
  }

  function clearNote(): void {
    noteDraft.value = ''
    applyNote()
  }
  const template = computed(() => (inst.value ? equipmentTemplate(inst.value.templateId) : undefined))
  const resolved = computed(() => (inst.value ? resolveEquipStats(inst.value) : null))
  const isEquipped = computed(() => (inst.value && template.value ? inventory.equipped[template.value.slot] === inst.value.uid : false))
  const upCost = computed(() => (inst.value ? equipUpgradeCost(inst.value.uid) : null))
  /** 分解返还:底材 + 强化投入的八成(练过的件拆了不至于血本无归,先把账摆出来) */
  const salvage = computed(() => (inst.value ? salvageOf(inst.value) : null))

  /**
   * 这件装备所属的共鸣与其当前件数(只数已佩戴的 —— 共鸣看的是挂载,不是行囊)。
   * 未佩戴时也照实显示「1/2」,让玩家在按下装备之前就看得见差几件。
   */
  const setInfo = computed(() => {
    const setId = template.value?.set
    if (!setId) return null
    const def = equipSetDef(setId)
    if (!def) return null
    const count = setCounts(inventory.equippedItems).get(setId) ?? 0
    return { def, count, active: count >= def.required }
  })

  // ---- 重铸与封存 (Phase 30.1) ----
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))
  /** 这一件按品质能有多少条词条:上限来自品质表,不在界面里另写一份 */
  const affixCap = computed(() => (inst.value ? qualityDef(inst.value.quality).affixes[1] : 0))
  const qualityName = computed(() => (inst.value ? qualityDef(inst.value.quality).name : ''))

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
      value: statValueText(k, v as number)
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

  const decomposeArm = ref<string | null>(null)

  function doDecompose(): void {
    if (!inst.value) return
    if (decomposeEquipment(inst.value.uid)) {
      decomposeArm.value = null
      close()
    }
  }

  function toggleLock(): void {
    if (!inst.value) return
    inventory.replaceItem({ ...inst.value, locked: !inst.value.locked })
  }
</script>
