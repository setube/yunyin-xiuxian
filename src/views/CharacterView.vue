<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 基本信息 -->
    <div class="card-ink px-4 py-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-kai text-[22px] tracking-[0.2em] text-ink">{{ player.name }}</p>
          <p class="mt-1 text-[11px] text-ink-faint tabular">
            {{ player.realmName }} · {{ Math.floor(player.age) }} 岁 / {{ formatYears(player.lifespanMax) }}
            <template v-if="player.reincarnation.count">· 第 {{ player.reincarnation.count + 1 }} 世</template>
          </p>
        </div>
        <div class="text-right">
          <p class="text-[10px] tracking-[0.3em] text-ink-faint">战 力</p>
          <p class="font-kai text-[18px] text-cinnabar tabular">{{ formatGN(stats.power) }}</p>
        </div>
      </div>
      <div class="ink-divider my-3" />
      <!-- 灵根 -->
      <div class="flex items-center gap-3">
        <span class="font-kai text-[12px] tracking-widest text-ink-faint">灵根</span>
        <span class="font-kai text-[13px] text-cinnabar">{{ player.linggen?.gradeName }}</span>
        <div class="flex gap-1.5">
          <span
            v-for="root in player.linggen?.roots ?? []"
            :key="root.element"
            class="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-kai"
            :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color }"
            :title="`资质 ${root.aptitude}`"
          >
            {{ ELEMENTS[root.element].char }}
          </span>
        </div>
        <span class="ml-auto text-[11px] text-ink-faint tabular">×{{ player.linggen?.growthMult.toFixed(2) }}</span>
      </div>
      <!-- 天然牌面(Phase 32.2):转世发下的这张牌决定路好不好走,而非走得多快 -->
      <div v-if="tendencies.length" class="mt-2 space-y-1">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
    </div>

    <!-- 属性 -->
    <section>
      <SectionTitle title="道躯" />
      <div class="card-ink mt-2 px-4 py-3">
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-[10px] text-ink-faint">攻击</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.attack) }}</p>
          </div>
          <div>
            <p class="text-[10px] text-ink-faint">防御</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.defense) }}</p>
          </div>
          <div>
            <p class="text-[10px] text-ink-faint">气血</p>
            <p class="tabular font-kai text-[15px] text-ink">{{ formatGN(stats.maxHp) }}</p>
          </div>
        </div>
        <div v-if="modRows.length" class="ink-divider my-2.5" />
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          <p v-for="row in modRows" :key="row.label" class="flex justify-between text-[11px]">
            <span class="text-ink-faint">{{ row.label }}</span>
            <span class="tabular" :class="row.value > 0 ? 'text-azure' : 'text-cinnabar'">
              {{ row.value > 0 ? '+' : '' }}{{ formatPercent(row.value) }}
            </span>
          </p>
        </div>
      </div>
    </section>

    <!-- 各处入口 -->
    <RouterLink to="/build" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-99">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">流 派</span>
        <span class="block truncate text-[10px] text-ink-faint tabular">
          <template v-if="build">
            {{ build.displayName }} · 契合 {{ Math.round(build.affinity * 100) }}% · 快照 {{ loadouts.list.length }} 套
          </template>
          <template v-else>道途尚未成路,词条与功法凑成一派便见分晓</template>
        </span>
      </span>
      <span class="text-[11px] text-cinnabar">参详 →</span>
    </RouterLink>

    <!-- 修行画像(Phase 31.2:历史行为归纳,纯描述无数值) -->
    <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-99" @click="identityOpen = true">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修行画像</span>
        <span class="block truncate text-[10px] text-ink-faint">「{{ identity?.epithet ?? '云隐散人' }}」 · {{ identity?.narrative ?? '足迹尚浅' }}</span>
      </span>
      <span class="shrink-0 text-[11px] text-ink-soft">展卷 →</span>
    </button>

    <RouterLink to="/titles" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-99">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">名号与灵兽</span>
        <span class="block truncate text-[10px] text-ink-faint">
          {{ currentTitleName ?? '未佩称号' }} · {{ currentPetName ?? '未伴灵兽' }}
        </span>
      </span>
      <span class="text-[11px] text-jade">整理 →</span>
    </RouterLink>

    <!-- 师承(Phase 31 S1):修行理念 + 师尊评价 -->
    <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-99" @click="mentorDialog = true">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">师 承</span>
        <span class="block truncate text-[10px] text-ink-faint">
          {{ mentorVer ? `${mentorVer.mentor?.name ?? ''}·${mentorVer.mentor?.title ?? ''} | ${mentorVer.line}` : '尚未拜师,可寻一位师尊' }}
        </span>
      </span>
      <span class="shrink-0 text-[11px] text-azure">{{ mentorVer ? '求教 →' : '拜师 →' }}</span>
    </button>

    <RouterLink to="/collection" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-99">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">藏珍与成就</span>
        <span class="block text-[10px] text-ink-faint tabular">
          成就 {{ quests.achieved.length }}/{{ ACHIEVEMENTS.length }} · 图鉴 {{ collectHave }}/{{ collectTotal }}
        </span>
      </span>
      <span class="text-[11px] text-gold-ink">翻阅 →</span>
    </RouterLink>

    <RouterLink to="/legacy" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-99">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修仙录</span>
        <span class="block truncate text-[10px] text-ink-faint tabular">画像 · 节点 · 我的纪录——这一部只写你自己</span>
      </span>
      <span class="text-[11px] text-ink-soft">展卷 →</span>
    </RouterLink>

    <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-99" @click="rebirthOpen = true">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">轮 回</span>
        <span class="block text-[10px] text-ink-faint tabular">
          <span class="chip-ink mr-1 border-violet-ink/50 text-[9px] text-violet-ink">永久积累</span>
          道果 {{ player.reincarnation.daoFruit }} · 天赋 {{ ownedTalents.length }} 项
        </span>
      </span>
      <span class="text-[11px] text-violet-ink">观想 →</span>
    </button>

    <!-- 修行画像弹窗(Phase 31.2) -->
    <BaseModal :open="identityOpen" :title="`修行画像 · 「${identity?.epithet ?? '云隐散人'}」`" @close="identityOpen = false">
      <div v-if="identity" class="space-y-2.5">
        <p class="text-[12px] leading-relaxed text-ink-soft">{{ identity.narrative }}</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <p class="flex justify-between"><span class="text-ink-faint">师承</span><span class="text-ink-soft">{{ identity.roots.mentor?.name ?? '未定' }}</span></p>
          <p class="flex justify-between"><span class="text-ink-faint">道途</span><span class="text-ink-soft">{{ identity.roots.daoPath ?? '未立' }}</span></p>
          <p class="flex justify-between"><span class="text-ink-faint">流派</span><span class="text-ink-soft">{{ identity.roots.build ?? '未成' }}</span></p>
          <p class="flex justify-between"><span class="text-ink-faint">悟道</span><span class="text-ink-soft">{{ identity.roots.branches.join('、') || '未定' }}</span></p>
        </div>
        <p v-if="identity.roots.fortunes.length" class="text-[11px] text-ink-faint">
          机缘印记:{{ identity.roots.fortunes.map(f => f.title).join(' · ') }}
        </p>
        <p class="text-[10px] leading-relaxed text-ink-ghost">画像基于真实选择归纳——你玩成了什么样,它便描述什么。</p>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="identityOpen = false">收 卷</button>
      </template>
    </BaseModal>

    <!-- 轮回弹窗 -->
    <BaseModal :open="rebirthOpen" title="轮回" @close="rebirthOpen = false">
      <p class="flex justify-between text-[12px]">
        <span class="text-ink-soft">
          道果
          <span class="ml-1 text-[10px] text-violet-ink">【永久积累】</span>
          <span class="block text-[10px] text-ink-faint">每枚:修行 +3%,道躯 +1.5%;转世保留</span>
        </span>
        <span class="tabular font-kai text-[15px] text-cinnabar">{{ player.reincarnation.daoFruit }}</span>
      </p>
      <!-- S3 道果收益:有效值与软上限白话 -->
      <p class="mt-1 text-[11px] text-ink-faint tabular">
        有效收益
        <span class="text-gold-ink">{{ fruitInfo.effective.toFixed(0) }} 枚</span>
        (边际渐减)·
        {{ fruitInfo.total > 0 ? `当前修行 +${Math.round(fruitInfo.effective * 3)}%` : '' }}
      </p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="t in ownedTalents"
          :key="t!.id"
          class="chip-ink border-current"
          :style="{ color: TALENT_GRADE_COLORS[t!.grade] }"
          :title="t!.desc"
        >
          {{ t!.name }}
        </span>
        <span v-if="!ownedTalents.length" class="text-[11px] text-ink-ghost">转世后可觉醒先天之姿</span>
      </div>
      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">兵解转世保留道果 / 天赋 / 法宝,功法折半,余者归尘。金丹境方可自行兵解。</p>
      <template #footer>
        <button class="btn-ghost w-full text-[12px]!" @click="rebirth">兵解转世</button>
      </template>
    </BaseModal>

    <!-- 师承弹窗:拜师 / 师尊评价
        (Phase 31 S1:四种师承理念,拜后不改,转世保留,纯叙事反馈) -->
    <BaseModal :open="mentorDialog" :title="mentorVer ? `师承 · ${mentorVer.mentor?.name ?? ''}` : '拜师'" @close="mentorDialog = false">
      <div v-if="mentorVer" class="space-y-3">
        <p class="font-kai text-[14px] text-ink">{{ mentorVer.mentor?.master }}</p>
        <p class="text-[12px] leading-relaxed text-ink-soft">
          「{{ mentorVer.line }}」
        </p>
        <p class="text-[11px] text-ink-faint tabular">
          契合度
          <span :class="mentorVer.affinity > 0.2 ? 'text-jade' : mentorVer.affinity < -0.2 ? 'text-cinnabar' : 'text-ink-faint'">
            {{ mentorVer.affinity.toFixed(2) }}
          </span>
        </p>
        <p class="text-[11px] leading-relaxed text-ink-faint">
          师承词条(并入终局属性):{{ Object.values(mentorVer.mentor?.mods ?? {}).join(' · ') || '—' }}
        </p>
      </div>
      <div v-else class="space-y-2.5">
        <p class="text-[12px] leading-relaxed text-ink-faint">师承是凡界修行者给你的"额外成长思想"。拜入师门,获一条方向性词条;行为与师承相合,师尊自有嘉许,不设惩罚。</p>
        <button
          v-for="m in mentorChoices()"
          :key="m!.id"
          class="w-full rounded-lg border px-3 py-2.5 text-left transition-all active:scale-98"
          :class="hintMentor === m!.id ? 'border-cinnabar/60 bg-cinnabar/5' : 'border-ink/20'"
          @click="player.adoptMentor(m!.id)"
        >
          <p class="flex items-baseline gap-2">
            <span class="font-kai text-[14px] text-ink">{{ m!.name }}</span>
            <span class="text-[11px] text-azure">{{ m!.title }}</span>
            <span v-if="hintMentor === m!.id" class="chip-ink ml-1 border-cinnabar/50 text-[9px] text-cinnabar">机缘引荐</span>
            <span class="ml-auto text-[10px] text-ink-faint">{{ m!.master }}</span>
          </p>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ m!.desc }}</p>
        </button>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="mentorDialog = false">知道了</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useQuestsStore } from '@/stores/quests'
  import { useUiStore } from '@/stores/ui'
  import { ELEMENTS } from '@/data/linggen'
  import { titleDef } from '@/data/titles'
  import { petDef, PETS } from '@/data/pets'
  import { talentDef, TALENT_GRADE_COLORS, TALENTS } from '@/data/talents'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
  import { GONGFA } from '@/data/gongfa'
  import { PILLS } from '@/data/pills'
  import { ARTIFACTS } from '@/data/artifacts'
  import { EVENTS } from '@/data/events'
  import { prepareReincarnation, MANUAL_REBIRTH_MIN_MAJOR } from '@/core/reincarnation'
  import { detectBuild } from '@/core/buildDetect'
  import { useLoadoutsStore } from '@/stores/loadouts'
  import { modOf } from '@/core/statsCalc'
  import { fruitMarginalInfo } from '@/core/resourceGuidance'
  import { mentorVerdict, mentorChoices } from '@/core/mentorService'
  import { mentorHint } from '@/core/fortuneChain'
  import { buildIdentity } from '@/core/identityService'
  import { rootElements, tendencyLines } from '@/core/linggenAffinity'
  import { formatGN, formatPercent, formatYears } from '@/utils/format'
  import type { AnyStatKey } from '@/types'
  import { STAT_NAMES } from '@/ui/statNames'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const player = usePlayerStore()

  /** S3 道果链路:有效收益与软上限白话 */
  const fruitInfo = computed(() => fruitMarginalInfo())
  const quests = useQuestsStore()
  const ui = useUiStore()
  const loadouts = useLoadoutsStore()

  const stats = computed(() => player.finalStats)

  /** 灵根的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(player.linggen?.roots)))

  const MOD_KEYS: AnyStatKey[] = [
    'cultivationSpeed',
    'qiRegen',
    'breakthroughRate',
    'critRate',
    'critDamage',
    'damageBonus',
    'damageReduction',
    'luck',
    'explorationSpeed',
    'dropRate'
  ]

  const modRows = computed(() =>
    MOD_KEYS.map(k => ({ label: STAT_NAMES[k], value: modOf(stats.value.mods, k) })).filter(x => x.value !== 0)
  )

  const build = computed(() => detectBuild(stats.value.mods))

  const currentTitleName = computed(() => (player.titleId ? titleDef(player.titleId)?.name : undefined))
  const currentPetName = computed(() => (player.petId ? petDef(player.petId)?.name : undefined))
  const ownedTalents = computed(() => player.reincarnation.talents.map(id => talentDef(id)).filter(t => t !== undefined))

  const collectHave = computed(
    () =>
      quests.collections.equip.length +
      quests.collections.gongfa.length +
      quests.collections.pill.length +
      quests.collections.artifact.length +
      quests.collections.pet.length +
      quests.collections.event.length +
      quests.collections.talent.length
  )
  const collectTotal =
    EQUIPMENT_TEMPLATES.length + GONGFA.length + PILLS.length + ARTIFACTS.length + PETS.length + EVENTS.length + TALENTS.length

  // ---- 轮回 ----
  const rebirthOpen = ref(false)
  const canRebirth = computed(() => player.major >= MANUAL_REBIRTH_MIN_MAJOR)

  // Phase 31 S1 师承
  const mentorDialog = ref(false)
  const mentorVer = computed(() => mentorVerdict(player.mentor))
  // Phase 31.1 机缘链:机缘取/弃记忆 → 师承推荐
  const hintMentor = computed(() => mentorHint())
  // Phase 31.2 修行画像
  const identityOpen = ref(false)
  const identity = computed(() => buildIdentity())

  function rebirth(): void {
    if (!canRebirth.value) {
      ui.toast(`至少金丹境方可自行兵解`, 'warn')
      return
    }
    rebirthOpen.value = false
    prepareReincarnation()
  }
</script>
