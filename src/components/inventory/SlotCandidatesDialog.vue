<template>
  <!-- 部位候选列表 -->
  <BaseModal
    :open="slotName !== null"
    :title="slotName ? EQUIP_SLOT_NAMES[slotName] : ''"
    @close="emit('close')"
  >
    <div v-if="rows.length" class="space-y-1.5">
      <div
        v-for="row in rows"
        :key="row.item.uid"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-2"
        :class="row.equipped ? 'bg-jade/10' : 'bg-paper-deep/70'"
      >
        <GameIcon :name="row.template.icon" :size="16" :style="{ color: qualityDef(row.item.quality).color }" />
        <button class="min-w-0 grow text-left active:opacity-60" @click="openDetail(row.item.uid)">
          <span class="block truncate font-kai text-[13px]" :style="{ color: qualityDef(row.item.quality).color }">
            {{ row.template.name }}
            <template v-if="row.item.level > 0">+{{ row.item.level }}</template>
          </span>
          <span class="block text-[10px] text-ink-faint">
            <!-- 条数带分母:这一件还剩多少条可涨,一眼看得出(上限来自品质表) -->
            {{ qualityDef(row.item.quality).name }} · {{ row.item.tier }} 阶 · 词条
            {{ row.item.affixes.length }}/{{ qualityDef(row.item.quality).affixes[1] }}
          </span>
        </button>
        <button v-if="row.equipped" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="unequipSlot()">卸下</button>
        <button v-else class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="equipItem(row.item.uid)">换上</button>
      </div>
    </div>
    <p v-else class="py-6 text-center">
      <span class="empty-seal" aria-hidden="true">空</span>
      <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">此部位尚无藏品</span>
      <span class="mt-1 block text-[10px] leading-relaxed text-ink-faint">去历练中寻些机缘吧</span>
    </p>
    <p class="mt-2 text-center text-[10px] text-ink-faint">点名称可查看详情与对比</p>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { qualityDef } from '@/data/qualities'
  import { EQUIP_SLOT_NAMES, equipmentTemplate } from '@/data/equipment'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import type { EquipSlot } from '@/types'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 部位候选列表 —— 自 InventoryView 迁入。
   *
   * 「哪一个部位被点开」是宿主的页面状态(pickerSlot),这里只认它、回传关闭,
   * 换装与卸下都直接走 inventory store;详情仍经全局 ui.equipDetailUid,
   * 与装备卡同一个入口,没有第二本账。
   */
  const props = defineProps<{ slotName: EquipSlot | null }>()
  const emit = defineEmits<{ close: [] }>()

  const inventory = useInventoryStore()
  const ui = useUiStore()

  /** 当前部位的候选:佩戴中的置顶,其余按品质/层级降序 */
  const rows = computed(() => {
    const slot = props.slotName
    if (!slot) return []
    const equippedUid = inventory.equipped[slot]
    return inventory.items
      .map(item => ({ item, template: equipmentTemplate(item.templateId)! }))
      .filter(row => row.template?.slot === slot)
      .map(row => ({ ...row, equipped: row.item.uid === equippedUid }))
      .sort((a, b) => {
        if (a.equipped !== b.equipped) return Number(b.equipped) - Number(a.equipped)
        const dq = qualityDef(b.item.quality).rank - qualityDef(a.item.quality).rank
        return dq !== 0 ? dq : b.item.tier - a.item.tier
      })
  })

  function equipItem(uid: string): void {
    if (props.slotName) inventory.equip(uid, props.slotName)
  }

  function unequipSlot(): void {
    if (props.slotName) inventory.unequip(props.slotName)
  }

  function openDetail(uid: string): void {
    ui.equipDetailUid = uid
  }
</script>
