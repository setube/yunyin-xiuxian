<template>
  <!-- 开炉炼丹 -->
  <BaseModal :open="open" title="开炉炼丹" wide @close="emit('close')">
    <p class="mb-2 text-[11px] text-ink-faint tabular">灵草 {{ herbStash }} · 灵石 {{ formatGN(resources.spiritStone) }}</p>
    <!--
      被动翻检全程无进度条:玩家只知道某天突然翻出一张方子,不知道它快到了。
      这一行把「下一件事」报成时间 —— 读数与 studyTick 同序,见 core/loreService.studyEta
    -->
    <p v-if="studyLine" class="mb-2 text-[10px] leading-relaxed text-ink-faint tabular">{{ studyLine }}</p>
    <!--
      方子列表不再自带滚动框:弹窗正文本身就是滚动容器,两层滚动叠在一起时,
      内层底边会把下一张卡片切得只剩一条圆角,玩家看不出还能滚(议题 #21)。
    -->
    <div v-if="recipes.length" class="space-y-2">
      <div v-for="r in recipes" :key="r.def.id" class="card-ink px-3.5 py-2.5">
        <!--
          信息在上、操作在下。从前「把握」与两枚按钮并排挂在右侧、宽度写死,
          加了「连炼 ×5」之后右列更宽,窄屏上左列只剩两个字宽,丹名被压成竖排(议题 #21)。
        -->
        <div class="flex items-start gap-2.5">
          <GameIcon :name="r.def.icon" :size="18" class="mt-px shrink-0" :style="{ color: pillQualityColor(r.def) }" />
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <span class="whitespace-nowrap font-kai text-[13px] text-ink">{{ r.def.name }}</span>
              <span class="whitespace-nowrap text-[10px] text-ink-faint">{{ r.able.rank }} 阶</span>
              <span v-if="r.able.overReach > 0" class="whitespace-nowrap text-[10px] text-cinnabar">越阶 {{ r.able.overReach }}</span>
              <span v-if="r.plan.rounds > 0" class="whitespace-nowrap text-[10px] text-jade">现可炼 {{ r.plan.rounds }} 炉</span>
            </p>
            <p class="text-[11px] text-ink-faint tabular">{{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.cost.herb }} · 灵石 {{ formatGN(r.cost.stone) }}</p>
            <!-- 炼出来是什么:方子清单此前只报代价与把握,不报成品 -->
            <p class="text-[10px] leading-relaxed text-azure">{{ pillFuncText(r.def) }}</p>
            <p v-for="w in r.able.weakness" :key="w" class="mt-0.5 text-[10px] text-ink-faint">· {{ w }}</p>
            <!--
              炉前存货账:只摊代价与把握时,玩家不知道行囊里已存几枚,容易重复炼制。
              存货读 inventory.pills(与丹匣同一份账),不另数一遍。
            -->
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
            <span v-if="craftGuarantee > 0" class="ml-1 tabular text-gold-ink" title="浴火丹心:本世前几炉必成,开一炉耗 1 次额度">· 本世必成 ×{{ craftGuarantee }}</span>
            <span v-if="r.able.bonusChanceWithYield > 0" class="ml-1 tabular text-jade">· 双丹 {{ formatPercent(r.able.bonusChanceWithYield) }}</span>
          </p>
          <div class="ml-auto flex shrink-0 gap-1.5">
            <!-- 玩家反馈「批量炼丹」:材料够几炉就连开几炉,结果与连点一致。
                 !py-1.5 盒高 27px 低于 28px 阈值(layout-check 弹窗巡逻实测),
                 抬到 !py-2 到 35px,批量炼制是高频操作。
                 料足(plan>5)时多一枚「炼满」:按当前料保底算清能开几炉,
                 一次开完,预览与执行共用 craftBatchPlan -->
            <template v-if="r.plan.rounds > 0">
              <template v-if="pillFullId !== r.def.id">
                <button class="btn-ghost !px-3 !py-2 !text-[11px]" @click="craftPillBatch(r.def.id, 5)">连炼 ×5</button>
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
                <!-- 开的是累计总账,按一下不该就此了结:二步确认与分解/散去同款 -->
                <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pillFullId = null">再想想</button>
                <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="runCraftFull(r.def.id, r.plan.rounds)">
                  开 炉 ×{{ r.plan.rounds }}
                </button>
              </template>
            </template>
            <!--
              缺料/掌握不足:不摆注定点不动的按钮,把真实阻拦摊在眼前。
              缺料时另给一条去路 —— 只说「未足」而不给去处,玩家只能自己翻页
              找坊市或历练(议题 #130)。草石都缺先指坊市:买回草之后这句会
              变成「只缺灵石」,那时再给历练那条,一次只摆一条,窄屏也不挤。
            -->
            <span v-else class="flex items-center gap-2">
              <span class="whitespace-nowrap text-[10px] text-cinnabar">{{ r.plan.blocked }}</span>
              <RouterLink
                v-if="r.plan.reason === 'herb' || r.plan.reason === 'both'"
                :to="{ name: 'market', query: { focus: 'herb', grade: String(r.cost.grade) } }"
                class="whitespace-nowrap rounded border border-jade/50 px-2 py-1 text-[10px] text-jade active:opacity-60"
              >
                去坊市续草 →
              </RouterLink>
              <!-- 灵石只从历练/悬赏来,坊市是花灵石的地方 —— 指去坊市等于指反方向 -->
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
          开 {{ r.plan.rounds }} 炉,约耗 {{ HERB_GRADE_SHORT[r.cost.grade] }}灵草×{{ r.plan.herb }} · 灵石 {{ formatGN(r.plan.stone) }};
          炸炉按技艺省下残料,或可再多开几炉 —— 仍要?
        </p>
      </div>
    </div>
    <p v-else class="px-1 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
      你还不知道任何丹方。
      <br />
      <span class="text-[10px]">多采多看多打听,方子自会找上门来</span>
    </p>
    <!--
      百工技艺:做得多就精。技艺一直在影响成丹,却从不显示 —— 玩家看不到自己在长。
      排在方子之后:九项技艺在窄屏上要占半屏,放在前面会把方子压到折叠线以下。
      说明一栏至少留 9 个字宽,不够就整段换到下一行,不再被三列定宽挤成竖排。
    -->
    <div v-if="skillRows.length" class="mt-3 rounded-md bg-paper-deep/60 px-3 py-2">
      <p class="text-[10px] text-ink-faint">技艺(按道分,做得多就精)</p>
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
  import { craftPill, craftPillBatch } from '@/core/pillService'
  import { useBrewing } from '@/composables/useBrewing'
  import { formatGN, formatNum, formatPercent } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 开炉炼丹弹窗 —— 自 InventoryView 迁入。
   *
   * 方子行、把握配色、技艺与翻检读数全走 composables/useBrewing.ts,与页面入口卡
   * 同源(入口卡要报「已知丹方 N 种」);这里只留弹窗自己的「炼满」确认态,
   * 也就是 useBrewing 里的 pillFullId —— 它本就只服务这一扇浮层。
   */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const resources = useResourcesStore()
  const { recipes, craftGuarantee, skillRows, studyLine, rateClass, pillFullId, runCraftFull } = useBrewing()
  const herbStash = computed(() => herbStashText(g => resources.herbOf(g), formatNum))

  /**
   * 「炼满」确认态只服务本次开炉。弹窗在行囊页常驻,只切 open:
   * 关闭时若不撤销,下次开炉会直接停在上次的「开炉 ×N」上,一步误触就炼掉整包料。
   */
  watch(
    () => props.open,
    open => {
      if (!open) pillFullId.value = null
    }
  )
</script>
