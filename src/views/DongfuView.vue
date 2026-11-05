<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div class="card-ink relative flex items-center justify-between gap-2 px-4 py-3">
      <!-- 走 goBack(父页兜底):冷启动直接落在这一页时,裸 router.back() 会退到 about:blank -->
      <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'home' })">← 返回</button>
      <!-- 标题绝对居中,不随左侧「返回」的宽度偏离中轴 -->
      <p class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-kai text-[15px] tracking-[0.3em] text-ink">
        洞府营造
      </p>
    </div>

    <div v-if="mansionLv === 0" class="rounded-md border border-amber-ink/25 bg-amber-ink/5 px-3 py-2.5">
      <p class="text-[10px] leading-relaxed text-ink-faint">{{ offlineLaunchLine }}</p>
    </div>

    <div class="rounded-md border border-ink/10 bg-paper-deep/50 px-3 py-2.5">
      <div class="flex items-center justify-between">
        <span class="font-kai text-[12px] tracking-wider text-ink-soft">洞府纪要</span>
        <!-- 离线上限只在下方「离线可攒」那一行给出,此处不重复 -->
      </div>
      <div class="mt-1.5 grid grid-cols-3 gap-1.5">
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="leaf" :size="13" class="mx-auto text-jade" />
          <p class="mt-0.5 text-[9px] text-ink-faint">灵草 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-jade' : 'text-ink-faint'">{{ summary.fieldLv ? summary.herbHr : '—' }}</p>
          <p v-if="summary.fieldGrade" class="mt-0.5 text-[8px] leading-none" :class="summary.fieldForward ? 'text-cinnabar' : 'text-ink-faint'">
            {{ summary.fieldForward ? `前瞻 ↑ ${summary.fieldGradeName}` : `产${summary.fieldGradeName}` }}
          </p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="axe" :size="13" class="mx-auto text-ink-soft" />
          <p class="mt-0.5 text-[9px] text-ink-faint">玄铁 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-ink-soft' : 'text-ink-faint'">{{ summary.fieldLv ? summary.oreHr : '—' }}</p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="book" :size="13" class="mx-auto text-gold-ink" />
          <p class="mt-0.5 text-[9px] text-ink-faint">悟道 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.libLv ? 'text-gold-ink' : 'text-ink-faint'">{{ summary.libLv ? summary.wudaoHr : '—' }}</p>
        </div>
      </div>
      <div class="mt-1.5 flex items-center justify-between gap-2">
        <span class="flex items-center gap-1 rounded bg-paper-deep/60 px-2 py-1 text-[10px] text-ink-faint">
          <GameIcon name="droplets" :size="12" class="text-azure" />
          灵气上限 <span class="tabular" :class="summary.arrayLv ? 'text-azure' : 'text-ink-faint'">{{ summary.arrayLv ? summary.qiCapPct : '—' }}</span>
        </span>
        <span class="flex items-center gap-1 rounded bg-paper-deep/60 px-2 py-1 text-[10px] text-ink-faint">
          <GameIcon name="scroll" :size="12" class="text-gold-ink" />
          辅修栏 <span class="tabular text-ink-soft">{{ summary.subSlots }}</span>
        </span>
      </div>
      <!-- 离线档位:标签与数一行,段条单独占一整行(三种字号混排在同一行会显得细碎) -->
      <div class="mt-1.5 flex items-baseline justify-between">
        <span class="text-[9px] text-ink-faint">离线可攒</span>
        <!--
          「时」会被读成「时辰」(一个时辰 = 2 小时),见 data/timeUnits 的口径。
          而同一个数在 buildings.ts 的效果文案里写的是「小时」—— 一处说时、一处说小时,
          读者得先猜这两个是不是同一件事。数值面板统一用现代单位。
        -->
        <span class="font-kai text-[10px] tabular text-gold-ink">{{ summary.offlineHrs }} 小时</span>
      </div>
      <div class="mt-1 flex items-center gap-1">
        <span
          v-for="(hr, i) in OFFLINE_CAP_HOURS"
          :key="hr"
          class="h-1.5 flex-1 rounded-full transition-colors"
          :class="i <= mansionLv ? 'bg-gold-ink/70' : 'bg-ink/8'"
          :title="`洞府 ${i} 级 · 离线可攒 ${hr} 小时`"
        ></span>
      </div>
    </div>

    <section>
      <!-- 放不下时入口整枚折到下一行靠右(200% 缩放),不挤标题 -->
      <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <SectionTitle class="shrink-0" title="营造" :hint="`已启 ${builtCount}/${BUILDINGS.length}`" />
        <!-- -my-1:触面 30px 不撑高标题行 -->
        <button
          v-if="veinsUnlocked"
          type="button"
          class="chip-ink -my-1 ml-auto shrink-0 !py-1.5 text-gold-ink active:scale-98"
          aria-haspopup="dialog"
          @click="veinOpen = true"
        >
          <GameIcon name="gem" :size="12" />
          灵脉投资
          <span class="tabular text-[10px] text-ink-faint">{{ dongfu.veinTotal }}/{{ VEIN_TOTAL_CAPACITY }}</span>
        </button>
        <span v-else class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-ink-faint">
          <GameIcon name="gem" :size="12" class="text-gold-ink" />
          灵脉 · 需{{ veinGateRealm }}境
        </span>
      </div>
      <!--
        营造进度:标题旁只给「已启 N/8」两个数,条给位置。
        洞府是全游戏唯一「从零建到八」的地方,这条条本身就是长期目标的可视化。
      -->
      <ProgressBar
        class="mt-1 px-0.5"
        :value="BUILDINGS.length > 0 ? builtCount / BUILDINGS.length : 0"
        :height="2"
      />
      <BuildingCard :def="mansionDef" featured class="mt-2" />
      <div class="mt-2.5 grid grid-cols-1 gap-2.5 min-[320px]:grid-cols-2">
        <BuildingCard v-for="def in otherBuildings" :key="def.id" :def="def" />
      </div>
    </section>

    <BaseModal :open="veinOpen" title="灵脉投资" wide @close="veinOpen = false">
      <div id="vein-panel"><VeinInvestCard /></div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { goBack } from '@/router/goBack'
  import { BUILDINGS, ARRAY_QI_CAP_PER_LEVEL } from '@/data/buildings'
  import { REALMS } from '@/data/realms'
  import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, LIBRARY_WUDAO_PER_HOUR, OFFLINE_CAP_HOURS, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { HERB_GRADE_SHORT, herbGradeOfMajor } from '@/data/herbGrades'
  import { useDongfuStore, fieldHerbGrade } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import ProgressBar from '@/components/common/ProgressBar.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BaseModal from '@/components/common/BaseModal.vue'
  import BuildingCard from '@/components/dongfu/BuildingCard.vue'
  import VeinInvestCard from '@/components/dongfu/VeinInvestCard.vue'

  const router = useRouter()
  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  /** 洞府等级,作离线档位条的当前档(0..4) */
  const mansionLv = computed(() => dongfu.levels.mansion ?? 0)
  /**
   * 洞府 0 级时那一行:报的是**起造后**的下一档离线时数,随 OFFLINE_CAP_HOURS 现算。
   * 原写「洞府 1 级 · 离线可攒 12 时」—— 这一行只在未启用时显示,
   * 读者会当成现状,而下方建筑卡又写着「未启用」,同屏两句互相顶。
   */
  const offlineLaunchLine = computed(() => `起造后:洞府 1 级 · 离线可攒 ${OFFLINE_CAP_HOURS[1]} 小时`)

  /** 未达门槛时只给一行开启境界 */
  const veinsUnlocked = computed(() => player.major >= VEIN_UNLOCK_MAJOR)
  /** 开启境界名取自 VEIN_UNLOCK_MAJOR 所在境,与 veinsUnlocked 同源,不手抄 */
  const veinGateRealm = computed(() => REALMS[VEIN_UNLOCK_MAJOR]?.name ?? '更高')
  const veinOpen = ref(false)

  const builtCount = computed(() => BUILDINGS.filter(b => (dongfu.levels[b.id] ?? 0) > 0).length)
  /** 洞府是全局闸门,单独横贯一排 */
  const mansionDef = computed(() => BUILDINGS.find(b => b.id === 'mansion')!)
  const otherBuildings = computed(() => BUILDINGS.filter(b => b.id !== 'mansion'))

  /** 洞府纪要(只读,不替代建筑卡详情):取 store 的 levels 与常数现算,与 produce/effectText 同一口径 */
  const summary = computed(() => {
    const fieldLv = dongfu.levels.field ?? 0
    const libLv = dongfu.levels.library ?? 0
    const arrayLv = dongfu.levels.array ?? 0
    return {
      fieldLv,
      libLv,
      arrayLv,
      herbHr: `${fieldLv * FIELD_HERB_PER_HOUR} 株`,
      // 灵田产草品阶与 produce 同一判据(fieldHerbGrade);未建时为 null。
      // forward = 产的高于当前境品:灵田不受境界门控,可前瞻一档
      fieldGrade: fieldLv > 0 ? fieldHerbGrade(player.major, fieldLv) : null,
      fieldGradeName: fieldLv > 0 ? HERB_GRADE_SHORT[fieldHerbGrade(player.major, fieldLv)] : null,
      fieldForward: fieldLv > 0 && fieldHerbGrade(player.major, fieldLv) > herbGradeOfMajor(player.major),
      oreHr: `${(fieldLv * FIELD_ORE_PER_HOUR).toFixed(1)} 块`,
      wudaoHr: `${(libLv * LIBRARY_WUDAO_PER_HOUR).toFixed(1)} 点`,
      offlineHrs: dongfu.offlineCapHours,
      qiCapPct: `+${Math.round(arrayLv * ARRAY_QI_CAP_PER_LEVEL * 100)}%`,
      subSlots: dongfu.subGongfaSlots
    }
  })
</script>
