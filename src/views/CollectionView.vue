<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <InkTabs v-model="tab" :tabs="TABS" />

    <template v-if="tab === 'achievement'">
      <SectionTitle title="成就" :hint="`${quests.achieved.length}/${ACHIEVEMENTS.length}`" />
      <ProgressBar
        class="mt-2"
        :value="ACHIEVEMENTS.length > 0 ? quests.achieved.length / ACHIEVEMENTS.length : 0"
        :height="3"
      />
      <div class="card-ink px-4">
        <template v-for="grp in achievementGroups" :key="grp.key">
          <p class="pb-1 pt-2 text-[10px] font-kai tracking-widest text-ink-faint">
            {{ grp.label }}
            <span class="ml-1 tabular">{{ grp.done }}/{{ grp.items.length }}</span>
          </p>
          <!-- 组内细条比页级条细一档 -->
          <ProgressBar class="pb-1.5" :value="grp.items.length > 0 ? grp.done / grp.items.length : 0" :height="2" />
          <div class="divide-y divide-ink/6">
            <div v-for="row in grp.items" :key="row.id" class="flex items-center gap-3 py-2.5">
              <span
                class="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-kai"
                :class="row.done ? 'border-gold-ink text-gold-ink' : 'border-ink/15 text-ink-faint'"
              >
                {{ row.done ? '成' : '未' }}
              </span>
              <div class="min-w-0">
                <p class="font-kai text-[12px]" :class="row.done ? 'text-ink' : 'text-ink-faint'">{{ row.name }}</p>
                <p class="text-[10px] text-ink-faint">{{ row.desc }}</p>
                <p v-if="row.done && row.achievedAt" class="mt-0.5 text-[10px] text-ink-faint">
                  达成于 {{ collectedTimeText(row.achievedAt) }}
                </p>
                <!--
                  进度条:同页的成就分组与收藏类目都有条,唯独单条成就只写「已 3 / 目标 10」——
                  而这两者是同一种东西(「走到哪了」),不该只有一处要自己算比例。
                  条与读数同处一行:条说走到哪,数字说还差几次。
                -->
                <div v-if="!row.done && row.progress" class="mt-0.5 flex items-center gap-1.5">
                  <ProgressBar class="w-16 shrink-0" :value="row.progress.current / row.progress.target" :height="2" />
                  <span class="text-[10px] tabular text-azure">已 {{ row.progress.current }} / {{ row.progress.target }}</span>
                </div>
                <p v-if="row.reward" class="mt-0.5 text-[10px] tabular text-azure">{{ row.reward }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <template v-else-if="tab === 'collection'">
      <section v-for="cat in collectionCats" :key="cat.key">
        <SectionTitle :title="cat.name" :hint="cat.hint" />
        <!-- 成就页与成就分组都有进度条,收藏各类目却没有 —— 只有一行「已 X/Y」文字 -->
        <ProgressBar class="mt-1.5" :value="cat.entries.length > 0 ? cat.done / cat.entries.length : 0" :height="2" />
        <p class="mt-1 text-[10px] text-ink-faint">{{ cat.source }}</p>
        <div class="card-ink mt-2 flex flex-wrap gap-1.5 px-3.5 py-3">
          <template v-for="entry in cat.entries" :key="entry.id">
            <button
              v-if="entry.stage >= 1"
              class="chip-ink !py-1.5 flex items-center gap-1 active:scale-90"
              :style="{ color: entry.color }"
              @click="openDetail(cat, entry)"
            >
              <GameIcon v-if="entry.icon" :name="entry.icon" :size="11" />
              {{ entry.name }}
              <span v-if="entry.badge" class="text-[9px] opacity-70">{{ entry.badge }}</span>
              <!-- 最上档:标签流放不下御纹,换一枚小字(与详情整幅框同源) -->
              <span v-if="entry.luster" class="text-[8px] opacity-80">{{ entry.luster.label.charAt(0) }}</span>
            </button>
            <!--
              未收录降噪:更细的虚线框,不与已收的彩签同粗。
              同类只铺到 UNCOLLECTED_SHOWN 个,余下的折成一行计数 ——
              装备一册 288 条,全铺开把整页撑成好几屏的「???」,屏幕里一条真信息也没有。
            -->
            <span
              v-else-if="uncollectedIndex(cat, entry.id) < UNCOLLECTED_SHOWN"
              class="inline-flex items-center rounded-full border border-dashed border-ink/15 px-2 py-0.5 text-[10px] leading-snug text-ink-faint"
              title="未收录"
            >???</span>
          </template>
        </div>
        <p v-if="hiddenUncollected(cat) > 0" class="mt-1 px-1 text-[10px] text-ink-faint">
          另有 {{ hiddenUncollected(cat) }} 条未收录
        </p>
      </section>
    </template>

    <BaseModal
      :open="detail !== null"
      :title="detail?.entry.name ?? ''"
      :panel-class="detail?.entry.luster ? 'luster-frame' : undefined"
      :title-class="detail?.entry.luster ? 'luster-title' : undefined"
      @close="detail = null"
    >
      <span v-if="detail?.entry.luster" class="luster-crown" aria-hidden="true">{{ detail.entry.luster.label }}</span>
      <div v-if="detail">
        <p class="flex flex-wrap items-center gap-2">
          <span class="chip-ink border-current" :style="{ color: detail.entry.color ?? 'var(--color-ink-soft)' }">
            {{ detail.catName }}
          </span>
          <span v-if="detail.entry.stageName" class="chip-ink border-ink/20 text-ink-faint">{{ detail.entry.stageName }}</span>
          <span v-if="detail.entry.meta" class="text-[11px] text-ink-faint">{{ detail.entry.meta }}</span>
          <!--
            神通性质:法宝谱此前只报品阶与层级,「这一件是攻、是护、还是削敌」看不出来 ——
            而玩家正在弹窗里决定要不要祭炼(见 ui/artifactShape,与包里那枚印同源)。
          -->
          <span
            v-if="detail.entry.shape"
            class="artifact-shape"
            :class="`artifact-shape--${detail.entry.shape.disposition}`"
            :title="detail.entry.shape.label"
            role="img"
            :aria-label="detail.entry.shape.label"
          >
            <span class="artifact-shape__crest" :class="`artifact-shape__crest--${detail.entry.shape.crest}`" aria-hidden="true" />
            <span class="artifact-shape__name">{{ detail.entry.shape.dispositionName }}</span>
          </span>
        </p>
        <p v-if="detail.entry.desc" class="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
          {{ detail.entry.desc }}
        </p>
        <p v-if="detail.entry.hint" class="mt-2 text-[11px] text-ink-faint">{{ detail.entry.hint }}</p>
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


  import { usePlayerStore } from '@/stores/player'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { GONGFA } from '@/data/gongfa'
  import { PETS } from '@/data/pets'
  import { beastIcon } from '@/data/beastFamilies'
  import { beastCrest } from '@/ui/beastCrest'
  import { talentTextColor } from '@/ui/talentMark'
  import { PERSONALITY_NAMES, personalityDesc } from '@/core/petPersonality'
  import { EVENTS } from '@/data/events'
  import { chainOfEvent } from '@/data/chains'
  import { TALENTS } from '@/data/talents'
  import { qualityDef, qualityTextColor } from '@/data/qualities'
  import { lusterOf } from '@/ui/luster'
  import {
    CODEX_SOURCES,
    artifactCodex,
    branchCodex,
    collectedTimeText,
    daoluCodex,
    equipCodex,
    materialCodex,
    pillCodex,
    type CodexCat,
    type CodexEntry,
    codexOwnedCount
  } from '@/ui/codex'
  import { gongfaFuncText, gongfaMetaText } from '@/ui/itemText'
  import { modsText } from '@/data/statNames'
  import { achievementGuide, achievementGroup, ACHIEVEMENT_GROUP_LABEL, ACHIEVEMENT_GROUP_ORDER } from '@/ui/achievementHint'
  import { rewardPreview } from '@/core/progress'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InkTabs from '@/components/common/InkTabs.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'

  /** 同类未收录最多铺几个虚框;余下折成一行计数(与坊市寄卖同一套) */
  const UNCOLLECTED_SHOWN = 12

  /** 本类里第几个未收录项(按 entries 原序);已收录项不参与 */
  function uncollectedIndex(cat: { entries: { id: string; stage: number }[] }, id: string): number {
    let n = 0
    for (const e of cat.entries) {
      if (e.stage >= 1) continue
      if (e.id === id) return n
      n += 1
    }
    return n
  }

  /** 本类被折起来的未收录条数 */
  function hiddenUncollected(cat: { entries: { stage: number }[] }): number {
    const total = cat.entries.filter(e => e.stage < 1).length
    return Math.max(0, total - UNCOLLECTED_SHOWN)
  }

  const quests = useQuestsStore()
  const player = usePlayerStore()

  type Tab = 'achievement' | 'collection'
  const tab = ref<Tab>('achievement')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'achievement', label: '成就' },
    { id: 'collection', label: '收藏' }
  ]

  /** 成就未达成一律显示「???」;不筛除任何条目,计数读 ACHIEVEMENTS.length */
  const achievementRows = computed(() =>
    ACHIEVEMENTS.map(a => {
      const done = quests.hasAchieved(a.id)
      return {
        id: a.id,
        done,
        group: achievementGroup(a.cond),
        achievedAt: quests.achievedAt[a.id],
        name: done ? a.name : '???',
        // 未达成不现名目,但要说清「还差哪道门槛」—— 只给方向时同组六条一模一样
        desc: done ? a.desc : `方向:${achievementGuide(a.cond)}`,
        // current 封顶在 target:周期补扫前计数可能暂超阈值
        progress:
          a.cond.type === 'counter'
            ? { current: Math.min(quests.counter(a.cond.key), a.cond.value), target: a.cond.value }
            : null,
        // 未达成不报赏(免得说破称号);数额与 grantReward 同一套折算
        reward: done && a.reward ? rewardPreview(a.reward) : ''
      }
    }).sort((a, b) => {
      if (a.done !== b.done) return Number(b.done) - Number(a.done)
      // 未达成段内:计数类按离阈值最近优先,非计数沉底保持原序
      const pa = a.progress ? a.progress.current / a.progress.target : -1
      const pb = b.progress ? b.progress.current / b.progress.target : -1
      return pb - pa
    })
  )

  /** 按主题归段,段内保留 achievementRows 的顺序 */
  const achievementGroups = computed(() =>
    ACHIEVEMENT_GROUP_ORDER.map(g => ({
      key: g,
      label: ACHIEVEMENT_GROUP_LABEL[g],
      items: achievementRows.value.filter(r => r.group === g),
      /** 该方向已达成数:组头数字与细条读同一份 */
      done: achievementRows.value.filter(r => r.group === g && r.done).length
    })).filter(grp => grp.items.length > 0)
  )

  /** 两态图鉴(收没收录):补齐 CodexEntry 的深度字段,stage 1 即已收录 */
  function makeCat(
    key: CollectionCategory,
    name: string,
    ownedIds: string[],
    defs: { id: string; name: string; desc?: string; meta?: string; color?: string }[]
  ): CodexCat {
    const owned = new Set(ownedIds)
    // 只数实际落进 defs 的(ownedIds 可能含重复/旧 id);与角色页「图鉴 N/M」同一口径,见 ui/codex.codexOwnedCount
    const ownedCount = codexOwnedCount(ownedIds, defs)
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
        foot: { label: '收录时间', value: collectedTimeText(quests.collectedAt[`${key}:${d.id}`]) }
      }))
      .sort((a, b) => b.stage - a.stage)
    // done 从 entries 现算(收录深度 ≥1 即已收),不另存一份会与 entries 分叉
    return { key, name, hint: `${ownedCount}/${defs.length}`, done: entries.filter(e => e.stage >= 1).length, source: CODEX_SOURCES[key], entries }
  }

  /** 图鉴排布:悟道录紧随功法阁、灵材谱紧随丹方录 */
  const collectionCats = computed<CodexCat[]>(() => {
    const c = quests.collections
    return [
      // 装备/法宝/丹药走带深浅的派生视图(见 ui/codex:收录深度一节)
      equipCodex(),
      makeCat(
        'gongfa',
        '功法阁',
        c.gongfa,
        GONGFA.map(g => ({
          id: g.id,
          name: g.name,
          desc: [g.desc, gongfaFuncText(g)].filter(Boolean).join('\n'),
          meta: gongfaMetaText(g),
          color: qualityTextColor(g.quality),
          luster: lusterOf(g.quality)
        }))
      ),
      branchCodex(),
      pillCodex(),
      materialCodex(),
      artifactCodex(),
      makeCat(
        'pet',
        '灵兽册',
        c.pet,
        PETS.map(p => ({
          id: p.id,
          name: p.name,
          /**
           * 性子在历练中真会改遭遇走向,而册里原先只有「贪宝」两个字 ——
           * 名号页的灵兽卡早就有四项倾向印(见 ui/personalityMark),
           * 图鉴是纯文本流,只能把同一件事写成一句:与那边同读 core/petPersonality。
           */
          desc: [p.desc, modsText(player.petModsFor(p)), personalityDesc(p.personality)].filter(Boolean).join('\n'),
          /**
           * 灵兽册的 meta 原只写品阶名,而族类与性子在名号页都有:
           * 这头兽是走兽、羽禽还是龙属瑞兽,以及它历练时的行为倾向(贪宝/慢稳/好战/谨慎)。
           * 两处同读一份数据(见 data/beastFamilies、core/petPersonality),不另立。
           */
          meta: `${beastCrest(p.family).name} · ${PERSONALITY_NAMES[p.personality]} · ${qualityDef(p.quality).name}`,
          /**
           * 性子在历练中真会改遭遇走向,而册里原先只有「贪宝」两个字 ——
           * 名号页的灵兽卡早就有四项倾向印(见 ui/personalityMark),
           * 图鉴是纯文本流,只能把同一件事写成一句:与那边同读 core/petPersonality。
           */

          icon: beastIcon(p.family),
          color: qualityTextColor(p.quality),
          luster: lusterOf(p.quality)
        }))
      ),
      makeCat(
        'event',
        '见闻志',
        c.event,
        // 奇缘的阶段事件与普通际遇同表,见闻志里须各归各的名
        EVENTS.map(e => ({
          id: e.id,
          name: e.title,
          desc: e.text,
          meta: chainOfEvent(e.id) ? '奇缘' : '历练际遇'
        }))
      ),
      makeCat(
        'talent',
        '天赋鉴',
        c.talent,
        TALENTS.map(t => ({
          id: t.id,
          name: t.name,
          desc: [t.desc, modsText(t.mods)].filter(Boolean).join('\n'),
          meta: '先天之姿',
          color: talentTextColor(t.grade)
        }))
      ),
      /*
       * 人缘册:走到过多深,不是「有没有」两态。
       * 深度从这一世的关系与历世归档里现算,见 ui/codex.daoluCodex。
       */
      daoluCodex()
    ]
  })

  // 脚注各类口径不同,由条目自带 foot
  const detail = ref<{ catName: string; entry: CodexEntry } | null>(null)

  function openDetail(cat: CodexCat, entry: CodexEntry): void {
    detail.value = { catName: cat.name, entry }
  }
</script>
