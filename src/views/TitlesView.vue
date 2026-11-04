<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <InkTabs v-model="tab" :tabs="TABS" />

    <template v-if="tab === 'title'">
      <SectionTitle title="名号" :hint="`${ownedCount}/${TITLES.length} · 佩一枚`" />
      <ProgressBar class="mt-2" :value="TITLES.length > 0 ? ownedCount / TITLES.length : 0" :height="3" />
      <!--
        境界名号的梯子:21 境分属四个界域,段长即该界域的境界数。
        原先 29 顶名号长得一模一样,只换「佩/藏/未」一个字 ——
        可玩家真正想知道的是「我在第几级」,不是「我有这一枚」。
      -->
      <div class="title-ladder" role="img" :aria-label="`境界名号共 ${TITLE_LADDER_STEPS} 级`">
        <span
          v-for="seg in ladderSegs"
          :key="seg.id"
          class="title-ladder-seg"
          :class="{ 'is-here': seg.here }"
          :style="{ flexGrow: seg.span, flexBasis: '0%' }"
          :title="`${seg.name} · ${seg.span} 境`"
        />
      </div>
      <p class="mt-1 flex justify-between text-[9px] text-ink-faint tabular">
        <span>第 1 境</span>
        <span v-if="ladderHere">当前这顶 · {{ ladderHere.worldName }}第 {{ ladderHere.step }} 境</span>
        <span>第 {{ TITLE_LADDER_STEPS }} 境</span>
      </p>
      <div class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in titleRows" :key="row.def.id" class="flex items-center gap-3 py-2.5">
          <!--
            境界名号:一枚界域印 + 第几境。事功名号不在这条梯子上,
            故只给「事」字印,不硬塞一个假的级数。
          -->
          <span
            class="title-seal grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-kai"
            :class="[
              row.mark.tone,
              row.worn ? 'border-cinnabar' : row.owned ? 'border-gold-ink' : 'border-ink/15',
              row.owned ? '' : 'opacity-45'
            ]"
            role="img"
            :aria-label="row.mark.label"
          >
            {{ row.mark.kind === 'realm' ? row.mark.step : '事' }}
          </span>
          <div class="min-w-0 grow">
            <p class="font-kai text-[13px]" :class="row.owned ? 'text-ink' : 'text-ink-faint'">
              {{ row.def.name }}
              <span v-if="row.worn" class="ml-1 text-[9px] tracking-normal text-cinnabar">佩</span>
            </p>
            <p class="truncate text-[10px] text-ink-faint">{{ row.def.desc }}</p>
            <p v-if="row.mark.kind === 'realm'" class="text-[9px] text-ink-faint tabular">
              {{ row.mark.worldName }} · 第 {{ row.mark.step }}/{{ TITLE_LADDER_STEPS }} 境
            </p>
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
      <!-- 族谱:五族各收了几头。只列有灵兽的族 -->
      <p v-if="petRows.length" class="beast-roster mt-2">
        <span
          v-for="f in roster"
          :key="f.family"
          class="beast-roster-row text-[10px] tabular"
          :class="f.owned > 0 ? 'text-ink-soft' : 'text-ink-faint'"
        >
          <span class="beast-crest shrink-0" aria-hidden="true">{{ f.seal }}</span>
          {{ f.name }}
          <span class="text-ink-faint">{{ f.owned }}/{{ f.total }}</span>
        </span>
      </p>
      <div v-if="petRows.length" class="space-y-2">
        <div
          v-for="row in petRows"
          :key="row.def.id"
          class="card-ink relative flex items-center gap-2.5 px-4 py-2.5"
          :class="{ 'ring-1 ring-jade/40': row.active }"
        >
          <QualityAura :quality="row.def.quality" />
          <span v-if="row.luster" class="luster-cornice" aria-hidden="true" />
          <span v-if="row.luster" class="luster-sheen" aria-hidden="true" />
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-center gap-1.5">
              <!-- 族徽:这一头是走兽还是龙属。族类是分类,印面取中性墨色 -->
              <span class="beast-crest shrink-0" aria-hidden="true">{{ row.crest.seal }}</span>
              <span
                class="truncate font-kai text-[13px]"
                :class="{ 'q-plaque': row.plaque }"
                :style="{ color: qualityTextColor(row.def.quality) }"
                >{{ row.def.name }}</span
              >
              <span class="sr-only">{{ row.crest.name }}</span>
              <span class="shrink-0 rounded bg-ink/6 px-1.5 py-0.5 text-[10px]" :style="{ color: qualityTextColor(row.def.quality) }">{{ qualityDef(row.def.quality).name }}</span>
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
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { beastCrest, familyRoster } from '@/ui/beastCrest'
  import { realmTitleMajor, titleMark, worldSegs, TITLE_LADDER_STEPS } from '@/ui/titleMark'
  import { qualityAura } from '@/ui/qualityAura'
  import { lusterOf } from '@/ui/luster'
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
      source: ownedSet.has(def.id) ? '' : TITLE_SOURCE[def.id] ?? '',
      /** 形制:境界名号有级数与界域,事功名号给「事」印 */
      mark: titleMark(def)
    })).sort((a, b) => Number(b.worn) - Number(a.worn) || Number(b.owned) - Number(a.owned))
  })

  /** 已佩名号落在大境界第几级;未佩或佩的是事功名号则为 null */
  const wornMajor = computed(() => (player.titleId ? realmTitleMajor(player.titleId) : null))
  const ladderSegs = computed(() => worldSegs(wornMajor.value))
  const ladderHere = computed(() => {
    const m = wornMajor.value
    if (m === null) return null
    const mark = titleMark(TITLES.find(t => t.id === player.titleId) ?? TITLES[0]!)
    return { step: mark.step, worldName: mark.worldName }
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
        /** 族徽:族名首字成印,族名原样转发给读屏 */
        crest: beastCrest(def!.family),
        /** 稀有档的名字加描边与字距,与法宝/装备同一套(见 ui/qualityAura) */
        plaque: qualityAura(def!.quality).plaque,
        luster: lusterOf(def!.quality)
      }))
      .sort((a, b) => Number(b.active) - Number(a.active))
  )

  /** 族谱:只列有灵兽的族,按数据表首次出现的次序 */
  const roster = computed(() => familyRoster(quests.collections.pet))

  function togglePet(id: string): void {
    const def = petDef(id)
    const active = player.petId === id
    player.setPet(active ? null : id)
    if (def) ui.toast(active ? `「${def.name}」已暂别` : `唤来「${def.name}」`, 'info')
  }
</script>
