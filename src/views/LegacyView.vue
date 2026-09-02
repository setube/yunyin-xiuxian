<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <SectionTitle title="修仙录" hint="这一部,只写你自己" />

    <!-- 修行画像 -->
    <div v-if="profile" class="card-ink px-4 py-3">
      <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">修行画像</p>
      <p class="font-kai text-[13px] leading-relaxed text-ink">「{{ profile.verdict }}」</p>
      <div class="mt-2 space-y-1">
        <p v-for="d in profile.daoShares" :key="d.name" class="flex items-center gap-2 text-[11px]">
          <span class="w-14 shrink-0 text-ink-faint">{{ d.name }}</span>
          <span class="track-ink h-1.25 grow">
            <span class="bar-fill block h-full" :style="{ width: `${d.pct}%`, background: 'var(--color-cinnabar)' }" />
          </span>
          <span class="w-8 shrink-0 text-right tabular text-ink-soft">{{ d.pct }}%</span>
        </p>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <p class="flex justify-between">
          <span class="text-ink-faint">风险偏好</span>
          <span class="text-ink-soft">{{ profile.riskText }}</span>
        </p>
        <p class="flex justify-between">
          <span class="text-ink-faint">构筑倾向</span>
          <span class="text-ink-soft">{{ profile.buildTendency }}</span>
        </p>
        <p class="flex justify-between">
          <span class="text-ink-faint">常用流派</span>
          <span class="text-ink-soft">{{ profile.favoriteBuild }}</span>
        </p>
        <p v-if="profile.favoritePacts.length" class="flex justify-between">
          <span class="text-ink-faint">常立之契</span>
          <span class="text-ink-soft">{{ profile.favoritePacts.join(' / ') }}</span>
        </p>
        <p v-if="profile.bestWorld" class="flex justify-between">
          <span class="text-ink-faint">最擅长</span>
          <span class="text-jade">{{ profile.bestWorld }}</span>
        </p>
        <p v-if="profile.weakWorld" class="flex justify-between">
          <span class="text-ink-faint">最薄弱</span>
          <span class="text-cinnabar">{{ profile.weakWorld }}</span>
        </p>
      </div>
      <p class="mt-1.5 text-[9px] text-ink-ghost">画像全部来自真实道痕统计,不可人工修饰。</p>
    </div>
    <p v-else class="card-ink px-4 py-6 text-center text-[11px] text-ink-ghost">道痕未满五则,画像尚不成形。</p>

    <!-- 轮回录(Phase 32.5):第 N 世与第 1 世的实质区别 -->
    <SectionTitle title="轮回录" :hint="`宿慧 ${insight}`" />
    <div class="card-ink px-4 py-3">
      <p class="flex items-center gap-2">
        <span class="font-kai text-[14px] tracking-widest text-ink">{{ stage.name }}</span>
        <span class="text-[10px] text-ink-faint tabular">第 {{ player.reincarnation.count + 1 }} 世</span>
        <span v-if="toNextStage !== null" class="ml-auto shrink-0 text-[10px] text-ink-ghost tabular">
          再积 {{ toNextStage }} 宿慧入下一境地
        </span>
        <span v-else class="ml-auto shrink-0 text-[10px] text-gold-ink">此道已至尽头</span>
      </p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ stage.desc }}</p>

      <!-- 随神魂不灭的那一份 -->
      <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-ink/10 pt-2 text-[11px]">
        <p class="flex justify-between">
          <span class="text-ink-faint">认得灵材</span>
          <span class="tabular text-ink-soft">{{ lore.knownMaterialCount }} 味</span>
        </p>
        <p class="flex justify-between">
          <span class="text-ink-faint">通晓丹方</span>
          <span class="tabular text-ink-soft">{{ lore.masteredRecipeCount }} 张</span>
        </p>
        <p class="flex justify-between">
          <span class="text-ink-faint">洞悉敌手</span>
          <span class="tabular text-ink-soft">{{ lore.masteredEnemyCount }} 种</span>
        </p>
        <p class="flex justify-between">
          <span class="text-ink-faint">睁眼即识</span>
          <span class="tabular text-ink-soft">{{ stage.knownMaterialRank }} 阶以下</span>
        </p>
      </div>

      <!-- 这一世的命题 -->
      <div v-if="vowTheme" class="mt-2 rounded-lg border border-ink/15 px-3 py-2">
        <p class="flex items-center justify-between">
          <span class="font-kai text-[13px] text-ink">「{{ vowTheme.vow }}」</span>
          <span class="text-[11px]" :class="vowBroken ? 'text-amber-ink' : vowDone ? 'text-cinnabar' : 'text-ink-faint'">
            {{ vowBroken ? '已破' : vowDone ? '已成' : '在途' }}
          </span>
        </p>
        <p class="mt-1 text-[11px] text-ink-faint">
          {{ vowTheme.goal }}
          <span v-if="vowProg" class="tabular">({{ Math.floor(vowProg.cur) }} / {{ vowProg.need }})</span>
        </p>
      </div>
      <p v-else class="mt-2 text-[11px] text-ink-ghost">这一世不曾为自己立题。兵解转世时,可择一题而行。</p>
    </div>

    <!-- 历世履历 -->
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="lifeRows.length">
        <p v-for="l in lifeRows" :key="l.index" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="w-11 shrink-0 font-kai text-ink-faint tabular">第{{ l.index }}世</span>
          <span class="text-ink-soft">{{ l.realmLabel }}</span>
          <span class="text-[10px] text-ink-ghost tabular">寿 {{ l.age }} 载</span>
          <span v-if="l.themeName" class="text-[10px]" :class="l.resultColor">{{ l.themeName }}·{{ l.resultText }}</span>
          <span class="ml-auto shrink-0 tabular text-[10px] text-gold-ink">宿慧 +{{ l.insight }}</span>
        </p>
      </template>
      <p v-else class="py-4 text-center text-[11px] text-ink-ghost">此为初世。你尚未死过一次,也就还没有什么可以回忆。</p>
    </div>

    <!-- 修行节点 -->
    <SectionTitle title="修行节点" :hint="`${endgame.milestones.length}/${MILESTONE_DEFS.length}`" />
    <div class="card-ink px-4 py-2">
      <div v-if="milestoneRows.length" class="relative ml-2 border-l border-ink/15 pl-4">
        <div v-for="row in milestoneRows" :key="row.id" class="relative py-1.5">
          <span class="absolute -left-5.25 top-2.5 h-2 w-2 rounded-full bg-gold-ink" />
          <p class="font-kai text-[13px] text-ink">第 {{ row.life }} 世 · {{ row.name }}</p>
          <p class="text-[10px] text-ink-faint">{{ row.desc }}</p>
        </div>
      </div>
      <p v-else class="py-4 text-center text-[11px] text-ink-ghost">此录尚白。天界之行,自会留名。</p>
    </div>

    <!-- 征战录(Phase 30.9 S2):宿敌与雪耻 -->
    <SectionTitle title="征战录" :hint="`宿敌 ${nemesisRows.length} 位`" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="nemesisRows.length">
        <p v-for="n in nemesisRows" :key="n.enemyId" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="font-kai text-[13px]" :class="n.avengedAt ? 'text-ink' : 'text-cinnabar'">{{ n.enemyName }}</span>
          <span class="text-[10px] text-ink-faint">{{ n.regionName }} · 败我 {{ n.lossCount }} 次</span>
          <span class="ml-auto shrink-0 text-[10px]" :class="n.avengedAt ? 'text-jade' : 'text-cinnabar/70'">
            {{ n.avengedAt ? '已雪耻' : '尚为宿敌' }}
          </span>
        </p>
      </template>
      <p v-else class="py-4 text-center text-[11px] text-ink-ghost">尚无宿敌。此录待你的血与道来填。</p>
    </div>

    <!-- 行迹录(Phase 30.9 S3):事件余波 -->
    <SectionTitle title="行迹录" :hint="`际遇回响 ${lossRows.length} 则`" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="lossRows.length">
        <p v-for="l in lossRows" :key="l.eventId + l.at" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="text-[10px] text-ink-ghost">{{ formatDate(l.at) }}</span>
          <span class="text-ink-soft">{{ l.eventName }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-ink-faint">{{ l.note }}</span>
        </p>
      </template>
      <p v-else class="py-4 text-center text-[11px] text-ink-ghost">世界尚未记住你的足迹。</p>
    </div>

    <!-- 我的纪录 -->
    <SectionTitle title="我的纪录" hint="只与过去的自己比" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="recordRows.length">
        <p v-for="r in recordRows" :key="r.id" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="text-ink-faint">{{ r.name }}</span>
          <span class="ml-auto tabular font-kai text-[13px] text-gold-ink">{{ r.valueText }}</span>
          <span class="shrink-0 text-[10px] text-ink-ghost">第{{ r.life }}世 · {{ r.note }}</span>
        </p>
      </template>
      <p v-else class="py-4 text-center text-[11px] text-ink-ghost">纪录待创。破界之时,自见分晓。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useEndgameStore } from '@/stores/endgame'
  import { usePlayerStore } from '@/stores/player'
  import { useAdventureStore } from '@/stores/adventure'
  import { useLoreStore } from '@/stores/lore'
  import { cultivatorProfile, MILESTONE_DEFS, milestoneDef, RECORD_DEFS } from '@/core/identity'
  import { currentStage, totalInsight, vowProgress, vowResult } from '@/core/samsaraService'
  import { nextStageAfter } from '@/data/samsara'
  import { lifeThemeDef } from '@/data/lifeThemes'
  import { regionDef } from '@/data/regions'
  import { eventDef } from '@/data/events'
  import { isNemesis } from '@/core/worldMemory'
  import { formatDate } from '@/utils/time'
  import SectionTitle from '@/components/common/SectionTitle.vue'

  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  const lore = useLoreStore()

  // ---- 轮回录 ----
  const insight = computed(() => totalInsight())
  const stage = computed(() => currentStage())
  const toNextStage = computed(() => {
    const next = nextStageAfter(insight.value)
    return next ? next.insight - insight.value : null
  })
  const vowTheme = computed(() => {
    const vow = player.reincarnation.vow
    return vow ? (lifeThemeDef(vow.themeId) ?? null) : null
  })
  const vowProg = computed(() => vowProgress())
  const vowBroken = computed(() => vowResult() === 'broken')
  const vowDone = computed(() => vowResult() === 'done')

  const RESULT_TEXTS: Record<'done' | 'unfinished' | 'broken', string> = {
    done: '践行到底',
    unfinished: '未竟',
    broken: '已破'
  }
  const RESULT_COLORS: Record<'done' | 'unfinished' | 'broken', string> = {
    done: 'text-cinnabar',
    unfinished: 'text-ink-ghost',
    broken: 'text-amber-ink'
  }

  /** 历世履历:最近的一世排在最前 */
  const lifeRows = computed(() =>
    [...player.reincarnation.lives]
      .sort((a, b) => b.index - a.index)
      .map(l => {
        const result = l.themeResult ?? 'unfinished'
        return {
          ...l,
          themeName: l.themeId ? (lifeThemeDef(l.themeId)?.name ?? null) : null,
          resultText: RESULT_TEXTS[result],
          resultColor: RESULT_COLORS[result]
        }
      })
  )

  /** 征战录:当前未雪耻/已雪耻的宿敌 */
  const nemesisRows = computed(() =>
    player.nemeses
      .filter(n => n.lossCount >= 3)
      .map(n => ({
        ...n,
        regionName: regionDef(n.regionId)?.name ?? n.regionId,
        avengedAt: n.avengedAt,
        active: isNemesis(player.nemeses, n.enemyId)
      }))
      .sort((a, b) => (a.avengedAt ?? 0) - (b.avengedAt ?? 0))
  )

  /** 征战录:事件余波(世界记忆的最近完成) */
  const lossRows = computed(() =>
    Object.values(adventure.eventMemories)
      .filter(m => m.times >= 2)
      .map(m => ({
        eventId: m.eventId,
        at: m.lastAt,
        eventName: eventDef(m.eventId)?.title ?? m.eventId,
        note: `${m.times} 次际遇后,此地已别有风貌`
      }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
  )

  const profile = computed(() => cultivatorProfile(endgame.marks))

  const milestoneRows = computed(() =>
    [...endgame.milestones]
      .sort((a, b) => a.at - b.at)
      .map(m => {
        const def = milestoneDef(m.id)
        return { id: m.id, life: m.life, name: def?.name ?? m.id, desc: def?.desc ?? '' }
      })
  )

  const recordRows = computed(() =>
    RECORD_DEFS.map(def => {
      const r = endgame.records[def.id]
      if (!r) return null
      return {
        id: def.id,
        name: def.name,
        valueText: def.unit === '×' ? `×${r.value}` : `${r.value} ${def.unit}`,
        life: r.life,
        note: r.note
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  )
</script>
