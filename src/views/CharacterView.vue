<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 基本信息:名号、境界、年龄、世数皆在全局顶栏常驻,此处不再重复 -->
    <div class="card-ink px-4 py-4">
      <div class="flex items-center justify-between">
        <span class="text-[10px] tracking-[0.3em] text-ink-faint">战 力</span>
        <span class="font-kai text-[18px] text-cinnabar tabular">{{ formatGN(stats.power) }}</span>
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

    <!-- 道侣(Phase 33.8):这一世遇见的人。只记关系与经历,不给任何属性 -->
    <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-99" @click="bondDialog = true">
      <span class="min-w-0 grow">
        <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">道 侣</span>
        <span class="block truncate text-[10px] text-ink-faint">
          {{
            bondDef && bond
              ? `${bondDef.name}·${STAGE_NAMES[bond.stage]}${bond.fallen ? '(已殁)' : ''} | ${bondDef.brief}`
              : pastBonds.length
                ? `此生尚未遇见,历世曾有 ${pastBonds.length} 段同行`
                : '此生尚未遇见谁'
          }}
        </span>
      </span>
      <span class="shrink-0 text-[11px] text-azure">{{ bondDef ? '相知 →' : '履历 →' }}</span>
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
      <!-- 逆旅契:道果的第一个消费出口。花道果换一世逆境,回报只有履历 -->
      <p class="mt-2 flex items-center justify-between text-[12px]">
        <span class="text-ink-soft">
          逆旅契
          <span class="ml-1 text-[10px] text-violet-ink">【本世 · 消耗道果】</span>
          <span class="block text-[10px] text-ink-faint">
            {{ signedTrial ? `此生已立「${signedTrial.name}」·${signedTrial.ruleText}` : '以道果换一世逆境,所得唯有履历一笔' }}
          </span>
        </span>
        <button v-if="!signedTrial" class="shrink-0 text-[12px] text-gold-ink underline underline-offset-2 active:text-cinnabar" @click="trialOpen = true">立契</button>
        <span v-else class="shrink-0 font-kai text-[15px] text-cinnabar">{{ signedTrial.seal }}</span>
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
        <button class="btn-ghost w-full !text-[12px]" @click="rebirth">兵解转世</button>
      </template>
    </BaseModal>

    <!-- 逆旅契弹窗:一世一份,签下不可解除;只加难度,不给任何属性或资源 -->
    <BaseModal :open="trialOpen" title="逆旅契" @close="trialOpen = false">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        道果本是历世所积,却一向只堆在身上。立一份契,把它押在这一世的逆境里——
        契不予你分毫气力,只把路走窄。走完了,它会留在你的履历上。
      </p>
      <div class="mt-3 space-y-2">
        <button
          v-for="t in LIFE_TRIALS"
          :key="t.id"
          class="card-ink w-full px-3 py-2 text-left disabled:opacity-40"
          :disabled="!canSignLifeTrial(t.id)"
          @click="signTrial(t.id)"
        >
          <span class="flex items-baseline justify-between">
            <span class="font-kai text-[14px] text-ink">{{ t.seal }} · {{ t.name }}</span>
            <span class="tabular text-[12px]" :class="player.reincarnation.daoFruit >= t.cost ? 'text-cinnabar' : 'text-ink-ghost'">
              {{ t.cost }} 道果
            </span>
          </span>
          <span class="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">{{ t.desc }}</span>
          <span class="mt-0.5 block text-[10px] text-ink-faint">{{ t.ruleText }}</span>
        </button>
      </div>
      <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">一世只可立一契,立下不可解。转世时契随皮囊散去,履历长存。</p>
    </BaseModal>

    <!-- 道侣弹窗:这一世的关系与历世的同行 -->
    <BaseModal :open="bondDialog" :title="bondDef ? `道侣 · ${bondDef.name}` : '道侣'" @close="bondDialog = false">
      <template v-if="bondDef && bond">
        <p class="font-kai text-[14px] text-ink">{{ bondDef.name }}</p>
        <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ bondDef.brief }}</p>
        <p class="mt-2 text-[11px] text-ink-soft">
          {{ TEMPER_NAMES[bondDef.temper] }} · {{ LEAN_NAMES[bondDef.lean] }}道
          <span class="ml-1 text-azure">{{ STAGE_NAMES[bond.stage] }}</span>
          <span v-if="bond.fallen" class="ml-1 text-cinnabar">已殁</span>
        </p>

        <!-- 三维只影响关系推进,不进任何属性 -->
        <div class="mt-3 space-y-1.5">
          <p v-for="m in bondMeters" :key="m.label" class="flex items-center gap-2 text-[11px]">
            <span class="w-10 shrink-0 text-ink-faint">{{ m.label }}</span>
            <span class="h-1 grow rounded-full bg-ink/10">
              <span class="block h-1 rounded-full bg-azure/70" :style="{ width: `${m.v}%` }" />
            </span>
            <span class="w-8 shrink-0 text-right tabular text-ink-soft">{{ m.v }}</span>
          </p>
        </div>
        <p class="mt-2 text-[11px] text-ink-faint">共历 {{ bond.shared }} 次</p>

        <p class="mt-3 text-[11px] leading-relaxed text-ink-soft">她所求:{{ bondDef.pursuit }}</p>
        <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">她不越的线:{{ bondDef.taboo }}</p>

        <p v-if="gateHint" class="mt-3 text-[11px] text-gold-ink">
          离「{{ STAGE_NAMES[gateHint.stage] }}」尚差:{{ gateHint.lacking.join('、') }}
        </p>

        <!-- 她自己提出的事(Phase 34.1):不是世界安排的事件,是她开的口 -->
        <template v-if="herIntent">
          <div class="mt-4 border-t border-ink/10 pt-3">
            <p class="text-[12px] leading-relaxed text-gold-ink">{{ herIntent.line }}</p>
            <p class="mt-1 text-[10px] text-ink-faint">她所求:{{ herIntent.wish }}</p>
            <div class="mt-2.5 flex gap-2">
              <button
                v-for="r in INTENT_CHOICES"
                :key="r.id"
                class="card-ink grow px-2 py-2 text-center text-[12px] text-ink-soft active:scale-99"
                @click="answerIntent(r.id)"
              >
                {{ r.label }}
              </button>
            </div>
          </div>
        </template>

        <!-- 共同事件:她的诉求与底线在此第一次被玩家看见并回应 -->
        <template v-if="pendingEvent && !bond.fallen && !bond.departed">
          <div class="mt-4 border-t border-ink/10 pt-3">
            <p class="font-kai text-[13px] tracking-widest text-ink">{{ pendingEvent.title }}</p>
            <p class="mt-1 text-[11px] leading-relaxed text-ink-soft">{{ pendingEvent.text }}</p>
            <p class="mt-1.5 text-[11px] text-azure">{{ pendingEvent.herWish }}</p>
            <p class="text-[10px] text-ink-faint">{{ pendingEvent.herLimit }}</p>
            <p v-if="herLine" class="mt-1.5 text-[11px] text-gold-ink">{{ herLine }}</p>
            <div class="mt-2.5 space-y-1.5">
              <button
                v-for="ch in pendingEvent.choices"
                :key="ch.id"
                class="card-ink w-full px-3 py-2 text-left text-[12px] text-ink-soft active:scale-99"
                @click="pickChoice(ch.id)"
              >
                {{ ch.label }}
              </button>
            </div>
          </div>
        </template>
        <p v-else-if="lastEventText" class="mt-4 border-t border-ink/10 pt-3 text-[11px] leading-relaxed text-ink-soft">
          {{ lastEventText }}
        </p>
      </template>
      <p v-else class="text-[12px] leading-relaxed text-ink-faint">
        此生尚未遇见谁。人是在路上碰到的,不是挑出来的 —— 多走几处地界,或许自有相逢。
      </p>

      <template v-if="pastBonds.length">
        <p class="mt-4 font-kai text-[13px] tracking-widest text-ink-soft">历世同行</p>
        <div class="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          <p v-for="(r, i) in pastBonds" :key="i" class="flex justify-between text-[11px]">
            <span class="text-ink-soft">{{ r.name }}</span>
            <span class="text-ink-faint">{{ STAGE_NAMES[r.stage] }} · {{ ENDING_NAMES[r.ending] }}</span>
          </p>
        </div>
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
  import { computed, ref, watch } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { ENDING_NAMES, LEAN_NAMES, STAGE_NAMES, TEMPER_NAMES, daoluDef } from '@/data/daolu'
  import { chooseBondEvent, herStance, nextGateHint, pendingBondEvent, pendingIntent, respondIntent } from '@/core/daoluService'
  import { LIFE_TRIALS } from '@/data/lifeTrials'
  import { activeLifeTrial, canSignLifeTrial, signLifeTrial } from '@/core/lifeTrialService'
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
  import { formatGN, formatPercent } from '@/utils/format'
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
  const bondDialog = ref(false)
  const bond = computed(() => player.bond)
  const bondDef = computed(() => (bond.value ? (daoluDef(bond.value.daoluId) ?? null) : null))
  const bondMeters = computed(() =>
    bond.value
      ? [
          { label: '缘分', v: bond.value.fate },
          { label: '信任', v: bond.value.trust },
          { label: '契合', v: bond.value.accord }
        ]
      : []
  )
  const gateHint = computed(() => nextGateHint())
  const pastBonds = computed(() => player.reincarnation.bonds)
  /**
   * 待决的共同事件 —— 由历练情境写入关系状态,界面只读取。
   *
   * 34.0 之前是「打开弹窗才抽一个」:内容是真的,时机是假的。
   * 现在事件在历练途中就已发生,弹窗只是去看它
   */
  const pendingEvent = computed(() => pendingBondEvent())
  const lastEventText = ref('')
  const herLine = computed(() => (pendingEvent.value ? herStance(pendingEvent.value) : null))
  watch(bondDialog, open => {
    if (open) lastEventText.value = ''
  })
  function pickChoice(choiceId: string): void {
    if (!pendingEvent.value) return
    const r = chooseBondEvent(pendingEvent.value.id, choiceId)
    lastEventText.value = r?.text ?? ''
  }

  /** 她主动提出的事(34.1);三种回应,忽略不等于回绝 */
  const herIntent = computed(() => pendingIntent())
  const INTENT_CHOICES = [
    { id: 'accept' as const, label: '与她同去' },
    { id: 'refuse' as const, label: '婉言谢绝' },
    { id: 'ignore' as const, label: '不作声' }
  ]
  function answerIntent(r: 'accept' | 'refuse' | 'ignore'): void {
    const a = respondIntent(r)
    lastEventText.value = a?.text ?? ''
  }
  const trialOpen = ref(false)
  /** 本世已立的逆旅契;未立为 null */
  const signedTrial = computed(() => activeLifeTrial())
  function signTrial(id: string): void {
    if (signLifeTrial(id)) trialOpen.value = false
  }
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
