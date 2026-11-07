<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 名号、境界、年龄、世数在全局顶栏常驻,此处不重复 -->
    <div class="card-ink px-4 py-4">
      <div class="flex items-center justify-between">
        <button class="-my-1 py-1.5 text-left active:opacity-60" @click="powerOpen = true">
          <span class="text-[10px] tracking-[0.3em] text-ink-faint">战 力</span>
          <span class="ml-1 text-[9px] text-ink-faint">拆解 →</span>
        </button>
        <span class="font-kai text-[18px] text-cinnabar tabular">{{ formatGN(stats.power) }}</span>
      </div>
      <!-- 战力算式:权重取自 POWER_WEIGHTS,与 powerScore 同一份 -->
      <p class="mt-0.5 text-right text-[10px] text-ink-faint tabular">{{ powerExplain }}</p>
      <div class="ink-divider my-3" />
      <!-- 灵根名必须 nowrap 且不参与收缩(窄屏会被挤成竖排);挤不下时让 ×倍率 落到下一行 -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="shrink-0 font-kai text-[12px] tracking-widest text-ink-faint">灵根</span>
        <span class="shrink-0 whitespace-nowrap font-kai text-[13px] text-cinnabar">{{ player.linggen?.gradeName }}</span>
        <!--
          三根灵根时这一组约 90px 宽,而外层虽然能折行、它自己却 shrink-0 不参与收缩 ——
          200% 缩放(视口约 195)**实测**右缘冲到 202,越界 7px。组内也允许折行。
        -->
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <span
            v-for="root in player.linggen?.roots ?? []"
            :key="root.element"
            class="flex flex-col items-center"
            :title="`资质 ${root.aptitude}`"
          >
            <!-- 特殊灵根(风雷冰光暗混沌)另加一道外环:与五行的圆章同尺寸,只多一层可数的形制 -->
            <span
              class="grid h-6 w-6 place-items-center rounded-full border text-[11px] font-kai"
              :class="{ 'root-special': ELEMENTS[root.element].special }"
              :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color, '--root-tone': ELEMENTS[root.element].color }"
            >
              {{ ELEMENTS[root.element].char }}
            </span>
            <!-- 资质亮在圆环下,不只藏 hover:手机上要看得到 -->
            <span class="mt-0.5 text-[9px] leading-none tabular" :style="{ color: ELEMENTS[root.element].color }">
              {{ root.aptitude }}
            </span>
            <!--
              资质刻度:三根并排时哪一根是主根,原先得逐个读数字再比(见 ui/rootMark)。
              资质决定主根与同源偏向,但不直接加修速,故只画刻度、不排序、不改色。
            -->
            <span
              class="root-pips mt-0.5"
              :class="{ 'root-pips--top': markOf(root.element)?.top }"
              :style="{ '--root-tone': ELEMENTS[root.element].color }"
              role="img"
              :aria-label="`资质 ${root.aptitude}`"
            >
              <i v-for="(on, i) in rootPips(markOf(root.element)?.pips ?? 0)" :key="i" :class="{ on }" />
            </span>
          </span>
        </div>
        <span class="ml-auto shrink-0 whitespace-nowrap text-[11px] text-ink-faint tabular">
          ×{{ player.linggen?.growthMult.toFixed(2) }}
        </span>
      </div>
      <div v-if="tendencies.length" class="mt-2 space-y-1">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
    </div>

    <section>
      <div class="flex items-center gap-2">
        <SectionTitle title="道躯" />
        <button
          v-if="panelCaveats.length"
          class="-m-2 p-2 text-ink-faint active:scale-90"
          aria-label="属性说明"
          @click="caveatsOpen = true"
        >
          <GameIcon name="circle-help" :size="14" />
        </button>
      </div>
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
          <button
            v-for="row in modRows"
            :key="row.label"
            class="-my-1 flex justify-between py-1.5 text-left text-[11px] active:opacity-60"
            @click="openBreakdown(row.key)"
          >
            <span class="text-ink-faint">
              {{ row.label }}
              <span v-if="row.capped" class="ml-0.5 text-[9px] text-cinnabar">软</span>
            </span>
            <span class="tabular" :class="row.value > 0 ? 'text-azure' : 'text-cinnabar'">
              {{ signedPercent(row.value) }}
            </span>
          </button>
        </div>
        <p v-if="softCappedNotes.length" class="mt-1.5 text-[10px] leading-relaxed text-cinnabar">
          软上限:{{ softCappedNotes.join('、') }}
        </p>
      </div>
    </section>

    <!-- 入口按「道途 / 缘法 / 记录」分节,每张卡带一枚题头图标 -->
    <section>
      <SectionTitle title="道途" />
      <div class="mt-2 space-y-4">
        <RouterLink to="/build" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="swords" :size="16" class="shrink-0 text-cinnabar" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">流 派</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">
              <template v-if="build">
                {{ build.displayName }} · 契合 {{ Math.round(build.affinity * 100) }}% · 快照 {{ loadouts.list.length }} 套
              </template>
              <template v-else>未成</template>
            </span>
          </span>
          <span class="text-[11px] text-cinnabar">参详 →</span>
        </RouterLink>

        <!-- 修行画像:历史行为归纳,纯描述无数值 -->
        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="identityOpen = true">
          <GameIcon name="circle-user" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修行画像</span>
            <!-- 叙述给两行:一行截断会拦腰断句 -->
            <span class="line-clamp-2 text-[10px] leading-relaxed text-ink-faint">「{{ identity?.epithet ?? '云隐散人' }}」 · {{ identity?.narrative ?? '暂无记录' }}</span>
          </span>
          <span class="shrink-0 text-[11px] text-ink-soft">展卷 →</span>
        </button>

        <RouterLink to="/titles" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon :name="currentPetIcon ?? 'crown'" :size="16" class="shrink-0 text-jade" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">名号与灵兽</span>
            <span class="block truncate text-[10px] text-ink-faint">
              {{ currentTitleName ?? '未佩名号' }} · {{ currentPetName ?? '未伴灵兽' }}
            </span>
          </span>
          <span class="text-[11px] text-jade">整理 →</span>
        </RouterLink>
      </div>
    </section>

    <section>
      <SectionTitle title="缘法" />
      <div class="mt-2 space-y-4">
        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="mentorDialog = true">
          <GameIcon name="scroll" :size="16" class="shrink-0 text-azure" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">师 承</span>
            <span class="block truncate text-[10px] text-ink-faint">
              {{ mentorVer ? `${mentorVer.mentor?.name ?? ''}·${mentorVer.mentor?.title ?? ''} | ${mentorVer.line}` : '未拜师' }}
            </span>
          </span>
          <span class="shrink-0 text-[11px] text-azure">{{ mentorVer ? '求教 →' : '拜师 →' }}</span>
        </button>

        <!-- 道侣:只记关系与经历,不给任何属性 -->
        <button class="card-ink relative flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="bondDialog = true">
          <!-- 最上阶(道侣)独有的一圈外环;其余阶只有阶点(见 ui/bondMark) -->
          <span v-if="bondStageMark.top" class="bond-halo" aria-hidden="true" />
          <GameIcon name="user" :size="16" class="shrink-0 text-azure" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">道 侣</span>
            <!-- 与 herIntent/pendingEvent 同判定,intentPending/pendingEventId 只在没回时才置位 -->
            <span class="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-faint">
              <span
                v-if="bond"
                class="bond-pips shrink-0"
                :class="{ 'bond-pips--top': bondStageMark.top }"
                :style="{ '--bond-tone': bondStageMark.tone }"
                role="img"
                :aria-label="`${bondStageMark.label}阶`"
              >
                <i v-for="p in bondStageMark.pips" :key="p" />
              </span>
              <span v-if="hasBondWord" class="chip-ink mr-1 shrink-0 border-cinnabar/50 text-[9px] text-cinnabar">有话说</span>
              <span class="truncate">
                {{
                  bondDef && bond
                    ? `${bondDef.name}·${STAGE_NAMES[bond.stage]}${bond.fallen ? '(已殁)' : ''} | ${bondDef.brief}`
                    : pastBonds.length
                      ? `尚未遇见 · 历世同行 ${pastBonds.length} 段`
                      : '尚未遇见'
                }}
              </span>
            </span>
          </span>
          <span class="shrink-0 text-[11px] text-azure">{{ bondDef ? '相知 →' : '履历 →' }}</span>
        </button>
      </div>
    </section>

    <section>
      <SectionTitle title="记录" />
      <div class="mt-2 space-y-4">
        <RouterLink to="/collection" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="gem" :size="16" class="shrink-0 text-gold-ink" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">藏珍与成就</span>
            <span class="block text-[10px] text-ink-faint tabular">
              成就 {{ quests.achieved.length }}/{{ ACHIEVEMENTS.length }} · 图鉴 {{ collectHave }}/{{ collectTotal }}
            </span>
          </span>
          <span class="text-[11px] text-gold-ink">翻阅 →</span>
        </RouterLink>

        <RouterLink to="/legacy" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="book" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">修仙录</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">画像 · 节点 · 我的纪录</span>
          </span>
          <span class="text-[11px] text-ink-soft">展卷 →</span>
        </RouterLink>

        <RouterLink to="/codex" class="card-ink flex items-center gap-3 px-4 py-3 active:scale-98">
          <GameIcon name="mountain" :size="16" class="shrink-0 text-ink-soft" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">界域志</span>
            <span class="block truncate text-[10px] text-ink-faint tabular">{{ cnNumber(WORLDS.length) }}界{{ cnNumber(REALMS.length) }}境</span>
          </span>
          <span class="text-[11px] text-ink-soft">查阅 →</span>
        </RouterLink>

        <button class="card-ink flex w-full items-center gap-3 px-4 py-3 text-left active:scale-98" @click="rebirthOpen = true">
          <GameIcon name="refresh" :size="16" class="shrink-0 text-violet-ink" />
          <span class="min-w-0 grow">
            <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">轮 回</span>
            <span class="block text-[10px] text-ink-faint tabular">
              <span class="chip-ink mr-1 border-violet-ink/50 text-[9px] text-violet-ink">永久积累</span>
              道果 {{ player.reincarnation.daoFruit }} · 天赋 {{ ownedTalents.length }} 项 · 传承 {{ ownedHeritage.length }} 道
            </span>
          </span>
          <span class="text-[11px] text-violet-ink">观想 →</span>
        </button>
      </div>
    </section>

    <IdentityDialog :open="identityOpen" @close="identityOpen = false" />

    <RebirthDialog :open="rebirthOpen" @close="rebirthOpen = false" />

    <BondDialog :open="bondDialog" @close="bondDialog = false" />

    <MentorDialog :open="mentorDialog" @close="mentorDialog = false" />

    <BaseModal :open="powerOpen" title="战力 · 拆解" @close="powerOpen = false">
      <div class="rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p v-for="row in powerRows" :key="row.name" class="flex items-center justify-between">
          <span class="text-ink-faint">{{ row.name }}</span>
          <span class="tabular">
            {{ formatGN(row.raw) }} ×{{ row.weight }} = <span class="text-azure">{{ formatGN(row.value) }}</span>
          </span>
        </p>
        <p class="mt-1 flex items-center justify-between border-t border-ink/8 pt-1">
          <span class="text-ink-faint">合计</span>
          <span class="tabular font-kai text-[12px] text-cinnabar">{{ formatGN(stats.power) }}</span>
        </p>
      </div>
    </BaseModal>

    <BaseModal :open="caveatsOpen" title="属性说明" @close="caveatsOpen = false">
      <div class="space-y-1 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p v-for="note in panelCaveats" :key="note.key" class="flex gap-2 leading-relaxed">
          <span class="shrink-0 text-ink">{{ note.label }}</span>
          <span class="text-ink-faint">{{ note.caveat }}</span>
        </p>
      </div>
    </BaseModal>

    <BaseModal :open="breakdownOpen" :title="breakdownTitle" @close="breakdownOpen = false">
      <div class="space-y-1 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p v-for="c in breakdownRows" :key="c.name" class="flex justify-between gap-2">
          <span class="text-ink-faint">
            {{ c.name }}
            <span v-if="c.onTop" class="ml-1 text-[10px] text-cinnabar">另乘</span>
          </span>
          <span class="shrink-0 tabular" :class="c.value > 0 ? 'text-azure' : 'text-cinnabar'">
            {{ signedPercent(c.value) }}
          </span>
        </p>
        <p v-if="!breakdownRows.length" class="text-ink-faint">暂无来源</p>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { STAGE_NAMES } from '@/data/daolu'
  import { bondMark } from '@/ui/bondMark'
  import { useQuestsStore } from '@/stores/quests'
  import { ELEMENTS } from '@/data/linggen'
  import { titleDef } from '@/data/titles'
  import { petDef } from '@/data/pets'
  import { PETS } from '@/data/pets'
  import { beastIcon } from '@/data/beastFamilies'
  import { talentDef, TALENTS } from '@/data/talents'
  import { heritageDef } from '@/data/heritage'
  import { ACHIEVEMENTS } from '@/data/achievements'
  import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
  import { GONGFA } from '@/data/gongfa'
  import { PILLS } from '@/data/pills'
  import { ARTIFACTS } from '@/data/artifacts'
  import { REALMS, WORLDS } from '@/data/realms'
  import { EVENTS } from '@/data/events'
  import { detectBuild } from '@/core/buildDetect'
  import { useLoadoutsStore } from '@/stores/loadouts'
  import { isSoftCapped, modOf } from '@/core/statsCalc'
  import { SOFT_CAPS, CULT_SPEED_SOFT_CAP_DIMINISH } from '@/data/constants'
  import { branchCodex, materialCodex, codexOwnedCount } from '@/ui/codex'
  import { mentorVerdict } from '@/core/mentorService'
  import { buildIdentity } from '@/core/identityService'
  import { rootElements, tendencyLines } from '@/core/linggenAffinity'
  import { rootMarks, rootPips } from '@/ui/rootMark'
  import { cnNumber, formatGN } from '@/utils/format'
  import type { AnyStatKey } from '@/types'
  import { STAT_KEYS, STAT_NAMES, signedPercent, statCaveat } from '@/data/statNames'
  import { powerBreakdownRows, powerExplainText } from '@/ui/powerText'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import { useBondOverview } from '@/composables/useBondOverview'
  import IdentityDialog from '@/components/character/IdentityDialog.vue'
  import BondDialog from '@/components/character/BondDialog.vue'
  import MentorDialog from '@/components/character/MentorDialog.vue'
  import RebirthDialog from '@/components/character/RebirthDialog.vue'

  const player = usePlayerStore()

  const quests = useQuestsStore()
  const loadouts = useLoadoutsStore()

  const stats = computed(() => player.finalStats)

  /** 战力拆解:与 powerScore 同一批属性同一份权重,逐行相加即总战力 */
  const powerOpen = ref(false)
  const powerRows = computed(() => powerBreakdownRows(stats.value))
  /** 战力算式是纯常量文案(powerExplainText 无依赖),只在 setup 算一次 */
  const powerExplain = powerExplainText()

  const modRows = computed(() =>
    STAT_KEYS.map(k => ({
      key: k,
      label: STAT_NAMES[k],
      value: modOf(stats.value.mods, k),
      capped: isSoftCapped(stats.value.mods, k) || (k === 'cultivationSpeed' && stats.value.cultSpeedSoftCapped)
    })).filter(x => x.value !== 0)
  )

  /** 灵根的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(player.linggen?.roots)))

  /** 灵根资质刻度:每根按资质点数,最高者为「主根」(见 ui/rootMark) */
  const rootMarkList = computed(() => rootMarks(player.linggen?.roots ?? []))
  function markOf(element: string) {
    return rootMarkList.value.find(m => m.element === element)
  }

  /** 只提示当前真有的词条边界 */
  const panelCaveats = computed(() =>
    modRows.value.flatMap(row => {
      const caveat = statCaveat(row.key)
      return caveat ? [{ key: row.key, label: row.label, caveat }] : []
    })
  )
  const caveatsOpen = ref(false)

  /** 来源明细:数据来自 finalStats.breakdown,不在界面里另算 */
  const breakdownKey = ref<AnyStatKey | null>(null)
  // 关窗只收 open、不清 key:淡出过程中标题与明细不闪空
  const breakdownOpen = ref(false)
  const breakdownTitle = computed(() => (breakdownKey.value ? `${STAT_NAMES[breakdownKey.value]} · 来源明细` : ''))
  const breakdownRows = computed(() => {
    const key = breakdownKey.value
    if (!key) return []
    return stats.value.breakdown
      .map(r => ({ name: r.name, value: r.mods[key] ?? 0, onTop: r.onTop === true }))
      .filter(c => c.value !== 0)
  })

  function openBreakdown(key: AnyStatKey): void {
    breakdownKey.value = key
    breakdownOpen.value = true
  }

  /** 软上限:超出部分按折扣计入,折扣率取自 SOFT_CAPS 本体(各键不同),不手抄 */
  const softCappedNotes = computed(() =>
    modRows.value
      .filter(r => r.capped)
      .map(r =>
        `${r.label}(超出按 ${Math.round((r.key === 'cultivationSpeed' ? CULT_SPEED_SOFT_CAP_DIMINISH : SOFT_CAPS[r.key]?.diminish ?? 1) * 100)}% 计入)`
      )
  )

  const build = computed(() => detectBuild(stats.value.mods))

  const currentTitleName = computed(() => (player.titleId ? titleDef(player.titleId)?.name : undefined))
  const currentPetName = computed(() => (player.petId ? petDef(player.petId)?.name : undefined))
  // 灵兽 id 认不出时不出图,免得渲染期对 undefined 取 family
  const currentPetIcon = computed(() => {
    const def = player.petId ? petDef(player.petId) : undefined
    return def ? beastIcon(def.family) : undefined
  })
  const ownedTalents = computed(() => player.reincarnation.talents.map(id => talentDef(id)).filter(t => t !== undefined))
  const ownedHeritage = computed(() => player.reincarnation.heritage.map(id => heritageDef(id)).filter(d => d !== undefined))

  const collectHave = computed(
    () =>
      codexOwnedCount(quests.collections.equip, EQUIPMENT_TEMPLATES) +
      codexOwnedCount(quests.collections.gongfa, GONGFA) +
      codexOwnedCount(quests.collections.pill, PILLS) +
      codexOwnedCount(quests.collections.artifact, ARTIFACTS) +
      codexOwnedCount(quests.collections.pet, PETS) +
      codexOwnedCount(quests.collections.event, EVENTS) +
      codexOwnedCount(quests.collections.talent, TALENTS) +
      // 含灵材谱与悟道录(派生视图,见 ui/codex.ts),须与图鉴页计数一致
      branchCodex().entries.filter(e => e.stage > 0).length +
      materialCodex().entries.filter(e => e.stage > 0).length
  )
  const collectTotal =
    EQUIPMENT_TEMPLATES.length +
    GONGFA.length +
    PILLS.length +
    ARTIFACTS.length +
    PETS.length +
    EVENTS.length +
    TALENTS.length +
    branchCodex().entries.length +
    materialCodex().entries.length

  const rebirthOpen = ref(false)
  const bondDialog = ref(false)
  // 与道侣弹窗共用同一份投影(composable 单源)
  const { bond, bondDef, pastBonds, hasBondWord } = useBondOverview()
  /** 缘阶形制(入口卡只要阶点与最上阶外环);未建立关系时按素昧平生 */
  const bondStageMark = computed(() => bondMark(bond.value?.stage ?? 'none'))
  const mentorDialog = ref(false)
  const mentorVer = computed(() => mentorVerdict(player.mentor))
  const identityOpen = ref(false)
  const identity = computed(() => buildIdentity())

</script>
