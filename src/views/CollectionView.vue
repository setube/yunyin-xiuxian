<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 页签 -->
    <InkTabs v-model="tab" :tabs="TABS" />

    <!-- 成就 -->
    <template v-if="tab === 'achievement'">
      <SectionTitle title="成就" :hint="`${quests.achieved.length}/${ACHIEVEMENTS.length}`" />
      <div class="card-ink divide-y divide-ink/6 px-4">
        <div v-for="row in achievementRows" :key="row.id" class="flex items-center gap-3 py-2.5">
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-kai"
            :class="row.done ? 'border-gold-ink text-gold-ink' : 'border-ink/15 text-ink-ghost'"
          >
            {{ row.done ? '成' : '未' }}
          </span>
          <div class="min-w-0">
            <p class="font-kai text-[12px]" :class="row.done ? 'text-ink' : 'text-ink-ghost'">{{ row.name }}</p>
            <p class="truncate text-[10px] text-ink-ghost">{{ row.desc }}</p>
          </div>
        </div>
      </div>
      <p class="text-center text-[10px] text-ink-ghost">功成之日,名目自现</p>
    </template>

    <!-- 收藏图鉴 -->
    <template v-else>
      <section v-for="cat in collectionCats" :key="cat.key">
        <SectionTitle :title="cat.name" :hint="cat.hint" />
        <div class="card-ink mt-2 flex flex-wrap gap-1.5 px-3.5 py-3">
          <template v-for="entry in cat.entries" :key="entry.id">
            <button
              v-if="entry.stage >= 1"
              class="chip-ink active:scale-95"
              :style="{ color: entry.color }"
              @click="openDetail(cat, entry)"
            >
              {{ entry.name }}
              <span v-if="entry.badge" class="text-[9px] opacity-70">{{ entry.badge }}</span>
            </button>
            <span v-else class="chip-ink border-ink/15 text-ink-ghost" title="尚未收录">???</span>
          </template>
        </div>
      </section>
      <p class="text-center text-[10px] text-ink-ghost">点已收录的条目可看详情 —— 灵材与悟道另分深浅,愈用愈明</p>
    </template>

    <!-- 图鉴详情 -->
    <BaseModal :open="detail !== null" :title="detail?.entry.name ?? ''" @close="detail = null">
      <div v-if="detail">
        <p class="flex flex-wrap items-center gap-2">
          <span class="chip-ink border-current" :style="{ color: detail.entry.color ?? 'var(--color-ink-soft)' }">
            {{ detail.catName }}
          </span>
          <span v-if="detail.entry.stageName" class="chip-ink border-ink/20 text-ink-faint">{{ detail.entry.stageName }}</span>
          <span v-if="detail.entry.meta" class="text-[11px] text-ink-faint">{{ detail.entry.meta }}</span>
        </p>
        <p class="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
          {{ detail.entry.desc || '此物玄妙,难以言表。' }}
        </p>
        <p v-if="detail.entry.hint" class="mt-2 text-[11px] text-ink-ghost">{{ detail.entry.hint }}</p>
        <div class="ink-divider my-3" />
        <p class="flex justify-between text-[11px]">
          <span class="text-ink-faint">{{ detail.entry.foot.label }}</span>
          <span class="tabular text-ink-soft">{{ detail.entry.foot.value }}</span>
        </p>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useQuestsStore } from '@/stores/quests'
  import type { CollectionCategory } from '@/stores/quests'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { EQUIPMENT_TEMPLATES, EQUIP_SLOT_NAMES } from '@/data/equipment'
  import { GONGFA } from '@/data/gongfa'
  import { PILLS } from '@/data/pills'
  import { ARTIFACTS } from '@/data/artifacts'
  import { PETS } from '@/data/pets'
  import { EVENTS } from '@/data/events'
  import { TALENTS, TALENT_GRADE_COLORS } from '@/data/talents'
  import { qualityDef } from '@/data/qualities'
  import { branchCodex, materialCodex, type CodexCat, type CodexEntry } from '@/ui/codex'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const quests = useQuestsStore()

  type Tab = 'achievement' | 'collection'
  const tab = ref<Tab>('achievement')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'achievement', label: '成就' },
    { id: 'collection', label: '收藏' }
  ]

  /**
   * 成就一律先以「???」示人,达成之后才现名目。
   *
   * 既然未达成的全都遮住,原先的 hidden 标记(未达成时整行不列出)就没了着落 ——
   * 它与寻常未达成者长得一模一样,却害得计数的分母(50)对不上列出的行数(48)。
   * 故此处不再筛除,五十个位子一个不少。
   */
  const achievementRows = computed(() =>
    ACHIEVEMENTS.map(a => {
      const done = quests.hasAchieved(a.id)
      return {
        id: a.id,
        done,
        name: done ? a.name : '???',
        desc: done ? a.desc : '尚未达成 —— 成时自见'
      }
    }).sort((a, b) => Number(b.done) - Number(a.done))
  )

  /**
   * 原有七类只有"收没收录"两态,在此补齐 CodexEntry 的深度字段:
   * stage 1 即已收录,不设更深的层。深浅之别是灵材谱与悟道录才有的事。
   */
  function makeCat(
    key: CollectionCategory,
    name: string,
    ownedIds: string[],
    defs: { id: string; name: string; desc?: string; meta?: string; color?: string }[]
  ): CodexCat {
    const owned = new Set(ownedIds)
    const entries: CodexEntry[] = defs
      .map(d => ({
        id: d.id,
        name: d.name,
        desc: d.desc ?? '',
        meta: d.meta ?? '',
        color: d.color,
        stage: owned.has(d.id) ? 1 : 0,
        stageName: '',
        badge: '',
        hint: '',
        foot: { label: '收录时间', value: collectedTime(quests.collectedAt[`${key}:${d.id}`]) }
      }))
      .sort((a, b) => b.stage - a.stage)
    return { key, name, hint: `${ownedIds.length}/${defs.length}`, entries }
  }

  function collectedTime(ts: number | undefined): string {
    if (ts === undefined) return '早年收录,未记时日'
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * 九类图鉴的排布。
   *
   * 悟道录紧随功法阁、灵材谱紧随丹方录 —— 各自与所属的那条线挨在一处,
   * 翻到功法就看得见它的岔路,翻到丹药就看得见炼它的料。
   */
  const collectionCats = computed<CodexCat[]>(() => {
    const c = quests.collections
    return [
      makeCat(
        'equip',
        '装备图鉴',
        c.equip,
        EQUIPMENT_TEMPLATES.map(t => ({
          id: t.id,
          name: t.name,
          desc: t.desc,
          meta: `${EQUIP_SLOT_NAMES[t.slot]} · ${t.minTier} 阶起现世`
        }))
      ),
      makeCat(
        'gongfa',
        '功法阁',
        c.gongfa,
        GONGFA.map(g => ({ id: g.id, name: g.name, desc: g.desc, meta: qualityDef(g.quality).name, color: qualityDef(g.quality).color }))
      ),
      branchCodex(),
      makeCat(
        'pill',
        '丹方录',
        c.pill,
        PILLS.map(p => ({ id: p.id, name: p.name, desc: p.desc, meta: qualityDef(p.quality).name, color: qualityDef(p.quality).color }))
      ),
      materialCodex(),
      makeCat(
        'artifact',
        '法宝谱',
        c.artifact,
        ARTIFACTS.map(a => ({
          id: a.id,
          name: a.name,
          desc: a.desc,
          meta: `${qualityDef(a.quality).name} · 神通「${a.active.name}」`,
          color: qualityDef(a.quality).color
        }))
      ),
      makeCat(
        'pet',
        '灵兽册',
        c.pet,
        PETS.map(p => ({ id: p.id, name: p.name, desc: p.desc, meta: qualityDef(p.quality).name, color: qualityDef(p.quality).color }))
      ),
      makeCat(
        'event',
        '见闻志',
        c.event,
        EVENTS.map(e => ({ id: e.id, name: e.title, desc: e.text, meta: '历练际遇' }))
      ),
      makeCat(
        'talent',
        '天赋鉴',
        c.talent,
        TALENTS.map(t => ({ id: t.id, name: t.name, desc: t.desc, meta: '先天之姿', color: TALENT_GRADE_COLORS[t.grade] }))
      )
    ]
  })

  // ---- 详情弹窗 ----
  // 脚注各类口径不同(旧七类记收录时日、灵材记照面回数、悟道记所属功法),
  // 故由条目自带 foot,此处不再拼装
  const detail = ref<{ catName: string; entry: CodexEntry } | null>(null)

  function openDetail(cat: CodexCat, entry: CodexEntry): void {
    detail.value = { catName: cat.name, entry }
  }
</script>
