<template>
  <!-- 放在洞府页「灵脉投资」弹窗里,标题由弹窗给 -->
  <div>
    <p class="flex items-baseline justify-between gap-2">
      <span class="text-[10px] leading-relaxed text-ink-soft">
        主脉至多 <span class="text-cinnabar">{{ VEIN_MAIN_CAPACITY }} 点</span> · 副脉各
        <span class="text-cinnabar">{{ VEIN_SIDE_CAP }} 点</span>
      </span>
      <span class="shrink-0 tabular text-[11px] text-ink-faint">{{ veinTotal }}/{{ VEIN_TOTAL_CAPACITY }}</span>
    </p>
    <!--
      总容量分段:段长即该脉点数,空着的那截就是还能投多少。
      原先一根纯色条只说得出「74/100」一个总数,四脉各占多少看不出来。
    -->
    <div class="vein-budget mt-2" aria-hidden="true">
      <span
        v-for="band in budget.bands"
        :key="band.id"
        class="vein-budget-seg"
        :style="{ width: band.pct + '%', '--vein-tone': TONES[band.id].tone }"
      ></span>
      <span v-if="budget.freePct > 0" class="vein-budget-free" :style="{ width: budget.freePct + '%' }"></span>
    </div>

    <div class="mt-3 space-y-2">
      <div
        v-for="row in veinRows"
        :key="row.def.id"
        class="rounded-lg border px-2.5 py-2.5"
        :class="row.main ? TONES[row.def.id].row : 'border-ink/8 bg-paper-deep/40'"
      >
        <div class="flex flex-wrap items-start gap-2.5">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[15px] leading-none" :class="TONES[row.def.id].seal">
            <span class="translate-y-[1px]">{{ row.def.seal }}</span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-1.5">
              <span class="truncate font-kai text-[13px] text-ink">{{ row.def.name }}</span>
              <span v-if="row.main" class="shrink-0 rounded border border-cinnabar/40 bg-cinnabar/15 px-1 py-0.5 text-[10px] leading-none text-ink">主脉</span>
              <span v-else-if="dongfu.veinMain === null" class="shrink-0 text-[10px] text-ink-faint">首投成主</span>
            </p>
            <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ row.def.desc }}</p>
            <!-- 每条脉须自陈作用 -->
            <p class="mt-0.5 text-[10px] leading-relaxed text-azure">
              {{ row.effect }}
            </p>
            <!--
              四条共用一把尺:一律按 0→主脉上限。原先各按本脉上限,42/70 画的比 20/30 还短。
              副脉上限在轴上落一枚刻度,越过它就是「超额保留」的旧主脉。
            -->
            <div class="mt-1.5 flex items-center gap-2">
              <div class="vein-axis min-w-0 flex-1">
                <div class="vein-axis-fill" :style="{ width: row.axisWidth, '--vein-tone': TONES[row.def.id].tone }"></div>
                <span class="vein-axis-tick" :style="{ left: sideTickPct + '%' }"></span>
              </div>
              <span class="shrink-0 text-[10px] tabular" :class="row.surplus > 0 ? 'text-gold-ink' : 'text-ink-faint'">
                {{ row.level }}/{{ row.cap }}
              </span>
            </div>
            <p v-if="row.surplus > 0" class="mt-0.5 text-[10px] leading-relaxed text-gold-ink">
              超额 {{ row.surplus }} 点 · 效果保留
            </p>
          </div>
          <!--
            钮组另起一行靠右:弹窗正文窄,「改立主脉 · N 石」与说明并排时说明栏只剩 80px 上下。
            说明栏须 flex-1(基准 0):基准按内容宽时,折行会把说明栏整块甩到下一行。
            两钮放不下时折成两行;钮内两段各自不拆,钮窄时上下叠(不叠会被压成逐字竖排)。
          -->
          <div class="flex basis-full flex-wrap items-center justify-end gap-1.5">
            <button class="btn-ghost flex-wrap whitespace-normal !px-2.5 !py-1.5 !text-[11px]" :disabled="!canInvest(row.def.id)" @click="doInvest(row.def.id)">
              <template v-if="canInvest(row.def.id)">
                <span class="whitespace-nowrap">投一点 ·</span>
                <span class="whitespace-nowrap">{{ formatGN(investCost) }} 石</span>
              </template>
              <template v-else>{{ investedStateLabel(row.def.id) }}</template>
            </button>
            <button
              v-if="canSwitchTo(row.def.id)"
              class="btn-ghost flex-wrap !px-2.5 !py-2 !text-[10px]"
              :disabled="switchShort"
              :aria-label="switchLabel(row.def.id)"
              :title="switchShort ? `灵石尚差 ${formatGap(switchGap)}` : undefined"
              @click="switchArm = row.def.id"
            >
              <span class="whitespace-nowrap">改立主脉 ·</span>
              <span v-if="switchShort" class="whitespace-nowrap">尚差 {{ formatGap(switchGap) }}</span>
              <span v-else class="whitespace-nowrap">{{ formatGN(switchCost) }} 石</span>
            </button>
          </div>
        </div>

        <!--
          连投行:总账与群批同一条式子。
          flex-wrap + 文本保底宽不可去:否则 flex-1 文本被 shrink-0 双钮压成 0 宽竖排(同建筑连升)。
        -->
        <div v-if="row.plan.points >= 2" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
          <!-- 正文两态同一段、钮组自成一行:见 BuildingCard 的连升行(同一种跳动) -->
          <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
            连投至 <span class="font-kai text-[11px] text-cinnabar">第 {{ row.level + row.plan.points }} 点</span>
            <span class="mt-0.5 block text-[9px] text-ink-faint tabular">共耗 灵石 {{ formatGN(row.plan.stone) }}</span>
          </p>
          <!--
            正文两态同一段、钮组自成一行:见 BuildingCard 的连升行(同一种跳动)。
            钮组整段右对齐,两态都是一行高 —— 不跟着正文挤,就不会因为多一枚钮而折行撑高。
          -->
          <div class="flex w-full shrink-0 justify-end gap-1.5">
            <button v-if="batchArm === row.def.id" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchArm = null">再想想</button>
            <button
              v-if="batchArm === row.def.id"
              class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]"
              @click="runBatch(row.def.id)"
            >连 投</button>
            <button v-else class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchArm = row.def.id">连 投</button>
          </div>
        </div>

        <div v-if="switchArm === row.def.id" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
          <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
            改立「<span class="font-kai text-[11px] text-cinnabar">{{ row.def.name }}</span>」为主脉 · 耗灵石
            <span class="tabular text-ink">{{ formatGN(switchCost) }}</span>
            <span v-if="switchShort" class="mt-0.5 block text-[9px] leading-relaxed text-cinnabar tabular">
              灵石尚差 {{ formatGap(switchGap) }}
            </span>
            <span v-if="switchLoss" class="mt-0.5 block text-[9px] leading-relaxed text-gold-ink">
              「{{ switchLoss.oldName }}」转副脉<template v-if="switchLoss.lost > 0"> · 超额 {{ switchLoss.lost }} 点 · 效果保留</template>
            </span>
          </p>
          <div class="flex shrink-0 gap-1">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="switchArm = null">再想想</button>
            <button
              class="btn-seal !px-2.5 !py-2 !text-[11px]"
              :disabled="switchShort"
              :title="switchShort ? `灵石尚差 ${formatGap(switchGap)}` : undefined"
              @click="confirmSwitch(row.def.id)"
            >
              改 立
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-3 border-t border-ink/6 pt-2.5">
      <p class="text-[10px] text-ink-faint">当前加成</p>
      <div class="mt-1.5 space-y-1">
        <div v-for="row in veinRows" :key="row.def.id" class="flex items-center gap-2">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="row.level > 0 ? TONES[row.def.id].dot : 'bg-ink/15'"></span>
          <span class="w-14 shrink-0 text-[10px] text-ink-soft">{{ row.def.name }}</span>
          <span class="min-w-0 truncate text-[10px] tabular" :class="row.level > 0 ? 'text-ink' : 'text-ink-faint'">
            {{ ledgerText(row.def.id) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { VEINS, veinDef, type VeinId } from '@/data/veins'
  import { veinEffectText } from '@/ui/veinText'
  import { axisPct, veinBudget } from '@/ui/veinShape'
  import { investVein, investVeinBatch, veinCap, veinInvestPlan, veinPointCost, veinPointShortfall, veinSwitchCost, veinSwitchShortfall, switchMainVein, type VeinInvestPlan } from '@/core/veinService'
  import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { formatGN, formatGap } from '@/utils/format'

  const dongfu = useDongfuStore()
  const player = usePlayerStore()
  const resources = useResourcesStore()

  /**
   * 四脉色系,章/行描边/轴/预算段全从这里取。
   * 类串须写全字面量,不许拼:Tailwind JIT 只认源码里写全的类。
   * tone 走 CSS 变量(形制层在 style.css),故写成颜色值而非类名。
   */
  const TONES: Record<VeinId, { seal: string; row: string; dot: string; tone: string }> = {
    gather: { seal: 'border border-jade/40 bg-jade/10 text-ink', row: 'border-jade/35 bg-jade/5', dot: 'bg-jade', tone: 'rgb(var(--color-jade-rgb) / 0.75)' },
    craft: { seal: 'border border-cinnabar/40 bg-cinnabar/10 text-ink', row: 'border-cinnabar/35 bg-cinnabar/6', dot: 'bg-cinnabar', tone: 'rgb(var(--color-cinnabar-rgb) / 0.7)' },
    alchemy: { seal: 'border border-gold-ink/40 bg-gold-ink/10 text-ink', row: 'border-gold-ink/35 bg-gold-ink/6', dot: 'bg-gold-ink', tone: 'rgb(var(--color-gold-ink-rgb) / 0.75)' },
    insight: { seal: 'border border-violet-ink/40 bg-violet-ink/15 text-ink', row: 'border-violet-ink/40 bg-violet-ink/7', dot: 'bg-violet-ink', tone: 'rgb(var(--color-violet-ink-rgb) / 0.7)' }
  }

  const investCost = computed(() => veinPointCost())
  /** 单点投脉石差:按钮与服务拒因同源 */
  const investGap = computed(() => veinPointShortfall())
  const switchCost = computed(() => veinSwitchCost())
  /** 改立石差(付得起为 0):入口、确认钮与服务拒因同源 */
  const switchGap = computed(() => veinSwitchShortfall())
  const switchShort = computed(() => switchGap.value.m > 0)
  const veinsUnlocked = computed(() => player.major >= VEIN_UNLOCK_MAJOR)
  const veinTotal = computed(() => dongfu.veinTotal)

  /**
   * 列账须含不走 StatMods 的脉:寒冥灵脉 perPoint 为空,效果走 dongfu.insightDiscount,不进 veinMods。
   * veinEffectText 已并入参悟省耗,此处不再单独凑。
   */
  function ledgerText(veinId: VeinId): string {
    const lv = currentLevel(veinId)
    return lv > 0 ? `${lv} 点 · ${veinEffectText(veinDef(veinId), lv)}` : '未投'
  }

  /** 总容量上的四段;段长即各脉点数 */
  const budget = computed(() => veinBudget(dongfu.veinPoints, VEIN_TOTAL_CAPACITY))
  /** 副脉上限在主脉轴上的位置:四条横条共用这一枚刻度 */
  const sideTickPct = axisPct(VEIN_SIDE_CAP, VEIN_MAIN_CAPACITY)

  function isMain(veinId: VeinId): boolean {
    return dongfu.veinMain === veinId
  }

  /** 该脉实际可投上限;未定主脉时每条按主脉档 */
  function cap(veinId: VeinId): number {
    return veinCap(veinId)
  }

  function currentLevel(veinId: VeinId): number {
    return dongfu.veinPoints[veinId] ?? 0
  }

  /** 原主脉迁出后超出副脉上限的部分(效果保留,不可再投) */
  function surplusPoints(veinId: VeinId): number {
    if (isMain(veinId)) return 0
    return Math.max(0, currentLevel(veinId) - VEIN_SIDE_CAP)
  }

  function canInvest(veinId: VeinId): boolean {
    if (!veinsUnlocked.value) return false
    if (currentLevel(veinId) >= cap(veinId)) return false
    if (veinTotal.value >= VEIN_TOTAL_CAPACITY) return false
    return resources.hasStone(investCost.value)
  }

  function investedStateLabel(veinId: VeinId): string {
    if (currentLevel(veinId) >= cap(veinId)) return isMain(veinId) ? '主脉圆满' : '副脉已至上限'
    if (veinTotal.value >= VEIN_TOTAL_CAPACITY) return '容量已尽'
    if (!veinsUnlocked.value) return '未解锁'
    if (!resources.hasStone(investCost.value)) return `灵石尚差 ${formatGap(investGap.value)}`
    return '不可投'
  }

  function canSwitchTo(veinId: VeinId): boolean {
    if (!veinsUnlocked.value || isMain(veinId)) return false
    // 尚无主脉时首投即成主脉
    return dongfu.veinMain !== null
  }

  function switchLabel(veinId: VeinId): string {
    const base = `改立${veinDef(veinId).name}为主脉`
    return switchShort.value ? `${base},灵石尚差 ${formatGap(switchGap.value)}` : base
  }

  /** 四脉连投计划;行只读量,不另算价 */
  const plans = computed<Record<VeinId, VeinInvestPlan>>(() => ({
    gather: veinInvestPlan('gather'),
    craft: veinInvestPlan('craft'),
    alchemy: veinInvestPlan('alchemy'),
    insight: veinInvestPlan('insight')
  }))

  /**
   * 灵脉行的读数:每条脉一次算齐。
   *
   * 原先主循环里 `currentLevel(v.id)` 被调 4 次、`veinEffectText` 2 次、
   * `axisPct` / `surplusPoints` / `cap` 各 1~2 次,连投区还要再调一次 `currentLevel`。
   * 全是同一个 `dongfu.veinPoints[veinId]` 的查表 —— 每帧算十几次没有理由。
   */
  const veinRows = computed(() =>
    VEINS.map(v => {
      const level = currentLevel(v.id)
      return {
        def: v,
        level,
        cap: cap(v.id),
        main: isMain(v.id),
        effect: level > 0 ? veinEffectText(v, level) : `每点 ${veinEffectText(v, 1)}`,
        axisWidth: `${axisPct(level, VEIN_MAIN_CAPACITY)}%`,
        surplus: surplusPoints(v.id),
        plan: plans.value[v.id]
      }
    })
  )

  /** 连投二步确认态 */
  const batchArm = ref<VeinId | null>(null)
  function runBatch(veinId: VeinId): void {
    batchArm.value = null
    investVeinBatch(veinId) // toast 由服务报
  }

  /** 改立主脉二步确认态 */
  const switchArm = ref<VeinId | null>(null)
  /** 改立后原主脉落回副脉上限:超出 VEIN_SIDE_CAP 的部分不再可投(效果不减) */
  const switchLoss = computed<{ oldName: string; lost: number } | null>(() => {
    const old = dongfu.veinMain
    if (!old || switchArm.value === null) return null
    return { oldName: veinDef(old).name, lost: Math.max(0, currentLevel(old) - VEIN_SIDE_CAP) }
  })
  function confirmSwitch(veinId: VeinId): void {
    switchArm.value = null
    switchMainVein(veinId) // toast 由服务报
  }

  function doInvest(veinId: VeinId): void {
    investVein(veinId)
  }
</script>
