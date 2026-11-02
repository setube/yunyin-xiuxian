<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <InkTabs v-model="tab" :tabs="TABS" />

    <template v-if="tab === 'title'">
      <SectionTitle title="名号" :hint="`${ownedCount}/${TITLES.length} · 佩一枚`" />
      <ProgressBar class="mt-2" :value="TITLES.length > 0 ? ownedCount / TITLES.length : 0" :height="3" />
      <div class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in titleRows" :key="row.def.id" class="flex items-center gap-3 py-2.5">
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-kai"
            :class="
              row.worn ? 'border-cinnabar text-cinnabar' : row.owned ? 'border-gold-ink text-gold-ink' : 'border-ink/15 text-ink-faint'
            "
          >
            {{ row.worn ? '佩' : row.owned ? '藏' : '未' }}
          </span>
          <div class="min-w-0 grow">
            <p class="font-kai text-[13px]" :class="row.owned ? 'text-ink' : 'text-ink-faint'">{{ row.def.name }}</p>
            <p class="truncate text-[10px] text-ink-faint">{{ row.def.desc }}</p>
            <p v-if="!row.owned && row.source" class="truncate text-[10px] text-ink-faint">来历:{{ row.source }}</p>
            <p v-if="row.owned && row.modText" class="truncate text-[10px] text-azure tabular" :title="row.modText">{{ row.modText }}</p>
          </div>
          <button v-if="row.owned" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="toggleTitle(row.def.id)">
            {{ row.worn ? '卸下' : '佩戴' }}
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <SectionTitle title="灵兽" :hint="`${petRows.length}/${PETS.length} · 伴一只`" />
      <ProgressBar class="mt-2" :value="PETS.length > 0 ? petRows.length / PETS.length : 0" :height="3" />
      <div v-if="petRows.length" class="space-y-2">
        <div
          v-for="row in petRows"
          :key="row.def.id"
          class="card-ink relative flex items-center gap-2.5 px-4 py-2.5"
          :class="{ 'ring-1 ring-jade/40': row.active }"
        >
          <QualityAura :quality="row.def.quality" />
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-center gap-1.5">
              <span
                class="truncate font-kai text-[13px]"
                :class="{ 'q-plaque': row.plaque }"
                :style="{ color: qualityDef(row.def.quality).color }"
                >{{ row.def.name }}</span
              >
              <span class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px]" :style="{ color: qualityDef(row.def.quality).color }">{{ qualityDef(row.def.quality).name }}</span>
              <span v-if="row.active" class="shrink-0 rounded border border-jade/40 bg-jade/15 px-1.5 py-0.5 text-[10px] text-ink">相伴</span>
            </p>
            <p class="truncate text-[10px] text-ink-faint">{{ row.def.desc }}</p>
            <p v-if="row.modText" class="text-[10px] text-azure tabular">{{ row.modText }}</p>
            <p class="text-[10px] text-violet-ink">
              {{ row.personalityName }} · <span class="text-ink-faint">{{ row.personalityDesc }}</span>
            </p>
            <p v-if="row.traitText" class="text-[10px] text-azure tabular">{{ row.traitText }}</p>
          </div>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="togglePet(row.def.id)">
            {{ row.active ? '暂别' : '唤来' }}
          </button>
        </div>
      </div>
      <p v-else class="card-ink px-4 py-6 text-center">
        <span class="empty-seal" aria-hidden="true">兽</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无灵兽</span>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { useQuestsStore } from '@/stores/quests'
  import { TITLES } from '@/data/titles'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { achievementDirection } from '@/ui/achievementHint'
  import { petDef, PETS } from '@/data/pets'
  import { PERSONALITY_NAMES, personalityDesc } from '@/core/petPersonality'
  import { petTraitText } from '@/ui/itemText'
  import { qualityDef } from '@/data/qualities'
  import { qualityAura } from '@/ui/qualityAura'
  import { modsText } from '@/data/statNames'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import QualityAura from '@/components/common/QualityAura.vue'

  const player = usePlayerStore()
  const quests = useQuestsStore()
  const ui = useUiStore()

  type Tab = 'title' | 'pet'
  const tab = ref<Tab>('title')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'title', label: '名号' },
    { id: 'pet', label: '灵兽' }
  ]

  const ownedCount = computed(() => quests.titlesOwned.length)

  /** 未获得名号的来历:随成就条件走,不剧透成就名 */
  const TITLE_SOURCE: Record<string, string> = {}
  for (const a of ACHIEVEMENTS) {
    if (a.reward?.titleId) TITLE_SOURCE[a.reward.titleId] = achievementDirection(a.cond)
  }

  const titleRows = computed(() => {
    const ownedSet = new Set(quests.titlesOwned)
    return TITLES.map(def => ({
      def,
      owned: ownedSet.has(def.id),
      worn: player.titleId === def.id,
      modText: modsText(def.mods ?? {}),
      source: ownedSet.has(def.id) ? '' : TITLE_SOURCE[def.id] ?? ''
    })).sort((a, b) => Number(b.worn) - Number(a.worn) || Number(b.owned) - Number(a.owned))
  })

  function toggleTitle(id: string): void {
    const def = TITLES.find(t => t.id === id)
    const wearing = player.titleId === id
    player.setTitle(wearing ? null : id)
    if (def) ui.toast(wearing ? `卸下「${def.name}」` : `佩上「${def.name}」`, 'info')
  }

  const petRows = computed(() =>
    quests.collections.pet
      .map(id => petDef(id))
      .filter(def => def !== undefined)
      .map(def => ({
        def: def!,
        active: player.petId === def!.id,
        // 出战加成按真到账那份渲染(× 灵兽园等级 × 安抚增益),与角色面板来源明细一致,不用 base
        modText: modsText(player.petModsFor(def!)),
        personalityName: PERSONALITY_NAMES[def!.personality],
        personalityDesc: personalityDesc(def!.personality),
        traitText: petTraitText(def!),
        /** 稀有档的名字加描边与字距,与法宝/装备同一套(见 ui/qualityAura) */
        plaque: qualityAura(def!.quality).plaque
      }))
      .sort((a, b) => Number(b.active) - Number(a.active))
  )

  function togglePet(id: string): void {
    const def = petDef(id)
    const active = player.petId === id
    player.setPet(active ? null : id)
    if (def) ui.toast(active ? `「${def.name}」已暂别` : `唤来「${def.name}」`, 'info')
  }
</script>
