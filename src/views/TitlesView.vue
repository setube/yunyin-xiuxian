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
              row.worn ? 'border-cinnabar text-cinnabar' : row.owned ? 'border-gold-ink text-gold-ink' : 'border-ink/15 text-ink-faint'
            "
          >
            {{ row.worn ? '佩' : row.owned ? '藏' : '未' }}
          </span>
          <div class="min-w-0 grow">
            <p class="font-kai text-[13px]" :class="row.owned ? 'text-ink' : 'text-ink-faint'">{{ row.def.name }}</p>
            <p class="truncate text-[10px] text-ink-faint">{{ row.def.desc }}</p>
            <p v-if="row.owned && row.modText" class="truncate text-[10px] text-azure tabular" :title="row.modText">{{ row.modText }}</p>
          </div>
          <button v-if="row.owned" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="toggleTitle(row.def.id)">
            {{ row.worn ? '卸下' : '佩戴' }}
          </button>
        </div>
      </div>
    </template>

    <!-- 灵兽:同样的列表式 -->
    <template v-else>
      <SectionTitle title="灵兽" :hint="`${petRows.length}/${PETS.length} · 伴一只`" />
      <div v-if="petRows.length" class="space-y-2">
        <div
          v-for="row in petRows"
          :key="row.def.id"
          class="card-ink flex items-center gap-2.5 px-4 py-2.5"
        >
          <!-- 灵兽印章:从一行小图标长成一块色底印章;相伴时转玉色光晕 -->
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors"
            :class="row.active ? 'bg-jade/10 text-jade' : 'bg-ink/5 text-ink-soft'"
          ><GameIcon :name="row.def.icon" :size="20" /></span>
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-center gap-1.5">
              <span class="truncate font-kai text-[13px]" :style="{ color: qualityDef(row.def.quality).color }">{{ row.def.name }}</span>
              <span class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px]" :style="{ color: qualityDef(row.def.quality).color }">{{ qualityDef(row.def.quality).name }}</span>
              <span v-if="row.active" class="shrink-0 rounded bg-jade/15 px-1.5 py-0.5 text-[10px] text-jade">相伴</span>
            </p>
            <p class="truncate text-[10px] text-ink-faint">{{ row.def.desc }}</p>
            <p v-if="row.modText" class="text-[10px] text-azure tabular">{{ row.modText }}</p>
            <!-- 性格是灵兽的"人味":它在历练里怎么表现,得让玩家看得见,而不是只看数值 -->
            <p class="text-[10px] text-violet-ink">
              {{ row.personalityName }} · <span class="text-ink-faint">{{ row.personalityDesc }}</span>
            </p>
            <!-- 定性的话之外还要给数:换不换这只伙伴,靠「更容易」三个字算不出来 -->
            <p v-if="row.traitText" class="text-[10px] text-azure/80 tabular">{{ row.traitText }}</p>
          </div>
          <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="togglePet(row.def.id)">
            {{ row.active ? '暂别' : '唤来' }}
          </button>
        </div>
      </div>
      <p v-else class="card-ink px-4 py-6 text-center">
        <span class="empty-seal" aria-hidden="true">兽</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">尚无灵兽相伴</span>
        <span class="mt-1 block text-[10px] leading-relaxed text-ink-faint">灵兽多在历练际遇中结缘</span>
      </p>
      <!-- 集齐路上的念想:还差几只、去哪找,一句带过 -->
      <p v-if="petRows.length > 0 && petRows.length < PETS.length" class="mt-2.5 text-center text-[10px] text-ink-faint">
        尚有 {{ PETS.length - petRows.length }} 只灵兽散落于历练际遇 —— 结缘即归此册
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
  import { PERSONALITY_NAMES, personalityDesc } from '@/core/petPersonality'
  import { petTraitText } from '@/ui/itemText'
  import { qualityDef } from '@/data/qualities'
  import { modsText } from '@/ui/statNames'
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

  // ---- 名号 ----
  const ownedCount = computed(() => quests.titlesOwned.length)

  /** 全量陈列:佩戴中 > 已拥有 > 未获得 */
  const titleRows = computed(() => {
    const ownedSet = new Set(quests.titlesOwned)
    return TITLES.map(def => ({
      def,
      owned: ownedSet.has(def.id),
      worn: player.titleId === def.id,
      modText: modsText(def.mods ?? {})
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
      .map(def => ({
        def: def!,
        active: player.petId === def!.id,
        modText: modsText(def!.mods),
        personalityName: PERSONALITY_NAMES[def!.personality],
        personalityDesc: personalityDesc(def!.personality),
        traitText: petTraitText(def!)
      }))
      .sort((a, b) => Number(b.active) - Number(a.active))
  )

  function togglePet(id: string): void {
    player.setPet(player.petId === id ? null : id)
  }
</script>
