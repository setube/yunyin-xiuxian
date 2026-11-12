<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="card-ink paper-grain relative overflow-hidden px-4 pb-4 pt-5 text-center">
      <span class="seal-solid" aria-hidden="true">我</span>
      <h1 class="mt-2.5 font-kai text-[20px] tracking-[0.3em] text-ink">修 仙 录</h1>
    </div>

    <div v-if="profile" class="card-ink px-4 py-3">
      <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">修行画像</p>
      <p class="font-kai text-[13px] leading-relaxed text-ink">「{{ profile.verdict }}」</p>
      <!--
        道途占比:每行带上该道的符纹与道色(见 ui/daoMark),四根不再是一模一样的朱砂条。
        条长以本组最大的那根为满格 —— 四条占比之和本就不到一百(还有无道途的道痕),
        按 100% 画会让四根都短得像没走过路(见 ui/daoShare)。
      -->
      <div class="mt-2 space-y-1">
        <p v-for="d in daoRows" :key="d.name" class="flex items-center gap-2 text-[11px]">
          <span
            v-if="d.mark"
            class="dao-tag shrink-0"
            :class="`dao-tag--${d.mark.crest}`"
            :style="{ color: d.mark.tone }"
            role="img"
            :aria-label="d.mark.label"
          />
          <span class="w-12 shrink-0" :class="d.top ? 'text-ink-soft' : 'text-ink-faint'">{{ d.name }}</span>
          <span class="track-ink h-1.25 grow">
            <span
              class="bar-fill block h-full"
              :style="{ width: `${d.barPct}%`, background: d.mark?.tone ?? 'var(--color-cinnabar)' }"
            />
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
    </div>
    <p v-else class="card-ink px-4 py-6 text-center">
      <span class="empty-seal" aria-hidden="true">像</span>
      <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">道痕未满{{ cnNumber(PROFILE_MIN_MARKS) }}则</span>
    </p>

    <SectionTitle title="轮回录" :hint="`宿慧 ${insight}`" />
    <div class="card-ink px-4 py-3">
      <p class="flex items-center gap-2">
        <span class="font-kai text-[14px] tracking-widest text-ink">{{ stage.name }}</span>
        <span class="text-[10px] text-ink-faint tabular">第 {{ player.reincarnation.count + 1 }} 世</span>
        <span v-if="toNextStage !== null" class="ml-auto shrink-0 text-[10px] text-ink-faint tabular">
          下一境地 · 宿慧尚差 {{ toNextStage }}
        </span>
        <span v-else class="ml-auto shrink-0 text-[10px] text-gold-ink">已至尽头</span>
      </p>
      <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ stage.desc }}</p>

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
        <!--
          誓愿是本世的核心目标,而它此前只有一行「(已 / 需)」的读数 ——
          同页的修行节点同样只有读数,于是「走到哪了」处处都要自己拿两个数相除。
          条说走到哪,数字说还差多少,两者互补。
        -->
        <ProgressBar
          v-if="vowProg && vowProg.need > 0"
          class="mt-1.5"
          :value="vowProg.cur / vowProg.need"
          :color="vowBroken ? 'var(--color-amber-ink)' : vowDone ? 'var(--color-cinnabar)' : 'var(--color-jade)'"
          :height="3"
        />
        <!--
          誓愿是本世的核心目标,而它此前只有一行「(已 / 需)」的读数 ——
          同页的修行节点同样只有读数,于是「走到哪了」处处都要自己拿两个数相除。
          条说走到哪,数字说还差多少,两者互补。
        -->
      </div>
      <p v-else class="mt-2 text-[11px] text-ink-faint">本世未立题</p>
    </div>

    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="lifeRows.length">
        <p v-for="l in lifeRows" :key="l.index" class="flex items-center gap-2 py-2 text-[12px]">
          <!--
            不给空格:这一格要装下「第一百二十世」,加空格只会更早折行。
            w-13 是量出来的 —— w-11(44px)装三位数世号就折成两行(实测 375 宽下 21 条
            「第1xx世」全部 h=36,而两位数的 90 条都是 h=18),放宽到 52px 才够。
          -->
          <span class="w-13 shrink-0 whitespace-nowrap font-kai text-ink-faint tabular">第{{ l.index }}世</span>
          <span class="text-ink-soft">{{ l.realmLabel }}</span>
          <span class="text-[10px] text-ink-faint tabular">寿 {{ l.age }} 载</span>
          <span v-if="l.themeName" class="text-[10px]" :class="l.resultColor">{{ l.themeName }}·{{ l.resultText }}</span>
          <span v-if="l.trialName" class="text-[10px] text-cinnabar">·立契{{ l.trialName }}</span>
          <span class="ml-auto shrink-0 tabular text-[10px] text-gold-ink">宿慧 +{{ l.insight }}</span>
        </p>
      </template>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">初</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">此为初世</span>
      </p>
    </div>

    <SectionTitle title="修行节点" :hint="`${endgame.milestones.length}/${MILESTONE_DEFS.length}`" />
    <!-- 节点已走完几分之几:标题旁的读数只给两个数,条给位置 -->
    <ProgressBar
      class="mb-1.5 mt-1 px-0.5"
      :value="MILESTONE_DEFS.length > 0 ? endgame.milestones.length / MILESTONE_DEFS.length : 0"
      :height="2"
    />
    <div class="card-ink px-4 py-2">
      <div v-if="milestoneRows.length" class="relative ml-2 border-l border-ink/15 pl-4">
        <div v-for="row in milestoneRows" :key="row.id" class="relative py-1.5">
          <span class="absolute -left-5.25 top-2.5 h-2 w-2 rounded-full bg-gold-ink" />
          <p class="font-kai text-[13px] text-ink">第 {{ row.life }} 世 · {{ row.name }}</p>
          <p class="text-[10px] text-ink-faint">{{ row.desc }}</p>
        </div>
      </div>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">白</span>
        <!-- 区块标题是「修行节点」:空态按「暂无 + 具体名词」写「节点」,不写泛指的「记录」 -->
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无节点</span>
      </p>
    </div>

    <SectionTitle title="征战录" :hint="`宿敌 ${nemesisRows.length} 位`" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="nemesisRows.length">
        <p v-for="n in nemesisRows" :key="n.enemyId" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="font-kai text-[13px]" :class="n.avengedAt ? 'text-ink' : 'text-cinnabar'">{{ n.enemyName }}</span>
          <span class="text-[10px] text-ink-faint">{{ n.regionName }} · 败我 {{ n.lossCount }} 次</span>
          <span class="ml-auto shrink-0 text-[10px]" :class="n.avengedAt ? 'text-jade' : 'text-cinnabar'">
            {{ n.avengedAt ? '已雪耻' : '尚为宿敌' }}
          </span>
        </p>
      </template>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">敌</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无宿敌</span>
      </p>
    </div>

    <SectionTitle title="奇缘录" :hint="`未了之缘 ${unfinishedChains} 条`" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="chainRows.length">
        <p v-for="c in chainRows" :key="c.id" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="shrink-0 font-kai text-[13px]" :class="c.finished ? 'text-ink' : 'text-cinnabar'">{{ c.name }}</span>
          <span class="min-w-0 truncate text-[10px] text-ink-faint">{{ c.hint }}</span>
          <span class="ml-auto shrink-0 tabular text-[10px]" :class="c.finished ? 'text-jade' : 'text-ink-faint'">
            {{ c.finished ? '已了' : `第 ${c.stage + 1}/${c.total} 程` }}
          </span>
        </p>
      </template>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">缘</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无奇缘</span>
      </p>
    </div>

    <SectionTitle title="行迹录" :hint="`${lossRows.length} 则`" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="lossRows.length">
        <p v-for="l in lossRows" :key="l.eventId + l.at" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="text-[10px] text-ink-faint">{{ formatDate(l.at) }}</span>
          <span class="text-ink-soft">{{ l.eventName }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-ink-faint">{{ l.note }}</span>
        </p>
      </template>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">迹</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无行迹</span>
      </p>
    </div>

    <SectionTitle title="我的纪录" />
    <div class="card-ink divide-y divide-ink/6 px-4">
      <template v-if="recordRows.length">
        <p v-for="r in recordRows" :key="r.id" class="flex items-center gap-2 py-2 text-[12px]">
          <span class="text-ink-faint">{{ r.name }}</span>
          <span class="ml-auto tabular font-kai text-[13px] text-gold-ink">{{ r.valueText }}</span>
          <span class="shrink-0 text-[10px] text-ink-faint">第 {{ r.life }} 世 · {{ r.note }}</span>
        </p>
      </template>
      <p v-else class="py-5 text-center">
        <span class="empty-seal" aria-hidden="true">创</span>
        <span class="mt-2.5 block font-kai text-[12px] tracking-[0.2em] text-ink-soft">暂无纪录</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useEndgameStore } from '@/stores/endgame'
  import { usePlayerStore } from '@/stores/player'
  import { useAdventureStore } from '@/stores/adventure'
  import { useLoreStore } from '@/stores/lore'
  import { cnNumber } from '@/utils/format'
  import { cultivatorProfile, MILESTONE_DEFS, milestoneDef, PROFILE_MIN_MARKS, RECORD_DEFS } from '@/core/identity'
  import { currentStage, totalInsight, vowProgress, vowResult } from '@/core/samsaraService'
  import { nextStageAfter } from '@/data/samsara'
  import { lifeThemeDef } from '@/data/lifeThemes'
  import { lifeTrialDef } from '@/data/lifeTrials'
  import { regionDef } from '@/data/regions'
  import { eventDef } from '@/data/events'
  import { isNemesis } from '@/core/worldMemory'
  import { daoShareRows } from '@/ui/daoShare'
  import { chainProgressRows } from '@/core/eventEngine'
  import { formatDate } from '@/utils/time'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'

  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  const lore = useLoreStore()

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
    done: '已成',
    unfinished: '未竟',
    broken: '已破'
  }
  const RESULT_COLORS: Record<'done' | 'unfinished' | 'broken', string> = {
    done: 'text-cinnabar',
    unfinished: 'text-ink-faint',
    broken: 'text-amber-ink'
  }

  const lifeRows = computed(() =>
    [...player.reincarnation.lives]
      .sort((a, b) => b.index - a.index)
      .map(l => {
        const result = l.themeResult ?? 'unfinished'
        return {
          ...l,
          themeName: l.themeId ? (lifeThemeDef(l.themeId)?.name ?? null) : null,
          resultText: RESULT_TEXTS[result],
          resultColor: RESULT_COLORS[result],
          // 逆旅契是这一世唯一的回报:记在履历上
          trialName: l.trialId ? (lifeTrialDef(l.trialId)?.name ?? null) : null
        }
      })
  )

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

  const lossRows = computed(() =>
    Object.values(adventure.eventMemories)
      .filter(m => m.times >= 2)
      .map(m => ({
        eventId: m.eventId,
        at: m.lastAt,
        eventName: eventDef(m.eventId)?.title ?? m.eventId,
        note: `际遇 ${m.times} 次`
      }))
      .sort((a, b) => b.at - a.at)
  )

  const profile = computed(() => cultivatorProfile(endgame.marks))
  /** 道途占比条:带道纹与道色,条长以本组最大者为满格(见 ui/daoShare) */
  const daoRows = computed(() => daoShareRows(profile.value?.daoShares ?? []))

  const chainRows = computed(() => chainProgressRows())
  const unfinishedChains = computed(() => chainRows.value.filter(c => !c.finished).length)

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
