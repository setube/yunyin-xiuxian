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
              :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color }"
            >
              {{ ELEMENTS[root.element].char }}
            </span>
            <span class="tabular text-[11px] text-ink-soft">资质 {{ root.aptitude }}</span>
          </div>
        </div>
        <p class="mt-3 text-center text-[12px] text-ink-faint">
          修行倍率 <span class="tabular text-ink">×{{ view.nextLinggen.growthMult.toFixed(2) }}</span>
        </p>
        <button class="btn-ghost mt-3 w-full" @click="rerollReincarnationLinggen">逆天改命</button>
        <p class="mt-2 text-center text-[11px] text-ink-faint">不限次数</p>
      </div>
      <p class="mt-3 font-kai text-[13px] tracking-widest text-ink">择一先天之姿</p>
      <p v-if="view.talentChoices.length === 0" class="mt-2 text-[11px] leading-relaxed text-ink-faint">已集齐</p>
      <div class="mt-2 space-y-2">
        <button
          v-for="id in view.talentChoices"
          :key="id"
          class="w-full rounded-lg border px-3 py-2 text-left transition-all active:scale-98"
          :class="chosen === id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/20'"
          :aria-pressed="chosen === id"
          @click="chosen = id"
        >
          <p class="flex items-center gap-2">
            <span class="font-kai text-[14px]" :style="{ color: TALENT_GRADE_COLORS[talentDef(id)?.grade ?? 1] }">
              {{ talentDef(id)?.name }}
            </span>
            <span class="text-[10px] text-ink-faint">{{ TALENT_GRADE_NAMES[talentDef(id)?.grade ?? 1] }}</span>
          </p>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ talentDef(id)?.desc }}</p>
          <p v-if="talentDef(id) && modsText(talentDef(id)!.mods)" class="mt-0.5 text-[11px] tabular text-azure">
            {{ modsText(talentDef(id)!.mods) }}
          </p>
        </button>
      </div>
      <div v-if="view.extraTalents.length" class="mt-3 text-[11px] text-ink-faint">
        <p>另得:</p>
        <p v-for="id in view.extraTalents" :key="id" class="mt-1">
          <span class="font-kai text-gold-ink">{{ talentDef(id)?.name }}</span>
          <span v-if="talentDef(id) && modsText(talentDef(id)!.mods)" class="ml-1 tabular text-azure">
            {{ modsText(talentDef(id)!.mods) }}
          </span>
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
  import { talentDef, TALENT_GRADE_COLORS, TALENT_GRADE_NAMES } from '@/data/talents'
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

  function confirm(): void {
    confirmReincarnation(chosen.value, theme.value)
    chosen.value = null
    theme.value = null
    engine.resetDeathFlag()
    void router.push('/')
  }
</script>
