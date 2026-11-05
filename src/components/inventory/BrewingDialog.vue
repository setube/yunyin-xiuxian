<template>
  <BaseModal :open="open" title="开炉炼丹" wide @close="emit('close')">
    <p class="mb-2 text-[11px] text-ink-faint tabular">灵草 {{ herbStash }} · 灵石 {{ formatGN(resources.spiritStone) }}</p>
    <!-- 翻检读数与 studyTick 同序(见 core/loreService.studyEta) -->
    <p v-if="studyLine" class="mb-2 text-[10px] leading-relaxed text-ink-faint tabular">{{ studyLine }}</p>
    <!-- 列表不可自带滚动框:弹窗正文已是滚动容器,两层滚动会切掉下一张卡(议题 #21) -->
    <div v-if="recipes.length" class="space-y-2">
      <div v-for="r in recipes" :key="r.def.id" class="card-ink px-3.5 py-2.5">
        <!-- 信息在上、操作在下:操作列并排在右时,窄屏丹名会被压成竖排(议题 #21) -->
        <div class="flex items-start gap-2.5">
          <GameIcon :name="r.def.icon" :size="18" class="mt-px shrink-0" :style="{ color: pillQualityColor(r.def) }" />
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <span class="whitespace-nowrap font-kai text-[13px] text-ink">{{ r.def.name }}</span>
              <span class="whitespace-nowrap text-[10px] text-ink-faint">{{ r.able.rank }} 阶</span>
              <span v-if="r.able.overReach > 0" class="whitespace-nowrap text-[10px] text-cinnabar">越阶 {{ r.able.overReach }}</span>
              <span v-if="r.plan.rounds > 0" class="whitespace-nowrap text-[10px] text-jade">可炼 {{ r.plan.rounds }} 炉</span>
            </p>
            <!--
              灵草按品阶上色:同是「×3」,凡品与神品是两种代价 ——
              背包、坊市两处灵草格都按品阶上色(见 ui/herbQuality),唯独炼丹这处只写品名。
            -->
            <p class="flex flex-wrap items-baseline gap-x-1.5 text-[11px] tabular">
              <span :style="{ color: herbQualityTextColor(r.cost.grade) }">{{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.cost.herb }}</span>
              <span class="text-ink-faint">· 灵石 {{ formatGN(r.cost.stone) }}</span>
            </p>
            <p class="text-[10px] leading-relaxed text-azure">{{ pillFuncText(r.def) }}</p>
            <p v-for="w in r.able.weakness" :key="w" class="mt-0.5 text-[10px] text-ink-faint">· {{ w }}</p>
            <!-- 存货读 inventory.pills,与丹匣同一份账 -->
            <p class="mt-0.5 text-[10px] tabular">
              <span :class="r.stock > 0 ? 'text-ink-soft' : 'text-ink-faint'">存 {{ r.stock }}</span>
              <span v-if="r.overflow === 'full'" class="ml-1 text-cinnabar">已顶</span>
              <span v-else-if="r.overflow === 'partial'" class="ml-1 text-gold-ink">将顶</span>
            </p>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <p class="whitespace-nowrap text-[10px] text-ink-faint">
            把握
            <span class="tabular text-[13px]" :class="rateClass(craftGuarantee > 0 ? 1 : r.able.successRate)">{{ formatPercent(craftGuarantee > 0 ? 1 : r.able.successRate) }}</span>
            <span v-if="craftGuarantee > 0" class="ml-1 tabular text-gold-ink" title="浴火丹心">· 本世必成 ×{{ craftGuarantee }}</span>
            <span v-if="r.able.bonusChanceWithYield > 0" class="ml-1 tabular text-jade">· 双丹 {{ formatPercent(r.able.bonusChanceWithYield) }}</span>
          </p>
          <div class="ml-auto flex shrink-0 gap-1.5">
            <!--
              !py-2 不可降回 !py-1.5:盒高 27px,低于 28px 可点阈值(layout-check 实测)。
              连炼结果与连点一致;「炼满」预览与执行共用 craftBatchPlan。
            -->
            <template v-if="r.plan.rounds > 0">
              <template v-if="pillFullId !== r.def.id">
                <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="craftPillBatch(r.def.id, 5)">连 炼 ×5</button>
                <button
                  v-if="r.plan.rounds > 5"
                  class="btn-ghost !px-2.5 !py-2 !text-[11px]"
                  @click="pillFullId = r.def.id"
                >
                  炼 满 ×{{ r.plan.rounds }}
                </button>
                <button class="btn-seal !px-3 !py-2 !text-[12px]" @click="craftPill(r.def.id)">炼制</button>
              </template>
              <template v-else>
                <!-- 二步确认与分解/散去同款 -->
                <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pillFullId = null">再想想</button>
                <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="runCraftFull(r.def.id, r.plan.rounds)">
                  开 炉 ×{{ r.plan.rounds }}
                </button>
              </template>
            </template>
            <!-- 缺料给一条去路(议题 #130):草石都缺先指坊市,一次只摆一条 -->
            <span v-else class="flex items-center gap-2">
              <span class="whitespace-nowrap text-[10px] text-cinnabar">{{ r.plan.blocked }}</span>
              <RouterLink
                v-if="r.plan.reason === 'herb' || r.plan.reason === 'both'"
                :to="{ name: 'market', query: { focus: 'herb', grade: String(r.cost.grade) } }"
                class="whitespace-nowrap rounded border border-jade/50 px-2 py-1 text-[10px] text-jade active:opacity-60"
              >
                去坊市续草 →
              </RouterLink>
              <!-- 只缺灵石指历练:灵石只从历练/悬赏来 -->
              <RouterLink
                v-else-if="r.plan.reason === 'stone'"
                :to="{ name: 'adventure' }"
                class="whitespace-nowrap rounded border border-azure/50 px-2 py-1 text-[10px] text-azure active:opacity-60"
              >
                去历练攒石 →
              </RouterLink>
            </span>
          </div>
        </div>
        <p
          v-if="pillFullId === r.def.id"
          class="mt-1.5 text-[9px] leading-relaxed text-cinnabar"
        >
          约耗 {{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.plan.herb }} · 灵石 {{ formatGN(r.plan.stone) }}
        </p>
      </div>
    </div>
    <p v-else class="px-1 py-6 text-center text-[11px] text-ink-faint">暂无丹方</p>
    <!--
      技艺排在方子之后:放前面会把方子压到折叠线以下。
      说明栏至少 9 字宽,不够整段换行,否则被三列定宽挤成竖排。
    -->
    <div v-if="skillRows.length" class="mt-3 rounded-md bg-paper-deep/60 px-3 py-2">
      <p class="text-[10px] text-ink-faint">技艺</p>
      <div class="mt-1 space-y-1">
        <p v-for="s in skillRows" :key="s.id" class="flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span class="w-14 shrink-0 text-ink-faint">{{ s.daoName }}</span>
          <span class="w-12 shrink-0 font-kai text-ink-soft">{{ s.name }}</span>
          <span class="w-12 shrink-0" :class="s.stage === '生疏' ? 'text-ink-faint' : 'text-jade'">{{ s.stage }}</span>
          <span class="min-w-[9em] flex-1 text-[10px] leading-relaxed text-ink-faint">{{ s.desc }}</span>
        </p>
      </div>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 炉</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue'
  import { useResourcesStore } from '@/stores/resources'
  import { HERB_GRADE_SHORT } from '@/data/herbGrades'
  import { pillQualityColor } from '@/data/pills'
  import { pillFuncText } from '@/ui/itemText'
  import { herbStashText } from '@/ui/herbText'
  import { herbQualityTextColor } from '@/ui/herbQuality'
  import { craftPill, craftPillBatch } from '@/core/pillService'
  import { useBrewing } from '@/composables/useBrewing'
  import { formatGN, formatNum, formatPercent } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /** 方子行、把握配色、技艺与翻检读数全走 useBrewing,与页面入口卡同源 */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const resources = useResourcesStore()
  const { recipes, craftGuarantee, skillRows, studyLine, rateClass, pillFullId, runCraftFull } = useBrewing()
  const herbStash = computed(() => herbStashText(g => resources.herbOf(g), formatNum))

  /** 弹窗常驻只切 open:关闭时须撤销「炼满」确认态,否则下次开炉停在「开炉 ×N」上 */
  watch(
    () => props.open,
    open => {
      if (!open) pillFullId.value = null
    }
  )
</script>
