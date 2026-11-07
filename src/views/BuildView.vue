<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <SectionTitle title="流派" />
    <div class="card-ink px-4 py-3">
      <template v-if="build">
        <div class="flex items-center gap-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[22px] seal-face shadow">
            {{ build.style.seal }}
          </span>
          <div class="min-w-0 grow">
            <p class="flex items-baseline gap-2">
              <span class="font-kai text-[16px] tracking-widest text-ink">{{ build.displayName }}</span>
              <span class="text-[11px] text-cinnabar">{{ build.stageName }}</span>
              <!-- 契合向下取整,与「成形 ≥60% / 大成 ≥90%」档位同口径(四舍五入会把 59.6% 的雏形印成「60%」) -->
              <span class="ml-auto tabular text-[12px] text-ink-soft">契合 {{ Math.floor(build.affinity * 100) }}%</span>
            </p>
            <div class="track-ink mt-1.5 h-1.25 w-full">
              <div class="bar-fill" :style="{ width: `${build.affinity * 100}%`, background: 'var(--color-cinnabar)' }" />
            </div>
            <p v-if="build.secondary" class="mt-1 text-[10px] text-ink-faint tabular">
              副体系:{{ build.secondary.style.name }} {{ Math.floor(build.secondary.affinity * 100) }}%
            </p>
          </div>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">{{ build.style.desc }}</p>
        <div class="mt-2 space-y-1">
          <p v-for="cv in build.coreValues" :key="cv.key" class="flex justify-between text-[12px]">
            <span class="text-ink-soft">
              {{ STAT_NAMES[cv.key] }}
              <span v-if="isSoftCapped(player.finalStats.mods, cv.key)" class="ml-0.5 text-[9px] text-cinnabar">软</span>
            </span>
            <span class="tabular text-violet-ink">{{ signedPercent(cv.value) }}</span>
          </p>
          <p
            v-for="note in coreCaveats"
            :key="note.key"
            class="text-[9px] leading-relaxed text-ink-faint"
          >
            {{ note.label }}:{{ note.caveat }}
          </p>
        </div>
        <p v-if="buildSourceNames.length" class="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-ink-faint">
          <span>成路于:</span>
          <span v-for="name in buildSourceNames" :key="name" class="text-azure">{{ name }}</span>
        </p>
        <div class="mt-2.5 rounded-md bg-paper-deep/60 px-3 py-2">
          <p class="flex items-baseline justify-between gap-2 text-[10px] text-ink-faint">
            <span>{{ cnNumber(powerRating.labels.length) }}维评级</span>
            <!-- 最短板:五根条长短要拿眼睛比,不如直接点名 -->
            <span v-if="weakestRating" class="shrink-0">
              短板 <span class="text-cinnabar">{{ weakestRating.name }}</span>
              <span class="tabular">· 距 {{ weakestRating.nextLabel }} 还差 {{ weakestRating.toNext.toFixed(2) }}</span>
            </span>
          </p>
          <div class="mt-1 grid grid-cols-1 gap-0.5">
            <button
              v-for="g in ratingRows"
              :key="g.key"
              class="-my-1 py-1.5 text-left active:opacity-60"
              @click="toggleDim(g.key)"
            >
              <!--
                只给一排星时,「进攻 3 星」与「进攻 3 星」之间差多少读不出来 ——
                而 core 早算好了连续得分与那道阈值表(见 ui/ratingGauge)。
                星说在哪一档,条说离满还有多远;每维按自己那四道线归一,不共尺。
                条长取 gaugeFill(总规模),不取本档进度 —— 后者会让 1 星的条比 4 星还长。
              -->
              <span class="flex items-center justify-between gap-2 text-[11px]">
                <span class="shrink-0 text-ink-soft">{{ g.name }}</span>
                <span class="rating-gauge shrink-0" :class="{ 'rating-gauge--weak': weakestRating?.key === g.key }" aria-hidden="true">
                  <i :style="{ width: `${gaugeFill(g) * 100}%` }" />
                </span>
                <span class="shrink-0 tabular tracking-widest text-gold-ink">{{ ratingStars(g.stars) }}</span>
              </span>
              <span v-if="dimKey === g.key" class="mt-1 block rounded-md bg-paper/70 px-2 py-1.5">
                <span class="block text-[10px] text-ink-soft">
                  {{ g.name }}得分 {{ g.score.toFixed(2) }}
                  <template v-if="g.nextLabel"> · 距 {{ g.nextLabel }} 还差 {{ g.toNext.toFixed(2) }}</template>
                  <template v-else> · 已至满档</template>
                </span>
                <span v-for="t in g.terms" :key="t.label" class="mt-0.5 flex justify-between text-[10px]">
                  <span class="text-ink-faint">{{ t.label }}</span>
                  <span class="tabular text-azure">+{{ t.contribution.toFixed(2) }}</span>
                </span>
                <span v-if="!g.terms.length" class="block text-[10px] text-ink-faint">暂无词条</span>
              </span>
            </button>
          </div>
        </div>
        <div v-if="comboInfo" class="mt-2.5 rounded-md px-3 py-2" :class="comboInfo.active ? 'bg-violet-ink/8' : 'bg-ink/4'">
          <p class="flex items-center gap-2">
            <span class="font-kai text-[13px]" :class="comboInfo.active ? 'text-violet-ink' : 'text-ink-faint'">
              组合技「{{ comboInfo.art.name }}」
            </span>
            <span class="text-[10px]" :class="comboInfo.active ? 'text-jade' : 'text-ink-faint'">
              {{ comboInfo.active ? '已成' : `需副体系 ${Math.round(COMBO_SECONDARY_MIN * 100)}%` }}
            </span>
          </p>
          <!--
            组合技由「哪两派配对」而来,data 里 pair 就是为此存的;
            原先只显示技名与效果,玩家看不出是手上这两派的哪一对触发了它。
          -->
          <p class="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[10px] text-ink-faint">
            <span>{{ comboInfo.pairNames[0] }}</span>
            <span class="text-ink-faint">×</span>
            <span>{{ comboInfo.pairNames[1] }}</span>
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed" :class="comboInfo.active ? 'text-ink-soft' : 'text-ink-faint'">
            {{ comboInfo.art.desc }}
          </p>
          <p class="mt-0.5 text-[10px] text-cinnabar">代价:{{ comboInfo.art.costText }}</p>
        </div>
        <div v-if="resilience" class="mt-2.5 rounded-md bg-ink/4 px-3 py-2">
          <!-- 标签与取值各成一格并允许换行:窄屏上整串胜率一起落到下一行,nowrap 保证它自己不裂 -->
          <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
            <span class="font-kai whitespace-nowrap text-ink-soft">构筑韧性</span>
            <span class="text-[10px] text-ink-faint">(主派核心封印之下)</span>
            <span
              class="ml-auto shrink-0 whitespace-nowrap tabular"
              :class="resilience.retention >= 0.45 ? 'text-jade' : 'text-cinnabar'"
            >
              胜率 {{ Math.round(resilience.normal * 100) }}% → {{ Math.round(resilience.sealed * 100) }}%
            </span>
          </p>
          <p class="mt-0.5 text-[10px] text-ink-faint">{{ resilienceText(resilience) }}</p>
        </div>
        <div v-if="matchupRows" class="mt-2.5 rounded-md bg-paper-deep/60 px-3 py-2">
          <p class="text-[10px] text-ink-faint">本世对局</p>
          <div class="mt-1.5 space-y-1">
            <div v-for="row in matchupSorted" :key="row.id" class="flex items-center gap-2">
              <span class="w-9 shrink-0 truncate text-[11px] text-ink-soft">{{ row.name }}</span>
              <span v-if="row.wall" class="shrink-0 rounded border border-cinnabar/40 bg-cinnabar/10 px-1 py-0.5 text-[9px] leading-none text-ink">墙</span>
              <span class="track-ink h-1.25 min-w-0 flex-1 overflow-hidden rounded-full">
                <span class="bar-fill h-full rounded-full" :class="winBarCls(row.winRate)" :style="{ width: `${row.winRate * 100}%` }" />
              </span>
              <span class="w-9 shrink-0 text-right tabular text-[11px]" :class="winTextCls(row.winRate)">
                {{ Math.round(row.winRate * 100) }}%
              </span>
            </div>
          </div>
          <p class="mt-1.5 text-[9px] text-ink-faint">每类 {{ MATCHUP_SAMPLE_RUNS }} 场估算</p>
        </div>
      </template>
      <p v-else class="empty-note text-center text-[11px] text-ink-faint">未成流派</p>
    </div>

    <SectionTitle title="构筑快照" :hint="`${loadouts.list.length}/${MAX_LOADOUTS}`" />
    <div class="card-ink px-4 py-3">
      <p class="mb-1.5 flex items-center justify-end">
        <!-- 满栏即置灰(与卡牌置灰同一纪律) -->
        <button
          :disabled="loadouts.list.length >= MAX_LOADOUTS"
          class="-my-1 py-1.5 text-[11px]"
          :class="loadouts.list.length >= MAX_LOADOUTS ? 'cursor-not-allowed text-ink-faint' : 'text-cinnabar active:opacity-60'"
          @click="openSave"
        >{{ loadouts.list.length >= MAX_LOADOUTS ? '快照已满' : '+ 存当前构筑' }}</button>
      </p>
      <div v-if="loadouts.list.length" class="space-y-1.5">
        <!--
          两段式:识别行一段、钮组一段,钮组右对齐独占一行。

          原先一行里挤着印章、名字、换装、改名、删除:删除确认态再多出「再想想」「确认删除」两枚,
          320 宽下这一行从 99px 涨到 115.5px,而「再想想」被压到 20px 宽 ×65px 高 ——
          两个字竖排成一行一个字,名字也被截成「青…」。钮组自成一行之后两态同高。
        -->
        <div v-for="lo in loadouts.list" :key="lo.id" class="rounded-md bg-paper-deep/70 px-2.5 py-1.5">
          <p class="flex items-center gap-2">
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-cinnabar font-kai text-[12px] seal-face">
              {{ lo.seal }}
            </span>
            <span class="min-w-0 grow truncate font-kai text-[12px] text-ink">{{ lo.name }}</span>
          </p>
          <!-- !py-2:触面须 ≥28px(!py-1 仅 27px);卡片只在有构筑时出现,巡页夹具量不到 -->
          <div class="mt-1 flex justify-end gap-1.5">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="applyLoadout(lo.id)">换装</button>
            <button class="btn-ghost !px-2 !py-2 !text-[11px] !text-ink-faint" @click="openRename(lo)">改名</button>
            <button
              v-if="confirmDelete !== lo.id"
              class="btn-ghost !px-2 !py-2 !text-[11px] !text-ink-faint"
              aria-label="删除构筑"
              @click="confirmDelete = lo.id"
            >
              <GameIcon name="trash" :size="12" />
            </button>
            <template v-else>
              <button class="btn-ghost !px-2 !py-2 !text-[11px] text-ink-faint" @click="confirmDelete = null">再想想</button>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="doDeleteLoadout(lo.id)">确认删除</button>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="empty-note mt-1 text-center text-[11px] text-ink-faint">暂无快照</p>
    </div>

    <!-- 双构筑对照(真仙可用) -->
    <template v-if="compareCandidates.length">
      <SectionTitle title="构筑对照" />
      <div class="card-ink px-4 py-3">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="(c, i) in compareCandidates"
            :key="i"
            class="chip-ink !py-1.5 border-ink/25 text-ink-faint"
            @click="pickCompare(c)"
          >
            第{{ c.life }}世·{{ c.buildName }}
          </button>
        </div>
      </div>
    </template>

    <BuildLabPanel />

    <!-- 保存 / 改名同一弹窗;存的那套功/宝/装原样不动 -->
    <BaseModal :open="saveOpen" :title="renameId ? '为构筑改名' : '存为构筑'" @close="closeSave">
      <!--
        不写 maxlength:它按 UTF-16 码元计数,emoji 占两个 —— 输入阶段就会劈开,
        后面再怎么按码点截也救不回来。收敛交给 captureLoadout / renameLoadout 的 truncateCodePoints。
      -->
      <input
        v-model="saveName"
        class="w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-2 font-kai text-[14px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
        placeholder="构筑名号"
      />
      <template #footer>
        <button class="btn-seal w-full" @click="onSaveSubmit">{{ renameId ? '改 名' : '存 入' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="compareOpen" :title="compareTitle" @close="compareOpen = false">
      <div v-if="compareResult" class="rounded-md bg-paper-deep/60 px-2.5 py-2">
        <div class="space-y-0.5">
          <p v-for="row in compareResult.rows" :key="row.worldName" class="flex justify-between text-[11px]">
            <span class="text-ink-faint">{{ row.worldName }}</span>
            <span class="tabular">
              <span class="text-ink-soft">今 {{ row.aText }}</span>
              <span class="mx-1 text-ink-faint">|</span>
              <span :class="row.trend === 'down' ? 'text-jade' : row.trend === 'up' ? 'text-cinnabar' : 'text-ink-faint'">
                彼 {{ row.bText }}
              </span>
            </span>
          </p>
        </div>
        <p v-if="compareResult.diffLines.length" class="mt-1 text-[10px] text-azure tabular">
          彼相对于今:{{ compareResult.diffLines.join(' · ') }}
        </p>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { detectBuild, buildSources } from '@/core/buildDetect'
  import { ratePower, ratingStars, type PowerDimKey } from '@/core/powerRating'
  import { gaugeFill, ratingGauges, weakestGauge } from '@/ui/ratingGauge'
  import { comboPairNames, matchComboArt, COMBO_SECONDARY_MIN } from '@/data/comboArts'
  import { measureResilience, resilienceText } from '@/core/resilience'
  import { playerMatchups, MATCHUP_SAMPLE_RUNS } from '@/core/playerMatchup'
  import { buildPlayerSnap } from '@/core/playerSnap'
  import { compareSnaps, type CompareReport } from '@/core/compare'
  import { endgameUnlocked, snapFromReplay } from '@/core/endgameService'
  import { useEndgameStore } from '@/stores/endgame'
  import { applyLoadout, captureLoadout, deleteLoadout, renameLoadout } from '@/core/loadoutService'
  import { useLoadoutsStore, MAX_LOADOUTS, type Loadout } from '@/stores/loadouts'
  import { cnNumber } from '@/utils/format'
  import { STAT_NAMES, signedPercent, statCaveat } from '@/data/statNames'
  import { isSoftCapped } from '@/core/statsCalc'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BuildLabPanel from '@/components/build/BuildLabPanel.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const player = usePlayerStore()
  const loadouts = useLoadoutsStore()

  const build = computed(() => detectBuild(player.finalStats.mods))
  /** 五维评级:进攻/生存/身法/恢复/机制 */
  const powerRating = computed(() => ratePower(player.finalStats))
  /** 五维刻度:星说在哪档,条说这一档走了多少(见 ui/ratingGauge) */
  const ratingRows = computed(() => ratingGauges(powerRating.value))
  const weakestRating = computed(() => weakestGauge(ratingRows.value))

  /** 点开的那一维;明细之和 = 那一维的得分(与人物页属性明细同一条规矩) */
  const dimKey = ref<PowerDimKey | null>(null)
  function toggleDim(key: PowerDimKey): void {
    dimKey.value = dimKey.value === key ? null : key
  }
  const buildSourceNames = computed(() => (build.value ? buildSources(build.value.style) : []))
  const coreCaveats = computed(() =>
    (build.value?.coreValues ?? [])
      .map(cv => ({ key: cv.key, label: STAT_NAMES[cv.key], caveat: statCaveat(cv.key) }))
      .filter((row): row is { key: typeof row.key; label: string; caveat: string } => Boolean(row.caveat))
  )

  /** 主副体系凑对时展示组合技,未达门槛也展示 */
  const comboInfo = computed(() => {
    const b = build.value
    const sec = b?.secondary
    if (!b || !sec) return null
    const art = matchComboArt(b.style.id, sec.style.id)
    if (!art) return null
    return {
      art,
      // 配对两派名按 pair 原序取,不按主副(见 data/comboArts.comboPairNames)
      pairNames: comboPairNames(art, b.style, sec.style),
      active: sec.affinity >= COMBO_SECONDARY_MIN
    }
  })

  /** 构筑韧性:主派封印后的战力保持(RESILIENCE_SAMPLE_RUNS 场等比敌采样,见 core/resilience) */
  const resilience = computed(() => (build.value ? measureResilience(buildPlayerSnap()) : null))

  /** 本世对局:当前构筑快照逐类对打,与构筑韧性同一条现算路径 */
  const matchupRows = computed(() => (build.value ? playerMatchups(buildPlayerSnap(), MATCHUP_SAMPLE_RUNS) : null))
  /** 短板在前 */
  const matchupSorted = computed(() => [...(matchupRows.value ?? [])].sort((a, b) => a.winRate - b.winRate))
  /** 胜率三档色,沿用战斗面板的给色 */
  function winBarCls(rate: number): string {
    return rate >= 0.7 ? 'bg-jade' : rate >= 0.45 ? 'bg-amber-ink' : 'bg-cinnabar'
  }
  function winTextCls(rate: number): string {
    return rate >= 0.7 ? 'text-jade' : rate >= 0.45 ? 'text-amber-ink' : 'text-cinnabar'
  }

  const endgame = useEndgameStore()
  /** 对照的那条道痕;关窗只收 open、不清,淡出时标题不闪空 */
  const compareAt = ref<(typeof endgame.marks)[number] | null>(null)
  const compareResult = ref<CompareReport | null>(null)
  const compareOpen = ref(false)
  const compareTitle = computed(() => (compareAt.value ? `第${compareAt.value.life}世·${compareAt.value.buildName}` : ''))

  const compareCandidates = computed(() =>
    endgameUnlocked()
      ? endgame.marks.filter(m => m.replay !== undefined).slice(0, 8)
      : []
  )

  function pickCompare(mark: (typeof endgame.marks)[number]): void {
    compareAt.value = mark
    if (!mark.replay) return
    compareResult.value = compareSnaps(buildPlayerSnap(), snapFromReplay('彼时构筑', mark.replay))
    compareOpen.value = true
  }

  const saveOpen = ref(false)
  const saveName = ref('')
  /** 等待二次确认删除的构筑 id */
  const confirmDelete = ref<string | null>(null)

  function openSave(): void {
    saveName.value = build.value?.style.name ?? ''
    saveOpen.value = true
  }

  const renameId = ref<string | null>(null)
  function openRename(lo: Loadout): void {
    renameId.value = lo.id
    saveName.value = lo.name
    saveOpen.value = true
  }

  function confirmRename(): void {
    if (renameId.value && renameLoadout(renameId.value, saveName.value)) {
      saveOpen.value = false
      renameId.value = null
    }
  }

  function onSaveSubmit(): void {
    if (renameId.value) confirmRename()
    else if (captureLoadout(saveName.value)) saveOpen.value = false
  }

  function closeSave(): void {
    renameId.value = null
    saveOpen.value = false
  }

  function doDeleteLoadout(id: string): void {
    deleteLoadout(id)
    confirmDelete.value = null
  }
</script>
