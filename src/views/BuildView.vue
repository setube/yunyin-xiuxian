<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <SectionTitle title="流派" hint="道路由构筑自然成形" />
    <div class="card-ink px-4 py-3">
      <template v-if="build">
        <div class="flex items-center gap-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-cinnabar/90 font-kai text-[22px] text-paper shadow">
            {{ build.style.seal }}
          </span>
          <div class="min-w-0 grow">
            <p class="flex items-baseline gap-2">
              <span class="font-kai text-[16px] tracking-widest text-ink">{{ build.displayName }}</span>
              <span class="text-[11px] text-cinnabar">{{ build.stageName }}</span>
              <span class="ml-auto tabular text-[12px] text-ink-soft">契合 {{ Math.round(build.affinity * 100) }}%</span>
            </p>
            <div class="track-ink mt-1.5 h-1.25 w-full">
              <div class="bar-fill" :style="{ width: `${build.affinity * 100}%`, background: 'var(--color-cinnabar)' }" />
            </div>
            <p v-if="build.secondary" class="mt-1 text-[10px] text-ink-faint tabular">
              副体系:{{ build.secondary.style.name }} {{ Math.round(build.secondary.affinity * 100) }}% —— 修行无职业,道路可以不纯
            </p>
          </div>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-ink-faint">{{ build.style.desc }}</p>
        <div class="mt-2 space-y-1">
          <p v-for="cv in build.coreValues" :key="cv.key" class="flex justify-between text-[12px]">
            <span class="text-ink-soft">
              {{ STAT_NAMES[cv.key] }}
              <span v-if="isSoftCapped(player.finalStats.mods, cv.key)" class="ml-0.5 text-[9px] text-cinnabar/80">软</span>
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
        <!-- 五维评级(Phase 30.2):读懂构筑"形状",不看战力总数 -->
        <div class="mt-2.5 rounded-md bg-paper-deep/60 px-3 py-2">
          <p class="text-[10px] text-ink-faint">{{ cnNumber(powerRating.labels.length) }}维评级 —— 读的是形状,不是排名</p>
          <div class="mt-1 grid grid-cols-1 gap-0.5">
            <!-- 每维可点开:星级是结果,词条才是原因 -->
            <button
              v-for="l in powerRating.labels"
              :key="l.key"
              class="-my-1 py-1.5 text-left active:opacity-60"
              @click="toggleDim(l.key)"
            >
              <span class="flex items-center justify-between text-[11px]">
                <span class="text-ink-soft">{{ l.name }}</span>
                <span class="tabular tracking-widest text-gold-ink">{{ ratingStars(l.stars) }}</span>
              </span>
              <span v-if="dimKey === l.key" class="mt-1 block rounded-md bg-paper/70 px-2 py-1.5">
                <span class="block text-[10px] text-ink-soft">
                  {{ l.name }}得分 {{ l.score.toFixed(2) }} · 一至五星,分高星足
                </span>
                <span v-for="t in l.terms" :key="t.label" class="mt-0.5 flex justify-between text-[10px]">
                  <span class="text-ink-faint">{{ t.label }}</span>
                  <span class="tabular text-azure">+{{ t.contribution.toFixed(2) }}</span>
                </span>
                <span v-if="!l.terms.length" class="block text-[10px] text-ink-faint">这一维还没有词条撑着。</span>
                <span class="mt-1 block text-[9px] leading-relaxed text-ink-faint">
                  底下各项相加,便得出这一维的得分;星随得分而升。
                </span>
              </span>
            </button>
          </div>
          <p class="mt-1 text-[10px] text-ink-faint">点一维看它由哪些词条凑出来。</p>
          <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
            同一星级的两个构筑谁更强,由环境与相性决定 —— 所以这里给的是形状,不是名次。
          </p>
        </div>
        <!-- 组合技:两条道路交汇处的一式神通 -->
        <div v-if="comboInfo" class="mt-2.5 rounded-md px-3 py-2" :class="comboInfo.active ? 'bg-violet-ink/8' : 'bg-ink/4'">
          <p class="flex items-center gap-2">
            <span class="font-kai text-[13px]" :class="comboInfo.active ? 'text-violet-ink' : 'text-ink-faint'">
              组合技「{{ comboInfo.art.name }}」
            </span>
            <span class="text-[10px]" :class="comboInfo.active ? 'text-jade' : 'text-ink-faint'">
              {{ comboInfo.active ? '已成' : `副体系至 ${Math.round(COMBO_SECONDARY_MIN * 100)}% 契合可成` }}
            </span>
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed" :class="comboInfo.active ? 'text-ink-soft' : 'text-ink-faint'">
            {{ comboInfo.art.desc }}
          </p>
          <p class="mt-0.5 text-[10px] text-cinnabar/80">代价:{{ comboInfo.art.costText }}</p>
        </div>
        <!-- 构筑韧性:主派被封后还剩什么 -->
        <div v-if="resilience" class="mt-2.5 rounded-md bg-ink/4 px-3 py-2">
          <!--
            标签与取值各成一格并允许换行:窄屏上「构筑韧性(主派核心封印之下)」会把
            右边那串胜率挤成两行(「胜率 100% →」/「100%」)。副题拆成独立一格,
            换行时整串胜率一起落到下一行(nowrap 保证它自己不裂)。
          -->
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
      </template>
      <p v-else class="text-[12px] leading-relaxed text-ink-faint">
        道途尚未成路。凑齐同一路数的词条、功法与法宝,自成一派——
        <br />
        <span class="text-ink-faint">背水 / 罡盾 / 反震 / 连击 / 沐泽 / 锋芒,各有克制,亦各有天敌。</span>
      </p>
    </div>

    <!-- 构筑快照 -->
    <SectionTitle title="构筑快照" :hint="`${loadouts.list.length}/${MAX_LOADOUTS}`" />
    <div class="card-ink px-4 py-3">
      <p class="mb-1.5 flex items-center justify-between">
        <span class="text-[11px] text-ink-faint">把顺手的整套功法 / 法宝 / 装备存起来,一键切换</span>
        <button class="-my-1 py-1.5 text-[11px] text-cinnabar/90 active:opacity-60" @click="openSave">+ 存当前构筑</button>
      </p>
      <div v-if="loadouts.list.length" class="space-y-1.5">
        <div v-for="lo in loadouts.list" :key="lo.id" class="flex items-center gap-2 rounded-md bg-paper-deep/70 px-2.5 py-1.5">
          <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-cinnabar/85 font-kai text-[12px] text-paper">
            {{ lo.seal }}
          </span>
          <span class="min-w-0 grow truncate font-kai text-[12px] text-ink">{{ lo.name }}</span>
          <button class="btn-ghost !px-2.5 !py-1 !text-[11px]" @click="applyLoadout(lo.id)">换装</button>
          <!-- 删除二步确认:一套构筑是心血,误触垃圾桶不该直接没 -->
          <template v-if="confirmDelete !== lo.id">
            <button
              class="-m-1.5 flex min-h-[28px] min-w-[28px] items-center justify-center p-1.5 text-ink-faint active:text-cinnabar"
              aria-label="删除构筑"
              @click="confirmDelete = lo.id"
            >
              <GameIcon name="trash" :size="12" />
            </button>
          </template>
          <template v-else>
            <button class="btn-seal !px-2 !py-0.5 !text-[10px]" @click="doDeleteLoadout(lo.id)">确信删除</button>
            <button class="text-[10px] text-ink-faint active:text-ink" @click="confirmDelete = null">取消</button>
          </template>
        </div>
      </div>
      <p v-else class="text-[10px] text-ink-faint">尚无快照,存一套后可在此与各区域间从容切换。</p>
    </div>

    <!-- 双构筑对照:让实验成为研究(真仙可用) -->
    <template v-if="compareCandidates.length">
      <SectionTitle title="构筑对照" hint="分环境论短长,不宣布谁胜" />
      <div class="card-ink px-4 py-3">
        <p class="text-[11px] text-ink-faint">以当前构筑,对照道痕中冻结的一套过往构筑,看四天局面各有何异。</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="c in compareCandidates"
            :key="c.at"
            class="chip-ink"
            :class="compareAt === c.at ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="pickCompare(c.at)"
          >
            第{{ c.life }}世·{{ c.buildName }}
          </button>
        </div>
        <template v-if="compareResult">
          <div class="mt-2 space-y-0.5">
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
          <p class="mt-0.5 text-[10px] text-ink-faint">两套方案各有其境,取舍在你。</p>
        </template>
      </div>
    </template>

    <!-- 保存构筑 -->
    <BaseModal :open="saveOpen" title="存为构筑" @close="saveOpen = false">
      <p class="text-[11px] text-ink-faint">将当前功法 / 法宝 / 整身装备存为一套,可随时一键切换。</p>
      <input
        v-model="saveName"
        maxlength="8"
        class="mt-2 w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-2 font-kai text-[14px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
        placeholder="给这套构筑起个名号"
      />
      <template #footer>
        <button class="btn-seal w-full" @click="confirmSave">存 入</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { detectBuild, buildSources } from '@/core/buildDetect'
  import { ratePower, ratingStars, type PowerDimKey } from '@/core/powerRating'
  import { matchComboArt, COMBO_SECONDARY_MIN } from '@/data/comboArts'
  import { measureResilience, resilienceText } from '@/core/resilience'
  import { buildPlayerSnap } from '@/core/playerSnap'
  import { compareSnaps, type CompareReport } from '@/core/compare'
  import { endgameUnlocked, snapFromReplay } from '@/core/endgameService'
  import { useEndgameStore } from '@/stores/endgame'
  import { applyLoadout, captureLoadout, deleteLoadout } from '@/core/loadoutService'
  import { useLoadoutsStore, MAX_LOADOUTS } from '@/stores/loadouts'
  import { cnNumber } from '@/utils/format'
  import { STAT_NAMES, signedPercent, statCaveat } from '@/ui/statNames'
  import { isSoftCapped } from '@/core/statsCalc'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const player = usePlayerStore()
  const loadouts = useLoadoutsStore()

  const build = computed(() => detectBuild(player.finalStats.mods))
  /** 五维评级:进攻/生存/身法/恢复/机制 —— 让玩家读懂构筑形状而非只盯战力总数 */
  const powerRating = computed(() => ratePower(player.finalStats))

  /** 点开哪一维看它的来路 —— 与人物页属性明细同一条规矩:明细之和 = 那一维的得分 */
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

  /** 主副体系凑对时展示组合技(未达门槛也展示,作为构筑目标) */
  const comboInfo = computed(() => {
    const b = build.value
    if (!b?.secondary) return null
    const art = matchComboArt(b.style.id, b.secondary.style.id)
    if (!art) return null
    return { art, active: b.secondary.affinity >= COMBO_SECONDARY_MIN }
  })

  /** 构筑韧性:主派封印后的战力保持(120 场等比敌采样) */
  const resilience = computed(() => (build.value ? measureResilience(buildPlayerSnap()) : null))

  // ---- 双构筑对照 ----
  const endgame = useEndgameStore()
  const compareAt = ref<number | null>(null)
  const compareResult = ref<CompareReport | null>(null)

  const compareCandidates = computed(() =>
    endgameUnlocked()
      ? endgame.marks
          .filter(m => m.replay !== undefined)
          .slice(0, 8)
          .map(m => ({ at: m.at, life: m.life, buildName: m.buildName }))
      : []
  )

  function pickCompare(at: number): void {
    compareAt.value = at
    const mark = endgame.marks.find(m => m.at === at)
    if (!mark?.replay) return
    compareResult.value = compareSnaps(buildPlayerSnap(), snapFromReplay('彼时构筑', mark.replay))
  }

  const saveOpen = ref(false)
  const saveName = ref('')
  /** 等待二次确认删除的构筑 id */
  const confirmDelete = ref<string | null>(null)

  function openSave(): void {
    saveName.value = build.value?.style.name ?? ''
    saveOpen.value = true
  }

  function doDeleteLoadout(id: string): void {
    deleteLoadout(id)
    confirmDelete.value = null
  }

  function confirmSave(): void {
    if (captureLoadout(saveName.value)) saveOpen.value = false
  }
</script>
