<template>
  <!-- 死亡提示 -->
  <BaseModal :open="ui.deathDialog && !view" :closable="false" aria-label="寿元将尽">
    <div class="text-center">
      <p class="mt-2 font-kai text-2xl tracking-[0.4em] text-ink">寿元将尽</p>
      <p class="mt-3 text-[13px] leading-relaxed text-ink-soft">
        {{ player.name }} · {{ Math.floor(player.age) }} 载 · {{ player.realmName }}
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="beginRebirth">兵解转世</button>
    </template>
  </BaseModal>

  <!-- 第一程:回顾上一世 -->
  <BaseModal :open="view !== null && step === 'review'" :closable="false" title="此生已矣">
    <div v-if="view">
      <p class="text-[12px] leading-relaxed text-ink-soft">
        第
        <span class="font-kai text-ink tabular">{{ view.review.index }}</span>
        世 · {{ view.review.realmLabel }} ·
        <span class="tabular">{{ view.review.age }}</span>
        载
      </p>

      <!-- 这一世立的题 -->
      <div v-if="reviewTheme" class="mt-3 rounded-lg border border-ink/15 px-3 py-2">
        <p class="flex items-center justify-between">
          <span class="font-kai text-[13px] text-ink">「{{ reviewTheme.vow }}」</span>
          <span class="text-[11px]" :class="RESULT_COLORS[view.review.themeResult ?? 'unfinished']">
            {{ RESULT_NAMES[view.review.themeResult ?? 'unfinished'] }}
          </span>
        </p>
        <p class="mt-1 text-[11px] text-ink-faint">
          {{ reviewTheme.goal }}
          <span v-if="view.review.themeResult === 'unfinished'" class="tabular">
            ({{ Math.floor(view.review.themeCur) }} / {{ view.review.themeNeed }})
          </span>
        </p>
        <p v-if="view.review.themeResult === 'done'" class="mt-1 text-[11px] leading-relaxed text-gold-ink">
          {{ reviewTheme.legacy }}
        </p>
        <p v-else-if="view.review.themeResult === 'broken'" class="mt-1 text-[11px] text-ink-faint">
          犯忌:{{ TABOO_NAMES[reviewTheme.taboo ?? 'pill'] }}
        </p>
      </div>
      <p v-else class="mt-3 text-[11px] text-ink-faint">未立题</p>

      <!-- 宿慧与阶段 -->
      <div class="mt-3 rounded-lg border border-ink/15 px-3 py-2">
        <p class="flex items-center justify-between text-[12px]">
          <span class="text-ink-soft">本世宿慧</span>
          <span class="font-kai text-cinnabar tabular">+{{ view.review.insightGained }}</span>
        </p>
        <p class="mt-1.5 flex items-center justify-between text-[12px]">
          <span class="text-ink-soft">宿慧共计</span>
          <span class="tabular text-ink">{{ view.insightAfter }}</span>
        </p>
        <p class="mt-2 flex items-center gap-2">
          <span class="font-kai text-[14px]" :class="view.stageAdvanced ? 'text-cinnabar' : 'text-ink'">{{ view.stageName }}</span>
          <span v-if="view.stageAdvanced" class="rounded border border-cinnabar/40 bg-cinnabar/10 px-1.5 py-0.5 text-[10px] text-ink">境地已迁</span>
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ view.stageDesc }}</p>
        <p v-if="view.toNextStage !== null" class="mt-1 text-[11px] text-ink-faint tabular">
          下一境地 · 宿慧尚差 {{ view.toNextStage }}
        </p>
        <!--
          这段原只写「宿慧 +40 / 共计 400 / 第四境地 / 尚差 120」——
          数都摆着,却从不说什么能力是这些宿慧换来的(见 ui/samsaraPowers)。
        -->
        <div v-if="powerPanel" class="mt-2 border-t border-ink/10 pt-2">
          <p class="flex items-baseline justify-between text-[10px]">
            <span class="text-ink-faint">宿慧所得</span>
            <span class="tabular text-ink-faint">{{ powerPanel.tally.owned }} / {{ powerPanel.tally.total }}</span>
          </p>
          <!-- 最快将至的那项单独点名:下面虚框列三行,哪一项最先到手仍要自己比阶数 -->
          <p v-if="powerPanel.next" class="mt-0.5 text-[10px] text-ink-faint">
            再转一世可得 <span class="text-ink-soft">{{ powerPanel.next.name }}</span>
          </p>
          <ul class="mt-1 space-y-0.5">
            <li
              v-for="pw in powerPanel.owned"
              :key="pw.id"
              class="flex items-baseline gap-1.5 text-[11px] leading-relaxed"
            >
              <span class="samara-power shrink-0 font-kai text-[10px]" :class="`samara-power--${pw.kind}`">{{ POWER_KIND_LABEL[pw.kind] }}</span>
              <span class="min-w-0 text-ink-soft">{{ pw.name }}</span>
            </li>
            <li
              v-for="pw in powerPanel.upcoming"
              :key="pw.id"
              class="flex items-baseline gap-1.5 text-[11px] leading-relaxed text-ink-faint"
            >
              <span class="samara-power samara-power--locked shrink-0 font-kai text-[10px]">{{ POWER_KIND_LABEL[pw.kind] }}</span>
              <span class="min-w-0">{{ pw.name }}</span>
              <span class="shrink-0 text-[10px] tabular">· {{ pw.fromStage }} 阶</span>
            </li>
          </ul>
        </div>
      </div>

      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">
        来世认得
        <span class="text-ink tabular">{{ view.knownMaterials }}</span>
        味灵材
      </p>

      <!-- 交割清单:与 core/samsaraAudit 的继承表同源,不另写 -->
      <div class="mt-3 rounded-lg border border-ink/15 px-3 py-2">
        <p class="text-[10px] text-ink-faint">此生交割</p>
        <div v-for="g in heritageGroups()" :key="g.mode" class="mt-1.5">
          <p class="text-[11px]" :class="g.mode === 'reset' ? 'text-ink-faint' : 'text-ink-soft'">
            {{ g.title }}
            <span class="ml-1 text-[10px] text-ink-faint">{{ g.rows.length }} 项</span>
          </p>
          <div class="mt-0.5 flex flex-wrap gap-1">
            <button
              v-for="r in g.rows"
              :key="r.id"
              type="button"
              class="chip-ink !py-1.5 !text-[10px]"
              :class="[
                g.mode === 'full' ? 'border-jade/50 text-jade' : g.mode === 'partial' ? 'border-gold-ink/50 text-gold-ink' : 'border-ink/20 text-ink-faint',
                detailId === r.id ? 'ring-1 ring-current' : ''
              ]"
              :aria-pressed="detailId === r.id"
              :title="r.brief"
              @click="detailId = detailId === r.id ? null : r.id"
            >
              {{ r.name }}
            </button>
          </div>
        </div>
        <p v-if="detailRow" class="mt-2 text-[10px] leading-relaxed text-ink-soft tabular">{{ detailRow.name }} · {{ detailRow.brief }}</p>
      </div>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="step = 'next'">往生</button>
    </template>
  </BaseModal>

  <!-- 第二程:择姿立题 -->
  <BaseModal :open="view !== null && step === 'next'" :closable="false" title="轮回">
    <div v-if="view">
      <p class="text-[12px] leading-relaxed text-ink-soft">
        道果
        <span class="text-cinnabar tabular">+{{ view.daoFruitGained }}</span>
      </p>
      <div class="mt-3 rounded-lg border border-ink/15 px-3 py-3" role="group" aria-label="来世灵根">
        <p class="flex items-center justify-between font-kai text-[13px] text-ink">
          <span>来世灵根</span>
          <span class="text-cinnabar">{{ view.nextLinggen.gradeName }}</span>
        </p>
        <div class="mt-3 flex flex-wrap justify-center gap-3" aria-live="polite">
          <div v-for="root in view.nextLinggen.roots" :key="root.element" class="flex flex-col items-center gap-1.5">
            <span
              class="grid h-10 w-10 place-items-center rounded-full border-2 font-kai text-lg"
              :class="{ 'root-special': ELEMENTS[root.element].special }"
              :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color, '--root-tone': ELEMENTS[root.element].color }"
            >
              {{ ELEMENTS[root.element].char }}
            </span>
            <span class="tabular text-[11px] text-ink-soft">资质 {{ root.aptitude }}</span>
            <!--
              资质刻度:多根时哪一根是主根,原先得逐个读数字再比。
              建号页与人物页都有这根,唯独这里没有 —— 而这正是玩家决定要不要「逆天改命」的地方
              (见 ui/rootMark)。
            -->
            <span
              class="root-pips"
              :class="{ 'root-pips--top': nextRootMark(root.element)?.top }"
              :style="{ '--root-tone': ELEMENTS[root.element].color }"
              role="img"
              :aria-label="`资质 ${root.aptitude}`"
            >
              <i v-for="(on, i) in rootPips(nextRootMark(root.element)?.pips ?? 0)" :key="i" :class="{ on }" />
            </span>
          </div>
        </div>
        <!--
          倍率原只给一个数。这一手算好还是不好,与建号页是同一件事、同一个数、同一个区间 ——
          两处该用同一份刻度(见 ui/growthGauge),不在这里另写一套判断。
        -->
        <div class="mt-3">
          <p class="flex items-baseline justify-center gap-2 text-[12px] text-ink-faint">
            <span>修行倍率</span>
            <span class="tabular text-[14px] text-ink">×{{ nextGrowth.mult.toFixed(2) }}</span>
            <span
              class="rounded border border-ink/15 px-1.5 py-0.5 text-[10px] leading-none"
              :class="GROWTH_TONE[nextGrowth.tier]"
            >
              {{ nextGrowth.label }}
            </span>
          </p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <span class="shrink-0 tabular text-[9px] leading-none text-ink-faint">×{{ nextGrowth.floor.toFixed(1) }}</span>
            <span
              class="growth-gauge min-w-0 flex-1"
              :class="`growth-gauge--${nextGrowth.tier}`"
              role="img"
              :aria-label="`修行倍率 ×${nextGrowth.mult.toFixed(2)},区间 ${nextGrowth.floor.toFixed(1)} 至 ${nextGrowth.ceil.toFixed(1)},属${nextGrowth.label}`"
            >
              <i :style="{ '--gauge-pos': `${nextGrowth.position * 100}%` }" />
            </span>
            <span class="shrink-0 tabular text-[9px] leading-none text-ink-faint">×{{ nextGrowth.ceil.toFixed(1) }}</span>
          </div>
        </div>
        <button class="btn-ghost mt-3 w-full" @click="rerollReincarnationLinggen">逆天改命</button>
        <p class="mt-2 text-center text-[11px] text-ink-faint">不限次数</p>
      </div>
      <p class="mt-3 font-kai text-[13px] tracking-widest text-ink">择一先天之姿</p>
      <p v-if="view.talentChoices.length === 0" class="mt-2 text-[11px] leading-relaxed text-ink-faint">已集齐</p>
      <div class="mt-2 space-y-2">
        <button
          v-for="row in talentRows"
          :key="row.id"
          class="w-full rounded-lg border px-3 py-2 text-left transition-all active:scale-98"
          :class="chosen === row.id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/20'"
          :aria-pressed="chosen === row.id"
          @click="chosen = row.id"
        >
          <p class="flex items-center gap-2">
            <span class="font-kai text-[14px]" :style="{ color: row.color }">{{ row.name }}</span>
            <span class="text-[10px] text-ink-faint">{{ row.gradeName }}</span>
            <!-- 阶点与转世弹窗同一套(见 ui/talentMark):四档里谁高一档,数点便知 -->
            <span
              class="talent-pips"
              :class="{ 'talent-pips--top': row.mark.top }"
              :style="{ color: row.color }"
              aria-hidden="true"
            >
              <i v-for="(on, i) in row.pips" :key="i" :class="{ on }" />
            </span>
          </p>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ row.desc }}</p>
          <p v-if="row.modsText" class="mt-0.5 text-[11px] tabular text-azure">{{ row.modsText }}</p>
        </button>
      </div>
      <div v-if="view.extraTalents.length" class="mt-3 text-[11px] text-ink-faint">
        <p>另得:</p>
        <p v-for="row in extraTalentRows" :key="row.id" class="mt-1">
          <span class="font-kai text-gold-ink">{{ row.name }}</span>
          <span v-if="row.modsText" class="ml-1 tabular text-azure">{{ row.modsText }}</span>
        </p>
      </div>

      <!-- 这一世的命题 -->
      <template v-if="view.themeChoices.length">
        <p class="mt-4 font-kai text-[13px] tracking-widest text-ink">
          本世命题
          <span v-if="view.themeFree" class="ml-1 text-[10px] font-normal text-gold-ink">(自选)</span>
        </p>
        <p class="mt-1 text-[11px] text-ink-faint">不加属性</p>
        <div class="mt-2 space-y-2">
          <button
            v-for="t in themeDefs"
            :key="t.id"
            class="w-full rounded-lg border px-3 py-2 text-left transition-all active:scale-98"
            :class="theme === t.id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/20'"
            :aria-pressed="theme === t.id"
            @click="theme = theme === t.id ? null : t.id"
          >
            <p class="flex items-center justify-between">
              <span class="font-kai text-[14px] text-ink">{{ t.name }}</span>
              <span class="text-[10px] text-ink-faint tabular">达成 +{{ t.insight }} 宿慧</span>
            </p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ t.vow }}</p>
            <p class="mt-0.5 text-[11px] text-ink-faint">
              {{ t.goal }}
              <span v-if="t.taboo" class="ml-1 text-amber-ink">忌:{{ TABOO_NAMES[t.taboo] }}</span>
            </p>
          </button>
        </div>
      </template>
    </div>
    <template #footer>
      <button class="btn-seal w-full" :disabled="!canConfirm" @click="confirm">
        {{ canConfirm ? '踏入轮回' : '踏入轮回(先择先天之姿)' }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useUiStore } from '@/stores/ui'
  import { usePlayerStore } from '@/stores/player'
  import { prepareReincarnation, confirmReincarnation, rerollReincarnationLinggen } from '@/core/reincarnation'
  import { ELEMENTS } from '@/data/linggen'
  import { talentDef, TALENT_GRADE_NAMES } from '@/data/talents'
  import { talentMark, talentPips, talentTextColor } from '@/ui/talentMark'
  import { growthGauge } from '@/ui/growthGauge'
  import { rootMarks, rootPips } from '@/ui/rootMark'
  import { POWER_KIND_LABEL, nextPower, powerTally, samaraPowers, upcomingPowers } from '@/ui/samsaraPowers'
  import { SAMSARA_STAGES } from '@/data/samsara'
  import { modsText } from '@/data/statNames'
  import { lifeThemeDef, TABOO_NAMES } from '@/data/lifeThemes'
  import { heritageGroups } from '@/core/samsaraAudit'
  import { engine } from '@/core/engine'
  import BaseModal from '@/components/common/BaseModal.vue'

  const ui = useUiStore()
  const player = usePlayerStore()
  const router = useRouter()

  const RESULT_NAMES: Record<'done' | 'unfinished' | 'broken', string> = {
    done: '已成',
    unfinished: '未竟',
    broken: '已破'
  }
  const RESULT_COLORS: Record<'done' | 'unfinished' | 'broken', string> = {
    done: 'text-cinnabar',
    unfinished: 'text-ink-faint',
    broken: 'text-amber-ink'
  }

  const chosen = ref<string | null>(null)
  const theme = ref<string | null>(null)
  const step = ref<'review' | 'next'>('review')
  // 芯片点按看去留:title 只 hover 可见,移动端读不到
  const detailId = ref<string | null>(null)
  const detailRow = computed(() => {
    if (!detailId.value) return null
    for (const g of heritageGroups()) {
      const r = g.rows.find(r => r.id === detailId.value)
      if (r) return r
    }
    return null
  })

  const view = computed(() => ui.reincarnation)

  /** 来世灵根的倍率刻度:与建号页同一份(见 ui/growthGauge) */
  const nextGrowth = computed(() => growthGauge(view.value?.nextLinggen.growthMult ?? 1))
  /**
   * 宿慧能力面板:阶序反查一次,四样读数(已得 / 总数 / 最快将至 / 将至三行)各算一次。
   *
   * 原先模板里 `stageIndexOf(view.stageId)` 一个渲染周期调六次(每次都在 SAMSARA_STAGES
   * 里 find 一遍),`powerTally` / `nextPower` / `samaraPowers` / `upcomingPowers` 各自再
   * 调一遍 —— 每个都从同一份静态表重新筛一次。现一次算齐,模板只读字段。
   */
  const powerPanel = computed(() => {
    const v = view.value
    if (!v) return null
    const idx = SAMSARA_STAGES.find(s => s.id === v.stageId)?.index ?? 0
    return {
      tally: powerTally(idx),
      next: nextPower(idx),
      owned: samaraPowers(idx).owned,
      upcoming: upcomingPowers(idx, 3)
    }
  })

  /**
   * 天赋行:每枚的品阶、字色、阶点、词条文本各算一次。
   *
   * 原先模板里 `talentDef(id)` 一个渲染周期要调十几次(名字、品阶名、字色 ×3、
   * 阶点、形意、词条判空 ×2),`modsText` 还要再算一遍 ——
   * 而这些全是纯查表。`id` 来自 view,一变全变,预计算与逐次调用的结果完全一致。
   */
  function talentRow(id: string) {
    const def = talentDef(id)
    const grade = def?.grade ?? 1
    return {
      id,
      name: def?.name ?? '',
      desc: def?.desc ?? '',
      gradeName: TALENT_GRADE_NAMES[grade],
      color: talentTextColor(grade),
      mark: talentMark(grade),
      pips: talentPips(grade),
      modsText: def ? modsText(def.mods) : ''
    }
  }
  const talentRows = computed(() => (view.value?.talentChoices ?? []).map(talentRow))
  const extraTalentRows = computed(() => (view.value?.extraTalents ?? []).map(talentRow))

  /** 来世灵根的资质刻度:与建号页、人物页同一份(见 ui/rootMark) */
  const nextRootMarks = computed(() => rootMarks(view.value?.nextLinggen.roots ?? []))
  const nextRootMark = (el: string) => nextRootMarks.value.find(m => m.element === el)
  const GROWTH_TONE: Record<string, string> = {
    low: 'text-ink-faint',
    mid: 'text-ink-soft',
    high: 'text-azure',
    peak: 'text-cinnabar'
  }
  const reviewTheme = computed(() => (view.value?.review.themeId ? lifeThemeDef(view.value.review.themeId) : undefined))
  const themeDefs = computed(() => (view.value?.themeChoices ?? []).flatMap(id => lifeThemeDef(id) ?? []))

  /** talentChoices 多周目后可能为空,此时须放行,否则卡死在此弹窗;只拦「有可选却未择定」 */
  const canConfirm = computed(() => (view.value?.talentChoices.length ?? 0) === 0 || chosen.value !== null)

  // 弹窗常驻 App,不随结算卸载:每次新结算回到第一程,收起上回点开的去留
  watch(view, v => {
    if (!v) return
    step.value = 'review'
    detailId.value = null
  })

  function beginRebirth(): void {
    prepareReincarnation()
  }

  async function confirm(): Promise<void> {
    // 转世里要等凡界重新凝出来(分块异步);不等就跳转,落地时会看到「此世未成」
    await confirmReincarnation(chosen.value, theme.value)
    chosen.value = null
    theme.value = null
    engine.resetDeathFlag()
    void router.push('/')
  }
</script>
