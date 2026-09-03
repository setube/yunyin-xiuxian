<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 页签 -->
    <InkTabs v-model="tab" :tabs="TABS" />

    <!-- 名号:成就式列表,全量陈列 -->
    <template v-if="tab === 'title'">
      <SectionTitle title="名号" :hint="`${ownedCount}/${TITLES.length} · 佩一枚`" />
      <div class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in titleRows" :key="row.def.id" class="flex items-center gap-3 py-2.5">
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-kai"
            :class="
              row.worn ? 'border-cinnabar text-cinnabar' : row.owned ? 'border-gold-ink text-gold-ink' : 'border-ink/15 text-ink-ghost'
            "
          >
            {{ row.worn ? '佩' : row.owned ? '藏' : '未' }}
          </span>
          <div class="min-w-0 grow">
            <p class="font-kai text-[13px]" :class="row.owned ? 'text-ink' : 'text-ink-faint'">{{ row.def.name }}</p>
            <p class="truncate text-[10px] text-ink-ghost">{{ row.def.desc }}</p>
            <p v-if="row.owned && row.modText" class="text-[10px] text-azure tabular">{{ row.modText }}</p>
          </div>
          <button v-if="row.owned" class="btn-ghost shrink-0 !px-2.5 !py-1 !text-[11px]" @click="toggleTitle(row.def.id)">
            {{ row.worn ? '卸下' : '佩戴' }}
          </button>
        </div>
      </div>
    </template>

    <!-- 灵兽:同样的列表式 -->
    <template v-else>
      <SectionTitle title="灵兽" :hint="`${petRows.length}/${PETS.length} · 伴一只`" />
      <div v-if="petRows.length" class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in petRows" :key="row.def.id" class="flex items-center gap-3 py-2.5">
          <GameIcon :name="row.def.icon" :size="18" :style="{ color: qualityDef(row.def.quality).color }" />
          <div class="min-w-0 grow">
            <p class="flex items-center gap-2">
              <span class="font-kai text-[13px]" :style="{ color: qualityDef(row.def.quality).color }">{{ row.def.name }}</span>
              <span v-if="row.active" class="text-[10px] text-jade">相伴中</span>
            </p>
            <p class="truncate text-[10px] text-ink-ghost">{{ row.def.desc }}</p>
            <p v-if="row.modText" class="text-[10px] text-azure tabular">{{ row.modText }}</p>
          </div>
          <button class="btn-ghost shrink-0 !px-2.5 !py-1 !text-[11px]" @click="togglePet(row.def.id)">
            {{ row.active ? '暂别' : '唤来' }}
          </button>
        </div>
      </div>
      <p v-else class="mt-10 text-center text-[12px] text-ink-ghost">
        尚无灵兽相伴
        <br />
        <span class="text-[11px]">灵兽多在历练奇遇中结缘</span>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useQuestsStore } from '@/stores/quests'
  import { TITLES } from '@/data/titles'
  import { petDef, PETS } from '@/data/pets'
  import { qualityDef } from '@/data/qualities'
  import { formatPercent } from '@/utils/format'
  import { STAT_NAMES } from '@/ui/statNames'
  import type { AnyStatKey } from '@/types'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  const player = usePlayerStore()
  const quests = useQuestsStore()

  type Tab = 'title' | 'pet'
  const tab = ref<Tab>('title')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'title', label: '名号' },
    { id: 'pet', label: '灵兽' }
  ]

  function modsText(mods: Partial<Record<string, number>> | undefined): string {
    return Object.entries(mods ?? {})
      .map(([k, v]) => `${STAT_NAMES[k as AnyStatKey] ?? k} +${formatPercent(v as number)}`)
      .join(' · ')
  }

  // ---- 名号 ----
  const ownedCount = computed(() => quests.titlesOwned.length)

  /** 全量陈列:佩戴中 > 已拥有 > 未获得 */
  const titleRows = computed(() => {
    const ownedSet = new Set(quests.titlesOwned)
    return TITLES.map(def => ({
      def,
      owned: ownedSet.has(def.id),
      worn: player.titleId === def.id,
      modText: modsText(def.mods)
    })).sort((a, b) => Number(b.worn) - Number(a.worn) || Number(b.owned) - Number(a.owned))
  })

  function toggleTitle(id: string): void {
    player.setTitle(player.titleId === id ? null : id)
  }

  // ---- 灵兽 ----
  const petRows = computed(() =>
    quests.collections.pet
      .map(id => petDef(id))
      .filter(def => def !== undefined)
      .map(def => ({ def: def!, active: player.petId === def!.id, modText: modsText(def!.mods) }))
      .sort((a, b) => Number(b.active) - Number(a.active))
  )

  function togglePet(id: string): void {
    player.setPet(player.petId === id ? null : id)
  }
</script>
