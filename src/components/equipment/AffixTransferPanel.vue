<template>
  <div class="space-y-3">
    <!-- 一 转出:源件的词条。选中后收成一行,点「更换」重选 -->
    <section ref="outRef" class="scroll-mt-6">
      <p class="flex min-h-[28px] items-center justify-between">
        <span class="font-kai text-[12px] tracking-[0.3em] text-ink-faint">{{ TRANSFER_LABELS.out }}</span>
        <button
          v-if="flow.affixId"
          type="button"
          class="-my-1 min-h-[28px] px-1.5 text-[11px] text-azure active:opacity-60"
          @click="flow.pickAffix(null)"
        >
          {{ TRANSFER_LABELS.change }}
        </button>
      </p>
      <p v-if="flow.sourceLines.length === 0" class="py-3 text-center text-[11px] text-ink-faint">{{ TRANSFER_LABELS.noAffix }}</p>
      <div v-else role="group" :aria-label="TRANSFER_LABELS.out" class="mt-1 space-y-1.5">
        <button
          v-for="line in shownSourceLines"
          :key="line.id"
          type="button"
          :aria-pressed="flow.affixId ? flow.affixId === line.id : undefined"
          class="block w-full rounded-md border px-2.5 py-1.5 text-left active:opacity-60"
          :class="flow.affixId === line.id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/15 bg-paper-deep/50'"
          @click="flow.pickAffix(line.id)"
        >
          <span class="flex items-center gap-1.5">
            <span class="whitespace-nowrap font-kai text-[12px]" :style="{ color: AFFIX_RARITY_META[line.rarity].color }">「{{ line.name }}」</span>
            <span class="text-[9px]" :style="{ color: AFFIX_RARITY_META[line.rarity].color }">{{ AFFIX_RARITY_META[line.rarity].name }}</span>
            <span v-if="flow.sourceSealed.has(line.id)" class="text-jade" role="img" :aria-label="TRANSFER_LABELS.sealed"><GameIcon name="lock" :size="11" /></span>
          </span>
          <span class="mt-0.5 block text-[11px] leading-snug text-ink-soft">
            {{ line.before }}<span class="tabular font-medium text-ink">{{ line.value }}</span>{{ line.after }}
          </span>
        </button>
      </div>
    </section>

    <!-- 二 转入:接得了这一条的件。部位、品质不合的不列;已有这条且不更低的置灰 -->
    <section v-if="flow.affixId" ref="intoRef" class="scroll-mt-6">
      <p class="flex min-h-[28px] items-center justify-between">
        <span class="font-kai text-[12px] tracking-[0.3em] text-ink-faint">{{ TRANSFER_LABELS.into }}</span>
        <span v-if="flow.targetUid" class="flex gap-1">
          <button type="button" class="-my-1 min-h-[28px] px-1.5 text-[11px] text-azure active:opacity-60" @click="emit('view', flow.targetUid)">
            {{ TRANSFER_LABELS.view }}
          </button>
          <button type="button" class="-my-1 min-h-[28px] px-1.5 text-[11px] text-azure active:opacity-60" @click="flow.pickTarget(null)">
            {{ TRANSFER_LABELS.change }}
          </button>
        </span>
      </p>
      <p v-if="flow.candidates.length === 0" class="py-3 text-center text-[11px] text-ink-faint">{{ TRANSFER_LABELS.noTarget }}</p>
      <div v-else role="group" :aria-label="TRANSFER_LABELS.into" class="mt-1 space-y-1.5">
        <button
          v-for="c in shownCandidates"
          :key="c.item.uid"
          type="button"
          :aria-pressed="flow.targetUid ? flow.targetUid === c.item.uid : undefined"
          :disabled="c.block !== null"
          class="block w-full rounded-md border px-2.5 py-1.5 text-left active:opacity-60 disabled:border-dashed disabled:bg-transparent"
          :class="flow.targetUid === c.item.uid ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/15 bg-paper-deep/50'"
          @click="flow.pickTarget(c.item.uid)"
        >
          <span class="block truncate font-kai text-[12px]" :style="{ color: qualityDef(c.item.quality).color }">
            {{ itemName(c.item.templateId) }}<template v-if="c.item.level > 0"> +{{ c.item.level }}</template>
            <template v-if="c.item.note"> ·{{ c.item.note }}</template>
          </span>
          <span class="mt-0.5 block text-[10px] text-ink-faint">
            {{ slotName(c.item.templateId) }} · {{ qualityDef(c.item.quality).name }} · <span class="whitespace-nowrap">{{ c.item.tier }} 阶</span> ·
            <span class="whitespace-nowrap">词条 {{ c.item.affixes.length }}/{{ qualityDef(c.item.quality).affixes[1] }}</span>
            <span v-if="c.worn" class="ml-1 text-jade">{{ TRANSFER_LABELS.equipped }}</span>
            <span v-if="c.block !== null" class="ml-1 text-cinnabar">{{ transferBlockText(c.block, flow.affixId) }}</span>
          </span>
        </button>
      </div>
      <button
        v-if="!flow.targetUid && flow.hiddenCount > 0"
        type="button"
        class="mt-1.5 min-h-[28px] w-full text-center text-[11px] text-azure active:opacity-60"
        @click="flow.expandAll()"
      >
        {{ transferShowAllText(flow.candidates.length) }}
      </button>
    </section>

    <!-- 三 位置:新增,或顶替一条。每一项单独标价;被挡的写原因 -->
    <section v-if="flow.affixId && flow.target" ref="slotRef" class="scroll-mt-6">
      <p class="flex min-h-[28px] items-center">
        <span class="font-kai text-[12px] tracking-[0.3em] text-ink-faint">{{ TRANSFER_LABELS.slot }}</span>
      </p>
      <div role="group" :aria-label="TRANSFER_LABELS.slot" class="mt-1 space-y-1.5">
        <button
          v-for="l in flow.landings"
          :key="l.replaceId ?? '_append'"
          type="button"
          :aria-pressed="flow.replaceId !== undefined ? flow.replaceId === l.replaceId : undefined"
          :disabled="!l.check.ok"
          class="block w-full rounded-md border px-2.5 py-1.5 text-left active:opacity-60 disabled:border-dashed disabled:bg-transparent"
          :class="flow.replaceId === l.replaceId ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/15 bg-paper-deep/50'"
          @click="flow.pickSlot(l.replaceId)"
        >
          <span class="flex items-center gap-1.5 text-[12px]">
            <span v-if="l.replaceId === null" class="font-kai text-ink">{{ TRANSFER_LABELS.append }}</span>
            <template v-else>
              <span class="text-ink-faint">{{ TRANSFER_LABELS.replace }}</span>
              <span class="whitespace-nowrap font-kai" :style="{ color: rarityColor(l.replaceId) }">「{{ targetLine(l.replaceId)?.name }}」</span>
              <span v-if="flow.targetSealed.has(l.replaceId)" class="text-jade" role="img" :aria-label="TRANSFER_LABELS.sealed"><GameIcon name="lock" :size="11" /></span>
            </template>
          </span>
          <span v-if="l.replaceId !== null && targetLine(l.replaceId)" class="mt-0.5 block text-[11px] leading-snug text-ink-soft">
            {{ targetLine(l.replaceId)!.before }}<span class="tabular font-medium text-ink">{{ targetLine(l.replaceId)!.value }}</span>{{ targetLine(l.replaceId)!.after }}
          </span>
          <span v-if="l.check.ok" class="mt-0.5 block text-[10px] tabular text-ink-faint">
            <span class="whitespace-nowrap">{{ transferStoneText(l.check.plan.cost.stone) }}</span> ·
            <span class="whitespace-nowrap">尘×{{ l.check.plan.cost.dust }}</span>
          </span>
          <span v-else class="mt-0.5 block text-[10px] text-cinnabar">{{ transferBlockText(l.check.block, flow.affixId) }}</span>
        </button>
      </div>
    </section>

    <!-- 四 结果:落地后的词条表、封存、目标件的属性变化、源件失去什么 -->
    <section v-if="flow.plan && flow.target" ref="resultRef" class="scroll-mt-6">
      <p class="flex min-h-[28px] items-center justify-between">
        <span class="font-kai text-[12px] tracking-[0.3em] text-ink-faint">{{ TRANSFER_LABELS.result }}</span>
        <span class="text-[10px] tabular text-ink-faint">
          {{ transferCountText(flow.target.affixes.length, flow.plan.target.affixes.length, flow.targetCap) }}
        </span>
      </p>
      <ul class="mt-1 overflow-hidden rounded-md bg-violet-ink/6">
        <li
          v-for="(line, i) in flow.resultLines"
          :key="line.id"
          class="py-1.5 pl-2 pr-1.5"
          :class="i > 0 ? 'border-t border-violet-ink/10' : ''"
          :style="{ borderLeft: `2px solid ${AFFIX_RARITY_META[line.rarity].color}` }"
        >
          <span class="flex items-center gap-1.5">
            <span class="whitespace-nowrap font-kai text-[12px]" :style="{ color: AFFIX_RARITY_META[line.rarity].color }">「{{ line.name }}」</span>
            <span v-if="line.id === flow.plan.moved.id" class="rounded bg-cinnabar/15 px-1 text-[9px] leading-relaxed text-cinnabar">
              {{ TRANSFER_LABELS.newTag }}
            </span>
            <span v-if="flow.resultSealed.has(line.id)" class="text-jade" role="img" :aria-label="TRANSFER_LABELS.sealed"><GameIcon name="lock" :size="11" /></span>
          </span>
          <span class="mt-0.5 block text-[11px] leading-snug text-ink-soft">
            {{ line.before }}<span class="tabular font-medium text-ink">{{ line.value }}</span>{{ line.after }}
          </span>
        </li>
      </ul>
      <p v-if="flow.plan.sealMode === 'inherit'" class="mt-1 flex min-h-[28px] items-center text-[11px] text-jade">{{ TRANSFER_LABELS.sealKeep }}</p>
      <label v-else-if="flow.sealFee" class="mt-1 flex min-h-[28px] items-center justify-between gap-2 text-[11px]">
        <span class="text-ink-soft">
          {{ TRANSFER_LABELS.seal }} <span class="whitespace-nowrap tabular text-ink-faint">{{ transferStoneText(flow.sealFee) }}</span>
        </span>
        <input type="checkbox" class="h-4 w-4 shrink-0 accent-cinnabar" :checked="flow.sealWanted" @change="flow.toggleSeal()" />
      </label>
      <p v-else class="mt-1 flex min-h-[28px] items-center text-[11px] text-ink-faint">{{ TRANSFER_LABELS.sealFull }}</p>
      <p v-if="flow.deltaText" class="text-[11px] leading-relaxed text-azure tabular">{{ TRANSFER_LABELS.delta }} {{ flow.deltaText }}</p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-cinnabar">
        {{ TRANSFER_LABELS.sourceLose }}「{{ movedName }}」<template v-if="flow.sourceWorn"> · {{ TRANSFER_LABELS.equipped }}</template>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { affixDef } from '@/data/affixes'
  import { EQUIP_SLOT_NAMES, equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { AFFIX_RARITY_META } from '@/ui/statNames'
  import {
    TRANSFER_LABELS,
    transferBlockText,
    transferCountText,
    transferShowAllText,
    transferStoneText
  } from '@/ui/affixTransferText'
  import type { AffixTransferFlow } from '@/composables/useAffixTransfer'
  import GameIcon from '@/components/common/GameIcon.vue'

  const props = defineProps<{ flow: AffixTransferFlow }>()
  const emit = defineEmits<{ view: [uid: string] }>()

  /** 选中词条后只留那一行;未选时列全部 */
  const shownSourceLines = computed(() =>
    props.flow.affixId ? props.flow.sourceLines.filter(l => l.id === props.flow.affixId) : props.flow.sourceLines
  )
  /** 选中目标后只留那一件 */
  const shownCandidates = computed(() =>
    props.flow.targetUid ? props.flow.candidates.filter(c => c.item.uid === props.flow.targetUid) : props.flow.shownCandidates
  )
  const movedName = computed(() => (props.flow.affixId ? (affixDef(props.flow.affixId)?.name ?? '') : ''))

  function itemName(templateId: string): string {
    return equipmentTemplate(templateId)?.name ?? ''
  }

  /** 候选可以跨部位(戒指的词条能去项链),行里写明是哪个部位 */
  function slotName(templateId: string): string {
    const slot = equipmentTemplate(templateId)?.slot
    return slot ? EQUIP_SLOT_NAMES[slot] : ''
  }

  function targetLine(id: string) {
    return props.flow.targetLines.find(l => l.id === id)
  }

  function rarityColor(id: string): string {
    const def = affixDef(id)
    return def ? AFFIX_RARITY_META[def.rarity].color : 'inherit'
  }

  // 每走完一步,把新展开的那一段滚到正文顶上(正文是唯一的滚动容器)。
  // 新段落是 v-if 出来的,渲染前拿不到元素 —— 先记下要去哪一段,nextTick 之后再取
  const outRef = ref<HTMLElement | null>(null)
  const intoRef = ref<HTMLElement | null>(null)
  const slotRef = ref<HTMLElement | null>(null)
  const resultRef = ref<HTMLElement | null>(null)
  watch(
    () => [props.flow.affixId, props.flow.targetUid, props.flow.replaceId] as const,
    ([affixId, targetUid, replaceId], [prevAffix, prevTarget, prevSlot]) => {
      const goal =
        !affixId
          ? outRef
          : replaceId !== undefined && (replaceId !== prevSlot || targetUid !== prevTarget || affixId !== prevAffix)
            ? resultRef
            : targetUid && targetUid !== prevTarget
              ? slotRef
              : affixId !== prevAffix
                ? intoRef
                : null
      if (!goal) return
      void nextTick(() => goal.value?.scrollIntoView({ block: 'start' }))
    }
  )
</script>
