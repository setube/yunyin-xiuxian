<template>
  <!-- 死亡提示 -->
  <BaseModal :open="ui.deathDialog && !view" :closable="false">
    <div class="text-center">
      <p class="mt-2 font-kai text-2xl tracking-[0.4em] text-ink">寿元将尽</p>
      <p class="mt-3 text-[13px] leading-relaxed text-ink-soft">
        {{ player.name }}枯坐于蒲团之上,油尽灯枯。
        <br />
        此生行至 {{ Math.floor(player.age) }} 载,止步于{{ player.realmName }}。
        <br />
        所幸神魂不灭,尚可入轮回,再启仙途。
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
        世,你行至{{ view.review.realmLabel }},寿终于
        <span class="tabular">{{ view.review.age }}</span>
        载。
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
          你{{ TABOO_NAMES[reviewTheme.taboo ?? 'pill'] }}了。这一世的话,没能说到底。
        </p>
      </div>
      <p v-else class="mt-3 text-[11px] text-ink-faint">此生不曾为自己立下什么题目。</p>

      <!-- 宿慧与阶段 -->
      <div class="mt-3 rounded-lg border border-ink/15 px-3 py-2">
        <p class="flex items-center justify-between text-[12px]">
          <span class="text-ink-soft">此生所历,化作宿慧</span>
          <span class="font-kai text-cinnabar tabular">+{{ view.review.insightGained }}</span>
        </p>
        <p class="mt-1.5 flex items-center justify-between text-[12px]">
          <span class="text-ink-soft">宿慧共计</span>
          <span class="tabular text-ink">{{ view.insightAfter }}</span>
        </p>
        <p class="mt-2 flex items-center gap-2">
          <span class="font-kai text-[14px]" :class="view.stageAdvanced ? 'text-cinnabar' : 'text-ink'">{{ view.stageName }}</span>
          <span v-if="view.stageAdvanced" class="rounded bg-cinnabar/10 px-1.5 py-0.5 text-[10px] text-cinnabar">境地已迁</span>
        </p>
        <p class="mt-1 text-[11px] leading-relaxed text-ink-faint">{{ view.stageDesc }}</p>
        <p v-if="view.toNextStage !== null" class="mt-1 text-[11px] text-ink-faint tabular">
          再积 {{ view.toNextStage }} 宿慧,可入下一境地。
        </p>
      </div>

      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">
        丹方、药性、器纹、敌手的路数——这些所知不随皮囊腐朽。
        来世睁眼,你便认得
        <span class="text-ink tabular">{{ view.knownMaterials }}</span>
        味灵材。
      </p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="step = 'next'">往生</button>
    </template>
  </BaseModal>

  <!-- 第二程:择姿立题 -->
  <BaseModal :open="view !== null && step === 'next'" :closable="false" title="轮回">
    <div v-if="view">
      <p class="text-[12px] leading-relaxed text-ink-soft">
        此番轮回凝得道果
        <span class="text-cinnabar tabular">{{ view.daoFruitGained }}</span>
        枚,来世修行更进一步。
      </p>
      <p class="mt-3 font-kai text-[13px] tracking-widest text-ink">择一先天之姿</p>
      <p v-if="view.talentChoices.length === 0" class="mt-2 text-[11px] leading-relaxed text-ink-faint">
        先天之姿已尽数为你所有,此番再无可择——直取轮回便是。
      </p>
      <div class="mt-2 space-y-2">
        <button
          v-for="id in view.talentChoices"
          :key="id"
          class="w-full rounded-lg border px-3 py-2 text-left transition-all active:scale-98"
          :class="chosen === id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/20'"
          @click="chosen = id"
        >
          <p class="flex items-center gap-2">
            <span class="font-kai text-[14px]" :style="{ color: TALENT_GRADE_COLORS[talentDef(id)?.grade ?? 1] }">
              {{ talentDef(id)?.name }}
            </span>
            <span class="text-[10px] text-ink-faint">{{ TALENT_GRADE_NAMES[talentDef(id)?.grade ?? 1] }}</span>
          </p>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ talentDef(id)?.desc }}</p>
        </button>
      </div>
      <p v-if="view.extraTalents.length" class="mt-3 text-[11px] text-ink-faint">
        另有天资自开:
        <span v-for="id in view.extraTalents" :key="id" class="mr-2 font-kai text-gold-ink">{{ talentDef(id)?.name }}</span>
      </p>

      <!-- 这一世的命题 -->
      <template v-if="view.themeChoices.length">
        <p class="mt-4 font-kai text-[13px] tracking-widest text-ink">
          这一世要做什么
          <span v-if="view.themeFree" class="ml-1 text-[10px] font-normal text-gold-ink">(百世老修,任你自择)</span>
        </p>
        <p class="mt-1 text-[11px] text-ink-faint">立题不给属性。走到底了,所得的是随神魂不灭的一份所知。</p>
        <div class="mt-2 space-y-2">
          <button
            v-for="t in themeDefs"
            :key="t.id"
            class="w-full rounded-lg border px-3 py-2 text-left transition-all active:scale-98"
            :class="theme === t.id ? 'border-cinnabar bg-cinnabar/5' : 'border-ink/20'"
            @click="theme = theme === t.id ? null : t.id"
          >
            <p class="flex items-center justify-between">
              <span class="font-kai text-[14px] text-ink">{{ t.name }}</span>
              <span class="text-[10px] text-ink-faint tabular">宿慧 +{{ t.insight }}</span>
            </p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{{ t.vow }}</p>
            <p class="mt-0.5 text-[11px] text-ink-faint">
              {{ t.goal }}
              <span v-if="t.taboo" class="ml-1 text-amber-ink">忌:{{ TABOO_NAMES[t.taboo] }}</span>
            </p>
          </button>
        </div>
        <p class="mt-2 text-[11px] text-ink-faint">不选亦可——无题的一世,不过是少一份所得。</p>
      </template>
    </div>
    <template #footer>
      <button class="btn-seal w-full" :disabled="!canConfirm" @click="confirm">踏入轮回</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useUiStore } from '@/stores/ui'
  import { usePlayerStore } from '@/stores/player'
  import { prepareReincarnation, confirmReincarnation } from '@/core/reincarnation'
  import { talentDef, TALENT_GRADE_COLORS, TALENT_GRADE_NAMES } from '@/data/talents'
  import { lifeThemeDef, TABOO_NAMES } from '@/data/lifeThemes'
  import { engine } from '@/core/engine'
  import BaseModal from '@/components/common/BaseModal.vue'

  const ui = useUiStore()
  const player = usePlayerStore()
  const router = useRouter()

  const RESULT_NAMES: Record<'done' | 'unfinished' | 'broken', string> = {
    done: '践行到底',
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

  const view = computed(() => ui.reincarnation)
  const reviewTheme = computed(() => (view.value?.review.themeId ? lifeThemeDef(view.value.review.themeId) : undefined))
  const themeDefs = computed(() => (view.value?.themeChoices ?? []).flatMap(id => lifeThemeDef(id) ?? []))

  /**
   * 天赋池会被抽空(可选天赋有限,多周目后 talentChoices 可能为空)。
   * 那种情况下没有可选项,却仍要能踏入轮回——否则玩家被永久卡死在此弹窗。
   * 只有「确有天赋可选却尚未择定」时才拦
   */
  const canConfirm = computed(() => (view.value?.talentChoices.length ?? 0) === 0 || chosen.value !== null)

  // 每次新开轮回界面都从"回顾"这一程重新走起
  watch(view, v => {
    if (v) step.value = 'review'
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
